import { describe, it, expect } from "vitest";

import { resolveStretch, SGI_MIN_DAYS_PER_WEEK, WORK_WEEK } from "@/lib/stretch";
import { addDays } from "@/lib/dates";

const start = new Date(Date.UTC(2025, 0, 1));
const oneYear = new Date(Date.UTC(2026, 0, 1));
const incomeDeadline = new Date(Date.UTC(2029, 0, 1)); // age 4

describe("resolveStretch", () => {
  it("slow-shields before the first birthday so days stretch the calendar", () => {
    const r = resolveStretch({ days: 26, start, oneYear, incomeDeadline });
    // 26 days at 0.5 d/wk ≈ 52 weeks of calendar — still inside the first year.
    expect(r.pace.phase1).toBe(0.5);
    expect(r.endsAt.getTime()).toBeLessThan(oneYear.getTime());
    expect(r.overrunDays).toBe(0);
  });

  it("floors the post-1-year pace at the SGI minimum (5 d/wk)", () => {
    const r = resolveStretch({ days: 100, start, oneYear, incomeDeadline });
    expect(r.pace.phase2).toBe(SGI_MIN_DAYS_PER_WEEK);
    // The slow first-year part lands the leave on the birthday, then the
    // remainder is drawn at 5/wk.
    expect(r.endsAt.getTime()).toBeGreaterThan(oneYear.getTime());
  });

  it("applies the full 5-day work week only when explicitly allowed", () => {
    // A period paced at 7 d/wk before the first birthday (if the user chose a
    // full pace) should not be floored down.
    const r = resolveStretch({
      days: 40,
      start,
      oneYear,
      incomeDeadline,
      phase1: WORK_WEEK,
      minPhase2: WORK_WEEK,
    });
    expect(r.pace.phase1).toBe(WORK_WEEK);
    // 40 days at 7/wk ≈ 40 calendar days.
    expect(r.endsAt.getTime()).toBeLessThan(oneYear.getTime());
  });

  it("reports income days that would run past the age-4 deadline", () => {
    // A huge number of days at 5/wk cannot finish before age 4.
    const r = resolveStretch({ days: 5000, start, oneYear, incomeDeadline });
    expect(r.overrunDays).toBeGreaterThan(0);
    expect(r.endsAt.getTime()).toBeGreaterThan(incomeDeadline.getTime());
  });

  it("ignores a start after the first birthday (phase 2 only)", () => {
    const lateStart = addDays(oneYear, 30);
    const r = resolveStretch({ days: 70, start: lateStart, oneYear, incomeDeadline });
    expect(r.pace.phase2).toBe(SGI_MIN_DAYS_PER_WEEK);
    expect(r.endsAt.getTime()).toBeGreaterThan(lateStart.getTime());
  });
});
