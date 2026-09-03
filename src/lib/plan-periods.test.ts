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
  const oneYear = new Date(Date.UTC(2025, 10, 1));

  it("skips birth and zero-day periods", () => {
    const r = periodIntervals(
      [p({ caregiver: "A" }), p({ caregiver: "B", days: 0 }), p({ kind: "birth" })],
      { A: "Niki", B: "Kalle" },
      () => 600,
      180,
      oneYear,
    );
    expect(r).toHaveLength(1); // the 0-day + birth are dropped
    expect(r[0].caregiver).toBe("Niki");
    expect(r[0].tier).toBe("income");
    expect(r[0].startsAt.getTime()).toBe(Date.UTC(2025, 0, 1));
  });

  it("uses the phase-1 pace entirely before the birthday", () => {
    const r = periodIntervals([p({ caregiver: "B" })], { A: "Niki", B: "Kalle" }, () => 900, 180, oneYear);
    expect(r[0].pace).toBe(0.5);
    expect(r[0].monthly).toBe(Math.round((900 * 0.5 * 30.4) / 7));
  });

  it("uses the flat lägstanivå rate for a lagsta period", () => {
    const r = periodIntervals(
      [p({ tier: "lagsta", pace: { phase1: 5, phase2: 5 } })],
      { A: "Niki", B: "Kalle" },
      () => 900,
      180,
      oneYear,
    );
    expect(r[0].tier).toBe("lagsta");
    expect(r[0].monthly).toBe(Math.round((180 * 5 * 30.4) / 7));
  });

  it("keeps a crossing period as ONE interval at the phase-1 pace (one block)", () => {
    const r = periodIntervals(
      [p({ startsAt: new Date(Date.UTC(2025, 0, 1)), endsAt: new Date(Date.UTC(2026, 3, 1)), pace: { phase1: 0.5, phase2: 5 } })],
      { A: "Niki", B: "Kalle" },
      () => 600,
      180,
      oneYear,
    );
    // A single block per stretch, at the start pace — the SGI lift is shown by
    // the pager, not by splitting into a second block (matches the goal view).
    expect(r).toHaveLength(1);
    expect(r[0].pace).toBe(0.5);
    expect(r[0].periodId).toBe("x");
    expect(r[0].kind).toBe("fixed");
  });
});
