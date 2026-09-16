import { NextResponse } from "next/server";

import { resolveComparisonDependencies } from "@/lib/database/repository";
import { ValidationError, VersionConflictError } from "@/lib/errors/app-error";
import { withRouteErrors } from "@/lib/errors/route-handler";
import { getComparisonOrThrow } from "@/lib/server/comparison-service";
import {
  comparisonIdSchema,
  updateComparisonSchema,
} from "@/lib/validation/comparison";
import type { ComparisonPatch } from "@/lib/database/repository";
import { assertRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ comparisonId: string }> };

export const GET = withRouteErrors<Context>(async (_request, context) => {
  const { comparisonId: rawId } = await context.params;
  const comparisonId = comparisonIdSchema.parse(rawId);
  const { repository, comparison } = await getComparisonOrThrow(comparisonId);
  const decision = await repository.getLatestDecision(comparisonId);
  return NextResponse.json(
    { comparison, decision, mode: repository.mode },
    { headers: { "Cache-Control": "no-store" } },
  );
});

export const PATCH = withRouteErrors<Context>(async (request, context) => {
  assertRateLimit(request, "comparison-update", 60);
  const { comparisonId: rawId } = await context.params;
  const comparisonId = comparisonIdSchema.parse(rawId);
  const input = updateComparisonSchema.parse(await request.json());
  const { repository, comparison } = await getComparisonOrThrow(comparisonId);
  const { expectedVersion, ...rawPatch } = input;
  const patch = rawPatch as ComparisonPatch;
  if (
    patch.targetListingId ||
    patch.competitorListingId ||
    patch.targetObservationId ||
    patch.competitorObservationId
  ) {
    const targetListingId = patch.targetListingId ?? comparison.targetListingId;
    const competitorListingId =
      patch.competitorListingId ?? comparison.competitorListingId;
    if (!targetListingId || !competitorListingId) {
      throw new ValidationError("Select both offers before continuing.");
    }
    const targetChanged = targetListingId !== comparison.targetListingId;
    const competitorChanged =
      competitorListingId !== comparison.competitorListingId;
    const catalogue = await repository.getCatalogue();
    const dependencies = resolveComparisonDependencies(
      catalogue,
      targetListingId,
      competitorListingId,
      patch.targetObservationId ??
        (targetChanged ? undefined : comparison.targetObservationId),
      patch.competitorObservationId ??
        (competitorChanged ? undefined : comparison.competitorObservationId),
    );
    if (!dependencies || dependencies.targetRetailer.kind !== "retailer") {
      throw new ValidationError("The selected offer pair is not valid for a supported retailer policy.");
    }
    patch.targetRetailerId = dependencies.targetListing.retailerId;
    patch.targetObservationId = dependencies.targetObservation.id;
    patch.competitorObservationId = dependencies.competitorObservation.id;
  }
  const updated = await repository.updateComparison(
    comparisonId,
    expectedVersion,
    patch,
  );
  if (updated === "version_conflict") throw new VersionConflictError();
  if (!updated) throw new VersionConflictError();
  return NextResponse.json({ comparison: updated, mode: repository.mode });
});

export const DELETE = withRouteErrors<Context>(async (request, context) => {
  assertRateLimit(request, "comparison-delete", 10);
  const { comparisonId: rawId } = await context.params;
  const comparisonId = comparisonIdSchema.parse(rawId);
  const { repository } = await getComparisonOrThrow(comparisonId);
  const deleted = await repository.deleteComparison(comparisonId);
  if (!deleted) throw new ValidationError("The comparison could not be deleted.");
  return NextResponse.json({ deleted: true });
});
