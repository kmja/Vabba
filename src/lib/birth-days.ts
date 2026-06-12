/**
 * birth-days.ts — "10-dagar vid barns födelse": the ~10 days of tillfällig
 * föräldrapenning the *other* parent can draw around a birth, on top of the 480
 * föräldrapenning days. Same benefit type as vab, so it shares vab's mechanics
 * (≈80 % of SGI, capped at 7.5 prisbasbelopp — not föräldrapenning's 10).
 *
 * Pure and framework-agnostic.
 */

import {
  vabDailyAmount,
  isAboveVabSgiCap,
  ABOVE_VAB_CAP_MONTHLY_INCOME,
} from "@/lib/vab";

export const BIRTH_DAYS = {
  /** Standard number of days the second parent gets at a birth. */
  standardDays: 10,
  /** Must be taken within this many days of the child coming home. */
  withinDaysAfterHome: 60,
} as const;

export interface BirthDaysInput {
  /** Gross monthly income of the parent taking the days. */
  grossMonthlyIncome: number;
  incomeAboveCap?: boolean;
  /** How many of the days are taken (0–10). */
  days: number;
}

export interface BirthDaysResult {
  days: number;
  dailyAmount: number;
  total: number;
  /** True when income exceeds the tillfällig-FP ceiling (7.5 PBB). */
  sgiCapped: boolean;
}

export function computeBirthDays(input: BirthDaysInput): BirthDaysResult {
  const income = input.incomeAboveCap
    ? ABOVE_VAB_CAP_MONTHLY_INCOME
    : Math.max(0, input.grossMonthlyIncome);
  const days = Math.max(
    0,
    Math.min(BIRTH_DAYS.standardDays, Math.floor(input.days)),
  );
  const dailyAmount = vabDailyAmount(income);
  return {
    days,
    dailyAmount,
    total: days * dailyAmount,
    sgiCapped: isAboveVabSgiCap(income),
  };
}
