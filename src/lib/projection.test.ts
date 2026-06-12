import { describe, it, expect } from "vitest";

import {
  buildLeaveIntervals,
  leaveDurationDays,
  type LeaveBlock,
  type PaceBreak,
} from "@/lib/projection";
import { addDays, addYears, differenceInDays } from "@/lib/dates";

const BIRTH = new Date(2025, 0, 1);
const single: PaceBreak[] = [{ until: null, pace: 7 }];

describe("buildLeaveIntervals", () => {
  it("lays out one block at a steady pace", () => {
    const blocks: LeaveBlock[] = [
      { tier: "income", days: 70, rate: 1000, schedule: single },
    ];
    const [iv] = buildLeaveIntervals(BIRTH, blocks);
    // 70 days at 7/week = 10 weeks = 70 calendar days.
    expect(differenceInDays(iv.startsAt, iv.endsAt)).toBe(70);
    expect(iv.pace).toBe(7);
    expect(iv.tier).toBe("income");
  });

  it("carries the cursor across blocks (income then lägsta)", () => {
    const blocks: LeaveBlock[] = [
      { tier: "income", days: 70, rate: 1000, schedule: single },
      { tier: "lagsta", days: 70, rate: 180, schedule: single },
    ];
    const ivs = buildLeaveIntervals(BIRTH, blocks);
    expect(ivs).toHaveLength(2);
    expect(ivs[1].startsAt.getTime()).toBe(ivs[0].endsAt.getTime());
    expect(differenceInDays(BIRTH, ivs[1].endsAt)).toBe(140);
  });

  it("splits a block at a pace break (slow first year, then faster)", () => {
    const oneYear = addYears(BIRTH, 1);
    const schedule: PaceBreak[] = [
      { until: oneYear, pace: 3 },
      { until: null, pace: 5 },
    ];
    // 365 days at 3/week ≈ 156 days fit in the first year; the rest at 5/week.
    const blocks: LeaveBlock[] = [
      { tier: "income", days: 300, rate: 1000, schedule },
    ];
    const ivs = buildLeaveIntervals(BIRTH, blocks);
    expect(ivs.length).toBeGreaterThanOrEqual(2);
    expect(ivs[0].pace).toBe(3);
    expect(ivs[0].endsAt.getTime()).toBe(oneYear.getTime());
    expect(ivs[ivs.length - 1].pace).toBe(5);
  });

  it("uses only the post-break pace when starting after the break", () => {
    const oneYear = addYears(BIRTH, 1);
    const schedule: PaceBreak[] = [
      { until: oneYear, pace: 3 },
      { until: null, pace: 5 },
    ];
    const start = addDays(oneYear, 30); // already past the first year
    const blocks: LeaveBlock[] = [
      { tier: "income", days: 50, rate: 1000, schedule },
    ];
    const ivs = buildLeaveIntervals(start, blocks);
    expect(ivs).toHaveLength(1);
    expect(ivs[0].pace).toBe(5);
  });
});

describe("leaveDurationDays", () => {
  it("matches a simple days/pace calculation", () => {
    expect(leaveDurationDays(BIRTH, 140, single)).toBe(140); // 7/week
    expect(leaveDurationDays(BIRTH, 70, [{ until: null, pace: 3.5 }])).toBe(140);
  });

  it("is longer when the first year is slow", () => {
    const oneYear = addYears(BIRTH, 1);
    const slowFirst: PaceBreak[] = [
      { until: oneYear, pace: 3 },
      { until: null, pace: 7 },
    ];
    const steady = leaveDurationDays(BIRTH, 300, [{ until: null, pace: 7 }]);
    const phased = leaveDurationDays(BIRTH, 300, slowFirst);
    expect(phased).toBeGreaterThan(steady);
  });
});
