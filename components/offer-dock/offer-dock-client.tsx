"use client";

import { ArrowRight, Camera, Check, Database, ExternalLink, Keyboard, Link2, LockKeyhole, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { EvidenceCapture } from "@/components/evidence/evidence-capture";
import { ErrorState, LoadingState } from "@/components/shared/async-state";
import { ResponsiveSelect } from "@/components/shared/responsive-select";
import { ApiClientError, createComparison, getCatalogue, getComparison, updateComparison, type CatalogueResponse } from "@/lib/client/api";
import { saveCatalogueDraft, saveDraft } from "@/lib/client/draft-store";
import { formatMoney, normalizeModel } from "@/lib/domain/normalization";
import type { Comparison, ConstraintCode, EvidenceField, EvidenceRecord, EvidenceSourceType, EvidenceValue } from "@/models/domain";

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
  const [scenarioId, setScenarioId] = useState("scenario-exact");
  const [targetId, setTargetId] = useState("lst-ow-dell");
  const [competitorId, setCompetitorId] = useState("lst-cc-dell-exact");
  const [activeSide, setActiveSide] = useState<OfferSide>(initialUrl ? "competitor" : "target");
  const [drafts, setDrafts] = useState<Record<OfferSide, OfferDraft>>({ target: emptyDraft(), competitor: emptyDraft(initialUrl) });
  const [mustHave, setMustHave] = useState<ConstraintCode[]>(["exact_identity", "new_condition"]);
  const [fulfilment, setFulfilment] = useState<"delivery" | "pickup">("delivery");
  const [postcode, setPostcode] = useState("3000");
  const [evidenceEditorOpen, setEvidenceEditorOpen] = useState(Boolean(initialUrl));

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
        if (activeSide === "target") setTargetId(listing.id); else setCompetitorId(listing.id);
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
      if (activeSide === "target") setTargetId(listing.id); else setCompetitorId(listing.id);
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

  const targetObservation = lookup.observations.get(targetId);
  const competitorObservation = lookup.observations.get(competitorId);
  const listedSavingCents = targetObservation && competitorObservation
    ? targetObservation.price.amountCents - competitorObservation.price.amountCents
    : 0;

  return <div className="space-y-5 pb-24 sm:space-y-6 lg:pb-0">
    {resumeId && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">You are editing the same comparison. Changes will keep its evidence history.</div>}
    <section className="surface overflow-hidden" aria-labelledby="offer-pair-heading">
      <h2 id="offer-pair-heading" className="sr-only">Choose the two offers</h2>
      <div className="grid items-stretch gap-2.5 p-3 sm:gap-3 sm:p-6 md:grid-cols-[1fr_auto_1fr]">
        <OfferSlot number="1" title="Product I want" description="The retailer where you want the price match" onSelect={() => setActiveSide("target")}><ResponsiveSelect id="target-listing" ariaLabel="Product I want offer" value={targetId} onChange={setTargetId} options={targetListings.map((listing) => ({ value: listing.id, label: labelFor(listing.id) }))} /></OfferSlot>
        <div className="flex items-center gap-2 px-5 py-0.5 md:grid md:px-0 md:py-0" aria-hidden="true"><span className="h-px flex-1 bg-slate-200 md:hidden" /><span className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400 md:grid md:size-10 md:place-items-center md:rounded-full md:bg-slate-950 md:text-base md:tracking-normal md:text-white">vs</span><span className="h-px flex-1 bg-slate-200 md:hidden" /></div>
        <OfferSlot number="2" title="Lower price I found" description="The competing offer you want checked" onSelect={() => setActiveSide("competitor")}><ResponsiveSelect id="competitor-listing" ariaLabel="Lower-price offer" value={competitorId} onChange={setCompetitorId} options={competitorListings.map((listing) => ({ value: listing.id, label: labelFor(listing.id) }))} /></OfferSlot>
      </div>
      {listedSavingCents > 0 && <p className="border-t border-emerald-100 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-900">The lower listed price is {formatMoney({ amountCents: listedSavingCents, currency: "AUD" })} less. We’ll now check whether it qualifies.</p>}
    </section>

    <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-6">
      <aside className="space-y-4">
        <section className="surface p-4 sm:p-5"><h2 className="font-semibold">How will you buy it?</h2><div className="mt-3 grid grid-cols-2 gap-2">{(["delivery", "pickup"] as const).map((value) => <button key={value} type="button" aria-pressed={fulfilment === value} onClick={() => { setFulfilment(value); setMustHave((current) => current.filter((item) => item !== "delivery" && item !== "pickup")); }} className={`button-secondary capitalize ${fulfilment === value ? "border-blue-500 bg-blue-50 text-blue-800" : ""}`}>{value}</button>)}</div>{fulfilment === "delivery" && <label className="mt-3 block text-sm font-semibold" htmlFor="postcode">Delivery postcode<input id="postcode" className="field mt-2" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={postcode} onChange={(event) => setPostcode(event.target.value.replace(/\D/g, "").slice(0, 4))} /></label>}</section>
        {submitError && <ErrorState message={submitError.message} requestId={submitError.requestId} />}
        <div className="mobile-action-dock"><button type="button" className="button-primary w-full" onClick={begin} disabled={busy || (fulfilment === "delivery" && !/^\d{4}$/.test(postcode))}>{busy ? "Preparing evidence…" : "Review both offers"}<ArrowRight size={18} /></button><p className="mobile-action-copy mt-2 text-center text-xs leading-5 text-slate-500">Next: verify the facts that decide the result.</p></div>
        <details className="surface group overflow-hidden"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5"><span className="inline-flex items-center gap-2 font-semibold"><LockKeyhole size={17} className="text-blue-700" />Must-haves</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{mustHave.length} selected</span></summary><div className="border-t border-slate-200 p-4 sm:p-5"><p className="text-xs leading-5 text-slate-600">Only select what cannot change. Everything else can be used to find an honest alternative.</p><div className="mt-4 space-y-2">{preferenceOptions.map((item) => <label key={item.code} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-blue-600" checked={mustHave.includes(item.code)} onChange={() => toggleRequirement(item.code)} /><span><span className="block text-sm font-semibold">{item.label}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.description}</span></span></label>)}</div></div></details>
      </aside>

      <div className="space-y-4 lg:space-y-5">
        <details className="surface group overflow-hidden" open={evidenceEditorOpen} onToggle={(event) => setEvidenceEditorOpen(event.currentTarget.open)}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 sm:p-5">
            <span><span className="block font-semibold">Add or change offer evidence</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">Use a URL, photo, barcode or manual entry only when needed.</span></span>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 group-open:bg-blue-50 group-open:text-blue-700">Optional</span>
          </summary>
          <div className="border-t border-slate-200">
            <div className="p-4 sm:p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">Adding evidence for</p><div className="mt-2 grid grid-cols-2 gap-2" aria-label="Offer being edited"><button type="button" aria-pressed={activeSide === "target"} onClick={() => setActiveSide("target")} className={`button-secondary ${activeSide === "target" ? "border-blue-500 bg-blue-50 text-blue-800" : ""}`}>Product I want</button><button type="button" aria-pressed={activeSide === "competitor"} onClick={() => setActiveSide("competitor")} className={`button-secondary ${activeSide === "competitor" ? "border-blue-500 bg-blue-50 text-blue-800" : ""}`}>Lower price</button></div><h2 id="source-heading" className="mt-4 text-lg font-semibold">How do you have this offer?</h2></div>
          <div className="grid grid-cols-2 border-b border-slate-200 sm:grid-cols-4" aria-label="Evidence input method">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={activeDraft.tab === id} onClick={() => updateDraft(activeSide, { tab: id })} className={`flex min-h-16 items-center justify-center gap-2 border-b-2 px-2 text-xs font-semibold sm:text-sm ${activeDraft.tab === id ? "border-blue-600 bg-blue-50 text-blue-800" : "border-transparent text-slate-600 hover:bg-slate-50"}`}><Icon size={17} aria-hidden="true" />{label}</button>)}</div>
          <div className="p-5 sm:p-6">
            {activeDraft.tab === "prepared" && <p className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"><Check className="mr-2 inline" size={17} />The selected prepared offer is ready. You will verify its important facts next.</p>}
            {activeDraft.tab === "url" && <div><label className="text-sm font-semibold" htmlFor={`${activeSide}-retailer-url`}>Retailer product URL</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input id={`${activeSide}-retailer-url`} className="field flex-1" type="url" placeholder="https://retailer.example/monitor" value={activeDraft.url} onChange={(event) => updateDraft(activeSide, { url: event.target.value, urlResolved: null })} /><button type="button" className="button-secondary shrink-0" onClick={resolveUrl}><ExternalLink size={17} />Check URL</button></div>{activeDraft.urlResolved === true && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">Known prototype offer found. Confirm the imported facts on the next screen.</p>}{activeDraft.urlResolved === false && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900" role="status">This page is not in the prototype catalogue. Enter only the facts you can see; everything else will remain Unknown.</p>}</div>}
            {activeDraft.tab === "capture" && <EvidenceCapture onDetected={handleDetected} />}
            {(activeDraft.tab === "manual" || (activeDraft.tab === "url" && activeDraft.urlResolved === false)) && <ManualFields draft={activeDraft} onChange={(value) => updateDraft(activeSide, value)} />}
          </div>
          </div>
        </details>
        <details className="surface p-5 sm:p-6"><summary className="cursor-pointer list-none font-semibold"><span className="inline-flex items-center gap-2"><Sparkles size={17} className="text-blue-600" />Try a prepared demonstration scenario</span><span className="mt-1 block text-sm font-normal text-slate-600">Optional: choose a known edge case for the assessment demonstration.</span></summary><div className="mt-5 grid gap-3 sm:grid-cols-2">{data.scenarios.map((scenario) => <button key={scenario.id} type="button" onClick={() => selectScenario(scenario.id)} className={`rounded-2xl border p-4 text-left ${scenarioId === scenario.id ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 hover:bg-slate-50"}`}><span className="text-sm font-semibold">{scenario.name}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{scenario.description}</span></button>)}</div></details>
      </div>
    </div>
  </div>;
}

function OfferSlot({ number, title, description, onSelect, children }: { number: string; title: string; description: string; onSelect(): void; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 sm:p-5" onFocus={onSelect}><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">{number}</span><div><h3 className="font-semibold">{title}</h3><p className="mt-0.5 text-xs leading-5 text-slate-600">{description}</p></div></div><div className="mt-3">{children}</div></section>;
}

function ManualFields({ draft, onChange }: { draft: OfferDraft; onChange(value: Partial<OfferDraft>): void }) {
  return <fieldset><legend className="text-sm font-semibold">Facts visible in this offer</legend><p className="mt-1 text-sm text-slate-600">Leave anything you cannot verify blank. SameProof will show it as Unknown.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Manufacturer model<input className="field mt-2" value={draft.model} onChange={(event) => onChange({ model: event.target.value })} placeholder="e.g. G2724D-AU" /></label><label className="text-sm font-semibold">GTIN / EAN<input className="field mt-2" inputMode="numeric" value={draft.gtin} onChange={(event) => onChange({ gtin: event.target.value.replace(/\D/g, "") })} placeholder="13-digit barcode" /></label><label className="text-sm font-semibold">Price (AUD)<input className="field mt-2" inputMode="decimal" value={draft.price} onChange={(event) => onChange({ price: event.target.value })} placeholder="449.00" /></label><label className="text-sm font-semibold">Delivery (AUD)<input className="field mt-2" inputMode="decimal" value={draft.delivery} onChange={(event) => onChange({ delivery: event.target.value })} placeholder="0.00" /></label><label className="text-sm font-semibold sm:col-span-2">Seller name<input className="field mt-2" value={draft.seller} onChange={(event) => onChange({ seller: event.target.value })} placeholder="Retailer or marketplace seller" /></label></div></fieldset>;
}
