import "server-only";

import { seedCatalogue, demoScenarios } from "@/lib/database/seed-data";
import {
  buildEvidenceRecord,
  resolveComparisonDependencies,
  type ComparisonPatch,
  type SameProofRepository,
} from "@/lib/database/repository";
import type { Comparison, Decision, PriceMatchPassport } from "@/models/domain";

interface DemoStore {
  comparisons: Map<string, Comparison>;
  decisions: Map<string, Decision>;
  passports: Map<string, PriceMatchPassport>;
}

declare global {
  var sameProofDemoStore: DemoStore | undefined;
}

const store: DemoStore =
  globalThis.sameProofDemoStore ?? {
    comparisons: new Map(),
    decisions: new Map(),
    passports: new Map(),
  };
globalThis.sameProofDemoStore = store;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryRepository implements SameProofRepository {
  readonly mode = "demo" as const;

  async getCatalogue() {
    return clone(seedCatalogue);
  }

  async getScenarios() {
    return clone(demoScenarios);
  }

  async createComparison(input: {
    targetListingId: string;
    competitorListingId: string;
    context: Comparison["context"];
  }) {
    const dependencies = resolveComparisonDependencies(
      seedCatalogue,
      input.targetListingId,
      input.competitorListingId,
    );
    if (!dependencies) return Promise.reject(new Error("Comparison dependencies missing"));

    const createdAt = new Date().toISOString();
    const comparison: Comparison = {
      id: crypto.randomUUID(),
      targetRetailerId: dependencies.targetListing.retailerId,
      targetListingId: dependencies.targetListing.id,
      competitorListingId: dependencies.competitorListing.id,
      targetObservationId: dependencies.targetObservation.id,
      competitorObservationId: dependencies.competitorObservation.id,
      context: input.context,
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
          seedCatalogue.retailers.find(
            (item) => item.id === dependencies.competitorListing.retailerId,
          )!,
        ),
      },
      stage: "evidence_lens",
      evidenceConfirmed: false,
      version: 0,
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
    };
    store.comparisons.set(comparison.id, clone(comparison));
    return clone(comparison);
  }

  async getComparison(id: string) {
    const value = store.comparisons.get(id);
    return value ? clone(value) : null;
  }

  async deleteComparison(id: string) {
    const existed = store.comparisons.delete(id);
    for (const [decisionId, decision] of store.decisions) {
      if (decision.comparisonId === id) store.decisions.delete(decisionId);
    }
    for (const [tokenHash, passport] of store.passports) {
      if (passport.comparisonId === id) store.passports.delete(tokenHash);
    }
    return existed;
  }

  async updateComparison(
    id: string,
    expectedVersion: number,
    patch: ComparisonPatch,
  ) {
    const existing = store.comparisons.get(id);
    if (!existing) return null;
    if (existing.version !== expectedVersion) return "version_conflict" as const;
    const updated: Comparison = {
      ...existing,
      ...clone(patch),
      id: existing.id,
      createdAt: existing.createdAt,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };
    store.comparisons.set(id, updated);
    return clone(updated);
  }

  async saveDecision(decision: Decision) {
    store.decisions.set(decision.id, clone(decision));
  }

  async getDecision(id: string) {
    const value = store.decisions.get(id);
    return value ? clone(value) : null;
  }

  async getLatestDecision(comparisonId: string) {
    const values = [...store.decisions.values()]
      .filter((decision) => decision.comparisonId === comparisonId)
      .sort((left, right) => Date.parse(right.generatedAt) - Date.parse(left.generatedAt));
    return values[0] ? clone(values[0]) : null;
  }

  async savePassport(passport: PriceMatchPassport) {
    store.passports.set(passport.publicTokenHash, clone(passport));
  }

  async getPassportByTokenHash(tokenHash: string) {
    const value = store.passports.get(tokenHash);
    return value ? clone(value) : null;
  }
}
