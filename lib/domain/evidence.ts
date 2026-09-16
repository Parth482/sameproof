import type {
  EvidenceField,
  EvidenceKey,
  EvidenceRecord,
  EvidenceValue,
} from "@/models/domain";

export const DYNAMIC_EVIDENCE_KEYS = [
  "priceCents",
  "deliveryCostCents",
  "stockState",
  "observedAt",
] as const satisfies readonly EvidenceKey[];

export function isTrustedEvidenceField(
  field: EvidenceField<EvidenceValue> | undefined,
): boolean {
  return Boolean(
    field &&
      field.state === "confirmed" &&
      field.userConfirmed &&
      field.value !== null,
  );
}

/**
 * Returns only evidence a person has explicitly confirmed. A present value is
 * not enough: extracted, conflicting and unknown values must stay undecided.
 */
export function trustedEvidenceValue<T>(
  record: EvidenceRecord,
  key: EvidenceKey,
): T | null {
  const field = record[key];
  return isTrustedEvidenceField(field) ? (field?.value as T) : null;
}

export function latestEvidenceSourceTime(
  field: EvidenceField<EvidenceValue> | undefined,
): number | null {
  if (!field || !isTrustedEvidenceField(field)) return null;
  const times = field.sources
    .map((source) => source.observedAt && Date.parse(source.observedAt))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return times.length ? Math.max(...times) : null;
}

/**
 * Dynamic evidence is only as fresh as its oldest decisive fact. Updating the
 * displayed observation time alone therefore cannot refresh price or stock.
 */
export function dynamicEvidenceValidUntil(
  record: EvidenceRecord,
  fulfilment: "delivery" | "pickup",
): string | null {
  const keys: EvidenceKey[] = fulfilment === "delivery"
    ? [...DYNAMIC_EVIDENCE_KEYS]
    : DYNAMIC_EVIDENCE_KEYS.filter((key) => key !== "deliveryCostCents");
  const observedTimes = keys.map((key) => latestEvidenceSourceTime(record[key]));
  if (observedTimes.some((value) => value === null)) return null;
  return new Date(Math.min(...(observedTimes as number[])) + 60 * 60 * 1_000).toISOString();
}
