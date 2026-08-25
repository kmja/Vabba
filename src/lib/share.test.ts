import { describe, it, expect } from "vitest";

import { decodeState, encodeState, plansEqual, type ShareableState } from "@/lib/share";
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
  parents: {
    A: { goalMode: "untilDate", saveDays: 20, supplementPct: 90 },
    B: { goalMode: "budget", saveDays: 10 },
  },
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

  it("round-trips the income-above-cap flag", () => {
    const withCap: ShareableState = {
      ...sample,
      plan: {
        ...sample.plan,
        parents: {
          ...sample.plan.parents,
          B: { ...sample.plan.parents.B, incomeAboveCap: true },
        },
      },
    };
    expect(
      decodeState(encodeState(withCap))?.plan.parents.B.incomeAboveCap,
    ).toBe(true);
  });

  it("returns null for missing or corrupt input", () => {
    expect(decodeState("")).toBeNull();
    expect(decodeState("@@not-base64@@")).toBeNull();
    expect(decodeState(encodeState({ ...sample, plan: undefined } as never))).toBeNull();
  });

  it("rejects a state in the old flat format (no nested parents)", () => {
    const oldFlat = { ...sample, parents: undefined };
    expect(decodeState(encodeState(oldFlat as never))).toBeNull();
  });

  it("plansEqual ignores key order but detects real changes", () => {
    const clone = structuredClone(sample);
    expect(plansEqual(sample, clone)).toBe(true);
    const changed = structuredClone(sample);
    changed.parents.A.saveDays = 99;
    expect(plansEqual(sample, changed)).toBe(false);
  });
});
