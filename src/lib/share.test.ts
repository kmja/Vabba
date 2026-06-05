import { describe, it, expect } from "vitest";

import { decodeState, encodeState, type ShareableState } from "@/lib/share";
import { defaultPlanInput } from "@/lib/calc";

const sample: ShareableState = {
  plan: {
    ...defaultPlanInput("2025-01-15"),
    parents: {
      A: {
        name: "Åsa",
        grossMonthlyIncome: 45000,
        daysUsed: { sjukpenning: 10, lagsta: 0 },
      },
      B: { grossMonthlyIncome: 30000, daysUsed: { sjukpenning: 0, lagsta: 0 } },
    },
  },
  objective: "equal",
  soloMode: false,
  hasUsedDays: true,
  detailedUsed: false,
};

describe("share encode/decode", () => {
  it("round-trips state through a URL-safe string", () => {
    const encoded = encodeState(sample);
    expect(typeof encoded).toBe("string");
    expect(encoded).not.toMatch(/[+/=]/); // URL-safe alphabet only
    expect(decodeState(encoded)).toEqual(sample);
  });

  it("preserves non-ASCII (Swedish) names", () => {
    expect(decodeState(encodeState(sample))?.plan.parents.A.name).toBe("Åsa");
  });

  it("returns null for missing or corrupt input", () => {
    expect(decodeState("")).toBeNull();
    expect(decodeState("@@not-base64@@")).toBeNull();
    expect(decodeState(encodeState({ ...sample, plan: undefined } as never))).toBeNull();
  });
});
