import { describe, expect, it } from "vitest";

import { calculateMenuPlacement } from "@/components/shared/responsive-select";

describe("responsive dropdown placement", () => {
  it("constrains a menu to the phone viewport", () => {
    const placement = calculateMenuPlacement(
      { left: 300, right: 680, top: 300, bottom: 344, width: 380 },
      412,
      915,
    );

    expect(placement.width).toBe(380);
    expect(placement.left).toBe(20);
    expect(placement.top).toBe(352);
    expect(placement.maxHeight).toBe(320);
  });

  it("opens upward with a bounded height near the bottom of the screen", () => {
    const placement = calculateMenuPlacement(
      { left: 24, right: 388, top: 790, bottom: 834, width: 364 },
      412,
      915,
    );

    expect(placement.top).toBeUndefined();
    expect(placement.bottom).toBe(133);
    expect(placement.maxHeight).toBe(320);
  });

  it("shrinks a trigger wider than the viewport without horizontal overflow", () => {
    const placement = calculateMenuPlacement(
      { left: -20, right: 500, top: 100, bottom: 144, width: 520 },
      375,
      667,
    );

    expect(placement.left).toBe(12);
    expect(placement.width).toBe(351);
  });
});
