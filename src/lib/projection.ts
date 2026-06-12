/**
 * projection.ts — Turn a caregiver's allocated days into dated leave intervals.
 *
 * A caregiver draws their days over calendar time at a *pace schedule* (days per
 * week, which can change at a milestone — e.g. drop the pace during the child's
 * first year, then go to 5/week to keep SGI). Within a stretch they take the
 * valuable income-based days before the flat lägstanivå ones. This module walks
 * those rules into concrete [start, end] intervals the timeline and Gantt draw.
 *
 * Pure and framework-agnostic.
 */

import { addDays, differenceInDays } from "@/lib/dates";

const DAYS_PER_MONTH = 30.4;

export interface PaceBreak {
  /** This pace applies up to (and excluding) `until`; `null` = no upper bound. */
  until: Date | null;
  /** Days drawn per week during this stretch. */
  pace: number;
}

export interface LeaveBlock {
  caregiver?: string;
  tier: "income" | "lagsta";
  days: number;
  /** Daily kr (for the monthly estimate on each interval). */
  rate: number;
  /** How the pace changes over calendar time. */
  schedule: PaceBreak[];
}

export interface LeaveInterval {
  startsAt: Date;
  endsAt: Date;
  pace: number;
  /** Approx gross kr per calendar month during this interval. */
  monthly: number;
  tier: "income" | "lagsta";
  caregiver?: string;
}

function monthlyAt(rate: number, pace: number): number {
  return Math.round((rate * pace * DAYS_PER_MONTH) / 7);
}

/** The pace stretch that covers `cursor` (the first whose `until` is later). */
function breakAt(schedule: PaceBreak[], cursor: Date): PaceBreak {
  for (const b of schedule) {
    if (b.until === null || b.until.getTime() > cursor.getTime()) return b;
  }
  return schedule[schedule.length - 1];
}

/**
 * Walk the blocks (in order) into dated intervals, starting at `start`. The
 * cursor carries across blocks, so the second caregiver begins when the first
 * one's days run out.
 */
export function buildLeaveIntervals(
  start: Date,
  blocks: LeaveBlock[],
): LeaveInterval[] {
  const out: LeaveInterval[] = [];
  let cursor = start;

  for (const block of blocks) {
    if (block.days <= 0) continue;
    let remaining = block.days;
    let guard = 0;

    while (remaining > 0.001 && guard++ < 200) {
      const brk = breakAt(block.schedule, cursor);
      const pace = brk.pace > 0 ? brk.pace : 7;

      let take = remaining;
      let end: Date;
      if (brk.until) {
        const calDays = differenceInDays(cursor, brk.until);
        const fits = (Math.max(0, calDays) / 7) * pace;
        if (fits < remaining) {
          take = fits;
          end = brk.until;
        } else {
          end = addDays(cursor, Math.round((remaining / pace) * 7));
        }
      } else {
        end = addDays(cursor, Math.round((remaining / pace) * 7));
      }

      if (end.getTime() > cursor.getTime()) {
        out.push({
          startsAt: cursor,
          endsAt: end,
          pace,
          monthly: monthlyAt(block.rate, pace),
          tier: block.tier,
          caregiver: block.caregiver,
        });
      }
      cursor = end;
      remaining -= take;
    }
  }

  return out;
}

/** Total calendar days to draw `days` from `start` at the given schedule. */
export function leaveDurationDays(
  start: Date,
  days: number,
  schedule: PaceBreak[],
): number {
  if (days <= 0) return 0;
  let cursor = start;
  let remaining = days;
  let total = 0;
  let guard = 0;

  while (remaining > 0.001 && guard++ < 200) {
    const brk = breakAt(schedule, cursor);
    const pace = brk.pace > 0 ? brk.pace : 7;
    if (brk.until) {
      const calDays = Math.max(0, differenceInDays(cursor, brk.until));
      const fits = (calDays / 7) * pace;
      if (fits < remaining) {
        total += calDays;
        cursor = brk.until;
        remaining -= fits;
        continue;
      }
    }
    total += Math.round((remaining / pace) * 7);
    remaining = 0;
  }
  return total;
}

/** Convenience: a caregiver's total leave length in (approximate) months. */
export function leaveMonths(
  start: Date,
  days: number,
  schedule: PaceBreak[],
): number {
  return leaveDurationDays(start, days, schedule) / DAYS_PER_MONTH;
}
