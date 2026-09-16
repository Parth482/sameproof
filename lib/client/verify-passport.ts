import type { PriceMatchPassport } from "@/models/domain";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassportIntegrity(passport: Omit<PriceMatchPassport, "publicTokenHash">) {
  const snapshot = {
    evidenceSnapshot: passport.evidenceSnapshot,
    policySnapshot: passport.policySnapshot,
    decisionSnapshot: passport.decisionSnapshot,
  };
  const bytes = new TextEncoder().encode(canonicalize(snapshot));
  return toHex(await crypto.subtle.digest("SHA-256", bytes)) === passport.integrityHash;
}
