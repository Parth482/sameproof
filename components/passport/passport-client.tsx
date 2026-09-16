"use client";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { PassportCard } from "@/components/passport/passport-card";
import { ErrorState, LoadingState } from "@/components/shared/async-state";
import { ApiClientError, createPassport, getComparison, getPublicPassport, type PublicPassport } from "@/lib/client/api";
import type { Comparison, Decision } from "@/models/domain";

export function PassportClient({ comparisonId }: { comparisonId: string }) {
  const router = useRouter();
  const [comparison, setComparison] = useState<Comparison>();
  const [decision, setDecision] = useState<Decision>();
  const [passport, setPassport] = useState<PublicPassport>();
  const [token, setToken] = useState<string>();
  const [error, setError] = useState<ApiClientError>();
  const [busy, setBusy] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const automaticGenerationStarted = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await getComparison(comparisonId);
      setError(undefined);
      setComparison(response.comparison);
      setDecision(response.decision ?? undefined);
      const remembered = sessionStorage.getItem(`sameproof-passport:${comparisonId}`);
      if (remembered) {
        try {
          const publicResponse = await getPublicPassport(remembered);
          setPassport(publicResponse.passport);
          setToken(remembered);
        } catch {
          sessionStorage.removeItem(`sameproof-passport:${comparisonId}`);
        }
      }
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause : new ApiClientError("Passport details could not be loaded.", "UNKNOWN", 0));
    } finally {
      setInitialLoadComplete(true);
    }
  }, [comparisonId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const response = await createPassport(comparisonId);
      setPassport(response.passport);
      setToken(response.publicToken);
      sessionStorage.setItem(`sameproof-passport:${comparisonId}`, response.publicToken);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause : new ApiClientError("The passport could not be generated.", "UNKNOWN", 0));
    } finally {
      setBusy(false);
    }
  }, [comparisonId]);

  const ready = Boolean(decision && comparison && decision.comparisonVersion === comparison.version && (decision.status === "verified" || decision.status === "likely"));
  useEffect(() => {
    if (!initialLoadComplete || !ready || passport || automaticGenerationStarted.current) return;
    automaticGenerationStarted.current = true;
    void generate();
  }, [generate, initialLoadComplete, passport, ready]);

  if (error && !comparison) return <ErrorState message={error.message} requestId={error.requestId} onRetry={load} />;
  if (error && comparison && ready && !passport) return <div className="mx-auto max-w-2xl"><ErrorState title="The passport could not be created" message={error.message} requestId={error.requestId} onRetry={generate} /><Link href={`/identity-bridge/${comparisonId}`} className="button-secondary mt-5"><ArrowLeft size={17} />Back to result</Link></div>;
  if (!comparison || (ready && !passport && !error)) return <LoadingState label={busy ? "Creating your live passport" : "Preparing the passport"} />;
  if (passport) return <div><PassportCard passport={passport} shareUrl={`${window.location.origin}/p/${token}`} onRefresh={() => { sessionStorage.removeItem(`sameproof-passport:${comparisonId}`); router.push(`/evidence-lens/${comparisonId}`); }} /><div className="mx-auto mt-5 max-w-5xl"><Link href={`/identity-bridge/${comparisonId}`} className="button-secondary"><ArrowLeft size={17} />Back to result</Link></div></div>;

  return <div className="mx-auto max-w-2xl"><section className="surface overflow-hidden"><div className="bg-amber-50 p-6 text-center sm:p-8"><ShieldCheck className="mx-auto text-amber-700" size={30} /><h2 className="mt-4 text-2xl font-semibold tracking-[-.035em]">You need an up-to-date result first</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-700">Go back and run the latest check. We&apos;ll create your proof automatically once it&apos;s ready.</p>{error && <div className="mt-5 text-left"><ErrorState message={error.message} requestId={error.requestId} onRetry={ready ? generate : undefined} /></div>}<Link href={`/identity-bridge/${comparisonId}`} className="button-primary mt-6"><ArrowLeft size={17} />Return to result</Link></div></section></div>;
}
