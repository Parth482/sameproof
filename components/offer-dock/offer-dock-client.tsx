"use client";

import { ArrowRight, Camera, Check, CircleHelp, Database, ExternalLink, Keyboard, Link2, LockKeyhole, Package, ShoppingBag, Sparkles, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { EvidenceCapture } from "@/components/evidence/evidence-capture";
import { ErrorState, LoadingState } from "@/components/shared/async-state";
import { ResponsiveSelect } from "@/components/shared/responsive-select";
import { ApiClientError, createComparison, getCatalogue, getComparison, updateComparison, type CatalogueResponse } from "@/lib/client/api";
import { saveCatalogueDraft, saveDraft } from "@/lib/client/draft-store";
import { formatMoney, normalizeModel } from "@/lib/domain/normalization";
import type {
  Comparison,
  ConstraintCode,
  EvidenceField,
  EvidenceRecord,
  EvidenceSourceType,
  EvidenceValue,
  OfferObservation,
  ProductIdentity,
  Retailer,
  RetailerListing,
} from "@/models/domain";

type SourceTab = "prepared" | "url" | "capture" | "manual";
type OfferSide = "target" | "competitor";

interface OfferDraft {
  tab: SourceTab;
  url: string;
  urlResolved: boolean | null;
  model: string;
  gtin: string;
  price: string;
  delivery: string;
  seller: string;
  capturedSource?: "barcode" | "image";
}

const tabs: Array<{ id: SourceTab; label: string; icon: typeof Database }> = [
  { id: "prepared", label: "Choose offer", icon: Database },
  { id: "url", label: "Paste URL", icon: Link2 },
  { id: "capture", label: "Scan or photo", icon: Camera },
  { id: "manual", label: "Enter details", icon: Keyboard },
];

const requirementOptions: Array<{ code: ConstraintCode; label: string; description: string }> = [
  { code: "exact_identity", label: "Exact model", description: "Model, barcode, region and bundle must match." },
  { code: "new_condition", label: "New condition", description: "Do not consider refurbished or used offers." },
  { code: "manufacturer_warranty", label: "Same warranty", description: "Keep the manufacturer warranty period." },
  { code: "same_bundle", label: "Same bundle", description: "Included promotional items must match." },
  { code: "lowest_total", label: "Lowest total", description: "Keep the best price after delivery." },
  { code: "fresh_evidence", label: "Current evidence", description: "Price and stock must be freshly checked." },
];

function emptyDraft(initialUrl = ""): OfferDraft {
  return { tab: initialUrl ? "url" : "prepared", url: initialUrl, urlResolved: null, model: "", gtin: "", price: "", delivery: "0", seller: "" };
}

function manualField(value: EvidenceValue | null, source: EvidenceSourceType, reference?: string): EvidenceField<EvidenceValue> {
  const present = value !== null && value !== "";
  return {
    value: present ? value : null,
    state: present ? (source === "manual" ? "confirmed" : "unconfirmed") : "unknown",
    sources: [{ type: source, reference, observedAt: new Date().toISOString() }],
    confidence: source === "manual" ? "medium" : "high",
    userConfirmed: source === "manual",
  };
}

function datasetField(value: EvidenceValue | undefined, reference: string, observedAt?: string): EvidenceField<EvidenceValue> {
  return {
    value: value ?? null,
    state: value === undefined ? "unknown" : "unconfirmed",
    sources: [{ type: "dataset", reference, observedAt }],
    confidence: value === undefined ? "low" : "high",
    userConfirmed: false,
  };
}

function evidenceForListing(data: CatalogueResponse, listingId: string): { record: EvidenceRecord; observationId: string } | null {
  const listing = data.catalogue.listings.find((item) => item.id === listingId);
  if (!listing) return null;
  const product = data.catalogue.products.find((item) => item.id === listing.productId);
  const observation = data.catalogue.observations.filter((item) => item.listingId === listingId).sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];
  if (!observation) return null;
  const reference = listing.sourceUrl;
  return {
    observationId: observation.id,
    record: {
      manufacturerModel: datasetField(listing.listedModel ?? product?.identifiers.manufacturerModel, reference),
      normalizedModel: datasetField(product?.identifiers.normalizedModel, reference),
      gtin: datasetField(listing.listedGtin ?? product?.identifiers.gtin, reference),
      regionalSuffix: datasetField(product?.identifiers.regionalSuffix, reference),
      priceCents: datasetField(observation.price.amountCents, reference, observation.observedAt),
      deliveryCostCents: datasetField(observation.delivery.cost.amountCents, reference, observation.observedAt),
      sellerName: datasetField(listing.seller.name, reference),
      sellerType: datasetField(listing.seller.type, reference),
      retailerId: datasetField(listing.retailerId, reference),
      stockState: datasetField(observation.stockState, reference, observation.observedAt),
      membershipRequired: datasetField(observation.membershipRequired, reference, observation.observedAt),
      condition: datasetField(listing.condition, reference),
      warrantyMonths: datasetField(listing.warrantyMonths ?? product?.commercialAttributes.manufacturerWarrantyMonths, reference),
      bundleItems: datasetField(listing.promotionalBundleItems, reference),
      observedAt: datasetField(observation.observedAt, reference, observation.observedAt),
    },
  };
}

const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

interface CompetitorMatch {
  listingId: string;
  reason: string;
}

function deliveredTotal(observation: OfferObservation) {
  return observation.price.amountCents + observation.delivery.cost.amountCents;
}

function identityScore(target: RetailerListing, competitor: RetailerListing, targetProduct?: ProductIdentity, competitorProduct?: ProductIdentity) {
  if (target.productId && competitor.productId && target.productId === competitor.productId) return 10_000;
  if (target.listedGtin && competitor.listedGtin && target.listedGtin === competitor.listedGtin) return 8_500;
  const targetModel = normalizeModel(target.listedModel ?? targetProduct?.identifiers.normalizedModel ?? "");
  const competitorModel = normalizeModel(competitor.listedModel ?? competitorProduct?.identifiers.normalizedModel ?? "");
  if (targetModel && competitorModel && targetModel === competitorModel) return 7_000;
  if (targetProduct && competitorProduct && targetProduct.brand === competitorProduct.brand && targetProduct.family === competitorProduct.family) return 3_000;
  if (targetProduct && competitorProduct && targetProduct.brand === competitorProduct.brand) return 800;
  if (competitor.mappingStatus === "unresolved") return 50;
  return 0;
}

/** Prefer the same commercial product, then a cheaper delivered total that a store is likelier to accept. */
function findBestCheaperCompetitor(
  target: RetailerListing,
  competitors: RetailerListing[],
  products: Map<string, ProductIdentity>,
  observations: Map<string, OfferObservation>,
  retailers: Map<string, Retailer>,
  now = Date.now(),
): CompetitorMatch | undefined {
  const targetObservation = observations.get(target.id);
  if (!targetObservation) return undefined;
  const targetProduct = products.get(target.productId ?? "");
  const targetTotal = deliveredTotal(targetObservation);

  const ranked = competitors.flatMap((competitor) => {
    const observation = observations.get(competitor.id);
    if (!observation) return [];
    const competitorTotal = deliveredTotal(observation);
    if (competitorTotal >= targetTotal) return [];

    const competitorProduct = products.get(competitor.productId ?? "");
    const identity = identityScore(target, competitor, targetProduct, competitorProduct);
    const stale = now - Date.parse(observation.observedAt) > STALE_AFTER_MS || Date.parse(observation.validUntil) < now;
    const stockPenalty = observation.stockState === "out_of_stock" ? 3_000 : observation.stockState === "unknown" ? 400 : 0;
    const marketplacePenalty = competitor.seller.type === "marketplace" ? 1_500 : 0;
    const conditionPenalty = competitor.condition === "new" ? 0 : 2_000;
    const membershipPenalty = observation.membershipRequired ? 800 : 0;
    const stalePenalty = stale ? 1_200 : 0;
    const savings = targetTotal - competitorTotal;
    const score = identity + Math.min(savings / 100, 400) - stockPenalty - marketplacePenalty - conditionPenalty - membershipPenalty - stalePenalty;

    return [{
      listingId: competitor.id,
      score,
      identity,
      savings,
      competitor,
      observation,
      retailerName: retailers.get(competitor.retailerId)?.name ?? competitor.seller.name,
    }];
  }).sort((left, right) => right.score - left.score || right.savings - left.savings);

  const best = ranked[0];
  if (!best) return undefined;

  const savingLabel = formatMoney({ amountCents: best.savings, currency: "AUD" });
  const reason = best.identity >= 7_000
    ? `Same product at ${best.retailerName} — ${savingLabel} cheaper delivered`
    : best.identity >= 3_000
      ? `Closest family match at ${best.retailerName} — ${savingLabel} cheaper`
      : `Cheapest comparable offer at ${best.retailerName} — ${savingLabel} less`;
  return { listingId: best.listingId, reason };
}

function overlayEvidence(current: EvidenceRecord, draft: OfferDraft): EvidenceRecord {
  if (draft.tab === "prepared") return current;
  const source: EvidenceSourceType = draft.capturedSource ?? (draft.tab === "url" ? "url" : draft.tab === "capture" ? "barcode" : "manual");
  const reference = draft.tab === "url" ? draft.url : draft.url || undefined;
  const observedAt = new Date().toISOString();
  const priceNumber = Number(draft.price);
  const deliveryNumber = Number(draft.delivery);
  const preserveCatalogue = draft.urlResolved === true || Boolean(draft.capturedSource);
  const preservedOrUnknown = (key: keyof EvidenceRecord) => preserveCatalogue ? current[key] : manualField(null, source, reference);
  return {
    ...current,
    manufacturerModel: manualField(draft.model || null, source, reference),
    normalizedModel: manualField(draft.model ? normalizeModel(draft.model) : null, source, reference),
    gtin: manualField(draft.gtin || null, source, reference),
    priceCents: manualField(Number.isFinite(priceNumber) && draft.price !== "" ? Math.round(priceNumber * 100) : null, source, reference),
    deliveryCostCents: manualField(Number.isFinite(deliveryNumber) && draft.delivery !== "" ? Math.round(deliveryNumber * 100) : null, source, reference),
    sellerName: manualField(draft.seller || null, source, reference),
    regionalSuffix: preservedOrUnknown("regionalSuffix"),
    sellerType: preservedOrUnknown("sellerType"),
    retailerId: preservedOrUnknown("retailerId"),
    stockState: preservedOrUnknown("stockState"),
    condition: preservedOrUnknown("condition"),
    warrantyMonths: preservedOrUnknown("warrantyMonths"),
    bundleItems: preservedOrUnknown("bundleItems"),
    membershipRequired: preservedOrUnknown("membershipRequired"),
    observedAt: manualField(observedAt, source, reference),
  };
}

export function OfferDockClient({ initialUrl = "", resumeId }: { initialUrl?: string; resumeId?: string }) {
  const router = useRouter();
  const [data, setData] = useState<CatalogueResponse>();
  const [resumeComparison, setResumeComparison] = useState<Comparison>();
  const [loadError, setLoadError] = useState<ApiClientError>();
  const [submitError, setSubmitError] = useState<ApiClientError>();
  const [busy, setBusy] = useState(false);
  const [scenarioId, setScenarioId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [competitorId, setCompetitorId] = useState("");
  const [activeSide, setActiveSide] = useState<OfferSide>(initialUrl ? "competitor" : "target");
  const [drafts, setDrafts] = useState<Record<OfferSide, OfferDraft>>({ target: emptyDraft(), competitor: emptyDraft(initialUrl) });
  const [mustHave, setMustHave] = useState<ConstraintCode[]>(["exact_identity", "new_condition"]);
  const [fulfilment, setFulfilment] = useState<"delivery" | "pickup">("delivery");
  const [postcode, setPostcode] = useState("3000");
  const [evidenceEditorOpen, setEvidenceEditorOpen] = useState(Boolean(initialUrl));
  const [autoPickHint, setAutoPickHint] = useState("");

  const load = useCallback(() => {
    const comparisonRequest = resumeId ? getComparison(resumeId) : Promise.resolve(null);
    Promise.all([getCatalogue(), comparisonRequest]).then(([response, existing]) => {
      setLoadError(undefined);
      setData(response);
      void saveCatalogueDraft(response).catch(() => undefined);
      if (existing) {
        const current = existing.comparison;
        setResumeComparison(current);
        if (current.targetListingId) setTargetId(current.targetListingId);
        if (current.competitorListingId) setCompetitorId(current.competitorListingId);
        setFulfilment(current.context.fulfilment);
        setPostcode(current.context.postcode ?? "3000");
        setMustHave(current.context.mustHave);
        const matchingScenario = response.scenarios.find((item) => item.targetListingId === current.targetListingId && item.competitorListingId === current.competitorListingId);
        if (matchingScenario) setScenarioId(matchingScenario.id);
      }
    }).catch((error) => setLoadError(error instanceof ApiClientError ? error : new ApiClientError("Catalogue unavailable.", "UNKNOWN", 0)));
  }, [resumeId]);
  useEffect(load, [load]);

  const lookup = useMemo(() => {
    if (!data) return null;
    return {
      retailers: new Map(data.catalogue.retailers.map((item) => [item.id, item])),
      products: new Map(data.catalogue.products.map((item) => [item.id, item])),
      observations: new Map(data.catalogue.observations.map((item) => [item.listingId, item])),
    };
  }, [data]);
  const targetListings = data?.catalogue.listings.filter((listing) => lookup?.retailers.get(listing.retailerId)?.kind === "retailer") ?? [];
  const competitorListings = data?.catalogue.listings.filter((listing) => lookup?.retailers.get(listing.retailerId)?.kind === "competitor") ?? [];
  const activeDraft = drafts[activeSide];
  const preferenceOptions = useMemo(() => [
    ...requirementOptions,
    {
      code: fulfilment as ConstraintCode,
      label: fulfilment === "delivery" ? "Keep delivery" : "Keep pickup",
      description: fulfilment === "delivery" ? "Pickup is not an acceptable alternative." : "Delivery is not an acceptable alternative.",
    },
  ], [fulfilment]);

  function applyCheaperMatch(nextTargetId: string) {
    if (!data || !lookup) return;
    const target = data.catalogue.listings.find((listing) => listing.id === nextTargetId);
    if (!target) return;
    const match = findBestCheaperCompetitor(target, competitorListings, lookup.products, lookup.observations, lookup.retailers);
    if (match) {
      setCompetitorId(match.listingId);
      setAutoPickHint(match.reason);
    } else {
      setCompetitorId("");
      setAutoPickHint("No cheaper matching offer found — pick one yourself.");
    }
  }

  function handleTargetChange(id: string) {
    setTargetId(id);
    setScenarioId("");
    applyCheaperMatch(id);
  }

  function handleCompetitorChange(id: string) {
    setCompetitorId(id);
    setAutoPickHint("");
    setScenarioId("");
  }

  function updateDraft(side: OfferSide, patch: Partial<OfferDraft>) {
    setDrafts((current) => ({ ...current, [side]: { ...current[side], ...patch } }));
  }

  function labelFor(listingId: string) {
    const listing = data?.catalogue.listings.find((item) => item.id === listingId);
    if (!listing || !lookup) return listingId;
    const retailer = lookup.retailers.get(listing.retailerId)?.name ?? "Retailer";
    const observation = lookup.observations.get(listing.id);
    return `${retailer} · ${listing.title}${observation ? ` · ${formatMoney(observation.price)}` : ""}`;
  }

  function selectScenario(id: string) {
    const scenario = data?.scenarios.find((item) => item.id === id);
    if (!scenario) return;
    setScenarioId(id);
    setTargetId(scenario.targetListingId);
    setCompetitorId(scenario.competitorListingId);
    setFulfilment(scenario.fulfilment);
    setDrafts({ target: emptyDraft(), competitor: emptyDraft() });
    setAutoPickHint("");
  }

  function populateDraft(side: OfferSide, listingId: string, patch: Partial<OfferDraft>) {
    const listing = data?.catalogue.listings.find((item) => item.id === listingId);
    if (!listing || !lookup) return;
    const product = lookup.products.get(listing.productId ?? "");
    const observation = lookup.observations.get(listing.id);
    updateDraft(side, {
      ...patch,
      model: listing.listedModel ?? product?.identifiers.manufacturerModel ?? "",
      gtin: listing.listedGtin ?? product?.identifiers.gtin ?? "",
      price: observation ? String(observation.price.amountCents / 100) : "",
      delivery: observation ? String(observation.delivery.cost.amountCents / 100) : "0",
      seller: listing.seller.name,
    });
  }

  function resolveUrl() {
    setSubmitError(undefined);
    try {
      const normalized = new URL(activeDraft.url).toString().replace(/\/$/, "");
      const expectedKind = activeSide === "target" ? "retailer" : "competitor";
      const listing = data?.catalogue.listings.find((item) => item.sourceUrl.replace(/\/$/, "") === normalized && lookup?.retailers.get(item.retailerId)?.kind === expectedKind);
      if (listing) {
        if (activeSide === "target") {
          setTargetId(listing.id);
          applyCheaperMatch(listing.id);
        } else setCompetitorId(listing.id);
        populateDraft(activeSide, listing.id, { urlResolved: true });
      } else {
        if (activeSide === "competitor") setCompetitorId("lst-unknown-msi");
        updateDraft(activeSide, { urlResolved: false });
      }
    } catch {
      setSubmitError(new ApiClientError("Enter a complete http:// or https:// retailer URL.", "INVALID_URL", 400));
    }
  }

  function handleDetected(value: string, source: "barcode" | "image", reference?: string) {
    const product = data?.catalogue.products.find((item) => item.identifiers.gtin === value);
    const candidates = activeSide === "target" ? targetListings : competitorListings;
    const listing = product && candidates.find((item) => item.productId === product.id);
    if (listing) {
      if (activeSide === "target") {
        setTargetId(listing.id);
        applyCheaperMatch(listing.id);
      } else setCompetitorId(listing.id);
      populateDraft(activeSide, listing.id, { capturedSource: source, tab: "manual", url: reference ?? source });
    } else {
      if (activeSide === "competitor") setCompetitorId("lst-unknown-msi");
      updateDraft(activeSide, { capturedSource: source, tab: "manual", gtin: value, url: reference ?? source });
    }
  }

  function toggleRequirement(code: ConstraintCode) {
    setMustHave((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  }

  async function begin() {
    if (!data) return;
    setBusy(true);
    setSubmitError(undefined);
    try {
      const allRequirements = preferenceOptions.map((item) => item.code);
      const context: Comparison["context"] = { postcode: fulfilment === "delivery" ? postcode : undefined, fulfilment, mustHave, flexible: allRequirements.filter((item) => !mustHave.includes(item)) };
      const targetSelection = evidenceForListing(data, targetId);
      const competitorSelection = evidenceForListing(data, competitorId);
      if (!targetSelection || !competitorSelection) throw new ApiClientError("The selected offer no longer has usable evidence.", "OFFER_UNAVAILABLE", 422);
      let workingComparison: Comparison;
      if (resumeComparison) {
        workingComparison = (await updateComparison(resumeComparison.id, {
          expectedVersion: resumeComparison.version,
          targetListingId: targetId,
          competitorListingId: competitorId,
          targetObservationId: targetSelection.observationId,
          competitorObservationId: competitorSelection.observationId,
          context,
          evidence: { target: targetSelection.record, competitor: competitorSelection.record },
          evidenceConfirmed: false,
          stage: "evidence_lens",
        })).comparison;
      } else {
        workingComparison = (await createComparison({ targetListingId: targetId, competitorListingId: competitorId, context })).comparison;
      }
      const evidence = { target: overlayEvidence(workingComparison.evidence.target, drafts.target), competitor: overlayEvidence(workingComparison.evidence.competitor, drafts.competitor) };
      const updated = await updateComparison(workingComparison.id, { expectedVersion: workingComparison.version, stage: "evidence_lens", evidence, evidenceConfirmed: false });
      await saveDraft(updated.comparison).catch(() => undefined);
      router.push(`/evidence-lens/${updated.comparison.id}`);
    } catch (error) {
      setSubmitError(error instanceof ApiClientError ? error : new ApiClientError("The comparison could not be started.", "UNKNOWN", 0));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorState message={loadError.message} requestId={loadError.requestId} onRetry={load} />;
  if (!data || !lookup) return <LoadingState label="Preparing the offer catalogue" />;

  const targetObservation = targetId ? lookup.observations.get(targetId) : undefined;
  const competitorObservation = competitorId ? lookup.observations.get(competitorId) : undefined;
  const targetListing = targetId ? data.catalogue.listings.find((item) => item.id === targetId) : undefined;
  const competitorListing = competitorId ? data.catalogue.listings.find((item) => item.id === competitorId) : undefined;
  const targetRetailerName = targetListing ? lookup.retailers.get(targetListing.retailerId)?.name : undefined;
  const competitorRetailerName = competitorListing ? lookup.retailers.get(competitorListing.retailerId)?.name : undefined;
  const listedSavingCents = targetObservation && competitorObservation
    ? targetObservation.price.amountCents - competitorObservation.price.amountCents
    : 0;
  const bothSelected = Boolean(targetId && competitorId);
  const canSubmit = bothSelected && !busy && (fulfilment !== "delivery" || /^\d{4}$/.test(postcode));

  return <div className="space-y-4 pb-24 sm:space-y-5 lg:pb-0">
    {resumeId && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">You are editing the same comparison. Changes will keep its evidence history.</div>}

    {/* ── Step 1 + Step 2: Progressive offer selection ── */}
    <section className="surface overflow-hidden" aria-labelledby="offer-pair-heading">
      <h2 id="offer-pair-heading" className="sr-only">Choose the two offers to compare</h2>
      <div className="grid items-stretch gap-3 p-3 sm:p-5 md:grid-cols-[1fr_auto_1fr] md:gap-4">
        {/* Step 1: Target */}
        <OfferSlot
          number="1"
          title="Your store"
          description="Where you want the price match"
          icon={Store}
          tone="violet"
          active
          onFocus={() => setActiveSide("target")}
        >
          <ResponsiveSelect
            id="target-listing"
            ariaLabel="Your store's product"
            value={targetId}
            onChange={handleTargetChange}
            placeholder="Choose your store's product…"
            options={targetListings.map((listing) => ({ value: listing.id, label: labelFor(listing.id) }))}
          />
          {targetListing && targetObservation && (
            <OfferMiniSummary
              storeName={targetRetailerName ?? targetListing.seller.name}
              title={targetListing.title}
              price={formatMoney(targetObservation.price)}
              stock={targetObservation.stockState}
              tone="violet"
            />
          )}
        </OfferSlot>

        {/* Divider */}
        <div className="flex items-center gap-2 px-4 py-0.5 md:grid md:place-items-center md:px-0 md:py-0" aria-hidden="true">
          <span className="h-px flex-1 bg-slate-200 md:hidden" />
          <span className={`text-[10px] font-bold uppercase tracking-[.16em] transition-colors md:grid md:size-10 md:place-items-center md:rounded-full md:text-base md:tracking-normal ${bothSelected ? "text-white md:bg-blue-600" : "text-slate-400 md:bg-slate-100 md:text-slate-500"}`}>vs</span>
          <span className="h-px flex-1 bg-slate-200 md:hidden" />
        </div>

        {/* Step 2: Competitor — dimmed until target picked */}
        {targetId ? (
          <OfferSlot
            number="2"
            title="Cheaper offer"
            description="The competing offer you want checked"
            icon={ShoppingBag}
            tone="blue"
            active
            onFocus={() => setActiveSide("competitor")}
          >
            <ResponsiveSelect
              id="competitor-listing"
              ariaLabel="Competitor offer"
              value={competitorId}
              onChange={handleCompetitorChange}
              placeholder="Choose the cheaper offer…"
              options={competitorListings.map((listing) => ({ value: listing.id, label: labelFor(listing.id) }))}
            />
            {competitorListing && competitorObservation && (
              <OfferMiniSummary
                storeName={competitorRetailerName ?? competitorListing.seller.name}
                title={competitorListing.title}
                price={formatMoney(competitorObservation.price)}
                stock={competitorObservation.stockState}
                tone="blue"
              />
            )}
            {autoPickHint && (
              <p className="mt-2 text-xs leading-5 text-blue-800" role="status">{autoPickHint}</p>
            )}
          </OfferSlot>
        ) : (
          <div className="grid place-items-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center sm:p-8" aria-hidden="true">
            <span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-400"><Package size={20} /></span>
            <p className="mt-3 text-sm font-semibold text-slate-500">Pick your product first</p>
            <p className="mt-1 text-xs text-slate-400">Then choose the cheaper offer to compare</p>
          </div>
        )}
      </div>

      {/* Saving banner — only when both selected */}
      {listedSavingCents > 0 && (
        <p className="flex items-center justify-center gap-2 border-t border-emerald-100 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-900">
          <Sparkles size={15} className="shrink-0" />
          {formatMoney({ amountCents: listedSavingCents, currency: "AUD" })} cheaper on paper. Let&apos;s check if it qualifies.
        </p>
      )}
      {bothSelected && listedSavingCents <= 0 && (
        <p className="flex items-center justify-center gap-2 border-t border-amber-100 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900">
          <CircleHelp size={15} className="shrink-0" />
          The competitor isn&apos;t actually cheaper. You can still run the check.
        </p>
      )}
    </section>

    {/* ── Scenarios: prominent when nothing is selected ── */}
    {!bothSelected && !resumeId && (
      <section className="surface overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div>
            <h2 className="inline-flex items-center gap-2 font-semibold"><Sparkles size={17} className="text-blue-600" />Or try a ready-made example</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Pick one to see the whole flow with pre-filled offers.</p>
          </div>
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-2 sm:gap-3 sm:p-4">
          {data.scenarios.slice(0, 4).map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => selectScenario(scenario.id)}
              className={`rounded-xl border p-3.5 text-left transition-all sm:p-4 ${scenarioId === scenario.id ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}
            >
              <span className="text-sm font-semibold">{scenario.name}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-600">{scenario.description}</span>
            </button>
          ))}
        </div>
        {data.scenarios.length > 4 && (
          <details className="group border-t border-slate-100">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-slate-50">
              <span>Show {data.scenarios.length - 4} more examples</span>
            </summary>
            <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2 sm:gap-3 sm:p-4">
              {data.scenarios.slice(4).map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => selectScenario(scenario.id)}
                  className={`rounded-xl border p-3.5 text-left transition-all sm:p-4 ${scenarioId === scenario.id ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}
                >
                  <span className="text-sm font-semibold">{scenario.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">{scenario.description}</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </section>
    )}

    {/* ── Options only once at least one offer is chosen ── */}
    {(targetId || competitorId || resumeId) && (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-5">
        <div className="space-y-4 lg:space-y-5">
          {/* Delivery / postcode */}
          <section className="surface p-4 sm:p-5">
            <h2 className="font-semibold">How will you buy it?</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["delivery", "pickup"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={fulfilment === value}
                  onClick={() => { setFulfilment(value); setMustHave((current) => current.filter((item) => item !== "delivery" && item !== "pickup")); }}
                  className={`button-secondary capitalize ${fulfilment === value ? "border-blue-500 bg-blue-50 text-blue-800" : ""}`}
                >{value}</button>
              ))}
            </div>
            {fulfilment === "delivery" && (
              <label className="mt-3 block text-sm font-semibold" htmlFor="postcode">
                Delivery postcode
                <input id="postcode" className="field mt-2" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={postcode} onChange={(event) => setPostcode(event.target.value.replace(/\D/g, "").slice(0, 4))} />
              </label>
            )}
          </section>

          {/* Evidence editor — optional */}
          <details className="surface group overflow-hidden" open={evidenceEditorOpen} onToggle={(event) => setEvidenceEditorOpen(event.currentTarget.open)}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 sm:p-5">
              <span>
                <span className="block font-semibold">Change or add offer details</span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">Only needed if the picked offer isn&apos;t quite right.</span>
              </span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 group-open:bg-blue-50 group-open:text-blue-700">Optional</span>
            </summary>
            <div className="border-t border-slate-200">
              <div className="p-4 sm:p-5">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">Editing</p>
                <div className="mt-2 grid grid-cols-2 gap-2" aria-label="Offer being edited">
                  <button type="button" aria-pressed={activeSide === "target"} onClick={() => setActiveSide("target")} className={`button-secondary ${activeSide === "target" ? "border-blue-500 bg-blue-50 text-blue-800" : ""}`}>Your store</button>
                  <button type="button" aria-pressed={activeSide === "competitor"} onClick={() => setActiveSide("competitor")} className={`button-secondary ${activeSide === "competitor" ? "border-blue-500 bg-blue-50 text-blue-800" : ""}`}>Cheaper offer</button>
                </div>
                <h2 id="source-heading" className="mt-4 text-lg font-semibold">How do you have this offer?</h2>
              </div>
              <div className="grid grid-cols-2 border-b border-slate-200 sm:grid-cols-4" aria-label="Evidence input method">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" aria-pressed={activeDraft.tab === id} onClick={() => updateDraft(activeSide, { tab: id })} className={`flex min-h-16 items-center justify-center gap-2 border-b-2 px-2 text-xs font-semibold sm:text-sm ${activeDraft.tab === id ? "border-blue-600 bg-blue-50 text-blue-800" : "border-transparent text-slate-600 hover:bg-slate-50"}`}>
                    <Icon size={17} aria-hidden="true" />{label}
                  </button>
                ))}
              </div>
              <div className="p-5 sm:p-6">
                {activeDraft.tab === "prepared" && <p className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"><Check className="mr-2 inline" size={17} />The picked offer is ready. You&apos;ll verify its details next.</p>}
                {activeDraft.tab === "url" && (
                  <div>
                    <label className="text-sm font-semibold" htmlFor={`${activeSide}-retailer-url`}>Store product URL</label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input id={`${activeSide}-retailer-url`} className="field flex-1" type="url" placeholder="https://retailer.example/monitor" value={activeDraft.url} onChange={(event) => updateDraft(activeSide, { url: event.target.value, urlResolved: null })} />
                      <button type="button" className="button-secondary shrink-0" onClick={resolveUrl}><ExternalLink size={17} />Check URL</button>
                    </div>
                    {activeDraft.urlResolved === true && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">Known offer found. Confirm the imported facts on the next screen.</p>}
                    {activeDraft.urlResolved === false && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900" role="status">This page is not in our catalogue. Enter only the facts you can see; everything else will remain Unknown.</p>}
                  </div>
                )}
                {activeDraft.tab === "capture" && <EvidenceCapture onDetected={handleDetected} />}
                {(activeDraft.tab === "manual" || (activeDraft.tab === "url" && activeDraft.urlResolved === false)) && <ManualFields draft={activeDraft} onChange={(value) => updateDraft(activeSide, value)} />}
              </div>
            </div>
          </details>
        </div>

        {/* Sidebar: must-haves */}
        <aside className="space-y-4">
          <details className="surface group overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5">
              <span className="inline-flex items-center gap-2 font-semibold"><LockKeyhole size={17} className="text-blue-700" />Must-haves</span>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{mustHave.length} selected</span>
            </summary>
            <div className="border-t border-slate-200 p-4 sm:p-5">
              <p className="text-xs leading-5 text-slate-600">Only tick what cannot change. Everything else can be used to find an honest alternative.</p>
              <div className="mt-4 space-y-2">
                {preferenceOptions.map((item) => (
                  <label key={item.code} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
                    <input type="checkbox" className="mt-1 size-5 shrink-0 accent-blue-600" checked={mustHave.includes(item.code)} onChange={() => toggleRequirement(item.code)} />
                    <span>
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </details>

          {/* Also expose scenarios below when both selected — as compact accordion */}
          {bothSelected && !resumeId && (
            <details className="surface group overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5">
                <span className="inline-flex items-center gap-2 font-semibold"><Sparkles size={17} className="text-blue-600" />Try a different example</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{data.scenarios.length}</span>
              </summary>
              <div className="grid gap-2 border-t border-slate-200 p-3 sm:grid-cols-2 sm:gap-3 sm:p-4">
                {data.scenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => selectScenario(scenario.id)}
                    className={`rounded-xl border p-3 text-left ${scenarioId === scenario.id ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <span className="text-sm font-semibold">{scenario.name}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">{scenario.description}</span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </aside>
      </div>
    )}

    {submitError && <ErrorState message={submitError.message} requestId={submitError.requestId} />}

    {/* ── Action bar ── */}
    <div className="mobile-action-dock">
      <div className="action-panel surface p-4">
        <button type="button" className="button-primary w-full" onClick={begin} disabled={!canSubmit}>
          {busy ? "Preparing evidence…" : bothSelected ? "Review both offers" : "Pick two offers to continue"}
          <ArrowRight size={18} />
        </button>
        {bothSelected && (
          <p className="mobile-action-copy mt-2 text-center text-xs leading-5 text-slate-500">Next: verify the facts that decide the result.</p>
        )}
      </div>
    </div>
  </div>;
}

function OfferSlot({ number, title, description, icon: Icon, tone, active, onFocus, children }: { number: string; title: string; description: string; icon: typeof Store; tone: "violet" | "blue"; active: boolean; onFocus(): void; children: ReactNode }) {
  const accent = tone === "violet"
    ? { bg: "bg-violet-50", border: "border-violet-200", iconBg: "bg-violet-500", numberBg: "bg-violet-600", stripe: "bg-violet-500" }
    : { bg: "bg-blue-50", border: "border-blue-200", iconBg: "bg-blue-500", numberBg: "bg-blue-600", stripe: "bg-blue-500" };
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border-2 p-4 transition-all sm:p-5 ${active ? `${accent.border} ${accent.bg}` : "border-slate-200 bg-slate-50/60 opacity-70"}`}
      onFocus={onFocus}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${accent.stripe}`} aria-hidden="true" />
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl text-white ${accent.iconBg}`}><Icon size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Step {number}</p>
          <h3 className="mt-0.5 text-sm font-semibold text-slate-900 sm:text-base">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function OfferMiniSummary({ storeName, title, price, stock, tone }: { storeName: string; title: string; price: string; stock: string; tone: "violet" | "blue" }) {
  const stockLabel = stock === "in_stock" ? "In stock" : stock === "out_of_stock" ? "Out of stock" : "Stock unknown";
  const stockColor = stock === "in_stock" ? "text-emerald-700" : stock === "out_of_stock" ? "text-rose-700" : "text-amber-700";
  return (
    <div className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-white p-3 shadow-sm">
      <div className="min-w-0 flex-1">
        <p className={`text-[10px] font-bold uppercase tracking-[.14em] ${tone === "violet" ? "text-violet-600" : "text-blue-600"}`}>{storeName}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{title}</p>
        <p className={`mt-0.5 text-xs font-semibold ${stockColor}`}>{stockLabel}</p>
      </div>
      <p className="shrink-0 text-lg font-bold tracking-[-.02em] text-slate-900">{price}</p>
    </div>
  );
}

function ManualFields({ draft, onChange }: { draft: OfferDraft; onChange(value: Partial<OfferDraft>): void }) {
  return <fieldset><legend className="text-sm font-semibold">Facts visible in this offer</legend><p className="mt-1 text-sm text-slate-600">Leave anything you cannot verify blank. It will show as Unknown.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Manufacturer model<input className="field mt-2" value={draft.model} onChange={(event) => onChange({ model: event.target.value })} placeholder="e.g. G2724D-AU" /></label><label className="text-sm font-semibold">GTIN / EAN<input className="field mt-2" inputMode="numeric" value={draft.gtin} onChange={(event) => onChange({ gtin: event.target.value.replace(/\D/g, "") })} placeholder="13-digit barcode" /></label><label className="text-sm font-semibold">Price (AUD)<input className="field mt-2" inputMode="decimal" value={draft.price} onChange={(event) => onChange({ price: event.target.value })} placeholder="449.00" /></label><label className="text-sm font-semibold">Delivery (AUD)<input className="field mt-2" inputMode="decimal" value={draft.delivery} onChange={(event) => onChange({ delivery: event.target.value })} placeholder="0.00" /></label><label className="text-sm font-semibold sm:col-span-2">Seller name<input className="field mt-2" value={draft.seller} onChange={(event) => onChange({ seller: event.target.value })} placeholder="Retailer or marketplace seller" /></label></div></fieldset>;
}
