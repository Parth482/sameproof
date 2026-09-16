import type { Metadata } from "next";

import { JourneyShell } from "@/components/journey/journey-shell";
import { NearMissClient } from "@/components/near-miss/near-miss-client";

export const metadata: Metadata = { title: "Near-Miss Route" };

export default async function NearMissPage({ params }: { params: Promise<{ comparisonId: string }> }) {
  const { comparisonId } = await params;
  return <JourneyShell stage="near_miss" comparisonId={comparisonId} eyebrow="One safe change" title="Your best next step" description="Fix the first blocker without changing what matters to you."><NearMissClient comparisonId={comparisonId} /></JourneyShell>;
}
