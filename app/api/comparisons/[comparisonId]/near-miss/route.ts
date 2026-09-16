import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveComparisonDependencies } from "@/lib/database/repository";
import {
  ValidationError,
  VersionConflictError,
} from "@/lib/errors/app-error";
import { withRouteErrors } from "@/lib/errors/route-handler";
import { getComparisonOrThrow } from "@/lib/server/comparison-service";
import { comparisonIdSchema } from "@/lib/validation/comparison";
import type { ComparisonPatch, SameProofRepository } from "@/lib/database/repository";
import type { EvidenceField, EvidenceValue } from "@/models/domain";
import { assertRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

type Context = { params: Promise<{ comparisonId: string }> };

const requestSchema = z.object({
  suggestionId: z.string().min(1).max(160),
  expectedVersion: z.number().int().nonnegative(),
});

async function patchForAlternative(
  repository: SameProofRepository,
  comparison: Awaited<ReturnType<typeof getComparisonOrThrow>>["comparison"],
  listingId: string,
): Promise<ComparisonPatch> {
  const catalogue = await repository.getCatalogue();
  if (!comparison.targetListingId) throw new ValidationError("Target listing is missing.");
  const dependencies = resolveComparisonDependencies(
    catalogue,
    comparison.targetListingId,
    listingId,
  );
  if (!dependencies) throw new ValidationError("The suggested offer is no longer available.");
  const competitorRetailer = catalogue.retailers.find(
    (retailer) => retailer.id === dependencies.competitorListing.retailerId,
  );
  if (!competitorRetailer) throw new ValidationError("Suggested retailer is missing.");
  const { buildEvidenceRecord } = await import("@/lib/database/repository");
  return {
    competitorListingId: dependencies.competitorListing.id,
    competitorObservationId: dependencies.competitorObservation.id,
    evidence: {
      target: comparison.evidence.target,
      competitor: buildEvidenceRecord(
        dependencies.competitorListing,
        dependencies.competitorObservation,
        dependencies.competitorProduct,
        competitorRetailer,
      ),
    },
    evidenceConfirmed: false,
    stage: "evidence_lens",
  };
}

export const POST = withRouteErrors<Context>(async (request, context) => {
  assertRateLimit(request, "near-miss-apply", 30);
  const { comparisonId: rawId } = await context.params;
  const comparisonId = comparisonIdSchema.parse(rawId);
  const input = requestSchema.parse(await request.json());
  const { repository, comparison } = await getComparisonOrThrow(comparisonId);
  if (comparison.version !== input.expectedVersion) throw new VersionConflictError();
  const decision = await repository.getLatestDecision(comparisonId);
  if (!decision || decision.comparisonVersion !== comparison.version) {
    throw new ValidationError("Re-evaluate this comparison before applying a route.");
  }
  const suggestion = decision.nearMisses.find((item) => item.id === input.suggestionId);
  if (!suggestion) throw new ValidationError("That near-miss route is no longer available.");

  let patch: ComparisonPatch;
  if (suggestion.changeType === "switch_fulfilment") {
    patch = {
      context: { ...comparison.context, fulfilment: "pickup" },
      stage: "identity_bridge",
    };
  } else if (
    suggestion.changeType === "select_competitor_offer" ||
    suggestion.changeType === "select_unbundled_offer"
  ) {
    if (!suggestion.candidateListingId) {
      throw new ValidationError("The suggested route has no candidate listing.");
    }
    patch = await patchForAlternative(
      repository,
      comparison,
      suggestion.candidateListingId,
    );
  } else {
    const markForRecheck = (
      key: "priceCents" | "deliveryCostCents" | "stockState" | "observedAt",
    ): EvidenceField<EvidenceValue> => {
      const field = comparison.evidence.competitor[key];
      return {
        ...field,
        value: key === "observedAt" ? null : (field?.value ?? null),
        state: key === "observedAt" ? "unknown" as const : "unconfirmed" as const,
        sources: field?.sources ?? [],
        userConfirmed: false,
      };
    };
    patch = {
      evidence: {
        target: comparison.evidence.target,
        competitor: {
          ...comparison.evidence.competitor,
          priceCents: markForRecheck("priceCents"),
          deliveryCostCents: markForRecheck("deliveryCostCents"),
          stockState: markForRecheck("stockState"),
          observedAt: markForRecheck("observedAt"),
        },
      },
      evidenceConfirmed: false,
      stage: "evidence_lens",
    };
  }

  const updated = await repository.updateComparison(
    comparisonId,
    input.expectedVersion,
    patch,
  );
  if (updated === "version_conflict") throw new VersionConflictError();
  if (!updated) throw new ValidationError("The comparison could not be updated.");
  return NextResponse.json({ comparison: updated, appliedSuggestion: suggestion });
});
