"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PassportCard } from "@/components/passport/passport-card";
import { ErrorState, LoadingState } from "@/components/shared/async-state";
import { ApiClientError, getPublicPassport, type PublicPassport } from "@/lib/client/api";

export function PublicPassportClient({ token }: { token: string }) {
  const [passport, setPassport] = useState<PublicPassport>();
  const [error, setError] = useState<ApiClientError>();
  const load = useCallback(() => {
    getPublicPassport(token).then((response) => { setError(undefined); setPassport(response.passport); }).catch((cause) => setError(cause instanceof ApiClientError ? cause : new ApiClientError("This passport could not be opened.", "UNKNOWN", 0)));
  }, [token]);
  useEffect(load, [load]);
  if (error) return <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12"><ErrorState title={error.status === 410 ? "This passport has expired" : "Passport unavailable"} message={error.message} requestId={error.requestId} onRetry={error.status === 0 ? load : undefined} /><Link href="/offer-dock" className="button-primary mt-5">Start a new comparison</Link></main>;
  if (!passport) return <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10"><LoadingState label="Verifying the shared passport" /></main>;
  return <main className="flex-1 px-3 py-6 sm:px-6 sm:py-10"><PassportCard passport={passport} publicView /></main>;
}
