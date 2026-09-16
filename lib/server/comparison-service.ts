import "server-only";

import { getRepository } from "@/lib/database";
import { resolveComparisonDependencies } from "@/lib/database/repository";
import {
  ExpiredResourceError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import type { Comparison, EvaluationInput } from "@/models/domain";

export function assertNotExpired(comparison: Comparison) {
  if (Date.parse(comparison.expiresAt) <= Date.now()) {
    throw new ExpiredResourceError("Comparison");
  }
}

export async function getComparisonOrThrow(id: string) {
  const repository = await getRepository();
  const comparison = await repository.getComparison(id);
  if (!comparison) throw new NotFoundError("Comparison");
  assertNotExpired(comparison);
  return { repository, comparison };
}

export async function buildEvaluationInput(
  comparison: Comparison,
): Promise<EvaluationInput> {
  if (
    !comparison.targetListingId ||
    !comparison.competitorListingId ||
    !comparison.targetObservationId ||
    !comparison.competitorObservationId
  ) {
    throw new ValidationError("Select both offers before evaluating the comparison.");
  }
  if (!comparison.evidenceConfirmed) {
    throw new ValidationError("Review and confirm the evidence before evaluation.");
  }

  const repository = await getRepository();
  const catalogue = await repository.getCatalogue();
  const dependencies = resolveComparisonDependencies(
    catalogue,
    comparison.targetListingId,
    comparison.competitorListingId,
    comparison.targetObservationId,
    comparison.competitorObservationId,
  );
  if (!dependencies) {
    throw new ValidationError("The selected listings no longer have usable evidence.");
  }

  return {
    comparison,
    targetListing: dependencies.targetListing,
    competitorListing: dependencies.competitorListing,
    targetObservation: dependencies.targetObservation,
    competitorObservation: dependencies.competitorObservation,
    targetProduct: dependencies.targetProduct,
    competitorProduct: dependencies.competitorProduct,
    policy: dependencies.policy,
    catalogue,
    now: new Date().toISOString(),
  };
}
