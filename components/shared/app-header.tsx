import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand/mark";

export function AppHeader() {
  return (
    <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:min-h-16 sm:px-6 lg:px-8">
        <Link href="/" aria-label="SameProof home"><BrandMark /></Link>
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">
          <ShieldCheck aria-hidden="true" size={14} /> No account needed
        </span>
      </div>
    </header>
  );
}
