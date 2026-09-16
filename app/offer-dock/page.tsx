import type { Metadata } from "next";

import { JourneyShell } from "@/components/journey/journey-shell";
import { OfferDockClient } from "@/components/offer-dock/offer-dock-client";

export const metadata: Metadata = { title: "Offer Dock" };

export default async function OfferDockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const sharedUrl = typeof query.url === "string" ? query.url : "";
  const resumeId = typeof query.comparisonId === "string" ? query.comparisonId : undefined;
  return (
    <JourneyShell stage="offer_dock" eyebrow="Start a comparison" title="Compare two offers" description="Choose the product you want and the lower-priced offer. We’ll check whether they genuinely match.">
      <OfferDockClient initialUrl={sharedUrl} resumeId={resumeId} />
    </JourneyShell>
  );
}
