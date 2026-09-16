import { NextResponse } from "next/server";

import { evaluateComparison } from "@/lib/decision-engine";
import { VersionConflictError } from "@/lib/errors/app-error";
import { withRouteErrors } from "@/lib/errors/route-handler";
import {
  buildEvaluationInput,
  getComparisonOrThrow,
} from "@/lib/server/comparison-service";
import { comparisonIdSchema } from "@/lib/validation/comparison";
import { assertRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

type Context = { params: Promise<{ comparisonId: string }> };

export const POST = withRouteErrors<Context>(async (request, context) => {
  assertRateLimit(request, "comparison-evaluate", 30);
  const { comparisonId: rawId } = await context.params;
  const comparisonId = comparisonIdSchema.parse(rawId);
  const { repository, comparison } = await getComparisonOrThrow(comparisonId);
  const evaluation = await buildEvaluationInput(comparison);
  const previewDecision = evaluateComparison(evaluation);
  const nextStage =
    previewDecision.status === "verified" || previewDecision.status === "likely"
      ? "passport"
      : "near_miss";
  const updated = await repository.updateComparison(comparison.id, comparison.version, {
    stage: nextStage,
  });
  if (!updated || updated === "version_conflict") throw new VersionConflictError();
  const decision = {
    ...previewDecision,
    id: crypto.randomUUID(),
    comparisonVersion: updated.version,
  };
  await repository.saveDecision(decision);
  return NextResponse.json({ decision, comparison: updated });
});
