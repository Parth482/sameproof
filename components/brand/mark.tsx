import { ScanLine } from "lucide-react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold tracking-[-0.03em] text-slate-950">
      <span className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
        <ScanLine aria-hidden="true" size={19} strokeWidth={2.2} />
      </span>
      {!compact && <span className="text-lg">SameProof</span>}
    </span>
  );
}
