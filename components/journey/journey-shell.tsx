import Link from "next/link";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type { JourneyStage } from "@/models/domain";

const stages: Array<{ id: JourneyStage; label: string; path: string; hint: string }> = [
  { id: "offer_dock", label: "Offers", path: "offer-dock", hint: "Pick two offers" },
  { id: "evidence_lens", label: "Evidence", path: "evidence-lens", hint: "Review the facts" },
  { id: "identity_bridge", label: "Same product?", path: "identity-bridge", hint: "Compare identity" },
  { id: "near_miss", label: "Fix if needed", path: "near-miss", hint: "Find the closest option" },
  { id: "passport", label: "Passport", path: "passport", hint: "Ready to show" },
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

        {/* Desktop stepper with connecting rail */}
        <ol className="hidden sm:grid sm:grid-cols-5 sm:gap-3">
          {stages.map((item, index) => {
            const completed = index < activeIndex;
            const active = index === activeIndex;
            const future = index > activeIndex;
            const canVisit = Boolean(comparisonId) && index <= activeIndex;
            const href = item.id === "offer_dock"
              ? `/offer-dock?comparisonId=${comparisonId}`
              : `/${item.path}/${comparisonId}`;

            const circle = (
              <span className={`relative grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-all duration-200 ${
                active
                  ? "bg-blue-600 text-white stepper-active"
                  : completed
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-500"
              }`}>
                {completed ? <Check aria-hidden="true" size={14} className="stepper-check" /> : index + 1}
              </span>
            );

            const label = (
              <span className={`text-xs font-semibold transition-colors duration-200 ${
                active ? "text-blue-700" : completed ? "text-emerald-700" : "text-slate-500"
              }`}>{item.label}</span>
            );

            const inner = <>{circle}{label}</>;

            return (
              <li key={item.id} className={`group relative min-w-0 ${future ? "opacity-50" : ""}`}>
                {canVisit ? (
                  <Link
                    href={href}
                    aria-current={active ? "step" : undefined}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:justify-start"
                  >
                    {inner}
                    {/* Hover tooltip */}
                    <span className="pointer-events-none absolute -bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100" aria-hidden="true">
                      {item.hint}
                    </span>
                  </Link>
                ) : (
                  <span aria-current={active ? "step" : undefined} className="flex min-h-11 items-center justify-center gap-2 sm:justify-start">
                    {inner}
                  </span>
                )}
              </li>
            );
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
