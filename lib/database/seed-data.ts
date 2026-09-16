import type {
  CatalogueData,
  DemoScenario,
  OfferObservation,
  PolicyPredicate,
  PolicyVersion,
  ProductIdentity,
  Retailer,
  RetailerListing,
} from "@/models/domain";

const MINUTE = 60_000;
const now = Date.now();
const minutesFromNow = (minutes: number) => new Date(now + minutes * MINUTE).toISOString();

export const retailers: Retailer[] = [
  {
    id: "ret-officeworks",
    name: "Officeworks",
    slug: "officeworks",
    kind: "retailer",
    websiteUrl: "https://www.officeworks.com.au/",
    policyUrl: "https://www.officeworks.com.au/information/policies/price-beat-guarantee",
  },
  {
    id: "ret-jb",
    name: "JB Hi-Fi",
    slug: "jb-hi-fi",
    kind: "retailer",
    websiteUrl: "https://www.jbhifi.com.au/",
    policyUrl:
      "https://www.jbhifi.com.au/pages/help-and-support/360053193014-what-is-the-jb-hi-fi-price-match-policy-",
  },
  {
    id: "ret-centrecom",
    name: "Centre Com",
    slug: "centre-com",
    kind: "competitor",
    websiteUrl: "https://www.centrecom.com.au/",
  },
  {
    id: "ret-scorptec",
    name: "Scorptec",
    slug: "scorptec",
    kind: "competitor",
    websiteUrl: "https://www.scorptec.com.au/",
  },
  {
    id: "ret-amazon",
    name: "Amazon Australia",
    slug: "amazon-au",
    kind: "competitor",
    websiteUrl: "https://www.amazon.com.au/",
  },
  {
    id: "ret-kogan",
    name: "Kogan Marketplace",
    slug: "kogan-marketplace",
    kind: "competitor",
    websiteUrl: "https://www.kogan.com/au/",
  },
];

const product = (
  id: string,
  brand: string,
  family: string,
  model: string,
  gtin: string,
  suffix: string,
  refreshRateHz: number,
  panelTechnology = "IPS",
): ProductIdentity => ({
  id,
  brand,
  family,
  identifiers: {
    manufacturerModel: `${model}-${suffix}`,
    normalizedModel: `${model}${suffix}`.replace(/[^A-Z0-9]/gi, "").toUpperCase(),
    gtin,
    regionalSuffix: suffix,
  },
  commercialAttributes: {
    region: suffix === "AU" ? "Australia" : "International",
    colour: "Black",
    manufacturerWarrantyMonths: 36,
    includedInBox: ["monitor", "stand", "power cable", "displayport cable"],
  },
  specifications: {
    screenSizeInches: 27,
    resolution: "2560 x 1440",
    panelTechnology,
    refreshRateHz,
    ports: ["DisplayPort 1.4", "HDMI 2.0"],
    standFeatures: ["height", "tilt", "swivel", "pivot"],
  },
  schemaVersion: 1,
});

export const products: ProductIdentity[] = [
  product("prod-dell-g2724d-au", "Dell", "G2724D", "G2724D", "9300000000019", "AU", 165),
  product("prod-dell-g2724d-us", "Dell", "G2724D", "G2724D", "9300000000026", "US", 165),
  product("prod-lg-27gp850b", "LG", "UltraGear 27GP850", "27GP850-B", "9300000000033", "AU", 180),
  product("prod-lg-27gp850p", "LG", "UltraGear 27GP850", "27GP850P-B", "9300000000040", "AU", 180),
  product("prod-samsung-g5", "Samsung", "Odyssey G5", "S27CG552", "9300000000057", "AU", 165, "VA"),
  product("prod-asus-vg27aq3a", "ASUS", "TUF Gaming", "VG27AQ3A", "9300000000064", "AU", 180),
  product("prod-msi-mag274qrf", "MSI", "MAG", "MAG274QRF-QD-E2", "9300000000071", "AU", 180),
];

interface ListingSeed {
  id: string;
  retailerId: string;
  productId?: string;
  sku?: string;
  price: number;
  delivery: number;
  stock?: "in_stock" | "out_of_stock" | "unknown";
  marketplace?: boolean;
  membership?: boolean;
  condition?: "new" | "refurbished" | "used";
  warranty?: number;
  bundle?: string[];
  stale?: boolean;
  unresolved?: boolean;
  pickup?: boolean;
}

const listingSeeds: ListingSeed[] = [
  { id: "lst-ow-dell", retailerId: "ret-officeworks", productId: "prod-dell-g2724d-au", sku: "OW-G2724D", price: 49900, delivery: 0, pickup: true },
  { id: "lst-cc-dell-exact", retailerId: "ret-centrecom", productId: "prod-dell-g2724d-au", sku: "CC-G2724D", price: 44900, delivery: 0, pickup: true },
  { id: "lst-scorp-dell-delivery", retailerId: "ret-scorptec", productId: "prod-dell-g2724d-au", sku: "SC-G2724D", price: 42900, delivery: 8000, pickup: true },
  { id: "lst-amz-dell-oos", retailerId: "ret-amazon", productId: "prod-dell-g2724d-au", sku: "AMZ-G2724D", price: 43900, delivery: 0, stock: "out_of_stock" },
  { id: "lst-kogan-dell-market", retailerId: "ret-kogan", productId: "prod-dell-g2724d-au", sku: "KG-G2724D", price: 41900, delivery: 1200, marketplace: true },
  { id: "lst-cc-dell-us", retailerId: "ret-centrecom", productId: "prod-dell-g2724d-us", sku: "CC-G2724D-US", price: 40900, delivery: 0 },
  { id: "lst-jb-lg", retailerId: "ret-jb", productId: "prod-lg-27gp850b", sku: "JB-27GP850B", price: 59900, delivery: 0, pickup: true },
  { id: "lst-cc-lg-exact", retailerId: "ret-centrecom", productId: "prod-lg-27gp850b", sku: "CC-27GP850B", price: 54900, delivery: 0 },
  { id: "lst-scorp-lg-warranty", retailerId: "ret-scorptec", productId: "prod-lg-27gp850b", sku: "SC-27GP850B", price: 52900, delivery: 1500, warranty: 12 },
  { id: "lst-amz-lg-bundle", retailerId: "ret-amazon", productId: "prod-lg-27gp850b", sku: "AMZ-27GP850B-KIT", price: 53900, delivery: 0, bundle: ["gaming mouse"] },
  { id: "lst-cc-lg-p", retailerId: "ret-centrecom", productId: "prod-lg-27gp850p", sku: "CC-27GP850PB", price: 51900, delivery: 0 },
  { id: "lst-kogan-lg-stale", retailerId: "ret-kogan", productId: "prod-lg-27gp850b", sku: "KG-27GP850B", price: 50900, delivery: 2500, stale: true },
  { id: "lst-ow-samsung", retailerId: "ret-officeworks", productId: "prod-samsung-g5", sku: "OW-S27CG552", price: 44900, delivery: 0, pickup: true },
  { id: "lst-cc-samsung", retailerId: "ret-centrecom", productId: "prod-samsung-g5", sku: "CC-S27CG552", price: 39900, delivery: 0 },
  { id: "lst-scorp-samsung-member", retailerId: "ret-scorptec", productId: "prod-samsung-g5", sku: "SC-S27CG552", price: 37900, delivery: 0, membership: true },
  { id: "lst-amz-samsung-refurb", retailerId: "ret-amazon", productId: "prod-samsung-g5", sku: "AMZ-S27CG552-R", price: 34900, delivery: 0, condition: "refurbished" },
  { id: "lst-kogan-samsung", retailerId: "ret-kogan", productId: "prod-samsung-g5", sku: "KG-S27CG552", price: 38900, delivery: 1600, marketplace: true },
  { id: "lst-ow-asus", retailerId: "ret-officeworks", productId: "prod-asus-vg27aq3a", sku: "OW-VG27AQ3A", price: 52900, delivery: 0, pickup: true },
  { id: "lst-cc-asus", retailerId: "ret-centrecom", productId: "prod-asus-vg27aq3a", sku: "CC-VG27AQ3A", price: 48900, delivery: 0 },
  { id: "lst-scorp-asus-oos", retailerId: "ret-scorptec", productId: "prod-asus-vg27aq3a", sku: "SC-VG27AQ3A", price: 46900, delivery: 900, stock: "out_of_stock" },
  { id: "lst-amz-asus", retailerId: "ret-amazon", productId: "prod-asus-vg27aq3a", sku: "AMZ-VG27AQ3A", price: 47900, delivery: 0 },
  { id: "lst-ow-msi", retailerId: "ret-officeworks", productId: "prod-msi-mag274qrf", sku: "OW-MAG274QRF", price: 64900, delivery: 0, pickup: true },
  { id: "lst-cc-msi", retailerId: "ret-centrecom", productId: "prod-msi-mag274qrf", sku: "CC-MAG274QRF", price: 59900, delivery: 0 },
  { id: "lst-scorp-msi-stale", retailerId: "ret-scorptec", productId: "prod-msi-mag274qrf", sku: "SC-MAG274QRF", price: 57900, delivery: 1300, stale: true },
  { id: "lst-unknown-msi", retailerId: "ret-amazon", price: 55900, delivery: 0, unresolved: true },
];

function getProduct(productId?: string) {
  return products.find((candidate) => candidate.id === productId);
}

function getRetailer(retailerId: string) {
  return retailers.find((candidate) => candidate.id === retailerId)!;
}

export const listings: RetailerListing[] = listingSeeds.map((seed) => {
  const linkedProduct = getProduct(seed.productId);
  const retailer = getRetailer(seed.retailerId);
  return {
    id: seed.id,
    retailerId: seed.retailerId,
    productId: seed.productId,
    candidateProductIds: seed.unresolved ? ["prod-msi-mag274qrf"] : undefined,
    seller: {
      name: seed.marketplace ? "Independent marketplace seller" : retailer.name,
      type: seed.marketplace ? "marketplace" : "retailer",
    },
    retailerSku: seed.sku,
    title: linkedProduct
      ? `${linkedProduct.brand} ${linkedProduct.identifiers.manufacturerModel} 27-inch monitor`
      : "MSI 27-inch QHD gaming monitor - model suffix not shown",
    sourceUrl: `https://evidence.sameproof.example/${retailer.slug}/${seed.id}`,
    listedModel: seed.unresolved ? undefined : linkedProduct?.identifiers.manufacturerModel,
    listedGtin: seed.unresolved ? undefined : linkedProduct?.identifiers.gtin,
    promotionalBundleItems: seed.bundle ?? [],
    warrantyMonths:
      seed.warranty ?? linkedProduct?.commercialAttributes.manufacturerWarrantyMonths,
    condition: seed.condition ?? "new",
    mappingStatus: seed.unresolved ? "unresolved" : "mapped",
  };
});

export const offerObservations: OfferObservation[] = listingSeeds.map((seed) => ({
  id: `obs-${seed.id}`,
  listingId: seed.id,
  price: { amountCents: seed.price, currency: "AUD" },
  delivery: {
    cost: { amountCents: seed.delivery, currency: "AUD" },
    postcode: "3000",
    method: "delivery",
    available: true,
  },
  stockState: seed.stock ?? "in_stock",
  membershipRequired: seed.membership ?? false,
  pickupAvailable: seed.pickup ?? false,
  observedAt: seed.stale ? minutesFromNow(-240) : minutesFromNow(-5),
  validUntil: seed.stale ? minutesFromNow(-180) : minutesFromNow(55),
  captureMethod: "dataset",
  simulated: true,
}));

const requiredPredicate = (
  code: string,
  field: PolicyPredicate["field"],
  expectedValue: string | number | boolean,
  successMessage: string,
  failureMessage: string,
  unknownMessage: string,
): PolicyPredicate => ({
  code,
  field,
  operator: "equals",
  expectedValue,
  classification: "required",
  successMessage,
  failureMessage,
  unknownMessage,
});

const commonPredicates: PolicyPredicate[] = [
  requiredPredicate("IDENTITY_EXACT", "identity.status", "exact", "The commercial identity is exact.", "The products are not commercially identical.", "Exact commercial identity cannot be confirmed."),
  requiredPredicate("TARGET_STOCK", "target.stockState", "in_stock", "The target retailer has stock.", "The target retailer does not have immediate stock.", "Target retailer stock is unknown."),
  requiredPredicate("COMPETITOR_STOCK", "competitor.stockState", "in_stock", "The competitor has immediate stock.", "The competing offer is not currently in stock.", "Competitor stock is unknown."),
  requiredPredicate("SELLER_ELIGIBLE", "competitor.sellerType", "retailer", "The offer is sold directly by an eligible retailer.", "Marketplace sellers are excluded from this policy.", "The seller type is unknown."),
  requiredPredicate("CONDITION_NEW", "competitor.condition", "new", "The competing item is new.", "Refurbished or used products are excluded.", "The product condition is unknown."),
  requiredPredicate("PUBLIC_PRICE", "competitor.membershipRequired", false, "The price is publicly available.", "The lower price requires a membership condition.", "The price conditions are unknown."),
  {
    code: "LOWER_DELIVERED_PRICE",
    field: "pricing.competitorTotalCents",
    operator: "less_than_or_equal",
    compareToField: "pricing.targetPriceCents",
    classification: "flexible",
    successMessage: "The competitor total is no higher than the target price.",
    failureMessage: "Delivery removes the apparent saving.",
    unknownMessage: "The delivered comparison price cannot be calculated.",
  },
  requiredPredicate("EVIDENCE_FRESH", "evidence.fresh", true, "The offer evidence is still fresh.", "The offer evidence has expired.", "Evidence freshness is unknown."),
];

export const policyVersions: PolicyVersion[] = [
  {
    id: "policy-officeworks-2026-07",
    retailerId: "ret-officeworks",
    name: "Officeworks Price Beat Guarantee",
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    sourceUrl: retailers[0].policyUrl!,
    reviewedAt: "2026-09-14T00:00:00.000Z",
    predicates: commonPredicates,
    exclusions: [],
    discretionaryStatements: [],
    priceAdjustment: { type: "percentage_below", percentageBasisPoints: 500 },
    version: "2026.07-demo.1",
  },
  {
    id: "policy-jb-2026-09",
    retailerId: "ret-jb",
    name: "JB Hi-Fi Price Match",
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    sourceUrl: retailers[1].policyUrl!,
    reviewedAt: "2026-09-14T00:00:00.000Z",
    predicates: commonPredicates,
    exclusions: [],
    discretionaryStatements: [
      "A team member retains discretion and may request additional evidence.",
    ],
    priceAdjustment: { type: "match_only" },
    version: "2026.09-demo.1",
  },
];

export const demoScenarios: DemoScenario[] = [
  { id: "scenario-exact", name: "Exact eligible match", description: "Same AU model, current stock and a lower delivered total.", targetListingId: "lst-ow-dell", competitorListingId: "lst-cc-dell-exact", fulfilment: "delivery", expectedTheme: "exact" },
  { id: "scenario-suffix", name: "Regional suffix conflict", description: "Functionally similar Dell monitors with different commercial region identifiers.", targetListingId: "lst-ow-dell", competitorListingId: "lst-cc-dell-us", fulfilment: "delivery", expectedTheme: "suffix_conflict" },
  { id: "scenario-warranty", name: "Warranty difference", description: "The competing LG listing includes only a 12-month warranty.", targetListingId: "lst-jb-lg", competitorListingId: "lst-scorp-lg-warranty", fulfilment: "delivery", expectedTheme: "warranty" },
  { id: "scenario-bundle", name: "Bundle mismatch", description: "The competitor offer adds a promotional gaming mouse.", targetListingId: "lst-jb-lg", competitorListingId: "lst-amz-lg-bundle", fulfilment: "delivery", expectedTheme: "bundle" },
  { id: "scenario-delivery", name: "Delivery reversal", description: "A lower sticker price becomes more expensive after delivery.", targetListingId: "lst-ow-dell", competitorListingId: "lst-scorp-dell-delivery", fulfilment: "delivery", expectedTheme: "delivery" },
  { id: "scenario-marketplace", name: "Marketplace exclusion", description: "The cheapest Dell offer is supplied by a marketplace seller.", targetListingId: "lst-ow-dell", competitorListingId: "lst-kogan-dell-market", fulfilment: "delivery", expectedTheme: "marketplace" },
  { id: "scenario-stock", name: "Unavailable stock", description: "The competing Dell listing is cheaper but unavailable.", targetListingId: "lst-ow-dell", competitorListingId: "lst-amz-dell-oos", fulfilment: "delivery", expectedTheme: "stock" },
  { id: "scenario-stale", name: "Expired evidence", description: "The MSI competitor observation is more than three hours old.", targetListingId: "lst-ow-msi", competitorListingId: "lst-scorp-msi-stale", fulfilment: "delivery", expectedTheme: "stale" },
  { id: "scenario-unknown", name: "Incomplete identity", description: "The competing MSI listing omits decisive model and GTIN evidence.", targetListingId: "lst-ow-msi", competitorListingId: "lst-unknown-msi", fulfilment: "delivery", expectedTheme: "unknown" },
  { id: "scenario-discretionary", name: "Discretionary retailer", description: "An exact LG result remains likely because staff approval is discretionary.", targetListingId: "lst-jb-lg", competitorListingId: "lst-cc-lg-exact", fulfilment: "delivery", expectedTheme: "discretionary" },
];

export const seedCatalogue: CatalogueData = {
  retailers,
  products,
  listings,
  observations: offerObservations,
  policies: policyVersions,
};
