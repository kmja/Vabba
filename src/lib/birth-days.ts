/**
 * birth-days.ts — "10-dagar vid barns födelse": the days of tillfällig
 * föräldrapenning the *other* parent can draw around a birth, on top of the 480
 * föräldrapenning days. Same benefit type as vab, so it shares vab's mechanics
 * (≈80 % of SGI, capped at 7.5 prisbasbelopp — not föräldrapenning's 10).
 *
 * The entitlement is per child, so a multiple birth doubles it (twins: 20).
 *
 * Pure and framework-agnostic.
 */

import {
  vabDailyAmount,
  isAboveVabSgiCap,
  ABOVE_VAB_CAP_MONTHLY_INCOME,
} from "@/lib/vab";

export const BIRTH_DAYS = {
  /** Days the other parent gets, per child born. */
  daysPerChild: 10,
  /** Must be taken within this many days of the child coming home. */
  withinDaysAfterHome: 60,
} as const;

/** The full entitlement for a birth — 10 per child, so twins give 20. */
export function birthDaysFor(childrenInBirth = 1): number {
  return BIRTH_DAYS.daysPerChild * Math.max(1, Math.floor(childrenInBirth));
}

export interface BirthDaysInput {
  /** Gross monthly income of the parent taking the days. */
  grossMonthlyIncome: number;
  incomeAboveCap?: boolean;
  /** How many of the days are taken (0 – the full entitlement). */
  days: number;
  /** Children born together — 1 unless it is a multiple birth. */
  childrenInBirth?: number;
}

export interface BirthDaysResult {
  days: number;
  /** The full entitlement for this birth, which `days` is capped to. */
  maxDays: number;
  dailyAmount: number;
  total: number;
  /** True when income exceeds the tillfällig-FP ceiling (7.5 PBB). */
  sgiCapped: boolean;
}

export function computeBirthDays(input: BirthDaysInput): BirthDaysResult {
  const income = input.incomeAboveCap
    ? ABOVE_VAB_CAP_MONTHLY_INCOME
    : Math.max(0, input.grossMonthlyIncome);
  const maxDays = birthDaysFor(input.childrenInBirth);
  const days = Math.max(0, Math.min(maxDays, Math.floor(input.days)));
  const dailyAmount = vabDailyAmount(income);
  return {
    days,
    maxDays,
    dailyAmount,
    total: days * dailyAmount,
    sgiCapped: isAboveVabSgiCap(income),
  };
}
