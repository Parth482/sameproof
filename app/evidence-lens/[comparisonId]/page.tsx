import type { Metadata } from "next";

import { EvidenceLensClient } from "@/components/evidence/evidence-lens-client";
import { JourneyShell } from "@/components/journey/journey-shell";

export const metadata: Metadata = { title: "Evidence Lens" };

export default async function EvidenceLensPage({ params }: { params: Promise<{ comparisonId: string }> }) {
  const { comparisonId } = await params;
  return <JourneyShell stage="evidence_lens" comparisonId={comparisonId} eyebrow="Check the source" title="Check what we found" description="Review each offer once. Edit only what is wrong or missing."><EvidenceLensClient comparisonId={comparisonId} /></JourneyShell>;
}
