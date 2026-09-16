export type Id = string;
export type IsoDateString = string;

export interface Money {
  amountCents: number;
  currency: "AUD";
}

export type Condition = "new" | "refurbished" | "used";
export type StockState = "in_stock" | "out_of_stock" | "unknown";
export type DecisionStatus = "verified" | "likely" | "uncertain" | "excluded";
export type RuleResult = "pass" | "fail" | "unknown";

export interface Retailer {
  id: Id;
  name: string;
  slug: string;
  kind: "retailer" | "competitor";
  websiteUrl: string;
  policyUrl?: string;
}

export interface ProductIdentity {
  id: Id;
  brand: string;
  family: string;
  identifiers: {
    manufacturerModel: string;
    normalizedModel: string;
    gtin?: string;
    regionalSuffix?: string;
  };
  commercialAttributes: {
    region?: string;
    colour?: string;
    manufacturerWarrantyMonths?: number;
    includedInBox: string[];
  };
  specifications: {
    screenSizeInches: number;
    resolution: string;
    panelTechnology: string;
    refreshRateHz: number;
    ports: string[];
    standFeatures: string[];
  };
  schemaVersion: number;
}

export interface RetailerListing {
  id: Id;
  retailerId: Id;
  productId?: Id;
  candidateProductIds?: Id[];
  seller: {
    name: string;
    type: "retailer" | "marketplace";
  };
  retailerSku?: string;
  title: string;
  sourceUrl: string;
  listedModel?: string;
  listedGtin?: string;
  promotionalBundleItems: string[];
  warrantyMonths?: number;
  condition: Condition;
  mappingStatus: "mapped" | "candidate" | "unresolved";
}

export interface DeliveryQuote {
  cost: Money;
  postcode?: string;
  method: "delivery" | "pickup";
  available: boolean | null;
}

export type EvidenceSourceType =
  | "dataset"
  | "url"
  | "barcode"
  | "image"
  | "manual";

export interface OfferObservation {
  id: Id;
  listingId: Id;
  price: Money;
  delivery: DeliveryQuote;
  stockState: StockState;
  membershipRequired: boolean;
  pickupAvailable?: boolean;
  observedAt: IsoDateString;
  validUntil: IsoDateString;
  captureMethod: EvidenceSourceType;
  simulated: boolean;
}

export interface EvidenceSource {
  type: EvidenceSourceType;
  reference?: string;
  observedAt?: IsoDateString;
}

export interface EvidenceConflict<T> {
  value: T;
  source: EvidenceSource;
}

export interface EvidenceField<T> {
  value: T | null;
  state: "confirmed" | "unconfirmed" | "unknown" | "conflicting";
  sources: EvidenceSource[];
  conflicts?: EvidenceConflict<T>[];
  confidence?: "high" | "medium" | "low";
  userConfirmed: boolean;
}

export type EvidenceValue = string | number | boolean | string[];
export type EvidenceKey =
  | "manufacturerModel"
  | "normalizedModel"
  | "gtin"
  | "regionalSuffix"
  | "priceCents"
  | "deliveryCostCents"
  | "sellerName"
  | "sellerType"
  | "retailerId"
  | "stockState"
  | "membershipRequired"
  | "condition"
  | "warrantyMonths"
  | "bundleItems"
  | "observedAt";

export type EvidenceRecord = Partial<
  Record<EvidenceKey, EvidenceField<EvidenceValue>>
>;

export type PolicyField =
  | "identity.status"
  | "target.stockState"
  | "competitor.stockState"
  | "competitor.sellerType"
  | "competitor.condition"
  | "competitor.membershipRequired"
  | "pricing.competitorTotalCents"
  | "pricing.targetPriceCents"
  | "evidence.fresh";

export type PolicyScalar = string | number | boolean;

interface PolicyPredicateBase {
  code: string;
  field: PolicyField;
  classification: "required" | "flexible" | "discretionary";
  failureMessage: string;
  unknownMessage: string;
  successMessage: string;
}

export type PolicyPredicate =
  | (PolicyPredicateBase & {
      operator: "equals" | "must_be_true";
      expectedValue: PolicyScalar;
    })
  | (PolicyPredicateBase & {
      operator: "included_in";
      expectedValue: PolicyScalar[];
    })
  | (PolicyPredicateBase & {
      operator: "less_than_or_equal";
      compareToField: PolicyField;
    });

export interface PolicyVersion {
  id: Id;
  retailerId: Id;
  name: string;
  effectiveFrom: IsoDateString;
  effectiveUntil?: IsoDateString;
  sourceUrl: string;
  reviewedAt: IsoDateString;
  predicates: PolicyPredicate[];
  exclusions: PolicyPredicate[];
  discretionaryStatements: string[];
  priceAdjustment: {
    type: "percentage_below" | "match_only";
    percentageBasisPoints?: number;
  };
  version: string;
}

export type ConstraintCode =
  | "exact_identity"
  | "new_condition"
  | "manufacturer_warranty"
  | "same_bundle"
  | "delivery"
  | "pickup"
  | "lowest_total"
  | "fresh_evidence";

export type JourneyStage =
  | "offer_dock"
  | "evidence_lens"
  | "identity_bridge"
  | "near_miss"
  | "passport";

export interface ComparisonContext {
  postcode?: string;
  fulfilment: "delivery" | "pickup";
  mustHave: ConstraintCode[];
  flexible: ConstraintCode[];
}

export interface Comparison {
  id: Id;
  targetRetailerId?: Id;
  targetListingId?: Id;
  competitorListingId?: Id;
  targetObservationId?: Id;
  competitorObservationId?: Id;
  context: ComparisonContext;
  evidence: {
    target: EvidenceRecord;
    competitor: EvidenceRecord;
  };
  stage: JourneyStage;
  evidenceConfirmed: boolean;
  version: number;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  expiresAt: IsoDateString;
}

export interface RuleEvidence {
  field: string;
  value: unknown;
  sourceTypes: EvidenceSourceType[];
}

export interface RuleOutcome {
  code: string;
  label: string;
  result: RuleResult;
  classification: "required" | "flexible" | "discretionary";
  explanation: string;
  evidence: RuleEvidence[];
}

export type NearMissChangeType =
  | "switch_fulfilment"
  | "select_competitor_offer"
  | "refresh_evidence"
  | "select_unbundled_offer";

export interface NearMissSuggestion {
  id: Id;
  blockedBy: string;
  changeType: NearMissChangeType;
  currentValue: unknown;
  proposedValue: unknown;
  candidateListingId?: Id;
  candidateObservationId?: Id;
  changedConstraints: ConstraintCode[];
  preservedMustHaves: ConstraintCode[];
  resultingStatus: Exclude<DecisionStatus, "excluded">;
  effortRank: number;
  explanation: string;
}

export interface Decision {
  id: Id;
  comparisonId: Id;
  comparisonVersion: number;
  policyVersionId: Id;
  engineVersion: string;
  status: DecisionStatus;
  identity: {
    status: "exact" | "conflict" | "unknown";
    commercialChecks: RuleOutcome[];
    functionalComparison: RuleOutcome[];
  };
  pricing: {
    targetPrice: Money | null;
    competitorPrice: Money | null;
    competitorDelivery: Money | null;
    comparableCompetitorTotal: Money | null;
    projectedMatchedPrice?: Money;
  };
  policyChecks: RuleOutcome[];
  nearMisses: NearMissSuggestion[];
  generatedAt: IsoDateString;
  expiresAt: IsoDateString;
}

export interface PriceMatchPassport {
  id: Id;
  publicTokenHash: string;
  comparisonId: Id;
  decisionId: Id;
  evidenceSnapshot: {
    target: EvidenceRecord;
    competitor: EvidenceRecord;
  };
  policySnapshot: PolicyVersion;
  decisionSnapshot: Decision;
  integrityHash: string;
  generatedAt: IsoDateString;
  expiresAt: IsoDateString;
  revokedAt?: IsoDateString;
}

export interface CatalogueData {
  retailers: Retailer[];
  products: ProductIdentity[];
  listings: RetailerListing[];
  observations: OfferObservation[];
  policies: PolicyVersion[];
}

export interface EvaluationInput {
  comparison: Comparison;
  targetListing: RetailerListing;
  competitorListing: RetailerListing;
  targetObservation: OfferObservation;
  competitorObservation: OfferObservation;
  targetProduct?: ProductIdentity;
  competitorProduct?: ProductIdentity;
  policy: PolicyVersion;
  catalogue: CatalogueData;
  now: IsoDateString;
}

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  targetListingId: string;
  competitorListingId: string;
  fulfilment: "delivery" | "pickup";
  expectedTheme:
    | "exact"
    | "suffix_conflict"
    | "warranty"
    | "bundle"
    | "delivery"
    | "marketplace"
    | "stock"
    | "stale"
    | "unknown"
    | "discretionary";
}
