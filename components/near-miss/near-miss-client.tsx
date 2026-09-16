"use client";

import { ArrowLeft, ArrowRight, Check, CircleHelp, LockKeyhole, Pencil, RotateCcw, Route, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DecisionBadge } from "@/components/decision/decision-ui";
import { ErrorState, LoadingState } from "@/components/shared/async-state";
import { ApiClientError, applyNearMiss, getCatalogue, getComparison, type CatalogueResponse } from "@/lib/client/api";
import { getCatalogueDraft, getDecisionDraft, getDraft, saveCatalogueDraft, saveDecisionDraft, saveDraft } from "@/lib/client/draft-store";
import type { Comparison, Decision, NearMissSuggestion, RuleOutcome } from "@/models/domain";

const constraintLabels: Record<string, string> = {
  exact_identity: "Exact commercial identity",
  new_condition: "New condition",
  manufacturer_warranty: "Manufacturer warranty",
  same_bundle: "Same bundle",
  delivery: "Delivery",
  pickup: "Pickup",
  lowest_total: "Lowest delivered total",
  fresh_evidence: "Current price and stock",
};

export function NearMissClient({ comparisonId }: { comparisonId: string }) {
  const router = useRouter();
  const [comparison, setComparison] = useState<Comparison>();
  const [decision, setDecision] = useState<Decision>();
  const [catalogue, setCatalogue] = useState<CatalogueResponse>();
  const [error, setError] = useState<ApiClientError>();
  const [busyId, setBusyId] = useState<string>();
  const [rejected, setRejected] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string>();
  const [announcement, setAnnouncement] = useState("");

  const load = useCallback(async () => {
    try {
      const [response, catalogueResponse] = await Promise.all([getComparison(comparisonId), getCatalogue()]);
      setError(undefined);
      setComparison(response.comparison);
      setCatalogue(catalogueResponse);
      await saveCatalogueDraft(catalogueResponse).catch(() => undefined);
      if (!response.decision || response.decision.comparisonVersion !== response.comparison.version) {
        throw new ApiClientError("This comparison changed after its last decision. Run the policy check again.", "DECISION_STALE", 409);
      }
      setDecision(response.decision);
      await saveDecisionDraft(response.decision).catch(() => undefined);
      const remembered = sessionStorage.getItem(`sameproof-rejected:${comparisonId}`);
      if (remembered) setRejected(JSON.parse(remembered) as string[]);
    } catch (cause) {
      const [draft, cachedDecision, cachedCatalogue] = await Promise.all([getDraft(comparisonId).catch(() => undefined), getDecisionDraft(comparisonId).catch(() => undefined), getCatalogueDraft().catch(() => undefined)]);
      if (draft && cachedDecision && cachedCatalogue && cachedDecision.comparisonVersion === draft.version) {
        setComparison(draft);
        setDecision(cachedDecision);
        setCatalogue(cachedCatalogue);
        setError(undefined);
      } else {
        setError(cause instanceof ApiClientError ? cause : new ApiClientError("Near-miss routes could not be loaded.", "UNKNOWN", 0));
      }
    }
  }, [comparisonId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const available = useMemo(() => decision?.nearMisses.filter((item) => !rejected.includes(item.id)) ?? [], [decision, rejected]);

  function reject(suggestion: NearMissSuggestion) {
    const next = [...new Set([...rejected, suggestion.id])];
    setRejected(next);
    sessionStorage.setItem(`sameproof-rejected:${comparisonId}`, JSON.stringify(next));
    setAnnouncement(`Rejected route: ${routeTitle(suggestion)}.`);
  }

  async function accept(suggestion: NearMissSuggestion) {
    if (!comparison) return;
    setBusyId(suggestion.id);
    setError(undefined);
    try {
      const result = await applyNearMiss(comparisonId, { suggestionId: suggestion.id, expectedVersion: comparison.version });
      await saveDraft(result.comparison).catch(() => undefined);
      sessionStorage.removeItem(`sameproof-rejected:${comparisonId}`);
      setAnnouncement(`Accepted route: ${suggestion.explanation}`);
      router.push(result.comparison.stage === "evidence_lens" ? `/evidence-lens/${comparisonId}` : `/identity-bridge/${comparisonId}`);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause : new ApiClientError("That route could not be applied.", "UNKNOWN", 0));
    } finally {
      setBusyId(undefined);
    }
  }

  if (error && !comparison) return <ErrorState message={error.message} requestId={error.requestId} onRetry={load} />;
  if (!comparison || !decision || !catalogue) return <LoadingState label="Testing the smallest safe changes" />;
  if (decision.status === "verified" || decision.status === "likely") return <div className="space-y-5"><section className="surface overflow-hidden"><div className="bg-emerald-50 p-6 text-center sm:p-8"><span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-600 text-white"><Check size={24} /></span><p className="mt-4 text-xs font-bold uppercase tracking-[.14em] text-emerald-700">No fix needed</p><h2 className="mt-2 text-2xl font-semibold">This offer can move straight to a passport</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">The latest decision is already {decision.status}. There is no honest near-miss to repair.</p><Link href={`/passport/${comparisonId}`} className="button-primary mt-5">Open the passport<ArrowRight size={17} /></Link></div></section><Link href={`/identity-bridge/${comparisonId}`} className="button-secondary"><ArrowLeft size={17} />Back to result</Link></div>;

  const blocking = decision.policyChecks.filter((item) => item.result !== "pass");
  const best = available[0];
  const alternatives = available.slice(1);
  const firstBlocker = blocking[0];
  const passedCount = decision.policyChecks.filter((item) => item.result === "pass").length;

  return <div className="space-y-5 sm:space-y-6">
    <p className="sr-only" aria-live="polite">{announcement}</p>
    <section className={`surface overflow-hidden border-l-4 ${firstBlocker?.result === "fail" ? "border-l-rose-500" : "border-l-amber-500"}`}>
      <div className="p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">First blocker</p><DecisionBadge status={decision.status} /></div><h2 className="mt-3 text-xl font-semibold">{firstBlocker?.label ?? "More proof is needed"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{firstBlocker?.explanation ?? "Review the evidence before continuing."}</p><p className={`mt-3 text-xs font-bold ${firstBlocker?.result === "fail" ? "text-rose-800" : "text-amber-800"}`}>This is the first rule to fix. {passedCount} other {passedCount === 1 ? "check has" : "checks have"} already passed.</p></div>
    </section>

    {best ? <section className="overflow-hidden rounded-[1.4rem] border-2 border-blue-500 bg-white shadow-[0_16px_45px_rgba(37,99,235,.12)]" aria-labelledby="best-route-title">
      <div className="bg-blue-600 px-5 py-3 text-sm font-bold text-white"><Route className="mr-2 inline" size={18} />Smallest safe change</div>
      <RouteCard suggestion={best} comparisonId={comparisonId} catalogue={catalogue} busy={busyId === best.id} expanded={expandedId === best.id} onAccept={() => accept(best)} onModify={() => setExpandedId(expandedId === best.id ? undefined : best.id)} onReject={() => reject(best)} primary />
    </section> : <section className="surface p-6 text-center"><RotateCcw className="mx-auto text-slate-400" /><h2 className="mt-3 font-semibold">No safe automatic route remains</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">SameProof will not relax a must-have or invent missing evidence. Review the source or choose another offer in this same comparison.</p><div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row"><Link href={`/evidence-lens/${comparisonId}`} className="button-secondary">Review evidence</Link><Link href={`/offer-dock?comparisonId=${comparisonId}`} className="button-primary">Choose another offer</Link></div></section>}

    {alternatives.length > 0 && <details className="surface p-5 sm:p-6"><summary className="cursor-pointer font-semibold">{alternatives.length} other honest {alternatives.length === 1 ? "route" : "routes"}</summary><div className="mt-4 grid gap-4">{alternatives.map((suggestion) => <RouteCard key={suggestion.id} suggestion={suggestion} comparisonId={comparisonId} catalogue={catalogue} busy={busyId === suggestion.id} expanded={expandedId === suggestion.id} onAccept={() => accept(suggestion)} onModify={() => setExpandedId(expandedId === suggestion.id ? undefined : suggestion.id)} onReject={() => reject(suggestion)} />)}</div></details>}

    <details className="surface group overflow-hidden"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-semibold"><span>Why this result?</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{passedCount} of {decision.policyChecks.length} passed</span></summary><ol className="border-t border-slate-200" aria-label="Policy constraint path">{decision.policyChecks.map((rule, index) => <ConstraintStep key={rule.code} rule={rule} number={index + 1} decisive={firstBlocker?.code === rule.code} />)}</ol></details>

    <details className="surface group overflow-hidden"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-semibold"><span className="inline-flex items-center gap-2"><LockKeyhole size={18} className="text-blue-700" />Your boundaries</span><span className="text-xs font-medium text-slate-500">{comparison.context.mustHave.length} must keep</span></summary><div className="grid gap-4 border-t border-slate-200 p-5 sm:grid-cols-2"><div><h3 className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">Must keep</h3><div className="mt-2 flex flex-wrap gap-2">{comparison.context.mustHave.map((item) => <span key={item} className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white"><LockKeyhole size={12} />{constraintLabels[item]}</span>)}</div></div><div><h3 className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">Flexible options</h3><ul className="mt-2 space-y-2">{comparison.context.flexible.map((item) => <li key={item} className="flex items-center gap-2 text-xs text-slate-700"><span className="size-2 rounded-full bg-blue-500" />{constraintLabels[item]}</li>)}</ul></div></div></details>

    {error && <ErrorState message={error.message} requestId={error.requestId} onRetry={load} />}
    <div className="flex"><Link href={`/identity-bridge/${comparisonId}`} className="button-secondary"><ArrowLeft size={17} />Back to result</Link></div>
    <p className="flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-xs leading-5 text-slate-600"><ShieldCheck size={16} className="mt-0.5 shrink-0" />A route is a transparent “what if”, not a guarantee of retailer approval.</p>
  </div>;
}

function ConstraintStep({ rule, number, decisive }: { rule: RuleOutcome; number: number; decisive: boolean }) {
  const Icon = rule.result === "pass" ? Check : rule.result === "fail" ? X : CircleHelp;
  const tone = rule.result === "pass" ? "bg-emerald-100 text-emerald-800" : rule.result === "fail" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900";
  return <li className={`grid grid-cols-[2.5rem_1fr] gap-3 border-b border-slate-200 p-4 last:border-b-0 ${decisive ? "bg-rose-50" : "bg-white"}`}><div className="relative flex justify-center"><span className={`grid size-8 place-items-center rounded-full ${tone}`}><Icon size={15} /></span><span className="absolute top-8 h-[calc(100%+1rem)] w-px bg-slate-200 last:hidden" aria-hidden="true" /></div><div><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{number}. {rule.label}</p><span className={`text-xs font-bold uppercase ${rule.result === "pass" ? "text-emerald-700" : rule.result === "fail" ? "text-rose-700" : "text-amber-800"}`}>{rule.result === "pass" ? "Passed" : rule.result === "fail" ? "Blocking" : "Waiting for proof"}</span></div><p className="mt-1 text-sm leading-6 text-slate-600">{rule.explanation}</p></div></li>;
}

function RouteCard({ suggestion, comparisonId, catalogue, busy, expanded, onAccept, onModify, onReject, primary = false }: { suggestion: NearMissSuggestion; comparisonId: string; catalogue: CatalogueResponse; busy: boolean; expanded: boolean; onAccept(): void; onModify(): void; onReject(): void; primary?: boolean }) {
  const candidate = suggestion.candidateListingId ? catalogue.catalogue.listings.find((item) => item.id === suggestion.candidateListingId) : undefined;
  return <article className={primary ? "p-5 sm:p-7" : "rounded-2xl border border-slate-200 p-5"}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id={primary ? "best-route-title" : undefined} className={primary ? "text-xl font-semibold" : "font-semibold"}>{routeTitle(suggestion)}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{suggestion.explanation}</p>{candidate && <p className="mt-2 text-xs font-semibold text-blue-700">Offer: {candidate.seller.name} · {candidate.title}</p>}</div><DecisionBadge status={suggestion.resultingStatus} /></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><Preview label="One change" icon={<Pencil size={15} />} values={changeSummary(suggestion)} tone="blue" /><Preview label="Must-haves preserved" icon={<LockKeyhole size={15} />} values={suggestion.preservedMustHaves.map((item) => constraintLabels[item] ?? item)} tone="emerald" /></div>
    {expanded && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-semibold">Adjust this route yourself</p><p className="mt-1 text-sm leading-6 text-slate-600">Keep the comparison and its history while changing the relevant evidence, offer or boundary.</p><div className="mt-3 flex flex-wrap gap-2"><Link href={`/evidence-lens/${comparisonId}`} className="button-secondary">Edit evidence</Link><Link href={`/offer-dock?comparisonId=${comparisonId}`} className="button-secondary">Change offer or must-haves</Link><button type="button" className="button-ghost" onClick={onReject}><X size={16} />Show another route</button></div></div>}
    <div className="mt-5 flex flex-col gap-2 sm:flex-row"><button type="button" className="button-primary" disabled={busy} onClick={onAccept}><Check size={17} />{busy ? "Applying…" : routeAction(suggestion)}</button><button type="button" className="button-ghost" onClick={onModify}><Pencil size={16} />Adjust manually</button></div>
  </article>;
}

function routeTitle(suggestion: NearMissSuggestion) {
  if (suggestion.changeType === "switch_fulfilment") return "Collect it instead of delivering it";
  if (suggestion.changeType === "refresh_evidence") return "Recheck the current price and stock";
  if (suggestion.changeType === "select_unbundled_offer") return "Use the offer without extras";
  return "Use another eligible offer";
}

function routeAction(suggestion: NearMissSuggestion) {
  if (suggestion.changeType === "switch_fulfilment") return "Switch to pickup and re-check";
  if (suggestion.changeType === "refresh_evidence") return "Recheck price and stock";
  if (suggestion.changeType === "select_unbundled_offer") return "Use the offer without extras";
  return "Use this eligible offer";
}

function changeSummary(suggestion: NearMissSuggestion) {
  if (suggestion.changeType === "switch_fulfilment") return ["Delivery → pickup"];
  if (suggestion.changeType === "refresh_evidence") return ["Recheck price, delivery and stock"];
  if (suggestion.changeType === "select_unbundled_offer") return ["Choose the same model without extras"];
  return ["Choose the named competitor offer"];
}

function Preview({ label, icon, values, tone }: { label: string; icon: React.ReactNode; values: string[]; tone: "blue" | "emerald" }) {
  return <div className={`rounded-xl p-3 ${tone === "blue" ? "bg-blue-50 text-blue-950" : "bg-emerald-50 text-emerald-950"}`}><p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.1em]">{icon}{label}</p><ul className="mt-2 space-y-1 text-xs leading-5">{values.length ? values.map((value) => <li key={value}>• {value}</li>) : <li>• None</li>}</ul></div>;
}
