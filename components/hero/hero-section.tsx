"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Store,
  Tag,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Text-scramble morph                                                */
/* ------------------------------------------------------------------ */

const PHRASES = [
  "Prove the match.",
  "Verify identity.",
  "Show your proof.",
  "Explain every rule.",
];

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
const FRAME_MS = 32;
const SETTLE_FRAMES = 12;
const HOLD_MS = 3200;

function useTextScramble(phrases: string[]) {
  const [display, setDisplay] = useState(phrases[0]);
  const indexRef = useRef(0);
  const rafRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const scrambleTo = useCallback((target: string) => {
    let frame = 0;
    const maxLen = target.length + 4;
    const totalFrames = maxLen + SETTLE_FRAMES;

    const tick = () => {
      frame++;
      let result = "";
      for (let i = 0; i < maxLen; i++) {
        const settled = frame - SETTLE_FRAMES > i;
        if (settled) {
          result += target[i] ?? "";
        } else if (i < target.length) {
          result += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
      }
      setDisplay(result);
      if (frame < totalFrames) {
        rafRef.current = setTimeout(tick, FRAME_MS);
      } else {
        setDisplay(target);
      }
    };
    tick();
  }, []);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let timeout: ReturnType<typeof setTimeout>;
    const cycle = () => {
      indexRef.current = (indexRef.current + 1) % phrases.length;
      scrambleTo(phrases[indexRef.current]);
      timeout = setTimeout(cycle, HOLD_MS);
    };
    timeout = setTimeout(cycle, HOLD_MS);

    return () => {
      clearTimeout(timeout);
      if (rafRef.current) clearTimeout(rafRef.current);
    };
  }, [phrases, scrambleTo]);

  return display;
}

/* ------------------------------------------------------------------ */
/*  Blur-to-focus spotlight reveal                                     */
/* ------------------------------------------------------------------ */

function HeadingReveal({ text }: { text: string }) {
  const words = text.split(" ");
  const [progress, setProgress] = useState(-1);
  const ref = useRef<HTMLSpanElement>(null);
  const hasPlayed = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setProgress(words.length);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          // Reset when out of view so it replays on re-entry
          setProgress(-1);
          hasPlayed.current = false;
          return;
        }
        if (hasPlayed.current) return;
        hasPlayed.current = true;

        let frame = -1;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const step = () => {
          frame++;
          setProgress(frame);
          if (frame < words.length) {
            timers.push(setTimeout(step, 120));
          }
        };
        timers.push(setTimeout(step, 150));
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [words.length]);

  return (
    <span ref={ref} aria-label={text}>
      {words.map((word, i) => {
        const dist = progress - i;
        const sharp = dist >= 0;
        const arriving = dist === 0;
        return (
          <span
            key={i}
            aria-hidden="true"
            className="inline-block transition-all duration-500 ease-out"
            style={{
              filter: sharp ? "blur(0px)" : "blur(8px)",
              opacity: sharp ? 1 : arriving ? 0.5 : 0.15,
              transform: sharp ? "scale(1)" : "scale(1.04)",
            }}
          >
            {word}{i < words.length - 1 ? "\u00A0" : ""}
          </span>
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Proof Bridge — animated hero visualization                         */
/* ------------------------------------------------------------------ */

const BRIDGE_CHECKS = [
  { field: "Model", left: "G2724D-AU", right: "G2724D-AU" },
  { field: "GTIN", left: "9300…0019", right: "9300…0019" },
  { field: "Region", left: "Australia", right: "Australia" },
  { field: "Stock", left: "In stock", right: "In stock" },
  { field: "Condition", left: "New", right: "New" },
];

type RowState = "hidden" | "checking" | "pass";

function ProofBridge() {
  const [storesVisible, setStoresVisible] = useState(false);
  const [rowStates, setRowStates] = useState<RowState[]>(
    BRIDGE_CHECKS.map(() => "hidden"),
  );
  const [verdict, setVerdict] = useState<"hidden" | "checking" | "done">("hidden");
  const [shimmer, setShimmer] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const run = () => {
      setStoresVisible(false);
      setRowStates(BRIDGE_CHECKS.map(() => "hidden"));
      setVerdict("hidden");
      setShimmer(false);

      const timers: ReturnType<typeof setTimeout>[] = [];
      let t = 0;
      const after = (ms: number, fn: () => void) => {
        t += ms;
        timers.push(setTimeout(fn, t));
      };

      after(300, () => setStoresVisible(true));

      BRIDGE_CHECKS.forEach((_, i) => {
        after(500, () =>
          setRowStates((p) => { const n = [...p]; n[i] = "checking"; return n; }),
        );
        after(450, () =>
          setRowStates((p) => { const n = [...p]; n[i] = "pass"; return n; }),
        );
      });

      after(300, () => setVerdict("checking"));
      after(600, () => { setVerdict("done"); setShimmer(true); });

      if (!prefersReduced) {
        after(4500, run);
      }

      return timers;
    };

    const timers = run();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-2xl shadow-slate-900/[.08]"
      aria-label="Animated price-match verification concept"
    >
      {/* Top gradient bar */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 via-emerald-400 to-blue-600"
      />

      {/* Shimmer sweep */}
      {shimmer && (
        <div
          aria-hidden="true"
          className="hero-shimmer absolute inset-0 z-10 pointer-events-none"
        />
      )}

      <div className="relative p-5 sm:p-6">
        {/* Two store badges */}
        <div
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 transition-all duration-500"
          style={{
            opacity: storesVisible ? 1 : 0,
            transform: storesVisible ? "translateY(0)" : "translateY(10px)",
          }}
        >
          {/* Your store */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-center">
            <div className="mx-auto mb-1.5 grid size-8 place-items-center rounded-lg bg-blue-600 text-white">
              <Store size={16} />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-500">Your store</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">$499.00</p>
            <p className="text-[11px] text-slate-500">Officeworks</p>
          </div>

          {/* VS divider */}
          <div className="flex flex-col items-center gap-1">
            <div className="size-8 grid place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-400">
              vs
            </div>
          </div>

          {/* Competitor */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-center">
            <div className="mx-auto mb-1.5 grid size-8 place-items-center rounded-lg bg-emerald-600 text-white">
              <Tag size={16} />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Competitor</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">$449.00</p>
            <p className="text-[11px] text-slate-500">Centre Com</p>
          </div>
        </div>

        {/* Verification pipeline */}
        <div className="mt-4 space-y-1.5">
          {BRIDGE_CHECKS.map((check, i) => {
            const state = rowStates[i];
            return (
              <div
                key={check.field}
                className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-all duration-400 ${
                  state === "pass"
                    ? "bg-emerald-50/70"
                    : state === "checking"
                      ? "bg-amber-50/50"
                      : "bg-transparent"
                }`}
                style={{
                  opacity: state === "hidden" ? 0.25 : 1,
                  transform: state === "hidden" ? "scale(0.97)" : "scale(1)",
                }}
              >
                <span className="text-right font-mono text-slate-600 truncate">
                  {state !== "hidden" ? check.left : "—"}
                </span>

                <span className="grid size-6 shrink-0 place-items-center">
                  {state === "checking" ? (
                    <Loader2 size={14} className="animate-spin text-amber-500" />
                  ) : state === "pass" ? (
                    <CheckCircle2 size={15} className="text-emerald-600" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-slate-300" />
                  )}
                </span>

                <span className="font-mono text-slate-600 truncate">
                  {state !== "hidden" ? check.right : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Verdict */}
        <div
          className="mt-4 overflow-hidden transition-all duration-700"
          style={{
            opacity: verdict === "hidden" ? 0 : 1,
            maxHeight: verdict === "hidden" ? 0 : 120,
            transform: verdict === "hidden" ? "translateY(8px)" : "translateY(0)",
          }}
        >
          <div
            className={`rounded-xl p-4 text-center transition-all duration-500 ${
              verdict === "done"
                ? "bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-600/20"
                : "bg-gradient-to-r from-slate-700 to-slate-600"
            }`}
          >
            {verdict === "checking" ? (
              <div className="flex items-center justify-center gap-2 text-sm font-semibold text-white/80">
                <Loader2 size={16} className="animate-spin" />
                Checking policy…
              </div>
            ) : verdict === "done" ? (
              <>
                <div className="flex items-center justify-center gap-2 text-base font-bold text-white">
                  <BadgeCheck size={20} />
                  Eligible — save $50.00
                </div>
                <p className="mt-1 text-[12px] text-emerald-100">
                  5 identity checks passed · 8 policy rules satisfied
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero section                                                       */
/* ------------------------------------------------------------------ */

export function HeroSection() {
  const morphedText = useTextScramble(PHRASES);

  return (
    <section className="relative border-b border-slate-200 bg-white">
      {/* Background gradients */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[36rem] bg-[radial-gradient(circle_at_70%_20%,rgba(37,99,235,.10),transparent_42%),radial-gradient(circle_at_15%_10%,rgba(16,185,129,.07),transparent_35%)]"
      />
      {/* Subtle grid pattern */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(15,23,42,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-28">
        {/* Left — Copy */}
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">
            <ShieldCheck size={15} aria-hidden="true" /> Explainable by design
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.055em] text-slate-950 sm:text-6xl">
            <HeadingReveal text="Don't just compare the price." />{" "}
            <span
              className="relative inline-block text-blue-600"
              aria-label={PHRASES.join(", ")}
            >
              <span className="font-mono tracking-[-0.02em]">{morphedText}</span>
              <span
                aria-hidden="true"
                className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full bg-blue-600/25"
              />
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-600">
            Found it cheaper somewhere else? SameProof checks if it's actually
            the same product, whether the offer qualifies, and gives you proof
            you can show at the counter.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/offer-dock"
              className="button-primary px-5 py-3 text-base"
            >
              Start a comparison{" "}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a
              href="#how-it-works"
              className="button-secondary px-5 py-3 text-base"
            >
              See how it works
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Sample data is simulated and clearly labelled. No account
            required.
          </p>
        </div>

        {/* Right — Proof bridge visualization */}
        <ProofBridge />
      </div>
    </section>
  );
}
