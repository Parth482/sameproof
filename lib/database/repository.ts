import type {
  CatalogueData,
  Comparison,
  ComparisonContext,
  Decision,
  DemoScenario,
  EvidenceField,
  EvidenceRecord,
  EvidenceValue,
  OfferObservation,
  PolicyVersion,
  PriceMatchPassport,
  ProductIdentity,
  Retailer,
  RetailerListing,
} from "@/models/domain";

export interface ComparisonPatch {
  stage?: Comparison["stage"];
  targetRetailerId?: string;
  targetListingId?: string;
  competitorListingId?: string;
  targetObservationId?: string;
  competitorObservationId?: string;
  context?: ComparisonContext;
  evidence?: Comparison["evidence"];
  evidenceConfirmed?: boolean;
}

export interface SameProofRepository {
  mode: "demo" | "atlas";
  getCatalogue(): Promise<CatalogueData>;
  getScenarios(): Promise<DemoScenario[]>;
  createComparison(input: {
    targetListingId: string;
    competitorListingId: string;
    context: ComparisonContext;
  }): Promise<Comparison>;
  getComparison(id: string): Promise<Comparison | null>;
  deleteComparison(id: string): Promise<boolean>;
  updateComparison(
    id: string,
    expectedVersion: number,
    patch: ComparisonPatch,
  ): Promise<Comparison | null | "version_conflict">;
  saveDecision(decision: Decision): Promise<void>;
  getDecision(id: string): Promise<Decision | null>;
  getLatestDecision(comparisonId: string): Promise<Decision | null>;
  savePassport(passport: PriceMatchPassport): Promise<void>;
  getPassportByTokenHash(tokenHash: string): Promise<PriceMatchPassport | null>;
}

function field<T extends string | number | boolean | string[]>(
  value: T | undefined,
  sourceReference: string,
  observedAt?: string,
): EvidenceField<EvidenceValue> {
  return {
    value: value ?? null,
    state: value === undefined ? "unknown" : "unconfirmed",
    sources: [
      {
        type: "dataset",
        reference: sourceReference,
        observedAt,
      },
    ],
    confidence: value === undefined ? "low" : "high",
    userConfirmed: false,
  };
}

export function buildEvidenceRecord(
  listing: RetailerListing,
  observation: OfferObservation,
  product: ProductIdentity | undefined,
  retailer: Retailer,
): EvidenceRecord {
  const source = listing.sourceUrl;
  return {
    manufacturerModel: field(
      listing.listedModel ?? product?.identifiers.manufacturerModel,
      source,
    ),
    normalizedModel: field(product?.identifiers.normalizedModel, source),
    gtin: field(listing.listedGtin ?? product?.identifiers.gtin, source),
    regionalSuffix: field(product?.identifiers.regionalSuffix, source),
    priceCents: field(observation.price.amountCents, source, observation.observedAt),
    deliveryCostCents: field(
      observation.delivery.cost.amountCents,
      source,
      observation.observedAt,
    ),
    sellerName: field(listing.seller.name, source),
    sellerType: field(listing.seller.type, source),
    retailerId: field(retailer.id, source),
    stockState: field(observation.stockState, source, observation.observedAt),
    membershipRequired: field(
      observation.membershipRequired,
      source,
      observation.observedAt,
    ),
    condition: field(listing.condition, source),
    warrantyMonths: field(
      listing.warrantyMonths ?? product?.commercialAttributes.manufacturerWarrantyMonths,
      source,
    ),
    bundleItems: field(listing.promotionalBundleItems, source),
    observedAt: field(observation.observedAt, source, observation.observedAt),
  };
}

export function resolveComparisonDependencies(
  catalogue: CatalogueData,
  targetListingId: string,
  competitorListingId: string,
  targetObservationId?: string,
  competitorObservationId?: string,
): {
  targetListing: RetailerListing;
  competitorListing: RetailerListing;
  targetObservation: OfferObservation;
  competitorObservation: OfferObservation;
  targetProduct?: ProductIdentity;
  competitorProduct?: ProductIdentity;
  targetRetailer: Retailer;
  policy: PolicyVersion;
} | null {
  const targetListing = catalogue.listings.find((item) => item.id === targetListingId);
  const competitorListing = catalogue.listings.find(
    (item) => item.id === competitorListingId,
  );
  if (!targetListing || !competitorListing) return null;

  const latest = (listingId: string) =>
    catalogue.observations
      .filter((item) => item.listingId === listingId)
      .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];
  const targetObservation = targetObservationId
    ? catalogue.observations.find(
        (item) => item.id === targetObservationId && item.listingId === targetListingId,
      )
    : latest(targetListingId);
  const competitorObservation = competitorObservationId
    ? catalogue.observations.find(
        (item) =>
          item.id === competitorObservationId &&
          item.listingId === competitorListingId,
      )
    : latest(competitorListingId);
  const targetRetailer = catalogue.retailers.find(
    (item) => item.id === targetListing.retailerId,
  );
  const policy = catalogue.policies
    .filter((item) => item.retailerId === targetListing.retailerId)
    .sort((left, right) => Date.parse(right.effectiveFrom) - Date.parse(left.effectiveFrom))[0];

  if (!targetObservation || !competitorObservation || !targetRetailer || !policy) {
    return null;
  }

  return {
    targetListing,
    competitorListing,
    targetObservation,
    competitorObservation,
    targetProduct: catalogue.products.find((item) => item.id === targetListing.productId),
    competitorProduct: catalogue.products.find(
      (item) => item.id === competitorListing.productId,
    ),
    targetRetailer,
    policy,
  };
}
