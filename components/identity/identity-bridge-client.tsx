"use client";

import { ArrowLeft, ArrowRight, Check, CircleHelp, Cpu, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DecisionBadge, IdentityBadge, RuleRow } from "@/components/decision/decision-ui";
import { ErrorState, LoadingState, OfflineNotice } from "@/components/shared/async-state";
import { ApiClientError, evaluateComparison, getCatalogue, getComparison, type CatalogueResponse } from "@/lib/client/api";
import { getCatalogueDraft, getDraft, saveCatalogueDraft, saveDecisionDraft, saveDraft } from "@/lib/client/draft-store";
import { useOnlineStatus } from "@/lib/client/use-online-status";
import type { Comparison, Decision, RuleOutcome } from "@/models/domain";

type IdentityResult = Decision["identity"];

export function IdentityBridgeClient({ comparisonId }: { comparisonId: string }) {
  const online = useOnlineStatus();
  const resultRef = useRef<HTMLDivElement>(null);
  const automaticCheckStarted = useRef(false);
  const [comparison, setComparison] = useState<Comparison>();
  const [catalogue, setCatalogue] = useState<CatalogueResponse>();
  const [identity, setIdentity] = useState<IdentityResult>();
  const [decision, setDecision] = useState<Decision>();
  const [error, setError] = useState<ApiClientError>();
  const [workerError, setWorkerError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [comparisonResponse, catalogueResponse] = await Promise.all([getComparison(comparisonId), getCatalogue()]);
      setError(undefined);
      setComparison(comparisonResponse.comparison);
      setCatalogue(catalogueResponse);
      await saveCatalogueDraft(catalogueResponse).catch(() => undefined);
      if (comparisonResponse.decision?.comparisonVersion === comparisonResponse.comparison.version) {
        setDecision(comparisonResponse.decision);
        setIdentity(comparisonResponse.decision.identity);
      }
    } catch (cause) {
      const [draft, cachedCatalogue] = await Promise.all([getDraft(comparisonId).catch(() => undefined), getCatalogueDraft().catch(() => undefined)]);
      if (draft && cachedCatalogue) {
        setComparison(draft);
        setCatalogue(cachedCatalogue);
        setError(undefined);
      } else {
        setError(cause instanceof ApiClientError ? cause : new ApiClientError("The comparison could not be loaded.", "UNKNOWN", 0));
      }
    }
  }, [comparisonId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  useEffect(() => {
    if (!comparison || !catalogue || identity) return;
    const targetListing = catalogue.catalogue.listings.find((item) => item.id === comparison.targetListingId);
    const competitorListing = catalogue.catalogue.listings.find((item) => item.id === comparison.competitorListingId);
    if (!targetListing || !competitorListing) return;
    const worker = new Worker(new URL("../../workers/identity.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: IdentityResult; message?: string }>) => {
      if (event.data.ok && event.data.result) setIdentity(event.data.result);
      else setWorkerError(event.data.message ?? "The browser identity check failed.");
    };
    worker.onerror = () => setWorkerError("The quick browser check could not start. The final server check is still available.");
    worker.postMessage({
      targetListing,
      competitorListing,
      targetProduct: catalogue.catalogue.products.find((item) => item.id === targetListing.productId),
      competitorProduct: catalogue.catalogue.products.find((item) => item.id === competitorListing.productId),
      evidence: comparison.evidence,
    });
    return () => worker.terminate();
  }, [catalogue, comparison, identity]);

  const offers = useMemo(() => {
    if (!catalogue || !comparison) return [{ title: "Product I want", seller: "Target retailer" }, { title: "Lower-price offer", seller: "Competitor" }];
    return [comparison.targetListingId, comparison.competitorListingId].map((id) => {
      const listing = catalogue.catalogue.listings.find((item) => item.id === id);
      return { title: listing?.title ?? "Unknown listing", seller: listing?.seller.name ?? "Unknown seller" };
    });
  }, [catalogue, comparison]);

  const runServerDecision = useCallback(async (moveFocus = true) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await evaluateComparison(comparisonId);
      setComparison(result.comparison);
      setDecision(result.decision);
      setIdentity(result.decision.identity);
      await saveDraft(result.comparison).catch(() => undefined);
      await saveDecisionDraft(result.decision).catch(() => undefined);
      if (moveFocus) window.setTimeout(() => resultRef.current?.focus(), 0);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause : new ApiClientError("The policy check could not be completed.", "UNKNOWN", 0));
    } finally {
      setBusy(false);
    }
  }, [comparisonId]);

  useEffect(() => {
    if (!identity || decision || !online || automaticCheckStarted.current) return;
    automaticCheckStarted.current = true;
    void runServerDecision(false);
  }, [decision, identity, online, runServerDecision]);

  if (error && !comparison) return <ErrorState message={error.message} requestId={error.requestId} onRetry={load} />;
  if (!comparison || !catalogue) return <LoadingState label="Building the identity bridge" />;

  const differences = identity?.commercialChecks.filter((check) => check.result !== "pass") ?? [];
  const summary = identity?.status === "exact"
    ? "Model, barcode, region, and condition all match between the two offers."
    : identity?.status === "conflict"
      ? `${differences.filter((item) => item.result === "fail").length} difference${differences.filter((item) => item.result === "fail").length === 1 ? "" : "s"} found. Even similar products aren\u2019t the same if a key detail differs.`
      : `${differences.filter((item) => item.result === "unknown").length} detail${differences.filter((item) => item.result === "unknown").length === 1 ? " is" : "s are"} missing. Go back to evidence and fill ${differences.filter((item) => item.result === "unknown").length === 1 ? "it" : "them"} in.`;

  return <div className="space-y-6">
    {!online && <OfflineNotice />}
    {workerError && <ErrorState title="Quick check unavailable" message={workerError} />}

    <section className="surface overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-stretch border-b border-slate-200 bg-slate-50">
        <OfferHeading label="Product I want" title={offers[0].title} seller={offers[0].seller} tone="violet" />
        <div className="grid place-items-center bg-white"><span className="h-full w-px bg-slate-300" aria-hidden="true" /><span className="absolute rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">vs</span></div>
        <OfferHeading label="Lower-price offer" title={offers[1].title} seller={offers[1].seller} tone="blue" alignRight />
      </div>
      <div className="p-4 sm:p-6">
        <div><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Product match</p><div className="mt-2 flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{identity?.status === "exact" ? "Same product confirmed" : identity?.status === "conflict" ? "These are different products" : identity?.status === "unknown" ? "We need more details to be sure" : "Checking now…"}</h2>{identity && <IdentityBadge status={identity.status} />}</div></div>

        {!identity && <LoadingState label="Comparing the visible identity evidence" />}
        {identity && <div className="mt-5">
          <div className={`rounded-2xl border p-4 ${identity.status === "exact" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : identity.status === "conflict" ? "border-rose-200 bg-rose-50 text-rose-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}><p className="font-semibold">{summary}</p><p className="mt-1 text-sm opacity-80">Specs alone never override a model, barcode, region, condition, warranty or bundle difference.</p></div>
          {differences[0] && <div className="mt-4"><p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-slate-500">What&apos;s blocking the match</p><div className="overflow-hidden rounded-2xl border border-slate-200"><BridgeRow rule={differences[0]} /></div></div>}
          <details className="group mt-4 rounded-2xl border border-slate-200 bg-slate-50"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold"><span>See all checks</span><span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600 group-open:text-blue-700">{identity.commercialChecks.length}</span></summary><div className="divide-y divide-slate-200 border-t border-slate-200 px-4">{identity.commercialChecks.map((rule) => <RuleRow key={rule.code} rule={rule} compact />)}</div></details>
          <details className="group mt-3 rounded-2xl border border-slate-200 bg-slate-50"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold"><span>Specs comparison</span><span className="text-xs font-medium text-slate-500">These don&apos;t affect the result</span></summary><div className="border-t border-slate-200 px-4 pb-2"><p className="mt-3 text-sm leading-6 text-slate-600">These details show how the products compare but don&apos;t affect the match result.</p><div className="mt-2 divide-y divide-slate-200">{identity.functionalComparison.map((rule) => <RuleRow key={rule.code} rule={rule} compact />)}</div></div></details>
          <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-slate-400"><Cpu size={14} className="mt-0.5 shrink-0" />A background check compares identity without blocking the page; the server runs its own independent check.</p>
        </div>}
      </div>
    </section>

    <section ref={resultRef} tabIndex={-1} className="surface p-5 outline-none sm:p-6" aria-live="polite">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-slate-500">Store policy</p><h2 className="mt-1 text-xl font-semibold">{decision ? "Does this qualify?" : "Checking if it qualifies"}</h2><p className="mt-1 text-sm leading-6 text-slate-600">We check the product, price, stock, seller, and how recent the info is.</p></div>{decision ? <DecisionBadge status={decision.status} large /> : <span className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-blue-50 px-4 text-sm font-bold text-blue-800"><LoaderCircle className="animate-spin" size={18} />{busy ? "Checking…" : "Starting…"}</span>}</div>
      {error && <div className="mt-4"><ErrorState message={error.message} requestId={error.requestId} onRetry={() => runServerDecision()} /></div>}
      {decision && <div className="mt-5 border-t border-slate-200 pt-5"><p className="text-sm font-semibold">{decisionMessage(decision)}</p><div className="mt-3 grid gap-2">{decision.policyChecks.filter((item) => item.result !== "pass").map((rule) => <RuleRow key={rule.code} rule={rule} />)}</div>{decision.policyChecks.every((item) => item.result === "pass") && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">All {decision.policyChecks.length} required policy checks passed.</p>}</div>}
    </section>

    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Link href={`/evidence-lens/${comparisonId}`} className="button-secondary"><ArrowLeft size={17} />Back to evidence</Link>{decision && <Link className="button-primary" href={decision.status === "verified" || decision.status === "likely" ? `/passport/${comparisonId}` : `/near-miss/${comparisonId}`}>{decision.status === "verified" || decision.status === "likely" ? "Create your proof" : "See the closest option"}<ArrowRight size={17} /></Link>}</div>
  </div>;
}

function OfferHeading({ label, title, seller, tone, alignRight = false }: { label: string; title: string; seller: string; tone: "violet" | "blue"; alignRight?: boolean }) {
  return <div className={`min-w-0 p-4 sm:p-5 ${tone === "violet" ? "bg-violet-50" : "bg-blue-50"} ${alignRight ? "text-right" : ""}`}><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-500 sm:text-xs">{label}</p><h3 className="mt-1 line-clamp-2 text-sm font-semibold sm:text-base">{title}</h3><p className="mt-1 truncate text-xs text-slate-500">{seller}</p></div>;
}

function BridgeRow({ rule }: { rule: RuleOutcome }) {
  const Icon = rule.result === "pass" ? Check : rule.result === "fail" ? X : CircleHelp;
  const target = rule.evidence.find((item) => item.field === "target")?.value;
  const competitor = rule.evidence.find((item) => item.field === "competitor")?.value;
  const tone = rule.result === "pass" ? "bg-emerald-100 text-emerald-800" : rule.result === "fail" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900";
  return <div className="grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-stretch border-b border-slate-200 bg-white last:border-b-0"><div className="min-w-0 p-3 text-sm sm:p-4"><p className="text-xs font-semibold text-slate-500">{rule.label}</p><p className="mt-1 break-words font-semibold">{formatValue(target)}</p></div><div className="relative grid place-items-center"><span className={`absolute h-px w-full ${rule.result === "pass" ? "bg-emerald-300" : rule.result === "fail" ? "border-t-2 border-dashed border-rose-300" : "border-t-2 border-dotted border-amber-300"}`} /><span className={`relative grid size-8 place-items-center rounded-full ${tone}`}><Icon size={15} /></span></div><div className="min-w-0 p-3 text-right text-sm sm:p-4"><p className="text-xs font-semibold text-slate-500">{rule.result === "pass" ? "Matches" : rule.result === "fail" ? "Different" : "Needs proof"}</p><p className="mt-1 break-words font-semibold">{formatValue(competitor)}</p></div></div>;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "Unknown") return "Unknown";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "No extras";
  return String(value).replaceAll("_", " ");
}

function decisionMessage(decision: Decision) {
  if (decision.status === "verified") return "All checks passed — this qualifies for a price match right now.";
  if (decision.status === "likely") return "Looking good — checks pass, but the store makes the final call.";
  if (decision.status === "uncertain") return "Some details are missing — go back and fill them in for a clear answer.";
  return "This doesn\u2019t qualify right now — but we can show the closest option that does.";
}
