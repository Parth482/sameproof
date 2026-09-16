import type { Money } from "@/models/domain";

export function normalizeModel(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()))].sort();
}

export function listsEqual(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeList(left);
  const normalizedRight = normalizeList(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) {
    throw new Error("Cannot add monetary values in different currencies.");
  }
  return { amountCents: left.amountCents + right.amountCents, currency: left.currency };
}

export function percentageBelow(money: Money, basisPoints: number): Money {
  const multiplier = 10_000 - basisPoints;
  return {
    amountCents: Math.round((money.amountCents * multiplier) / 10_000),
    currency: money.currency,
  };
}

export function formatMoney(money: Money): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: money.currency,
  }).format(money.amountCents / 100);
}
