import { LoadingState } from "@/components/shared/async-state";

export default function Loading() {
  return <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12"><LoadingState label="Opening SameProof" /></main>;
}
