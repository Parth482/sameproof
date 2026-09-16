/// <reference lib="webworker" />

import { evaluateIdentity } from "@/lib/identity-engine";
import type { EvidenceRecord, ProductIdentity, RetailerListing } from "@/models/domain";

type Request = {
  targetListing: RetailerListing;
  competitorListing: RetailerListing;
  targetProduct?: ProductIdentity;
  competitorProduct?: ProductIdentity;
  evidence: { target: EvidenceRecord; competitor: EvidenceRecord };
};

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const input = event.data;
    const result = evaluateIdentity(input.targetListing, input.competitorListing, input.targetProduct, input.competitorProduct, input.evidence);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, message: error instanceof Error ? error.message : "Identity calculation failed." });
  }
};

export {};
