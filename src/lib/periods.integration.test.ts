import { describe, it, expect } from "vitest";

import { buildPlanPeriods, solvePeriods } from "@/lib/periods";
import { resolveStretch, SGI_MIN_DAYS_PER_WEEK } from "@/lib/stretch";
import type { PeriodSpec } from "@/lib/share";

const start = new Date(Date.UTC(2025, 0, 1));
const oneYear = new Date(Date.UTC(2026, 0, 1));
const incomeDeadline = new Date(Date.UTC(2029, 0, 1));

describe("buildPlanPeriods (state → dated plan)", () => {
  it("dates periods sequentially from the birth", () => {
    const periods: PeriodSpec[] = [
      { id: "a", caregiver: "A", kind: "fixed", days: 70 },
      { id: "b", caregiver: "B", kind: "leftover", days: 0 },
    ];
    const r = buildPlanPeriods({ periods, budgets: { A: 240, B: 240 }, start, oneYear, incomeDeadline });
    expect(r.periods).toHaveLength(2);
    const [a, b] = r.periods;
    expect(a.startsAt.getTime()).toBe(start.getTime());
    expect(b.startsAt.getTime()).toBe(a.endsAt.getTime());
    // The leftover (B) absorbs only B's remaining days here (A has no leftover period).
    expect(b.days).toBe(240);
    // Each stretch obeys the SGI floor after the first birthday.
    expect(a.pace.phase2).toBeGreaterThanOrEqual(SGI_MIN_DAYS_PER_WEEK);
  });

  it("warns when a fixed period can't be fully met", () => {
    const r = buildPlanPeriods({
      periods: [{ id: "a", caregiver: "A", kind: "fixed", days: 999 }],
      budgets: { A: 240, B: 240 },
      start,
      oneYear,
      incomeDeadline,
    });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.periods[0].days).toBe(240);
  });

  it("dates a locked birth window overlapping the start without advancing it", () => {
    const r = buildPlanPeriods({
      periods: [
        { id: "birth", caregiver: "B", kind: "birth", days: 10, locked: true },
        { id: "a", caregiver: "A", kind: "fixed", days: 70 },
      ],
      budgets: { A: 240, B: 240 },
      start,
      oneYear,
      incomeDeadline,
    });
    const birth = r.periods.find((p) => p.id === "birth")!;
    const a = r.periods.find((p) => p.id === "a")!;
    // Birth overlaps the very start and is locked.
    expect(birth.startsAt.getTime()).toBe(start.getTime());
    expect(birth.locked).toBe(true);
    // The birth giver still starts AT the birth — not after the 10 days.
    expect(a.startsAt.getTime()).toBe(start.getTime());
  });

  it("dates a dubbeldagar window sequentially, drawing from both budgets", () => {
    const r = buildPlanPeriods({
      periods: [
        { id: "d", caregiver: "A", kind: "dubbeldagar", days: 20 },
        { id: "a", caregiver: "A", kind: "fixed", days: 60 },
      ],
      budgets: { A: 240, B: 240 },
      start,
      oneYear,
      incomeDeadline,
    });
    const d = r.periods.find((p) => p.id === "d")!;
    const a = r.periods.find((p) => p.id === "a")!;
    expect(d.startsAt.getTime()).toBe(start.getTime());
    expect(a.startsAt.getTime()).toBe(d.endsAt.getTime());
  });

  it("reordering fixed periods changes their date order", () => {
    const base = {
      budgets: { A: 240, B: 240 },
      start,
      oneYear,
      incomeDeadline,
    };
    const ab = buildPlanPeriods({
      ...base,
      periods: [
        { id: "a", caregiver: "A", kind: "fixed", days: 60 },
        { id: "b", caregiver: "B", kind: "fixed", days: 60 },
      ],
    });
    const ba = buildPlanPeriods({
      ...base,
      periods: [
        { id: "b", caregiver: "B", kind: "fixed", days: 60 },
        { id: "a", caregiver: "A", kind: "fixed", days: 60 },
      ],
    });
    // Swapped order ⇒ the leading caregiver is swapped.
    expect(ab.periods[0].caregiver).toBe("A");
    expect(ba.periods[0].caregiver).toBe("B");
  });
});

describe("periods → stretches (end to end)", () => {
  it("fixed periods are scheduled first, then the leftover fills the remainder", () => {
    const solved = solvePeriods({
      periods: [
        { id: "a-fixed", caregiver: "A", kind: "fixed", days: 70 },
        { id: "b-fixed", caregiver: "B", kind: "fixed", days: 60 },
        { id: "b-leftover", caregiver: "B", kind: "leftover", days: 0 },
      ],
      // Only B has a stretch that can absorb leftovers (A has no leftover
      // period), so B takes B's own leftover — not A's.
      budgets: { A: 240, B: 240 },
    });
    const byId = Object.fromEntries(solved.allocations.map((p) => [p.id, p]));

    // Both fixed periods keep their days.
    expect(byId["a-fixed"].days).toBe(70);
    expect(byId["b-fixed"].days).toBe(60);
    // B's leftover takes B's remaining 180 (B has a leftover period), while
    // A's 170 stay unused (A has no leftover period).
    expect(byId["b-leftover"].days).toBe(180);
    expect(solved.unused.A).toBe(170);
    expect(solved.unused.B).toBe(0);
  });

  it("turns allocated days into a dated stretch that respects the SGI floor", () => {
    const stretch = resolveStretch({
      days: 100,
      start,
      oneYear,
      incomeDeadline,
    });
    // The calendar must be drawn at >= 5 days/week after the 1st birthday.
    expect(stretch.pace.phase2).toBeGreaterThanOrEqual(SGI_MIN_DAYS_PER_WEEK);
    expect(stretch.endsAt.getTime()).toBeGreaterThan(start.getTime());
    expect(stretch.overrunDays).toBe(0);
  });

  it("warns when a fixed period overdraws its caregiver", () => {
    const r = solvePeriods({
      periods: [{ id: "a", caregiver: "A", kind: "fixed", days: 999 }],
      budgets: { A: 240, B: 240 },
    });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.allocations[0].days).toBe(240);
  });
});
