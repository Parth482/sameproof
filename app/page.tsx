import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Fingerprint,
  GitCompareArrows,
  Route,
  ShieldCheck,
} from "lucide-react";

export default function Home() {
  return (
    <main className="overflow-hidden">
      <section className="relative border-b border-slate-200 bg-white">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_70%_20%,rgba(37,99,235,.12),transparent_42%),radial-gradient(circle_at_15%_10%,rgba(16,185,129,.09),transparent_35%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">
              <ShieldCheck size={15} aria-hidden="true" /> Explainable by design
            </div>
            <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.055em] text-slate-950 sm:text-6xl">
              Don&apos;t just compare the price. <span className="text-blue-600">Prove the match.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-600">
              SameProof connects product identity, offer evidence and retailer policy—then explains exactly what passes, what blocks, and the closest honest route forward.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/offer-dock" className="button-primary px-5 py-3 text-base">Start a comparison <ArrowRight size={18} aria-hidden="true" /></Link>
              <a href="#how-it-works" className="button-secondary px-5 py-3 text-base">See how it works</a>
            </div>
            <p className="mt-4 text-sm text-slate-500">Prototype data is simulated and clearly labelled. No account required.</p>
          </div>

          <div className="surface relative overflow-hidden p-4 sm:p-6" aria-label="Example SameProof decision">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[.15em] text-slate-500">Match evidence</p><p className="mt-1 font-semibold">Dell G2724D-AU · AU model</p></div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800"><BadgeCheck size={15} /> Verified</span>
            </div>
            <div className="grid gap-3">
              {[{label:"Commercial identity",detail:"GTIN and regional suffix agree"},{label:"Comparable total",detail:"$449.00 + $0.00 delivery"},{label:"Retailer policy",detail:"8 required rules passed"}].map((row) => (
                <div key={row.label} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><BadgeCheck size={14} /></span>
                  <div><p className="text-sm font-semibold">{row.label}</p><p className="mt-0.5 text-sm text-slate-600">{row.detail}</p></div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-300">Evidence, not a mystery score</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Every conclusion points back to the exact field, source and policy rule used.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">From offer to proof</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">One traceable journey</h2><p className="mt-3 text-base leading-7 text-slate-600">Capture what you can see, confirm what matters, and keep unknowns honest.</p></div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {icon:GitCompareArrows,title:"Collect",text:"Choose a prepared offer or bring a URL, barcode, image or manual entry."},
            {icon:Fingerprint,title:"Verify identity",text:"Separate commercial identity from merely similar specifications."},
            {icon:Route,title:"Recover near misses",text:"Test one permitted change while preserving every must-have."},
            {icon:ShieldCheck,title:"Present proof",text:"Generate a time-bound, integrity-hashed passport from a server decision."},
          ].map(({icon:Icon,title,text}, index) => <article key={title} className="surface p-5"><div className="mb-5 flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon size={20} /></span><span className="text-sm font-bold text-slate-300">0{index+1}</span></div><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>)}
        </div>
      </section>
    </main>
  );
}
