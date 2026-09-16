import type {
  Comparison,
  Decision,
  PolicyVersion,
  PriceMatchPassport,
} from "@/models/domain";
import { AppError } from "@/lib/errors/app-error";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalize(value));
  return toHex(await crypto.subtle.digest("SHA-256", encoded));
}

export async function generatePassport(
  comparison: Comparison,
  decision: Decision,
  policy: PolicyVersion,
  rawPublicToken: string,
): Promise<PriceMatchPassport> {
  if (decision.comparisonId !== comparison.id || decision.comparisonVersion !== comparison.version) {
    throw new AppError(
      "VERSION_CONFLICT",
      "The decision no longer represents the current comparison.",
      409,
    );
  }
  if (decision.status !== "verified" && decision.status !== "likely") {
    throw new AppError(
      "INVARIANT_VIOLATION",
      "A passport requires a verified or likely server decision.",
      422,
    );
  }

  const snapshot = {
    evidenceSnapshot: structuredClone(comparison.evidence),
    policySnapshot: structuredClone(policy),
    decisionSnapshot: structuredClone(decision),
  };

  return {
    id: crypto.randomUUID(),
    publicTokenHash: await sha256(rawPublicToken),
    comparisonId: comparison.id,
    decisionId: decision.id,
    ...snapshot,
    integrityHash: await sha256(snapshot),
    generatedAt: decision.generatedAt,
    expiresAt: decision.expiresAt,
  };
}
