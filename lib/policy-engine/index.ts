import { addMoney, percentageBelow } from "@/lib/domain/normalization";
import { dynamicEvidenceValidUntil, trustedEvidenceValue } from "@/lib/domain/evidence";
import { AppError } from "@/lib/errors/app-error";
import type {
  DecisionStatus,
  EvaluationInput,
  Money,
  PolicyField,
  PolicyPredicate,
  PolicyScalar,
  RuleOutcome,
} from "@/models/domain";
import type { IdentityEvaluation } from "@/lib/identity-engine";

interface PolicyFacts {
  identity: { status: IdentityEvaluation["status"] };
  target: { stockState: string | null };
  competitor: {
    stockState: string | null;
    sellerType: string | null;
    condition: string | null;
    membershipRequired: boolean | null;
  };
  pricing: {
    competitorTotalCents: number | null;
    targetPriceCents: number | null;
  };
  evidence: { fresh: boolean | null };
}

const policyLabels: Record<string, string> = {
  IDENTITY_EXACT: "Same product confirmed",
  TARGET_STOCK: "Product available at the price-match retailer",
  COMPETITOR_STOCK: "Competitor has the product in stock",
  SELLER_ELIGIBLE: "Sold directly by an eligible retailer",
  CONDITION_NEW: "Product is new",
  PUBLIC_PRICE: "Price is available without paid membership",
  LOWER_DELIVERED_PRICE: "Competitor total is lower",
  EVIDENCE_FRESH: "Price and stock are current",
};

function readField(facts: PolicyFacts, field: PolicyField): PolicyScalar | null | undefined {
  const readers: Record<PolicyField, () => PolicyScalar | null | undefined> = {
    "identity.status": () => facts.identity.status,
    "target.stockState": () => facts.target.stockState,
    "competitor.stockState": () => facts.competitor.stockState,
    "competitor.sellerType": () => facts.competitor.sellerType,
    "competitor.condition": () => facts.competitor.condition,
    "competitor.membershipRequired": () => facts.competitor.membershipRequired,
    "pricing.competitorTotalCents": () => facts.pricing.competitorTotalCents,
    "pricing.targetPriceCents": () => facts.pricing.targetPriceCents,
    "evidence.fresh": () => facts.evidence.fresh,
  };
  return readers[field]();
}

function evaluatePredicate(
  predicate: PolicyPredicate,
  facts: PolicyFacts,
): RuleOutcome {
  const actual = readField(facts, predicate.field);
  if (actual === undefined || actual === null || actual === "unknown") {
    return {
      code: predicate.code,
      label: policyLabels[predicate.code] ?? predicate.code.replaceAll("_", " "),
      result: "unknown",
      classification: predicate.classification,
      explanation: predicate.unknownMessage,
      evidence: [{ field: predicate.field, value: actual ?? null, sourceTypes: ["dataset"] }],
    };
  }

  let passed: boolean;
  switch (predicate.operator) {
    case "equals":
    case "must_be_true":
      passed = actual === predicate.expectedValue;
      break;
    case "included_in":
      passed = predicate.expectedValue.includes(actual);
      break;
    case "less_than_or_equal": {
      const other = readField(facts, predicate.compareToField);
      if (other === undefined || other === null || other === "unknown") {
        return {
          code: predicate.code,
          label: policyLabels[predicate.code] ?? predicate.code.replaceAll("_", " "),
          result: "unknown",
          classification: predicate.classification,
          explanation: predicate.unknownMessage,
          evidence: [
            { field: predicate.field, value: actual, sourceTypes: ["dataset"] },
            { field: predicate.compareToField, value: other ?? null, sourceTypes: ["dataset"] },
          ],
        };
      }
      if (typeof actual !== "number" || typeof other !== "number") {
        throw new AppError(
          "POLICY_CONFIGURATION_INVALID",
          `Policy rule ${predicate.code} requires numeric operands.`,
          500,
        );
      }
      passed = actual <= other;
      break;
    }
    default: {
      const exhaustive: never = predicate;
      throw new AppError(
        "POLICY_CONFIGURATION_INVALID",
        `Unsupported policy predicate: ${JSON.stringify(exhaustive)}`,
        500,
      );
    }
  }

  return {
    code: predicate.code,
    label: policyLabels[predicate.code] ?? predicate.code.replaceAll("_", " "),
    result: passed ? "pass" : "fail",
    classification: predicate.classification,
    explanation: passed ? predicate.successMessage : predicate.failureMessage,
    evidence: [{ field: predicate.field, value: actual, sourceTypes: ["dataset"] }],
  };
}

export interface PolicyEvaluation {
  status: DecisionStatus;
  checks: RuleOutcome[];
  pricing: {
    targetPrice: Money | null;
    competitorPrice: Money | null;
    competitorDelivery: Money | null;
    comparableCompetitorTotal: Money | null;
    projectedMatchedPrice?: Money;
  };
}

/** Evaluates only allowlisted, data-driven predicates. No stored executable code is run. */
export function evaluatePolicy(
  input: EvaluationInput,
  identity: IdentityEvaluation,
): PolicyEvaluation {
  const evidenceValue = <T,>(
    side: "target" | "competitor",
    key: keyof typeof input.comparison.evidence.target,
    fallback: T,
  ): T | null => {
    if (!input.comparison.evidence) return fallback;
    const captured = input.comparison.evidence[side][key];
    if (!captured) return null;
    return trustedEvidenceValue<T>(input.comparison.evidence[side], key);
  };
  const targetPriceCents = evidenceValue(
    "target",
    "priceCents",
    input.targetObservation.price.amountCents,
  );
  const competitorPriceCents = evidenceValue(
    "competitor",
    "priceCents",
    input.competitorObservation.price.amountCents,
  );
  const competitorDeliveryCents = input.comparison.context.fulfilment === "pickup"
    ? 0
    : evidenceValue(
        "competitor",
        "deliveryCostCents",
        input.competitorObservation.delivery.cost.amountCents,
      );
  const targetPrice: Money | null = typeof targetPriceCents === "number" ? { amountCents: targetPriceCents, currency: "AUD" } : null;
  const competitorPrice: Money | null = typeof competitorPriceCents === "number" ? { amountCents: competitorPriceCents, currency: "AUD" } : null;
  const competitorDelivery: Money | null = typeof competitorDeliveryCents === "number" ? { amountCents: competitorDeliveryCents, currency: "AUD" } : null;
  const competitorTotal = competitorPrice && competitorDelivery
    ? addMoney(competitorPrice, competitorDelivery)
    : null;
  const evidenceValidUntil = dynamicEvidenceValidUntil(
    input.comparison.evidence.competitor,
    input.comparison.context.fulfilment,
  );
  const facts: PolicyFacts = {
    identity: { status: identity.status },
    target: {
      stockState: evidenceValue(
        "target",
        "stockState",
        input.targetObservation.stockState,
      ),
    },
    competitor: {
      stockState: evidenceValue(
        "competitor",
        "stockState",
        input.competitorObservation.stockState,
      ),
      sellerType: evidenceValue(
        "competitor",
        "sellerType",
        input.competitorListing.seller.type,
      ),
      condition: evidenceValue(
        "competitor",
        "condition",
        input.competitorListing.condition,
      ),
      membershipRequired: evidenceValue(
        "competitor",
        "membershipRequired",
        input.competitorObservation.membershipRequired,
      ),
    },
    pricing: {
      competitorTotalCents: competitorTotal?.amountCents ?? null,
      targetPriceCents: targetPrice?.amountCents ?? null,
    },
    evidence: {
      fresh: evidenceValidUntil === null ? null : Date.parse(evidenceValidUntil) > Date.parse(input.now),
    },
  };

  const checks = [...input.policy.predicates, ...input.policy.exclusions].map(
    (predicate) => evaluatePredicate(predicate, facts),
  );
  const decisive = checks.filter(
    (check) => check.classification !== "discretionary",
  );
  const discretionary = checks.filter(
    (check) => check.classification === "discretionary",
  );

  let status: DecisionStatus;
  if (decisive.some((check) => check.result === "fail")) status = "excluded";
  else if (decisive.some((check) => check.result === "unknown")) status = "uncertain";
  else if (
    discretionary.length > 0 ||
    input.policy.discretionaryStatements.length > 0 ||
    checks.some((check) => check.result === "unknown")
  ) {
    status = "likely";
  } else status = "verified";

  const projectedMatchedPrice =
    competitorTotal && (status === "verified" || status === "likely")
      ? input.policy.priceAdjustment.type === "percentage_below"
        ? percentageBelow(
            competitorTotal,
            input.policy.priceAdjustment.percentageBasisPoints ?? 0,
          )
        : competitorTotal
      : undefined;

  return {
    status,
    checks,
    pricing: {
      targetPrice,
      competitorPrice,
      competitorDelivery,
      comparableCompetitorTotal: competitorTotal,
      projectedMatchedPrice,
    },
  };
}
