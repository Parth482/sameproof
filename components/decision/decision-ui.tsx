import { AlertTriangle, Check, CircleHelp, X } from "lucide-react";
import type { DecisionStatus, RuleOutcome } from "@/models/domain";

const statusStyles: Record<DecisionStatus, string> = {
  verified: "border-emerald-200 bg-emerald-100 text-emerald-900",
  likely: "border-blue-200 bg-blue-100 text-blue-900",
  uncertain: "border-amber-200 bg-amber-100 text-amber-950",
  excluded: "border-rose-200 bg-rose-100 text-rose-950",
};

export function DecisionBadge({ status, large = false }: { status: DecisionStatus; large?: boolean }) {
  const Icon = status === "verified" ? Check : status === "likely" ? CircleHelp : status === "uncertain" ? AlertTriangle : X;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border font-bold capitalize ${large ? "px-4 py-2 text-sm" : "px-2.5 py-1 text-xs"} ${statusStyles[status]}`}><Icon size={large ? 17 : 14} aria-hidden="true" />{status}</span>;
}

export function IdentityBadge({ status }: { status: "exact" | "conflict" | "unknown" }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold capitalize ${status === "exact" ? "bg-emerald-100 text-emerald-800" : status === "conflict" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>{status === "exact" ? <Check size={14} /> : status === "conflict" ? <X size={14} /> : <CircleHelp size={14} />}{status}</span>;
}

export function RuleRow({ rule, compact = false }: { rule: RuleOutcome; compact?: boolean }) {
  const Icon = rule.result === "pass" ? Check : rule.result === "fail" ? X : CircleHelp;
  return <div className={`flex items-start gap-3 ${compact ? "py-3" : "rounded-2xl border border-slate-200 bg-white p-4"}`}><span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${rule.result === "pass" ? "bg-emerald-100 text-emerald-700" : rule.result === "fail" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}><Icon size={15} aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{rule.label.replaceAll("_", " ")}</p><span className={`text-xs font-bold uppercase ${rule.result === "pass" ? "text-emerald-700" : rule.result === "fail" ? "text-rose-700" : "text-amber-800"}`}>{rule.result}</span></div><p className="mt-1 text-sm leading-6 text-slate-600">{rule.explanation}</p>{rule.evidence.length > 0 && <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer font-semibold">Evidence used</summary><ul className="mt-2 space-y-1">{rule.evidence.map((item, index) => <li key={`${item.field}-${index}`} className="break-words"><span className="font-medium">{item.field}:</span> {formatEvidence(item.value)} · {item.sourceTypes.join(", ")}</li>)}</ul></details>}</div></div>;
}

function formatEvidence(value: unknown) {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "No extras";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
