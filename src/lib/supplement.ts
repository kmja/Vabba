/**
 * supplement.ts — Employer parental-leave top-up ("föräldralön" /
 * "föräldrapenningtillägg"), the extra money most Swedish collective agreements
 * (kollektivavtal) pay on top of Försäkringskassan's föräldrapenning.
 *
 * Agreements vary, but the common shape is: for a limited number of months the
 * employer tops your pay up to ~90 % of your *gross salary*. Since FK only pays
 * on income up to the SGI cap, the employer effectively covers ~10 % below the
 * cap **and ~90 % of the salary above the cap** — the part FK ignores entirely.
 * That above-cap compensation is the whole reason this matters for high earners.
 *
 * Pure and framework-agnostic so it can be unit-tested in isolation.
 */

import { MONEY } from "@/lib/rules";

/** Monthly salary level at the SGI cap (592 000 / 12 ≈ 49 333 kr, 2026). */
const CAP_MONTHLY = Math.round(MONEY.sgiAnnualCap / 12);

/** Days per month, matching the duration helpers used elsewhere. */
const DAYS_PER_MONTH = 30.4;

export interface SupplementResult {
  /** Top-up per calendar month, at the caregiver's leave pace. */
  monthly: number;
  /** Total top-up collected over the whole duration. */
  total: number;
  /** How many calendar months it lasts at this pace. */
  months: number;
  /** The salary the estimate is based on (cap level if only "above cap" known). */
  basedOnSalary: number;
}

export interface SupplementInput {
  /** Actual gross monthly salary, if known (0 when only "above cap" was flagged). */
  grossMonthlySalary: number;
  incomeAboveCap: boolean;
  /** Top salary up to this percent during the period (typically ~90). */
  pct: number;
  /** Number of full-time months the employer pays the top-up (typically ~6). */
  months: number;
  /** The caregiver's FK income-based daily rate (already capped). */
  fkDailyRate: number;
  /** The caregiver's leave pace, days/week. The top-up scales with it. */
  pace: number;
}

/**
 * Estimate the employer top-up. Returns `null` when it doesn't apply (no salary
 * known, zero months/percent, or FK already covers the target).
 */
export function computeSupplement(input: SupplementInput): SupplementResult | null {
  const salary =
    input.grossMonthlySalary > 0
      ? input.grossMonthlySalary
      : input.incomeAboveCap
        ? CAP_MONTHLY
        : 0;
  if (salary <= 0 || input.pct <= 0 || input.months <= 0) return null;

  // FK's monthly amount at full-time leave, from the (capped) daily rate.
  const fkFull = input.fkDailyRate * DAYS_PER_MONTH;
  const topUpFull = (input.pct / 100) * salary - fkFull;
  if (topUpFull <= 0) return null;

  const pace = input.pace > 0 ? Math.min(7, input.pace) : 7;
  const monthly = Math.round(topUpFull * (pace / 7));

  // The agreement pays a fixed number of leave days' worth, so a half pace
  // stretches that top-up over twice the calendar time — for as long as the
  // user's entered months imply. No extra post-birth cutoff is assumed.
  const stretched = (input.months * 7) / pace;
  // Kept to one decimal rather than whole months: rounding 8,4 months down
  // to 8 quietly lost 5 % of the total, so the breakdown stopped adding up
  // to the headline.
  const months = Math.round(stretched * 10) / 10;

  return {
    monthly,
    total: Math.round(monthly * months),
    months: Math.max(0.1, months),
    basedOnSalary: salary,
  };
}
