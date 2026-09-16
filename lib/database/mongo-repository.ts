import "server-only";

import type { Document } from "mongodb";

import { demoScenarios, seedCatalogue } from "@/lib/database/seed-data";
import { getDatabase } from "@/lib/database/mongo-client";
import {
  buildEvidenceRecord,
  resolveComparisonDependencies,
  type ComparisonPatch,
  type SameProofRepository,
} from "@/lib/database/repository";
import type {
  CatalogueData,
  Comparison,
  Decision,
  PriceMatchPassport,
} from "@/models/domain";

const DATE_KEYS = new Set([
  "observedAt",
  "validUntil",
  "effectiveFrom",
  "effectiveUntil",
  "reviewedAt",
  "createdAt",
  "updatedAt",
  "generatedAt",
  "expiresAt",
  "revokedAt",
]);

interface StringIdDocument extends Document {
  _id: string;
}

function toDocument<T extends { id: string }>(value: T): StringIdDocument {
  const convert = (input: unknown, key?: string): unknown => {
    if (key && DATE_KEYS.has(key) && typeof input === "string") return new Date(input);
    if (Array.isArray(input)) return input.map((item) => convert(item));
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input).map(([childKey, childValue]) => [
          childKey === "id" && key === undefined ? "_id" : childKey,
          convert(childValue, childKey),
        ]),
      );
    }
    return input;
  };
  return convert(value) as StringIdDocument;
}

function fromDocument<T>(value: Document): T {
  const convert = (input: unknown, key?: string): unknown => {
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map((item) => convert(item));
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([childKey, childValue]) => [
          childKey === "_id" && key === undefined ? "id" : childKey,
          convert(childValue, childKey),
        ]),
      );
    }
    return input;
  };
  return convert(value) as T;
}

let initialized: Promise<void> | undefined;

async function ensureDatabase() {
  if (initialized) return initialized;
  initialized = (async () => {
    const db = await getDatabase();
    await Promise.all([
      db.collection<StringIdDocument>("products").createIndex(
        { "identifiers.gtin": 1 },
        {
          unique: true,
          partialFilterExpression: { "identifiers.gtin": { $type: "string" } },
        },
      ),
      db.collection<StringIdDocument>("products").createIndex({ "identifiers.normalizedModel": 1 }),
      db.collection<StringIdDocument>("listings").createIndex(
        { retailerId: 1, retailerSku: 1 },
        {
          unique: true,
          partialFilterExpression: { retailerSku: { $type: "string" } },
        },
      ),
      db.collection<StringIdDocument>("listings").createIndex({ sourceUrl: 1 }, { unique: true }),
      db.collection<StringIdDocument>("offerObservations").createIndex({ listingId: 1, observedAt: -1 }),
      db.collection<StringIdDocument>("policyVersions").createIndex({ retailerId: 1, effectiveFrom: -1 }),
      db.collection<StringIdDocument>("comparisons").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection<StringIdDocument>("decisions").createIndex({ comparisonId: 1, generatedAt: -1 }),
      db.collection<StringIdDocument>("passports").createIndex({ publicTokenHash: 1 }, { unique: true }),
      db.collection<StringIdDocument>("passports").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);

    const retailerCount = await db.collection<StringIdDocument>("retailers").estimatedDocumentCount();
    if (retailerCount === 0) {
      const collections: Array<[string, Array<{ id: string }>]> = [
        ["retailers", seedCatalogue.retailers],
        ["products", seedCatalogue.products],
        ["listings", seedCatalogue.listings],
        ["offerObservations", seedCatalogue.observations],
        ["policyVersions", seedCatalogue.policies],
      ];
      await Promise.all(
        collections.map(([name, documents]) =>
          db.collection<StringIdDocument>(name).insertMany(documents.map(toDocument)),
        ),
      );
    }
  })();
  return initialized;
}

export class MongoRepository implements SameProofRepository {
  readonly mode = "atlas" as const;

  async getCatalogue(): Promise<CatalogueData> {
    await ensureDatabase();
    const db = await getDatabase();
    const [retailers, products, listings, observations, policies] = await Promise.all([
      db.collection<StringIdDocument>("retailers").find().toArray(),
      db.collection<StringIdDocument>("products").find().toArray(),
      db.collection<StringIdDocument>("listings").find().toArray(),
      db.collection<StringIdDocument>("offerObservations").find().toArray(),
      db.collection<StringIdDocument>("policyVersions").find().toArray(),
    ]);
    return {
      retailers: retailers.map((value) => fromDocument<CatalogueData["retailers"][number]>(value)),
      products: products.map((value) => fromDocument<CatalogueData["products"][number]>(value)),
      listings: listings.map((value) => fromDocument<CatalogueData["listings"][number]>(value)),
      observations: observations.map((value) => fromDocument<CatalogueData["observations"][number]>(value)),
      policies: policies.map((value) => fromDocument<CatalogueData["policies"][number]>(value)),
    };
  }

  async getScenarios() {
    return structuredClone(demoScenarios);
  }

  async createComparison(input: {
    targetListingId: string;
    competitorListingId: string;
    context: Comparison["context"];
  }) {
    const catalogue = await this.getCatalogue();
    const dependencies = resolveComparisonDependencies(
      catalogue,
      input.targetListingId,
      input.competitorListingId,
    );
    if (!dependencies) throw new Error("Comparison dependencies missing");
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
          catalogue.retailers.find(
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
    const db = await getDatabase();
    await db.collection<StringIdDocument>("comparisons").insertOne(toDocument(comparison));
    return comparison;
  }

  async getComparison(id: string) {
    await ensureDatabase();
    const db = await getDatabase();
    const value = await db.collection<StringIdDocument>("comparisons").findOne({ _id: id });
    return value ? fromDocument<Comparison>(value) : null;
  }

  async deleteComparison(id: string) {
    await ensureDatabase();
    const db = await getDatabase();
    const [comparison] = await Promise.all([
      db.collection<StringIdDocument>("comparisons").deleteOne({ _id: id }),
      db.collection<StringIdDocument>("decisions").deleteMany({ comparisonId: id }),
      db.collection<StringIdDocument>("passports").deleteMany({ comparisonId: id }),
    ]);
    return comparison.deletedCount === 1;
  }

  async updateComparison(
    id: string,
    expectedVersion: number,
    patch: ComparisonPatch,
  ) {
    const current = await this.getComparison(id);
    if (!current) return null;
    if (current.version !== expectedVersion) return "version_conflict" as const;
    const updated: Comparison = {
      ...current,
      ...structuredClone(patch),
      id,
      createdAt: current.createdAt,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    const db = await getDatabase();
    const result = await db.collection<StringIdDocument>("comparisons").replaceOne(
      { _id: id, version: expectedVersion },
      toDocument(updated),
    );
    if (result.matchedCount === 0) return "version_conflict" as const;
    return updated;
  }

  async saveDecision(decision: Decision) {
    await ensureDatabase();
    const db = await getDatabase();
    await db.collection<StringIdDocument>("decisions").insertOne(toDocument(decision));
  }

  async getDecision(id: string) {
    await ensureDatabase();
    const db = await getDatabase();
    const value = await db.collection<StringIdDocument>("decisions").findOne({ _id: id });
    return value ? fromDocument<Decision>(value) : null;
  }

  async getLatestDecision(comparisonId: string) {
    await ensureDatabase();
    const db = await getDatabase();
    const value = await db
      .collection<StringIdDocument>("decisions")
      .find({ comparisonId })
      .sort({ generatedAt: -1 })
      .limit(1)
      .next();
    return value ? fromDocument<Decision>(value) : null;
  }

  async savePassport(passport: PriceMatchPassport) {
    await ensureDatabase();
    const db = await getDatabase();
    await db.collection<StringIdDocument>("passports").insertOne(toDocument(passport));
  }

  async getPassportByTokenHash(tokenHash: string) {
    await ensureDatabase();
    const db = await getDatabase();
    const value = await db.collection<StringIdDocument>("passports").findOne({ publicTokenHash: tokenHash });
    return value ? fromDocument<PriceMatchPassport>(value) : null;
  }
}
