import { AlertTriangle, LoaderCircle, RotateCcw, WifiOff } from "lucide-react";

export function LoadingState({ label = "Loading evidence" }: { label?: string }) {
  return <div className="surface flex min-h-52 items-center justify-center p-8" role="status"><div className="text-center text-slate-600"><LoaderCircle className="mx-auto mb-3 animate-spin text-blue-600" aria-hidden="true" /><p className="font-semibold">{label}</p></div></div>;
}

export function ErrorState({ title = "We could not complete that step", message, requestId, onRetry }: { title?: string; message: string; requestId?: string; onRetry?: () => void }) {
  return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5" role="alert"><div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-rose-700" aria-hidden="true" /><div><h2 className="font-semibold text-rose-950">{title}</h2><p className="mt-1 text-sm leading-6 text-rose-800">{message}</p>{requestId && <p className="mt-2 font-mono text-xs text-rose-700">Request {requestId}</p>}{onRetry && <button type="button" className="button-secondary mt-4" onClick={onRetry}><RotateCcw aria-hidden="true" size={16} /> Retry</button>}</div></div></div>;
}

export function OfflineNotice() {
  return <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status"><WifiOff aria-hidden="true" size={18} />Showing the last draft saved on this device. Current price and stock cannot be verified offline.</div>;
}
