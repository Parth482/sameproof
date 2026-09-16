import { describe, expect, it } from "vitest";

import { evaluateComparison } from "@/lib/decision-engine";
import {
  buildEvidenceRecord,
  resolveComparisonDependencies,
} from "@/lib/database/repository";
import {
  demoScenarios,
  seedCatalogue,
} from "@/lib/database/seed-data";
import type { Comparison, EvaluationInput, EvidenceRecord } from "@/models/domain";

function confirmRecord(record: EvidenceRecord): EvidenceRecord {
  return Object.fromEntries(Object.entries(record).map(([key, field]) => [key, {
    ...field,
    state: field.value === null ? "unknown" : "confirmed",
    userConfirmed: true,
  }])) as EvidenceRecord;
}

function evaluationForScenario(scenarioId: string): EvaluationInput {
  const scenario = demoScenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenario ${scenarioId}`);
  const dependencies = resolveComparisonDependencies(
    seedCatalogue,
    scenario.targetListingId,
    scenario.competitorListingId,
  );
  if (!dependencies) throw new Error("Scenario dependencies are invalid");
  const competitorRetailer = seedCatalogue.retailers.find(
    (retailer) => retailer.id === dependencies.competitorListing.retailerId,
  );
  if (!competitorRetailer) throw new Error("Competitor retailer is invalid");

  const comparison: Comparison = {
    id: crypto.randomUUID(),
    targetRetailerId: dependencies.targetListing.retailerId,
    targetListingId: dependencies.targetListing.id,
    competitorListingId: dependencies.competitorListing.id,
    targetObservationId: dependencies.targetObservation.id,
    competitorObservationId: dependencies.competitorObservation.id,
    context: {
      fulfilment: scenario.fulfilment,
      mustHave: ["exact_identity", "new_condition", "manufacturer_warranty"],
      flexible: ["delivery", "pickup", "lowest_total", "fresh_evidence"],
    },
    evidence: {
      target: buildEvidenceRecord(
        dependencies.targetListing,
        dependencies.targetObservation,
        dependencies.targetProduct,
        dependencies.targetRetailer,
      ),
      competitor: buildEvidenceRecord(
        dependencies.competitorListing,
        dependencies.competitorObservation,
        dependencies.competitorProduct,
        competitorRetailer,
      ),
    },
    stage: "identity_bridge",
    evidenceConfirmed: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  };
  comparison.evidence = {
    target: confirmRecord(comparison.evidence.target),
    competitor: confirmRecord(comparison.evidence.competitor),
  };

  return {
    comparison,
    ...dependencies,
    catalogue: seedCatalogue,
    now: new Date().toISOString(),
  };
}

describe("SameProof decision engine", () => {
  it.each([
    ["scenario-exact", "verified"],
    ["scenario-suffix", "excluded"],
    ["scenario-warranty", "excluded"],
    ["scenario-bundle", "excluded"],
    ["scenario-delivery", "excluded"],
    ["scenario-marketplace", "excluded"],
    ["scenario-stock", "excluded"],
    ["scenario-stale", "excluded"],
    ["scenario-unknown", "uncertain"],
    ["scenario-discretionary", "likely"],
  ])("evaluates %s as %s", (scenarioId, expectedStatus) => {
    expect(evaluateComparison(evaluationForScenario(scenarioId)).status).toBe(
      expectedStatus,
    );
  });

  it("separates functional similarity from a regional identity conflict", () => {
    const decision = evaluateComparison(evaluationForScenario("scenario-suffix"));
    expect(decision.identity.status).toBe("conflict");
    expect(
      decision.identity.functionalComparison.every((check) => check.result === "pass"),
    ).toBe(true);
  });

  it("offers pickup without changing exact identity when delivery removes the saving", () => {
    const decision = evaluateComparison(evaluationForScenario("scenario-delivery"));
    expect(decision.nearMisses[0]).toEqual(expect.objectContaining({
      changeType: "switch_fulfilment",
      proposedValue: "pickup",
      resultingStatus: "verified",
    }));
    expect(decision.nearMisses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "switch_fulfilment",
          proposedValue: "pickup",
        }),
      ]),
    );
    expect(
      decision.nearMisses.every((suggestion) =>
        suggestion.preservedMustHaves.includes("exact_identity"),
      ),
    ).toBe(true);
  });

  it("does not suggest pickup when delivery is a must-have", () => {
    const input = evaluationForScenario("scenario-delivery");
    input.comparison.context.mustHave.push("delivery");
    input.comparison.context.flexible = input.comparison.context.flexible.filter(
      (item) => item !== "delivery",
    );
    const decision = evaluateComparison(input);
    expect(decision.nearMisses.some((item) => item.changeType === "switch_fulfilment")).toBe(false);
  });

  it("keeps missing identifiers unknown instead of inventing defaults", () => {
    const decision = evaluateComparison(evaluationForScenario("scenario-unknown"));
    const gtin = decision.identity.commercialChecks.find(
      (check) => check.code === "IDENTITY_GTIN",
    );
    expect(gtin?.result).toBe("unknown");
    expect(decision.status).toBe("uncertain");
  });

  it("keeps an explicitly unknown price unknown instead of using catalogue fallback", () => {
    const input = evaluationForScenario("scenario-exact");
    input.comparison.evidence.competitor.priceCents = {
      value: null,
      state: "unknown",
      sources: [{ type: "manual", observedAt: input.now }],
      confidence: "low",
      userConfirmed: true,
    };
    const decision = evaluateComparison(input);
    expect(decision.pricing.competitorPrice).toBeNull();
    expect(decision.pricing.comparableCompetitorTotal).toBeNull();
    expect(
      decision.policyChecks.find((check) => check.code === "LOWER_DELIVERED_PRICE")?.result,
    ).toBe("unknown");
    expect(decision.status).toBe("uncertain");
  });

  it("returns Unknown instead of a server error when the comparison price is unreviewed", () => {
    const input = evaluationForScenario("scenario-exact");
    input.comparison.evidence.target.priceCents = {
      ...input.comparison.evidence.target.priceCents!,
      state: "unconfirmed",
      userConfirmed: false,
    };
    const decision = evaluateComparison(input);
    expect(decision.pricing.targetPrice).toBeNull();
    expect(decision.policyChecks.find((check) => check.code === "LOWER_DELIVERED_PRICE")?.result).toBe("unknown");
    expect(decision.status).toBe("uncertain");
  });

  it("does not refresh stale price and stock by changing only the observation label", () => {
    const input = evaluationForScenario("scenario-stale");
    input.comparison.evidence.competitor.observedAt = {
      value: input.now,
      state: "confirmed",
      sources: [{ type: "manual", observedAt: input.now }],
      confidence: "medium",
      userConfirmed: true,
    };
    const decision = evaluateComparison(input);
    expect(decision.status).toBe("excluded");
  });

  it("extends freshness after the user rechecks every dynamic competitor fact", () => {
    const input = evaluationForScenario("scenario-stale");
    for (const key of ["priceCents", "deliveryCostCents", "stockState", "observedAt"] as const) {
      const field = input.comparison.evidence.competitor[key]!;
      input.comparison.evidence.competitor[key] = {
        ...field,
        value: key === "observedAt" ? input.now : field.value,
        state: "confirmed",
        sources: [...field.sources, { type: "manual", observedAt: input.now }],
        userConfirmed: true,
      };
    }
    const decision = evaluateComparison(input);
    expect(decision.status).toBe("verified");
    expect(Date.parse(decision.expiresAt)).toBeGreaterThan(Date.parse(input.now));
  });

  it("keeps an unconfirmed bundle unknown rather than treating it as no extras", () => {
    const input = evaluationForScenario("scenario-exact");
    input.comparison.evidence.competitor.bundleItems = {
      value: [],
      state: "unconfirmed",
      sources: [{ type: "dataset", observedAt: input.now }],
      userConfirmed: false,
    };
    const decision = evaluateComparison(input);
    expect(decision.identity.commercialChecks.find((item) => item.code === "IDENTITY_BUNDLE")?.result).toBe("unknown");
    expect(decision.status).toBe("uncertain");
  });
});
