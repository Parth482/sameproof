import { describe, expect, it } from "vitest";

import {
  addMoney,
  normalizeModel,
  percentageBelow,
} from "@/lib/domain/normalization";

describe("domain normalisation", () => {
  it("normalises model punctuation and casing", () => {
    expect(normalizeModel("mag-274qrf qd-e2")).toBe("MAG274QRFQDE2");
  });

  it("uses integer cents for delivered-price arithmetic", () => {
    expect(
      addMoney(
        { amountCents: 42_900, currency: "AUD" },
        { amountCents: 8_000, currency: "AUD" },
      ).amountCents,
    ).toBe(50_900);
  });

  it("rounds a five percent price beat to the nearest cent", () => {
    expect(
      percentageBelow(
        { amountCents: 44_999, currency: "AUD" },
        500,
      ).amountCents,
    ).toBe(42_749);
  });
});
