import { describe, it, expect } from "vitest";

import { periodIntervals } from "@/lib/plan-periods";
import type { DatedPeriod } from "@/lib/periods";

describe("periodIntervals", () => {
  const p = (over: Partial<DatedPeriod>): DatedPeriod => ({
    id: "x",
    caregiver: "A",
    kind: "fixed",
    days: 30,
    startsAt: new Date(Date.UTC(2025, 0, 1)),
    endsAt: new Date(Date.UTC(2025, 3, 15)),
    pace: { phase1: 0.5, phase2: 5 },
    overrunDays: 0,
    ...over,
  });

  it("maps each period to an interval at its SGI pace with the caregiver name", () => {
    const r = periodIntervals(
      [p({ caregiver: "A" }), p({ caregiver: "B", days: 0 })],
      { A: "Niki", B: "Kalle" },
      () => 600,
    );
    expect(r).toHaveLength(1); // the 0-day one is dropped
    expect(r[0].caregiver).toBe("Niki");
    expect(r[0].pace).toBe(5);
    expect(r[0].monthly).toBe(Math.round((600 * 5 * 30.4) / 7));
    expect(r[0].startsAt.getTime()).toBe(Date.UTC(2025, 0, 1));
  });

  it("values the monthly from the caregiver's own rate", () => {
    const r = periodIntervals([p({ caregiver: "B" })], { A: "Niki", B: "Kalle" }, () => 900);
    expect(r[0].monthly).toBe(Math.round((900 * 5 * 30.4) / 7));
  });
});
