"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/async-state";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("SameProof route error", { message: error.message, digest: error.digest });
  }, [error]);
  return <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12"><ErrorState message="This screen could not be rendered. Your comparison draft is kept on this device where possible." requestId={error.digest} onRetry={reset} /></main>;
}
