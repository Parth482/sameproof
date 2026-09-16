"use client";

import { BadgeCheck, Check, Clipboard, Clock3, ExternalLink, Fingerprint, RotateCcw, Share2, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { DecisionBadge, RuleRow } from "@/components/decision/decision-ui";
import { verifyPassportIntegrity } from "@/lib/client/verify-passport";
import { formatMoney } from "@/lib/domain/normalization";
import type { Money, PriceMatchPassport } from "@/models/domain";

type PublicPassport = Omit<PriceMatchPassport, "publicTokenHash">;

export function PassportCard({ passport, shareUrl, onRefresh, publicView = false }: { passport: PublicPassport; shareUrl?: string; onRefresh?: () => void; publicView?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const [present, setPresent] = useState(false);
  const [integrity, setIntegrity] = useState<"checking" | "valid" | "invalid">("checking");
  const [shareMessage, setShareMessage] = useState("");
  const presentButtonRef = useRef<HTMLButtonElement>(null);
  const presentationRef = useRef<HTMLDialogElement>(null);

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { verifyPassportIntegrity(passport).then((valid) => setIntegrity(valid ? "valid" : "invalid")).catch(() => setIntegrity("invalid")); }, [passport]);
  useEffect(() => {
    if (!present) return;
    const dialog = presentationRef.current;
    const closeButton = dialog?.querySelector("button");
    if (dialog && !dialog.open) dialog.showModal();
    if (closeButton instanceof HTMLElement) closeButton.focus();
    return () => { if (dialog?.open) dialog.close(); };
  }, [present]);

  const remaining = Date.parse(passport.expiresAt) - now;
  const expired = remaining <= 0;
  const countdown = useMemo(() => {
    const total = Math.max(0, Math.floor(remaining / 1_000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }, [remaining]);
  const decision = passport.decisionSnapshot;
  const target = passport.evidenceSnapshot.target;
  const competitor = passport.evidenceSnapshot.competitor;
  const matchedPrice = decision.pricing.projectedMatchedPrice ?? decision.pricing.comparableCompetitorTotal;
  const saving = decision.pricing.targetPrice && matchedPrice
    ? { amountCents: Math.max(0, decision.pricing.targetPrice.amountCents - matchedPrice.amountCents), currency: "AUD" as const }
    : null;
  const passedPolicy = decision.policyChecks.filter((item) => item.result === "pass").length;
  const model = target.manufacturerModel?.value ?? competitor.manufacturerModel?.value ?? "Product model unavailable";
  const timeAnnouncement = expired ? "Evidence has expired." : remaining <= 5 * 60_000 ? "Evidence expires in less than five minutes." : "";

  async function share() {
    const url = shareUrl ?? window.location.href;
    const browserNavigator = navigator as unknown as { share?: (data: ShareData) => Promise<void>; clipboard: Clipboard };
    try {
      if (browserNavigator.share) {
        await browserNavigator.share({ title: "SameProof price-match passport", text: "View this time-bound SameProof evidence passport.", url });
        setShareMessage("Passport shared.");
      } else {
        await browserNavigator.clipboard.writeText(url);
        setShareMessage("Share link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareMessage("Sharing is unavailable. Copy the address from your browser.");
    }
  }

  function closePresentation() {
    const trigger = presentButtonRef.current;
    if (presentationRef.current?.open) presentationRef.current.close();
    setPresent(false);
    window.setTimeout(() => trigger?.focus(), 0);
  }

  const policyName = passport.policySnapshot.name;
  const presentation = present ? <dialog ref={presentationRef} aria-labelledby="counter-view-title" onCancel={(event) => { event.preventDefault(); closePresentation(); }} className="fixed inset-0 z-50 m-0 h-dvh w-full max-w-none overflow-y-auto border-0 bg-slate-900 p-3 text-white backdrop:bg-slate-900 sm:p-8">
    <article className="mx-auto flex min-h-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border border-white/15 bg-slate-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-8"><span className="inline-flex items-center gap-2 text-sm font-bold text-blue-200"><ShieldCheck size={18} />SAMEPROOF</span><button type="button" onClick={closePresentation} className="grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close counter view"><X size={20} /></button></div>
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center sm:px-10"><span className="grid size-16 place-items-center rounded-full bg-emerald-500 text-white"><BadgeCheck size={34} /></span><p className="mt-5 text-xs font-bold uppercase tracking-[.2em] text-emerald-300">Show this to the store</p><h2 id="counter-view-title" className="mt-3 text-3xl font-semibold tracking-[-.04em] sm:text-5xl">{String(model)}</h2><p className="mt-1 text-sm text-slate-400">{policyName}</p><div className="mt-7 rounded-3xl bg-white px-7 py-6 text-slate-950 shadow-xl"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Price to request</p><p className="mt-1 text-5xl font-semibold tracking-[-.06em] text-blue-700">{moneyOrUnknown(matchedPrice)}</p>{saving && saving.amountCents > 0 && <p className="mt-2 font-bold text-emerald-700">Potential saving {formatMoney(saving)}</p>}</div><div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-3"><CounterCheck label="Same product" value={decision.identity.status === "exact" ? "Confirmed" : "Check needed"} /><CounterCheck label="Policy" value={`${passedPolicy}/${decision.policyChecks.length} pass`} /><CounterCheck label="Valid for" value={expired ? "Expired" : countdown} /></div><p className="mt-7 max-w-xl text-sm leading-6 text-slate-300">Show this alongside the competitor&apos;s page. The store decides.</p></div>
    </article>
  </dialog> : null;

  return <>{presentation}<article className={`mx-auto overflow-hidden rounded-[1.5rem] border bg-white shadow-xl ${expired ? "border-amber-300" : "border-slate-200"}`}>
    <header className="border-t-4 border-blue-500 bg-slate-900 p-5 text-white sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-blue-200"><ShieldCheck size={17} />Your price-match proof</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em] sm:text-3xl">{expired ? "Info may be outdated — refresh to continue" : "Ready to use"}</h2><p className="mt-1 text-sm text-slate-300">{String(model)}</p></div>{expired ? <span className="inline-flex items-center gap-2 rounded-full border border-amber-700 bg-amber-950 px-3 py-1.5 text-xs font-bold text-amber-100"><TriangleAlert size={15} />Outdated</span> : <DecisionBadge status={decision.status} large />}</div>

      <div className="mt-5 rounded-2xl bg-white p-4 text-slate-950 sm:p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Price to request</p><p className="mt-1 text-4xl font-semibold tracking-[-.055em] text-blue-700">{moneyOrUnknown(matchedPrice)}</p><div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 sm:grid-cols-3"><PriceFact label="Retailer price" value={decision.pricing.targetPrice} /><PriceFact label="Competitor delivered" value={decision.pricing.comparableCompetitorTotal} /><div className="col-span-2 rounded-xl bg-emerald-50 px-3 py-2.5 sm:col-span-1"><p className="text-[11px] font-semibold text-emerald-700">Potential saving</p><p className="mt-0.5 text-lg font-bold text-emerald-800">{saving ? formatMoney(saving) : "Unknown"}</p></div></div></div>

      <div className={`mt-4 flex items-center gap-3 rounded-xl px-4 py-3 ${expired || remaining < 10 * 60_000 ? "bg-amber-950" : "bg-white/10"}`} role="timer"><Clock3 size={19} /><div><p className="text-[11px] font-bold uppercase tracking-[.12em]">{expired ? "Expired — refresh to get a new one" : "Valid for"}</p><p className="mt-0.5 font-mono text-lg font-semibold">{expired ? "" : countdown}</p></div></div><p className="sr-only" aria-live="polite">{timeAnnouncement}</p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">{expired && onRefresh ? <button type="button" className="button-primary" onClick={onRefresh}><RotateCcw size={17} />Refresh</button> : !expired ? <button ref={presentButtonRef} type="button" className="button-primary" onClick={() => setPresent(true)}><BadgeCheck size={17} />Show at counter</button> : null}<button type="button" className="button-secondary" onClick={share}><Share2 size={17} />Share</button></div><p className="mt-2 text-xs text-slate-300" aria-live="polite">{shareMessage}</p>
    </header>

    {integrity === "invalid" && <div className="flex items-start gap-3 border-b border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert"><TriangleAlert className="shrink-0" size={19} />This record failed its integrity check. Do not rely on it.</div>}

    <div className="space-y-3 p-4 sm:p-6">
      <p className="px-1 text-xs font-bold uppercase tracking-[.14em] text-slate-500">What we checked</p>
      <ProofDisclosure title="Same product" status={decision.identity.status === "exact" ? "Confirmed" : "Needs attention"} tone={decision.identity.status === "exact" ? "emerald" : "amber"}>
        <div className="grid gap-2 sm:grid-cols-3"><Fact label="Model" value={competitor.manufacturerModel?.value} /><Fact label="Barcode" value={competitor.gtin?.value} /><Fact label="Region" value={competitor.regionalSuffix?.value} /></div><div className="mt-3 divide-y divide-slate-100">{decision.identity.commercialChecks.map((rule) => <RuleRow key={rule.code} rule={rule} compact />)}</div>
      </ProofDisclosure>
      <ProofDisclosure title="Lower delivered price" status={moneyOrUnknown(decision.pricing.comparableCompetitorTotal)} tone="blue">
        <div className="grid gap-2 sm:grid-cols-2"><Fact label="Seller" value={competitor.sellerName?.value} /><Fact label="Stock" value={competitor.stockState?.value} /><Fact label="Condition" value={competitor.condition?.value} /><Fact label="Checked" value={competitor.observedAt?.value ? new Date(String(competitor.observedAt.value)).toLocaleString("en-AU") : null} /></div>
      </ProofDisclosure>
      <ProofDisclosure title="Retailer policy" status={`${passedPolicy}/${decision.policyChecks.length} pass`} tone={passedPolicy === decision.policyChecks.length ? "emerald" : "amber"}>
        <p className="text-sm font-semibold">{passport.policySnapshot.name}</p><p className="mt-1 text-xs leading-5 text-slate-500">Version {passport.policySnapshot.version} · reviewed {new Date(passport.policySnapshot.reviewedAt).toLocaleDateString("en-AU")}</p><a href={passport.policySnapshot.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-blue-700 underline">View policy source<ExternalLink size={13} /></a><div className="divide-y divide-slate-100">{decision.policyChecks.map((rule) => <RuleRow key={rule.code} rule={rule} compact />)}</div>
      </ProofDisclosure>
    </div>

    <footer className="border-t border-slate-200 bg-slate-50 p-4 sm:p-6"><p className="text-xs leading-5 text-slate-600">This is a prototype — the store always has the final say.</p><details className="group mt-2"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-500"><Fingerprint size={15} />Verification details</summary><p className="mt-1 flex items-center gap-2 text-xs"><Fingerprint size={15} className={integrity === "valid" ? "text-emerald-600" : "text-slate-500"} />Integrity {integrity === "checking" ? "checking…" : integrity}</p><p className="mt-1 break-all font-mono text-[10px] leading-4 text-slate-500">SHA-256 {passport.integrityHash}</p></details>{!publicView && onRefresh && !expired && <button type="button" className="button-ghost mt-2 px-2 text-xs" onClick={onRefresh}><RotateCcw size={15} />Recheck evidence</button>}</footer>
  </article></>;
}

function PriceFact({ label, value }: { label: string; value: Money | null | undefined }) {
  return <div className="px-1"><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className="mt-0.5 font-bold text-slate-950">{moneyOrUnknown(value)}</p></div>;
}

function ProofDisclosure({ title, status, tone, children }: { title: string; status: string; tone: "emerald" | "blue" | "amber"; children: ReactNode }) {
  const styles = tone === "emerald" ? "bg-emerald-50 text-emerald-800" : tone === "amber" ? "bg-amber-50 text-amber-900" : "bg-blue-50 text-blue-800";
  const StatusIcon = tone === "amber" ? TriangleAlert : Check;
  return <details className="group overflow-hidden rounded-2xl border border-slate-200"><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3"><span className="inline-flex items-center gap-2 font-semibold"><span className={`grid size-8 place-items-center rounded-full ${styles}`}><StatusIcon size={16} /></span>{title}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles}`}>{status}</span></summary><div className="border-t border-slate-200 p-4">{children}</div></details>;
}

function Fact({ label, value }: { label: string; value: unknown }) {
  return <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm"><span className="text-slate-500">{label}</span><span className="break-words text-right font-semibold capitalize">{formatValue(value)}</span></div>;
}

function CounterCheck({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/15 bg-white/8 p-3 backdrop-blur-sm"><p className="text-[11px] font-semibold text-slate-300">{label}</p><p className="mt-1 font-bold text-white">{value}</p></div>;
}

function moneyOrUnknown(value: Money | null | undefined) {
  return value ? formatMoney(value) : "Unknown";
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "No extras";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).replaceAll("_", " ");
}
