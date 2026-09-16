import { evaluateIdentity } from "@/lib/identity-engine";
import { dynamicEvidenceValidUntil } from "@/lib/domain/evidence";
import { generateNearMisses } from "@/lib/near-miss-engine";
import { evaluatePolicy } from "@/lib/policy-engine";
import type { Decision, EvaluationInput } from "@/models/domain";

export const ENGINE_VERSION = "sameproof-engine/1.0.0";

/** Produces a deterministic, framework-independent SameProof decision. */
export function evaluateComparison(input: EvaluationInput): Decision {
  const identity = evaluateIdentity(
    input.targetListing,
    input.competitorListing,
    input.targetProduct,
    input.competitorProduct,
    input.comparison.evidence,
  );
  const policy = evaluatePolicy(input, identity);
  const nearMisses =
    policy.status === "verified"
      ? []
      : generateNearMisses({ evaluation: input, policyChecks: policy.checks });
  const generatedAt = input.now;
  const evidenceExpiries = [
    dynamicEvidenceValidUntil(input.comparison.evidence.target, input.comparison.context.fulfilment),
    dynamicEvidenceValidUntil(input.comparison.evidence.competitor, input.comparison.context.fulfilment),
  ].filter((value): value is string => Boolean(value));
  const expiresAt = evidenceExpiries.length
    ? evidenceExpiries.sort((left, right) => Date.parse(left) - Date.parse(right))[0]
    : generatedAt;

  return {
    id: crypto.randomUUID(),
    comparisonId: input.comparison.id,
    comparisonVersion: input.comparison.version,
    policyVersionId: input.policy.id,
    engineVersion: ENGINE_VERSION,
    status: policy.status,
    identity,
    pricing: policy.pricing,
    policyChecks: policy.checks,
    nearMisses,
    generatedAt,
    expiresAt,
  };
}
