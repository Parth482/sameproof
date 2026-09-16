import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16"><div className="surface w-full p-7 text-center"><SearchX className="mx-auto text-slate-400" size={36} /><h1 className="mt-4 text-2xl font-semibold">That evidence path was not found</h1><p className="mt-2 text-sm leading-6 text-slate-600">The link may be incomplete or the time-bounded comparison may no longer exist.</p><Link href="/offer-dock" className="button-primary mt-6">Start a comparison</Link></div></main>;
}
