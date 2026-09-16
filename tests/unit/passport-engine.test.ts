import { describe, expect, it } from "vitest";

import { generatePassport, sha256 } from "@/lib/passport-engine";
import { evaluateComparison } from "@/lib/decision-engine";
import {
  buildEvidenceRecord,
  resolveComparisonDependencies,
} from "@/lib/database/repository";
import { seedCatalogue } from "@/lib/database/seed-data";
import type { Comparison, EvaluationInput, EvidenceRecord } from "@/models/domain";

function confirmRecord(record: EvidenceRecord): EvidenceRecord {
  return Object.fromEntries(Object.entries(record).map(([key, field]) => [key, {
    ...field,
    state: field.value === null ? "unknown" : "confirmed",
    userConfirmed: true,
  }])) as EvidenceRecord;
}

function validInput(): EvaluationInput {
  const dependencies = resolveComparisonDependencies(
    seedCatalogue,
    "lst-ow-dell",
    "lst-cc-dell-exact",
  )!;
  const competitorRetailer = seedCatalogue.retailers.find(
    (retailer) => retailer.id === dependencies.competitorListing.retailerId,
  )!;
  const now = new Date().toISOString();
  const comparison: Comparison = {
    id: crypto.randomUUID(),
    targetRetailerId: dependencies.targetListing.retailerId,
    targetListingId: dependencies.targetListing.id,
    competitorListingId: dependencies.competitorListing.id,
    targetObservationId: dependencies.targetObservation.id,
    competitorObservationId: dependencies.competitorObservation.id,
    context: {
      fulfilment: "delivery",
      mustHave: ["exact_identity"],
      flexible: ["lowest_total"],
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
    stage: "passport",
    evidenceConfirmed: true,
    version: 2,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  };
  comparison.evidence = {
    target: confirmRecord(comparison.evidence.target),
    competitor: confirmRecord(comparison.evidence.competitor),
  };
  return { comparison, ...dependencies, catalogue: seedCatalogue, now };
}

describe("passport engine", () => {
  it("generates stable hashes for semantically identical key ordering", async () => {
    expect(await sha256({ b: 2, a: 1 })).toBe(await sha256({ a: 1, b: 2 }));
  });

  it("stores only the hash of a public token", async () => {
    const input = validInput();
    const decision = evaluateComparison(input);
    const token = "a-secure-public-token-with-more-than-32-characters";
    const passport = await generatePassport(
      input.comparison,
      decision,
      input.policy,
      token,
    );
    expect(passport.publicTokenHash).toBe(await sha256(token));
    expect(JSON.stringify(passport)).not.toContain(token);
  });

  it("rejects a decision made from an older comparison version", async () => {
    const input = validInput();
    const decision = evaluateComparison(input);
    input.comparison.version += 1;
    await expect(
      generatePassport(input.comparison, decision, input.policy, "valid-token-value"),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});
