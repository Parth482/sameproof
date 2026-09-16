"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, Check, CircleHelp, Clock3, Database, DollarSign, ExternalLink, Package, Pencil, ShieldCheck, Store, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ErrorState, LoadingState, OfflineNotice } from "@/components/shared/async-state";
import { ResponsiveSelect, type ResponsiveSelectOption } from "@/components/shared/responsive-select";
import { ApiClientError, deleteComparison, getCatalogue, getComparison, updateComparison, type CatalogueResponse } from "@/lib/client/api";
import { deleteDraft, getDraft, saveCatalogueDraft, saveDraft } from "@/lib/client/draft-store";
import { useOnlineStatus } from "@/lib/client/use-online-status";
import { formatMoney } from "@/lib/domain/normalization";
import type { Comparison, EvidenceField, EvidenceKey, EvidenceRecord, EvidenceValue } from "@/models/domain";

type Side = "target" | "competitor";
type FieldKind = "text" | "money" | "number" | "list" | "datetime" | "condition" | "stock" | "sellerType" | "retailer" | "yesno";

interface FieldDefinition {
  key: EvidenceKey;
  label: string;
  kind: FieldKind;
  hint: string;
  priority: "decision" | "details";
}

const fields: FieldDefinition[] = [
  { key: "manufacturerModel", label: "Model number", kind: "text", hint: "The exact model printed on the product or page", priority: "decision" },
  { key: "gtin", label: "Barcode", kind: "text", hint: "A matching barcode is strong identity evidence", priority: "decision" },
  { key: "regionalSuffix", label: "Region (e.g. AU)", kind: "text", hint: "Leave blank when it is not shown", priority: "decision" },
  { key: "priceCents", label: "Price", kind: "money", hint: "Australian dollars", priority: "decision" },
  { key: "deliveryCostCents", label: "Delivery cost", kind: "money", hint: "Use zero only when free delivery is confirmed", priority: "decision" },
  { key: "stockState", label: "Availability", kind: "stock", hint: "What the retailer shows right now", priority: "decision" },
  { key: "condition", label: "Condition", kind: "condition", hint: "New, refurbished or used", priority: "decision" },
  { key: "warrantyMonths", label: "Warranty (months)", kind: "number", hint: "How many months of manufacturer warranty", priority: "decision" },
  { key: "bundleItems", label: "Extras in the box", kind: "list", hint: "Comma-separated promotional items; blank means Unknown", priority: "decision" },
  { key: "sellerType", label: "Seller type", kind: "sellerType", hint: "Direct retailer or marketplace seller", priority: "decision" },
  { key: "membershipRequired", label: "Members-only price?", kind: "yesno", hint: "Whether everyone can access this price", priority: "decision" },
  { key: "observedAt", label: "Last checked", kind: "datetime", hint: "When you last saw this price and stock", priority: "decision" },
  { key: "sellerName", label: "Seller name", kind: "text", hint: "The business fulfilling the order", priority: "details" },
  { key: "retailerId", label: "Retailer", kind: "retailer", hint: "The website where this offer appears", priority: "details" },
];

const dynamicKeys = new Set<EvidenceKey>(["priceCents", "deliveryCostCents", "stockState", "observedAt"]);

function displayValue(field: EvidenceField<EvidenceValue> | undefined, kind: FieldKind) {
  if (field?.value === null || field?.value === undefined) return "";
  if (kind === "money" && typeof field.value === "number") return (field.value / 100).toFixed(2);
  if (kind === "list" && Array.isArray(field.value)) return field.value.join(", ");
  if (kind === "datetime" && typeof field.value === "string") return field.value.slice(0, 16);
  return String(field.value);
}

function parseValue(raw: string, kind: FieldKind): EvidenceValue | null {
  if (!raw.trim()) return null;
  if (kind === "money") {
    const number = Number(raw);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
  }
  if (kind === "number") {
    const number = Number(raw);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
  }
  if (kind === "list") return raw.split(",").map((item) => item.trim()).filter(Boolean);
  if (kind === "datetime") {
    const timestamp = Date.parse(raw);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  }
  if (kind === "yesno") return raw === "true";
  return raw;
}

function reviewedField(
  previous: EvidenceField<EvidenceValue> | undefined,
  value: EvidenceValue | null,
  refreshSource = true,
): EvidenceField<EvidenceValue> {
  const observedAt = new Date().toISOString();
  return {
    value,
    state: value === null ? "unknown" : previous?.state === "conflicting" ? "conflicting" : "confirmed",
    sources: value !== null && refreshSource
      ? [...(previous?.sources ?? []), { type: "manual" as const, reference: previous?.sources.at(-1)?.reference, observedAt }].slice(-10)
      : previous?.sources ?? [{ type: "manual" as const, observedAt }],
    conflicts: previous?.conflicts,
    confidence: value === null ? "low" : previous?.confidence ?? "medium",
    userConfirmed: value !== null && previous?.state !== "conflicting",
  };
}

function reviewRecord(record: EvidenceRecord): EvidenceRecord {
  return Object.fromEntries(Object.entries(record).map(([key, field]) => [
    key,
    fields.some((definition) => definition.priority === "decision" && definition.key === key)
      ? reviewedField(field, field.value, dynamicKeys.has(key as EvidenceKey))
      : field,
  ])) as EvidenceRecord;
}

function getRememberedSides(comparisonId: string, version: number): Side[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(`sameproof-reviewed-sides:${comparisonId}`) ?? "null") as { version?: number; sides?: unknown } | null;
    return value?.version === version && Array.isArray(value.sides)
      ? value.sides.filter((side): side is Side => side === "target" || side === "competitor")
      : [];
  } catch {
    return [];
  }
}

export function EvidenceLensClient({ comparisonId }: { comparisonId: string }) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [comparison, setComparison] = useState<Comparison>();
  const [catalogue, setCatalogue] = useState<CatalogueResponse>();
  const [evidence, setEvidence] = useState<Comparison["evidence"]>();
  const [loadError, setLoadError] = useState<ApiClientError>();
  const [submitError, setSubmitError] = useState<ApiClientError>();
  const [usingDraft, setUsingDraft] = useState(false);
  const [reviewedSides, setReviewedSides] = useState<Side[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeSide, setActiveSide] = useState<Side>("competitor");
  const [announcement, setAnnouncement] = useState("");

  const load = useCallback(async () => {
    try {
      const [response, catalogueResponse] = await Promise.all([getComparison(comparisonId), getCatalogue()]);
      setLoadError(undefined);
      setComparison(response.comparison);
      setEvidence(response.comparison.evidence);
      setCatalogue(catalogueResponse);
      setReviewedSides(response.comparison.evidenceConfirmed ? ["target", "competitor"] : getRememberedSides(comparisonId, response.comparison.version));
      await saveCatalogueDraft(catalogueResponse).catch(() => undefined);
      setUsingDraft(false);
      await saveDraft(response.comparison).catch(() => undefined);
    } catch (error) {
      const draft = await getDraft(comparisonId).catch(() => undefined);
      if (draft) {
        setComparison(draft);
        setEvidence(draft.evidence);
        setUsingDraft(true);
        setReviewedSides(draft.evidenceConfirmed ? ["target", "competitor"] : getRememberedSides(comparisonId, draft.version));
      } else {
        setLoadError(error instanceof ApiClientError ? error : new ApiClientError("Evidence could not be loaded.", "UNKNOWN", 0));
      }
    }
  }, [comparisonId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const retailerOptions = catalogue?.catalogue.retailers ?? [];
  const titles = useMemo(() => {
    if (!catalogue || !comparison) return { target: "Product I want", competitor: "Lower-price offer" };
    return {
      target: catalogue.catalogue.listings.find((item) => item.id === comparison.targetListingId)?.title ?? "Product I want",
      competitor: catalogue.catalogue.listings.find((item) => item.id === comparison.competitorListingId)?.title ?? "Lower-price offer",
    };
  }, [catalogue, comparison]);

  function setField(side: Side, key: EvidenceKey, raw: string, kind: FieldKind) {
    setEvidence((current) => {
      if (!current) return current;
      const record = current[side];
      return { ...current, [side]: { ...record, [key]: reviewedField(record[key], parseValue(raw, kind), true) } };
    });
    markSideUnreviewed(side);
  }

  function confirmField(side: Side, key: EvidenceKey) {
    setEvidence((current) => {
      if (!current) return current;
      const record = current[side];
      const field = record[key];
      if (!field) return current;
      return { ...current, [side]: { ...record, [key]: reviewedField(field, field.value, dynamicKeys.has(key)) } };
    });
    markSideUnreviewed(side);
  }

  function confirmOffer(side: Side) {
    setEvidence((current) => current ? { ...current, [side]: reviewRecord(current[side]) } : current);
    const otherSide: Side = side === "target" ? "competitor" : "target";
    setReviewedSides((current) => {
      const next = [...new Set([...current, side])];
      sessionStorage.setItem(`sameproof-reviewed-sides:${comparisonId}`, JSON.stringify({ version: comparison?.version, sides: next }));
      return next;
    });
    if (!reviewedSides.includes(otherSide)) {
      setActiveSide(otherSide);
      setAnnouncement(`Now review ${otherSide === "target" ? "Product I want" : "Lower-price offer"}.`);
      window.setTimeout(() => document.getElementById("active-offer-heading")?.focus(), 0);
    }
  }

  function markSideUnreviewed(side: Side) {
    setReviewedSides((current) => {
      const next = current.filter((item) => item !== side);
      sessionStorage.setItem(`sameproof-reviewed-sides:${comparisonId}`, JSON.stringify({ version: comparison?.version, sides: next }));
      return next;
    });
  }

  async function continueJourney() {
    if (!comparison || !evidence || reviewedSides.length < 2) return;
    setBusy(true);
    setSubmitError(undefined);
    const local = { ...comparison, evidence, evidenceConfirmed: true, stage: "identity_bridge" as const, updatedAt: new Date().toISOString() };
    await saveDraft(local).catch(() => undefined);
    if (!online || usingDraft) {
      setComparison(local);
      setSubmitError(new ApiClientError("Draft saved on this device. Reconnect to run the current policy check.", "OFFLINE_DRAFT_SAVED", 0));
      setBusy(false);
      return;
    }
    try {
      const response = await updateComparison(comparisonId, { expectedVersion: comparison.version, evidence, evidenceConfirmed: true, stage: "identity_bridge" });
      await saveDraft(response.comparison).catch(() => undefined);
      router.push(`/identity-bridge/${comparisonId}`);
    } catch (error) {
      setSubmitError(error instanceof ApiClientError ? error : new ApiClientError("Evidence could not be saved.", "UNKNOWN", 0));
    } finally {
      setBusy(false);
    }
  }

  async function removeComparison() {
    if (!window.confirm("Delete this comparison and all its saved evidence?")) return;
    setBusy(true);
    setSubmitError(undefined);
    try {
      if (!usingDraft && online) await deleteComparison(comparisonId);
      await deleteDraft(comparisonId);
      sessionStorage.removeItem(`sameproof-reviewed-sides:${comparisonId}`);
      router.push("/offer-dock");
    } catch (error) {
      setSubmitError(error instanceof ApiClientError ? error : new ApiClientError("The comparison could not be deleted.", "UNKNOWN", 0));
      setBusy(false);
    }
  }

  if (loadError) return <ErrorState message={loadError.message} requestId={loadError.requestId} onRetry={load} />;
  if (!comparison || !evidence) return <LoadingState label="Opening the Evidence Lens" />;

  const activeRecord = evidence[activeSide];
  const decidingEvidence = fields.filter((definition) => definition.priority === "decision").map((definition) => activeRecord[definition.key]).filter((field): field is EvidenceField<EvidenceValue> => Boolean(field));
  const pendingCount = decidingEvidence.filter((field) => field.value !== null && field.state !== "conflicting" && !(field.state === "confirmed" && field.userConfirmed)).length;
  const unknownCount = decidingEvidence.filter((field) => field.state === "unknown" || field.value === null).length;
  const conflictCount = decidingEvidence.filter((field) => field.state === "conflicting").length;
  const activeReviewed = reviewedSides.includes(activeSide);

  return <div className="space-y-4 pb-24 sm:space-y-5 lg:pb-0">
    <p className="sr-only" aria-live="polite">{announcement}</p>
    {usingDraft && <OfflineNotice />}
    <div className="grid grid-cols-2 gap-2" aria-label="Offer evidence">
      <OfferTab label="Product I want" number="1" active={activeSide === "target"} reviewed={reviewedSides.includes("target")} tone="violet" onClick={() => setActiveSide("target")} />
      <OfferTab label="Lower-price offer" number="2" active={activeSide === "competitor"} reviewed={reviewedSides.includes("competitor")} tone="blue" onClick={() => setActiveSide("competitor")} />
    </div>

    <section className="surface overflow-hidden" aria-labelledby="active-offer-heading">
      <SourceContext side={activeSide} title={titles[activeSide]} record={activeRecord} pending={pendingCount} unknown={unknownCount} conflicts={conflictCount} reviewed={activeReviewed} />
      <div className="bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">At a glance</h3><p className="mt-0.5 text-xs leading-5 text-slate-500">Every fact confirmed by the button below is shown here.</p></div><span className="shrink-0 text-xs font-semibold text-slate-500">12 key details</span></div>
        <EvidenceSummary record={activeRecord} />
      </div>
      <div className="border-t border-slate-200 bg-slate-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:p-5"><p className="text-sm leading-6 text-slate-600">If this summary matches the offer, confirm it once. You can still edit any detail below.</p>{activeReviewed ? <span className="mt-3 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-emerald-100 px-4 text-sm font-bold text-emerald-800 sm:mt-0"><Check size={17} />Confirmed</span> : <button type="button" className="button-primary mt-3 shrink-0 sm:mt-0" onClick={() => confirmOffer(activeSide)}><ShieldCheck size={17} />Looks correct</button>}</div>
      <details className="group border-t border-slate-200 bg-white"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold sm:px-5"><span>See all details</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 group-open:bg-blue-50 group-open:text-blue-700">{fields.length} facts</span></summary><div className="grid gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-2">{fields.map((definition) => <EvidenceInput key={definition.key} side={activeSide} definition={definition} field={activeRecord[definition.key]} retailerOptions={retailerOptions} onChange={(value) => setField(activeSide, definition.key, value, definition.kind)} onConfirm={() => confirmField(activeSide, definition.key)} />)}</div></details>
    </section>

    {submitError && <ErrorState message={submitError.message} requestId={submitError.requestId} />}
    <div className="mobile-action-dock"><div className="action-panel surface flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">{reviewedSides.length} of 2 checked</p><p className="mobile-action-copy mt-0.5 text-xs leading-5 text-slate-500">Missing details stay visible — they won&apos;t be hidden or assumed.</p></div><button type="button" aria-label="Compare product identity" className="button-primary shrink-0" disabled={reviewedSides.length < 2 || busy} onClick={continueJourney}>{busy ? "Saving…" : <><span className="sm:hidden">Next</span><span className="hidden sm:inline">Next: are they the same product?</span></>}<ArrowRight size={17} /></button></div></div>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"><Link href={`/offer-dock?comparisonId=${comparisonId}`} className="button-secondary"><ArrowLeft size={17} />Back to offers</Link><button type="button" className="button-ghost text-rose-700" disabled={busy} onClick={removeComparison}><Trash2 size={16} />Delete comparison</button></div>
  </div>;
}

function OfferTab({ label, number, active, reviewed, tone, onClick }: { label: string; number: string; active: boolean; reviewed: boolean; tone: "violet" | "blue"; onClick(): void }) {
  const activeTone = tone === "violet" ? "border-violet-500 bg-violet-50 text-violet-900" : "border-blue-500 bg-blue-50 text-blue-900";
  return <button type="button" aria-pressed={active} onClick={onClick} className={`button-secondary min-h-14 ${active ? activeTone : ""}`}><span className="inline-flex items-center gap-2">{reviewed ? <span className="grid size-6 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={14} /></span> : <span className="text-xs font-bold text-slate-400">{number}</span>}<span>{label}</span></span></button>;
}

function EvidenceSummary({ record }: { record: EvidenceRecord }) {
  const groups: Array<{ title: string; icon: typeof Package; facts: Array<{ key: EvidenceKey; label: string; kind: FieldKind }> }> = [
    { title: "Product identity", icon: Package, facts: [
      { key: "manufacturerModel", label: "Model", kind: "text" },
      { key: "gtin", label: "Barcode", kind: "text" },
      { key: "regionalSuffix", label: "Region", kind: "text" },
      { key: "condition", label: "Condition", kind: "condition" },
      { key: "warrantyMonths", label: "Warranty", kind: "number" },
      { key: "bundleItems", label: "Extras", kind: "list" },
    ] },
    { title: "Price and availability", icon: DollarSign, facts: [
      { key: "priceCents", label: "Price", kind: "money" },
      { key: "deliveryCostCents", label: "Delivery", kind: "money" },
      { key: "stockState", label: "Stock", kind: "stock" },
      { key: "observedAt", label: "Checked", kind: "datetime" },
    ] },
    { title: "Where to buy", icon: Store, facts: [
      { key: "sellerName", label: "Store", kind: "text" },
      { key: "retailerId", label: "Website", kind: "retailer" },
      { key: "sellerType", label: "Type", kind: "sellerType" },
      { key: "membershipRequired", label: "Members only", kind: "yesno" },
    ] },
  ];
  return <div className="mt-3 grid gap-2 lg:grid-cols-3">{groups.map((group) => { const Icon = group.icon; return <section key={group.title} className="rounded-xl bg-slate-50 p-3"><h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><Icon size={13} />{group.title}</h4><dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">{group.facts.map((fact) => <div key={fact.key} className="min-w-0 text-sm"><dt className="inline text-slate-500">{fact.label}: </dt><dd className="inline break-words font-semibold capitalize text-slate-950">{summaryValue(record[fact.key], fact.kind)}</dd></div>)}</dl></section>; })}</div>;
}

function summaryValue(field: EvidenceField<EvidenceValue> | undefined, kind: FieldKind) {
  if (field?.value === null || field?.value === undefined || field.value === "") return "Unknown";
  if (kind === "money" && typeof field.value === "number") return formatMoney({ amountCents: field.value, currency: "AUD" });
  if (kind === "number" && typeof field.value === "number") return `${field.value} months`;
  if (kind === "list" && Array.isArray(field.value)) return field.value.length ? field.value.join(", ") : "None";
  if (kind === "yesno" && typeof field.value === "boolean") return field.value ? "Yes" : "No";
  if (kind === "datetime" && typeof field.value === "string") return new Date(field.value).toLocaleString("en-AU");
  return String(field.value).replaceAll("_", " ");
}

function SourceContext({ side, title, record, pending, unknown, conflicts, reviewed }: { side: Side; title: string; record: EvidenceRecord; pending: number; unknown: number; conflicts: number; reviewed: boolean }) {
  const source = Object.values(record).flatMap((field) => field.sources).at(-1);
  const sourceReference = source?.reference;
  const sourceTime = source?.observedAt;
  const status = reviewed ? "Confirmed" : conflicts ? `${conflicts} conflict${conflicts === 1 ? "" : "s"}` : `${pending} to check${unknown ? ` · ${unknown} not found` : ""}`;
  return <div className={`flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5 ${side === "target" ? "border-violet-200 bg-violet-50" : "border-blue-200 bg-blue-50"}`}>
    <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.15em] text-slate-500">{side === "target" ? "Product I want" : "Lower-price offer"}</p><h2 id="active-offer-heading" tabIndex={-1} className="mt-1 text-lg font-semibold outline-none sm:text-xl">{title}</h2><div className="mt-2 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white px-2.5 py-1.5 font-semibold"><Database className="mr-1 inline" size={13} />{source?.type === "dataset" ? "Sample data" : source?.type === "manual" ? "Manual entry" : source?.type ?? "Unknown source"}</span>{sourceTime && <span className="rounded-full bg-white px-2.5 py-1.5 font-semibold"><Clock3 className="mr-1 inline" size={13} />Seen {new Date(sourceTime).toLocaleString("en-AU")}</span>}{sourceReference && /^https?:/.test(sourceReference) && <a className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 font-semibold text-blue-800 underline" href={sourceReference} target="_blank" rel="noreferrer">Source<ExternalLink size={13} /></a>}</div></div>
    <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${reviewed ? "bg-emerald-100 text-emerald-800" : conflicts ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>{reviewed ? <Check size={14} /> : conflicts ? <AlertTriangle size={14} /> : <CircleHelp size={14} />}{status}</span>
  </div>;
}

function EvidenceInput({ side, definition, field, retailerOptions, onChange, onConfirm }: { side: Side; definition: FieldDefinition; field?: EvidenceField<EvidenceValue>; retailerOptions: Array<{ id: string; name: string }>; onChange(value: string): void; onConfirm(): void }) {
  const source = field?.sources.at(-1)?.type;
  const value = displayValue(field, definition.kind);
  const options: ResponsiveSelectOption[] | undefined = definition.kind === "condition"
    ? [{ value: "", label: "Unknown" }, { value: "new", label: "New" }, { value: "refurbished", label: "Refurbished" }, { value: "used", label: "Used" }]
    : definition.kind === "stock"
      ? [{ value: "", label: "Unknown / not shown" }, { value: "in_stock", label: "In stock" }, { value: "out_of_stock", label: "Out of stock" }, { value: "unknown", label: "Retailer reports unknown" }]
      : definition.kind === "sellerType"
        ? [{ value: "", label: "Unknown" }, { value: "retailer", label: "Direct retailer" }, { value: "marketplace", label: "Marketplace seller" }]
        : definition.kind === "yesno"
          ? [{ value: "", label: "Unknown" }, { value: "false", label: "No" }, { value: "true", label: "Yes" }]
          : definition.kind === "retailer"
            ? [{ value: "", label: "Unknown" }, ...retailerOptions.map((retailer) => ({ value: retailer.id, label: retailer.name }))]
            : undefined;
  const trusted = field?.state === "confirmed" && field.userConfirmed;
  return <div className="min-w-0 bg-white p-4">
    <div className="flex items-start justify-between gap-3"><label htmlFor={`${side}-${definition.key}`} className="min-w-0"><span className="block text-sm font-semibold">{definition.label}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{definition.hint}</span></label><span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${field?.state === "conflicting" ? "bg-rose-100 text-rose-800" : !field || field.state === "unknown" ? "bg-amber-100 text-amber-800" : trusted ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{field?.state === "conflicting" ? <AlertTriangle size={12} /> : !field || field.state === "unknown" ? <CircleHelp size={12} /> : trusted ? <Check size={12} /> : source === "manual" ? <Pencil size={12} /> : <Database size={12} />}{field?.state === "conflicting" ? "Conflict" : !field || field.state === "unknown" ? "Unknown" : trusted ? "Confirmed" : "Review"}</span></div>
    <div className="mt-3">{options ? <ResponsiveSelect id={`${side}-${definition.key}`} value={value} onChange={onChange} options={options} /> : <input id={`${side}-${definition.key}`} className="field" type={definition.kind === "datetime" ? "datetime-local" : definition.kind === "money" || definition.kind === "number" ? "number" : "text"} min={definition.kind === "money" || definition.kind === "number" ? 0 : undefined} step={definition.kind === "money" ? "0.01" : definition.kind === "number" ? "1" : undefined} inputMode={definition.kind === "money" || definition.kind === "number" ? "decimal" : undefined} value={value} onChange={(event) => onChange(event.target.value)} />}</div>
    {field?.value !== null && field?.value !== undefined && field.state !== "conflicting" && !trusted && <button type="button" className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-blue-700 hover:bg-blue-50" onClick={onConfirm}><ShieldCheck size={14} />Looks correct</button>}
  </div>;
}
