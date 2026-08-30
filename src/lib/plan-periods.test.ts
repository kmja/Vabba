import { describe, it, expect } from "vitest";

import { periodIntervals } from "@/lib/plan-periods";
import type { DatedPeriod } from "@/lib/periods";

describe("periodIntervals", () => {
  const p = (over: Partial<DatedPeriod>): DatedPeriod => ({
    id: "x",
    caregiver: "A",
    kind: "fixed",
    days: 30,
    tier: "income",
    startsAt: new Date(Date.UTC(2025, 0, 1)),
    endsAt: new Date(Date.UTC(2025, 3, 15)),
    pace: { phase1: 0.5, phase2: 5 },
    overrunDays: 0,
    ...over,
  });

  it("maps each non-birth period to one interval at its phase-1 pace", () => {
    const r = periodIntervals(
      [p({ caregiver: "A" }), p({ caregiver: "B", days: 0 }), p({ kind: "birth" })],
      { A: "Niki", B: "Kalle" },
      () => 600,
      180,
    );
    expect(r).toHaveLength(1); // 0-day + birth are dropped
    expect(r[0].caregiver).toBe("Niki");
    expect(r[0].pace).toBe(0.5);
    expect(r[0].startsAt.getTime()).toBe(Date.UTC(2025, 0, 1));
  });

  it("values the monthly from the caregiver's own rate", () => {
    const r = periodIntervals([p({ caregiver: "B" })], { A: "Niki", B: "Kalle" }, () => 900, 180);
    expect(r[0].monthly).toBe(Math.round((900 * 0.5 * 30.4) / 7));
  });

  it("uses the flat lägstanivå rate for a lagsta period", () => {
    const r = periodIntervals(
      [p({ tier: "lagsta", days: 30, pace: { phase1: 5, phase2: 5 } })],
      { A: "Niki", B: "Kalle" },
      () => 900,
      180,
    );
    expect(r[0].tier).toBe("lagsta");
    expect(r[0].monthly).toBe(Math.round((180 * 5 * 30.4) / 7));
  });
});
