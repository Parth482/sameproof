import type { Metadata } from "next";

import { IdentityBridgeClient } from "@/components/identity/identity-bridge-client";
import { JourneyShell } from "@/components/journey/journey-shell";

export const metadata: Metadata = { title: "Identity Bridge" };

export default async function IdentityBridgePage({ params }: { params: Promise<{ comparisonId: string }> }) {
  const { comparisonId } = await params;
  return <JourneyShell stage="identity_bridge" comparisonId={comparisonId} eyebrow="Product check" title="Are these the same product?" description="We compare the key details first. Open the evidence only if you need to."><IdentityBridgeClient comparisonId={comparisonId} /></JourneyShell>;
}
