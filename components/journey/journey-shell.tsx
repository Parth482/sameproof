import Link from "next/link";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type { JourneyStage } from "@/models/domain";

const stages: Array<{ id: JourneyStage; label: string; path: string }> = [
  { id: "offer_dock", label: "Offers", path: "offer-dock" },
  { id: "evidence_lens", label: "Evidence", path: "evidence-lens" },
  { id: "identity_bridge", label: "Same product?", path: "identity-bridge" },
  { id: "near_miss", label: "Fix if needed", path: "near-miss" },
  { id: "passport", label: "Passport", path: "passport" },
];

export function JourneyShell({ stage, comparisonId, eyebrow, title, description, children }: {
  stage: JourneyStage;
  comparisonId?: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const activeIndex = stages.findIndex((item) => item.id === stage);
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-10 lg:px-8">
      <nav aria-label="Comparison progress" className="mb-5 sm:mb-8">
        <div className="mb-2.5 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 sm:mb-3">
          <span>Stage {activeIndex + 1} of {stages.length}</span>
          <span className="text-blue-700">{stages[activeIndex].label}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 sm:hidden" aria-hidden="true">
          <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${((activeIndex + 1) / stages.length) * 100}%` }} />
        </div>
        <ol className="hidden grid-cols-5 gap-3 sm:grid">
          {stages.map((item, index) => {
            const completed = index < activeIndex;
            const active = index === activeIndex;
            const canVisit = Boolean(comparisonId) && index <= activeIndex;
            const content = <><span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold sm:size-8 ${active ? "bg-blue-600 text-white" : completed ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{completed ? <Check aria-hidden="true" size={14} /> : index + 1}</span><span className="sr-only sm:not-sr-only sm:text-xs sm:font-semibold sm:text-slate-600">{item.label}</span></>;
            const href = item.id === "offer_dock"
              ? `/offer-dock?comparisonId=${comparisonId}`
              : `/${item.path}/${comparisonId}`;
            return <li key={item.id} className="min-w-0">{canVisit ? <Link href={href} aria-current={active ? "step" : undefined} className="flex min-h-11 items-center justify-center gap-2 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:justify-start">{content}</Link> : <span aria-current={active ? "step" : undefined} className="flex min-h-11 items-center justify-center gap-2 sm:justify-start">{content}</span>}</li>;
          })}
        </ol>
      </nav>
      <header className="mb-5 max-w-3xl sm:mb-7">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700 sm:mb-2 sm:text-xs">{eyebrow}</p>
        <h1 className="text-balance text-2xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-slate-600 sm:mt-3 sm:text-lg sm:leading-7">{description}</p>
      </header>
      {children}
    </main>
  );
}
