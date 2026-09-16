"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body className="bg-slate-50 p-4 text-slate-950"><main className="mx-auto mt-16 max-w-xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm"><h1 className="text-xl font-semibold">SameProof needs to restart this view</h1><p className="mt-2 text-sm leading-6 text-slate-600">An unexpected interface error occurred. Saved browser drafts are not deleted.</p><button type="button" className="mt-5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white" onClick={reset}>Try again</button></main></body></html>;
}
