import type { Metadata } from "next";

import { JourneyShell } from "@/components/journey/journey-shell";
import { PassportClient } from "@/components/passport/passport-client";

export const metadata: Metadata = { title: "Live Price-Match Passport" };

export default async function PassportPage({ params }: { params: Promise<{ comparisonId: string }> }) {
  const { comparisonId } = await params;
  return <JourneyShell stage="passport" comparisonId={comparisonId} eyebrow="Ready to present" title="Your price-match passport" description="Show the outcome at the counter. The detailed proof stays one tap away."><PassportClient comparisonId={comparisonId} /></JourneyShell>;
}
