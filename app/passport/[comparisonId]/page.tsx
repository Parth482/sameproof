import type { Metadata } from "next";

import { JourneyShell } from "@/components/journey/journey-shell";
import { PassportClient } from "@/components/passport/passport-client";

export const metadata: Metadata = { title: "Live Price-Match Passport" };

export default async function PassportPage({ params }: { params: Promise<{ comparisonId: string }> }) {
  const { comparisonId } = await params;
  return <JourneyShell stage="passport" comparisonId={comparisonId} eyebrow="Ready to use" title="Your price-match proof" description="Show this at the counter. The full details are one tap away."><PassportClient comparisonId={comparisonId} /></JourneyShell>;
}
