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
  /** Total top-up actually collected (after the window / leave-length cap). */
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
  /**
   * The caregiver's whole leave length, in calendar months. The top-up is paid
   * on leave days, so it can never run longer than the leave itself — and the
   * leave is bounded by the SGI pace floor after the 1st birthday. Pass the
   * leave length so a slow pace can't stretch the top-up past reality.
   */
  leaveMonths?: number;
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

  // The agreement pays a fixed number of leave days' worth, so a low pace
  // stretches that money over more calendar months. It can't outlast the
  // leave itself — which the SGI pace floor after the 1st birthday already
  // bounds, so no unrealistic multi-year stretch.
  const stretched = (input.months * 7) / pace;
  const months = Math.round((input.leaveMonths ? Math.min(stretched, input.leaveMonths) : stretched) * 10) / 10;

  return {
    monthly,
    total: Math.round(monthly * months),
    months: Math.max(0.1, months),
    basedOnSalary: salary,
  };
}
