"use client";

import { useEffect, useRef, useState } from "react";
import {
  Barcode,
  CheckCheck,
  Eye,
  Fingerprint,
  GitCompareArrows,
  Layers,
  MapPin,
  Route,
  Scale,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Step data                                                          */
/* ------------------------------------------------------------------ */

interface StepTag {
  icon: LucideIcon;
  label: string;
}

interface Step {
  num: string;
  title: string;
  headline: string;
  description: string;
  tags: StepTag[];
  outcome: string;
  accent: "blue" | "violet" | "amber" | "emerald";
}

const STEPS: Step[] = [
  {
    num: "01",
    title: "Pick your offers",
    headline: "Choose the two products you're comparing",
    description:
      "Pick the store you're buying from and where you spotted it cheaper. We've got ready-made examples you can try first, or jump straight in with your own pair. It takes about ten seconds.",
    tags: [
      { icon: Layers, label: "Try it with examples first" },
      { icon: Eye, label: "Works with any two stores" },
      { icon: Barcode, label: "See real store policies" },
    ],
    outcome: "Both offers are locked in and ready to check.",
    accent: "blue",
  },
  {
    num: "02",
    title: "Check the facts",
    headline: "Make sure the details are actually right",
    description:
      "You'll see every detail side by side — the price, whether it's in stock, delivery costs, who's actually selling it. Confirm what looks correct. If something's missing or outdated, it stays marked as unverified so nothing gets assumed.",
    tags: [
      { icon: Eye, label: "See where each fact came from" },
      { icon: CheckCheck, label: "Confirm only what you trust" },
      { icon: Sparkles, label: "Nothing gets assumed" },
    ],
    outcome: "Every detail is checked — you can trust what comes next.",
    accent: "violet",
  },
  {
    num: "03",
    title: "Verify identity",
    headline: "Check it's actually the same product",
    description:
      "A similar screen size isn't enough — the model number, region code, warranty and what's in the box all need to match too. We show you exactly what's the same and what's different, so there's no guesswork at the counter.",
    tags: [
      { icon: Fingerprint, label: "Model and barcode matching" },
      { icon: MapPin, label: "Region and warranty check" },
      { icon: Scale, label: "Shows every difference clearly" },
    ],
    outcome: "You'll know if it's the same product, a close match, or a different one — and exactly why.",
    accent: "amber",
  },
  {
    num: "04",
    title: "Get your proof",
    headline: "Fix what's blocking it, or take your proof to the counter",
    description:
      "If something stops the match — like delivery making it more expensive — we'll suggest the simplest fix, like switching to click-and-collect. Once everything checks out, you get a secure proof card you can show at the counter or share as a link.",
    tags: [
      { icon: Route, label: "Shows the simplest fix" },
      { icon: ShieldCheck, label: "Proof you can show in-store" },
      { icon: Timer, label: "Share it as a link" },
    ],
    outcome: "A proof card ready to present, or a clear next step to get there.",
    accent: "emerald",
  },
];

const COLORS = {
  blue: {
    numBg: "bg-blue-600",
    tagBg: "bg-blue-50 text-blue-700",
    border: "border-blue-100",
    leftBorder: "border-l-[3px] border-l-blue-500",
    outcomeBg: "bg-blue-50 border-blue-100 text-blue-800",
    dot: "#2563eb",
  },
  violet: {
    numBg: "bg-violet-600",
    tagBg: "bg-violet-50 text-violet-700",
    border: "border-violet-100",
    leftBorder: "border-l-[3px] border-l-violet-500",
    outcomeBg: "bg-violet-50 border-violet-100 text-violet-800",
    dot: "#7c3aed",
  },
  amber: {
    numBg: "bg-amber-600",
    tagBg: "bg-amber-50 text-amber-700",
    border: "border-amber-100",
    leftBorder: "border-l-[3px] border-l-amber-500",
    outcomeBg: "bg-amber-50 border-amber-100 text-amber-800",
    dot: "#d97706",
  },
  emerald: {
    numBg: "bg-emerald-600",
    tagBg: "bg-emerald-50 text-emerald-700",
    border: "border-emerald-100",
    leftBorder: "border-l-[3px] border-l-emerald-500",
    outcomeBg: "bg-emerald-50 border-emerald-100 text-emerald-800",
    dot: "#059669",
  },
};

/* ------------------------------------------------------------------ */
/*  Scroll-drawn S-path through all steps                              */
/* ------------------------------------------------------------------ */

const S_PATH =
  "M 70 0 C 70 50, 70 70, 50 100 " +
  "C 30 130, 30 160, 30 190 " +
  "C 30 220, 30 240, 50 270 " +
  "C 70 300, 70 330, 70 360 " +
  "C 70 390, 70 410, 50 440 " +
  "C 30 470, 30 500, 30 530 " +
  "C 30 550, 30 570, 50 600";

const PATH_LENGTH = 950;

const DOT_POSITIONS = [
  { cx: 70, cy: 0 },
  { cx: 30, cy: 190 },
  { cx: 70, cy: 360 },
  { cx: 50, cy: 600 },
];

const STEP_COLORS = ["#2563eb", "#7c3aed", "#d97706", "#059669"];

function useScrollProgress(ref: React.RefObject<HTMLDivElement | null>) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setProgress(1);
      return;
    }

    const onScroll = () => {
      const rect = container.getBoundingClientRect();
      const windowH = window.innerHeight;
      const scrolled = windowH * 0.5 - rect.top;
      const raw = scrolled / (rect.height * 0.65);
      setProgress(Math.max(0, Math.min(1, raw)));
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [ref]);

  return progress;
}

/* Desktop: S-curve through the center */
function DesktopScrollPath({ progress }: { progress: number }) {
  const drawn = PATH_LENGTH * progress;

  return (
    <svg
      viewBox="0 0 100 600"
      fill="none"
      preserveAspectRatio="none"
      className="absolute left-1/2 top-0 h-full w-16 -translate-x-1/2"
    >
      <path d={S_PATH} stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="4 6" strokeLinecap="round" />
      <path
        d={S_PATH}
        stroke="url(#s-path-gradient)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={PATH_LENGTH}
        strokeDashoffset={PATH_LENGTH - drawn}
      />
      <defs>
        <linearGradient id="s-path-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="33%" stopColor="#7c3aed" />
          <stop offset="66%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      {DOT_POSITIONS.map((dot, i) => {
        const thresholds = [0, 0.3, 0.6, 0.82];
        const active = progress >= thresholds[i];
        return (
          <circle
            key={i}
            cx={dot.cx}
            cy={dot.cy}
            r={active ? 5 : 3}
            fill={active ? STEP_COLORS[i] : "#cbd5e1"}
            style={{ transition: "r 0.3s, fill 0.3s" }}
          />
        );
      })}
    </svg>
  );
}

/* Mobile: vertical line on the left */
function MobileScrollPath({ progress }: { progress: number }) {
  return (
    <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col items-center z-10">
      {/* Track */}
      <div className="absolute left-[18px] top-0 bottom-0 w-[2px] bg-slate-200" />
      {/* Filled progress */}
      <div
        className="absolute left-[18px] top-0 w-[2px] origin-top"
        style={{
          height: `${progress * 100}%`,
          background: "linear-gradient(to bottom, #2563eb, #7c3aed, #d97706, #059669)",
          transition: "height 0.1s linear",
        }}
      />
      {/* Dots at each step */}
      {[0.02, 0.27, 0.53, 0.78].map((pos, i) => {
        const active = progress >= (i === 3 ? pos - 0.02 : pos);
        return (
          <div
            key={i}
            className="absolute"
            style={{
              top: `${pos * 100}%`,
              left: active ? 12 : 14,
            }}
          >
            <div
              className="rounded-full border-2 border-white shadow-sm"
              style={{
                width: active ? 14 : 10,
                height: active ? 14 : 10,
                background: active ? STEP_COLORS[i] : "#cbd5e1",
                transition: "all 0.3s",
                boxShadow: active ? `0 0 8px ${STEP_COLORS[i]}40` : "0 1px 2px rgba(0,0,0,.1)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function ScrollPath({ progress }: { progress: number }) {
  return (
    <>
      <div className="absolute inset-0 hidden lg:block pointer-events-none" aria-hidden="true">
        <DesktopScrollPath progress={progress} />
      </div>
      <div className="absolute inset-0 lg:hidden pointer-events-none" aria-hidden="true">
        <MobileScrollPath progress={progress} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Scroll-triggered step card                                         */
/* ------------------------------------------------------------------ */

function StepCard({ step, index }: { step: Step; index: number }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const colors = COLORS[step.accent];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isEven = index % 2 === 0;

  return (
    <article
      ref={ref}
      className="group relative grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(30px)",
        transition: "opacity 0.6s ease-out, transform 0.6s ease-out",
      }}
    >
      {/* Content side */}
      <div className={isEven ? "lg:order-1" : "lg:order-2"}>
        {/* Step number + title */}
        <div className="mb-4 flex items-center gap-3">
          <span
            className={`grid size-9 place-items-center rounded-xl text-sm font-bold text-white ${colors.numBg} shadow-sm`}
          >
            {step.num}
          </span>
          <span className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">
            {step.title}
          </span>
        </div>

        {/* Headline */}
        <h3 className="text-xl font-semibold tracking-[-0.02em] text-slate-900 sm:text-2xl">
          {step.headline}
        </h3>

        {/* Description */}
        <p className="mt-3 text-[15px] leading-7 text-slate-600">
          {step.description}
        </p>

        {/* Tags */}
        <div className="mt-5 flex flex-wrap gap-2">
          {step.tags.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${colors.tagBg}`}
            >
              <Icon size={13} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Outcome card side */}
      <div className={isEven ? "lg:order-2" : "lg:order-1"}>
        <div
          className={`relative overflow-hidden rounded-2xl border bg-white p-6 shadow-sm transition-all duration-300 group-hover:shadow-md group-hover:-translate-y-0.5 ${colors.border} ${colors.leftBorder}`}
        >
          {/* Big step number watermark */}
          <span
            aria-hidden="true"
            className="absolute -right-2 -top-4 text-[7rem] font-black leading-none text-slate-100/60 select-none"
          >
            {step.num}
          </span>

          {/* Outcome */}
          <div className="relative">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">
              What you get
            </p>
            <p className="mt-3 text-base font-medium leading-relaxed text-slate-800">
              {step.outcome}
            </p>

            {/* Visual indicator */}
            <div
              className={`mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${colors.outcomeBg}`}
            >
              <CheckCheck size={14} />
              Step {index + 1} of 4 complete
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  Section                                                            */
/* ------------------------------------------------------------------ */

export function JourneySteps() {
  const headerRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const [headerVisible, setHeaderVisible] = useState(false);
  const scrollProgress = useScrollProgress(stepsRef);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setHeaderVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setHeaderVisible(entry.isIntersecting),
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-24 border-t border-slate-100 bg-slate-50/50"
    >
      {/* Subtle background pattern */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(15,23,42,.5) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        {/* Section header */}
        <div
          ref={headerRef}
          className="mx-auto max-w-2xl text-center transition-all duration-700"
          style={{
            opacity: headerVisible ? 1 : 0,
            transform: headerVisible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-slate-900 sm:text-4xl">
            Four steps to a verified price match
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-500">
            No mystery scores, no guesswork. You see exactly why it
            passed or why it didn't — and what you can do about it.
          </p>
        </div>

        {/* Steps with scroll-drawn path */}
        <div ref={stepsRef} className="relative mt-16">
          <ScrollPath progress={scrollProgress} />
          <div className="space-y-16 pl-10 lg:space-y-24 lg:pl-0">
            {STEPS.map((step, i) => (
              <StepCard key={step.num} step={step} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
