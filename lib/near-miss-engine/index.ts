import { evaluateIdentity } from "@/lib/identity-engine";
import { addMoney } from "@/lib/domain/normalization";
import { evaluatePolicy } from "@/lib/policy-engine";
import type {
  EvaluationInput,
  NearMissSuggestion,
  RuleOutcome,
} from "@/models/domain";

export interface NearMissInput {
  evaluation: EvaluationInput;
  policyChecks: RuleOutcome[];
}

function latestObservationForListing(
  input: EvaluationInput,
  listingId: string,
) {
  return input.catalogue.observations
    .filter((observation) => observation.listingId === listingId)
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];
}

/**
 * Generates counterfactual actions while preserving every declared must-have.
 * It never edits observed facts such as stock or identity to manufacture a pass.
 */
export function generateNearMisses({
  evaluation,
  policyChecks,
}: NearMissInput): NearMissSuggestion[] {
  const failures = new Set(
    policyChecks.filter((check) => check.result !== "pass").map((check) => check.code),
  );
  const suggestions: NearMissSuggestion[] = [];
  const identity = evaluateIdentity(
    evaluation.targetListing,
    evaluation.competitorListing,
    evaluation.targetProduct,
    evaluation.competitorProduct,
    evaluation.comparison.evidence,
  );

  if (
    failures.has("LOWER_DELIVERED_PRICE") &&
    evaluation.competitorObservation.pickupAvailable &&
    evaluation.comparison.context.fulfilment === "delivery" &&
    !evaluation.comparison.context.mustHave.includes("delivery") &&
    (evaluation.comparison.context.flexible.includes("delivery") ||
      evaluation.comparison.context.flexible.includes("pickup")) &&
    evaluation.competitorObservation.price.amountCents <=
      evaluation.targetObservation.price.amountCents
  ) {
    const pickupEvaluation: EvaluationInput = {
      ...evaluation,
      comparison: {
        ...evaluation.comparison,
        context: { ...evaluation.comparison.context, fulfilment: "pickup" },
      },
    };
    const pickupStatus = evaluatePolicy(pickupEvaluation, identity).status;
    if (pickupStatus !== "excluded") suggestions.push({
      id: "near-pickup",
      blockedBy: "LOWER_DELIVERED_PRICE",
      changeType: "switch_fulfilment",
      currentValue: "delivery",
      proposedValue: "pickup",
      changedConstraints: ["delivery", "pickup"],
      preservedMustHaves: evaluation.comparison.context.mustHave,
      resultingStatus: pickupStatus,
      effortRank: 1,
      explanation:
        "Switch to pickup. The product price is lower, but delivery currently removes the saving.",
    });
  }

  if (failures.has("EVIDENCE_FRESH")) {
    suggestions.push({
      id: "near-refresh",
      blockedBy: "EVIDENCE_FRESH",
      changeType: "refresh_evidence",
      currentValue: evaluation.competitorObservation.validUntil,
      proposedValue: "Recheck the offer now",
      changedConstraints: ["fresh_evidence"],
      preservedMustHaves: evaluation.comparison.context.mustHave,
      resultingStatus: "uncertain",
      effortRank: 1,
      explanation:
        "Refresh the price and stock evidence before relying on this comparison.",
    });
  }

  const currentProductId = failures.has("IDENTITY_EXACT")
    ? evaluation.targetProduct?.id
    : evaluation.competitorListing.productId;
  if (
    currentProductId &&
    (failures.has("COMPETITOR_STOCK") ||
      failures.has("SELLER_ELIGIBLE") ||
      failures.has("LOWER_DELIVERED_PRICE"))
  ) {
    const alternatives = evaluation.catalogue.listings
      .filter(
        (listing) =>
          listing.id !== evaluation.competitorListing.id &&
          listing.productId === currentProductId &&
          listing.seller.type === "retailer" &&
          listing.condition === "new",
      )
      .map((listing) => ({ listing, observation: latestObservationForListing(evaluation, listing.id) }))
      .filter(({ observation }) => {
        if (!observation || observation.stockState !== "in_stock") return false;
        const total = addMoney(observation.price, observation.delivery.cost);
        return total.amountCents <= evaluation.targetObservation.price.amountCents;
      })
      .filter(({ listing }) => {
        const product = evaluation.catalogue.products.find(
          (candidate) => candidate.id === listing.productId,
        );
        return (
          evaluateIdentity(
            evaluation.targetListing,
            listing,
            evaluation.targetProduct,
            product,
          ).status === "exact"
        );
      })
      .sort((left, right) => {
        const leftTotal = addMoney(left.observation.price, left.observation.delivery.cost);
        const rightTotal = addMoney(right.observation.price, right.observation.delivery.cost);
        return leftTotal.amountCents - rightTotal.amountCents;
      });

    const best = alternatives[0];
    if (best) {
      const candidateProduct = evaluation.catalogue.products.find(
        (candidate) => candidate.id === best.listing.productId,
      );
      const candidateIdentity = evaluateIdentity(
        evaluation.targetListing,
        best.listing,
        evaluation.targetProduct,
        candidateProduct,
      );
      const candidateEvaluation: EvaluationInput = {
        ...evaluation,
        competitorListing: best.listing,
        competitorObservation: best.observation,
        competitorProduct: candidateProduct,
        comparison: {
          ...evaluation.comparison,
          competitorListingId: best.listing.id,
          competitorObservationId: best.observation.id,
          evidence: { ...evaluation.comparison.evidence, competitor: {} },
        },
      };
      const candidateStatus = evaluatePolicy(candidateEvaluation, candidateIdentity).status;
      if (candidateStatus !== "excluded") suggestions.push({
        id: `near-listing-${best.listing.id}`,
        blockedBy: [...failures][0] ?? "CURRENT_OFFER_BLOCKED",
        changeType: "select_competitor_offer",
        currentValue: evaluation.competitorListing.id,
        proposedValue: best.listing.id,
        candidateListingId: best.listing.id,
        candidateObservationId: best.observation.id,
        changedConstraints: failures.has("IDENTITY_EXACT")
          ? ["exact_identity"]
          : ["lowest_total"],
        preservedMustHaves: evaluation.comparison.context.mustHave,
        resultingStatus: candidateStatus,
        effortRank: 2,
        explanation: `Use the exact ${best.listing.listedModel ?? "model"} offer from ${best.listing.seller.name}, which is in stock and cheaper after delivery.`,
      });
    }
  }

  const preferenceRank = (suggestion: NearMissSuggestion) => {
    const positions = suggestion.changedConstraints.map((constraint) => {
      const flexibleIndex = evaluation.comparison.context.flexible.indexOf(constraint);
      return flexibleIndex < 0 ? Number.MAX_SAFE_INTEGER : flexibleIndex;
    });
    return Math.min(...positions, Number.MAX_SAFE_INTEGER);
  };
  const resultRank: Record<NearMissSuggestion["resultingStatus"], number> = {
    verified: 0,
    likely: 1,
    uncertain: 2,
  };
  return suggestions.sort(
    (left, right) =>
      resultRank[left.resultingStatus] - resultRank[right.resultingStatus] ||
      left.effortRank - right.effortRank ||
      preferenceRank(left) - preferenceRank(right),
  );
}
