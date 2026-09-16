import type { Metadata } from "next";

import { PublicPassportClient } from "@/components/passport/public-passport-client";

export const metadata: Metadata = { title: "Shared Price-Match Passport", robots: { index: false, follow: false } };

export default async function PublicPassportPage({ params }: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await params;
  return <PublicPassportClient token={publicToken} />;
}
