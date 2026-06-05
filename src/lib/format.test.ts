import { describe, it, expect } from "vitest";

import {
  approxLeaveMonths,
  approxLeaveWeeks,
  approxMonths,
  formatDays,
} from "@/lib/format";

describe("approxLeaveMonths", () => {
  it("matches approxMonths at 7 days/week", () => {
    expect(approxLeaveMonths(480, 7)).toBe(approxMonths(480));
  });

  it("stretches the duration as days/week drops", () => {
    expect(approxLeaveMonths(480, 7)).toBe("≈ 16 mån");
    expect(approxLeaveMonths(480, 5)).toBe("≈ 22 mån");
    expect(approxLeaveMonths(480, 3)).toBe("≈ 37 mån");
  });

  it("guards against zero / bad input", () => {
    expect(approxLeaveMonths(0, 5)).toBe("0 mån");
    expect(approxLeaveMonths(480, 0)).toBe(approxLeaveMonths(480, 7));
  });
});

describe("approxLeaveWeeks", () => {
  it("divides days by the weekly rate", () => {
    expect(approxLeaveWeeks(480, 5)).toBe(96);
    expect(approxLeaveWeeks(480, 7)).toBe(69);
  });
});

describe("formatDays", () => {
  it("uses the singular for a single day", () => {
    expect(formatDays(1)).toBe("1 dag");
    expect(formatDays(2)).toBe("2 dagar");
  });
});
