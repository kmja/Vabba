/**
 * vab.ts — Encoded ruleset for tillfällig föräldrapenning ("vab", care of a
 * sick child). DELIBERATELY SEPARATE from the föräldrapenning rules/optimizer —
 * different mechanics (a per-child annual day allowance, a different income
 * ceiling). Framework-agnostic and pure, same as rules.ts.
 *
 * ⚠️  PLANNING AID, NOT OFFICIAL ADVICE. Verify against Försäkringskassan.
 *
 * VERIFICATION: figures checked against public sources in June 2026, for 2026.
 * Source: https://www.forsakringskassan.se/privatperson/foralder/vard-av-barn-vab
 */

export const VAB_RULESET_YEAR = 2026;
export const VAB_RULESET_VERIFIED_ON = "2026-06-04";
export const VAB_PRIMARY_SOURCE =
  "https://www.forsakringskassan.se/privatperson/foralder/vard-av-barn-vab";

// -----------------------------------------------------------------------------
// Day allowance (per child, per calendar year)
// -----------------------------------------------------------------------------

export const VAB_DAYS = {
  /** Standard: up to 120 vab days per child per year. */
  perChildPerYear: 120,
  /** A sole-custody parent gets up to 240 per child per year. */
  perChildPerYearSingleParent: 240,
} as const;

// -----------------------------------------------------------------------------
// Age rules
// -----------------------------------------------------------------------------

export const VAB_AGE = {
  /**
   * General lower bound: vab applies from 8 months. For a child younger than
   * this you normally use ordinary föräldrapenning instead.
   */
  minMonths: 8,
  /** Standard vab is available until the child turns 12. */
  standardUntilAge: 12,
  /**
   * Between 12 and 16, vab is only possible with a special certificate (e.g. a
   * doctor confirming the parent's presence was needed).
   */
  certificateUntilAge: 16,
} as const;

// -----------------------------------------------------------------------------
// Money — note the income ceiling differs from föräldrapenning (7.5 vs 10 PBB)
// -----------------------------------------------------------------------------

export const VAB_MONEY = {
  /** Prisbasbelopp 2026. */
  prisbasbelopp: 59_200,
  /** Tillfällig föräldrapenning is capped at 7.5 × prisbasbelopp (≠ FP's 10). */
  sgiCapMultiplier: 7.5,
  /** 7.5 × 59 200 = 444 000 kr (2026). */
  sgiAnnualCap: 7.5 * 59_200,
  sgiAdjustmentFactor: 0.97,
  replacementRate: 0.8,
  daysPerYearDivisor: 365,
  /** Highest vab amount per full day, 2026 (≈ 444000 × 0.97 × 0.8 / 365). */
  maxPerDay: 944,
} as const;

// -----------------------------------------------------------------------------
// Administrative rules (surfaced as info in the UI)
// -----------------------------------------------------------------------------

export const VAB_RULES = {
  /** A healthcare certificate is needed from the 8th day of a care period. */
  certificateFromDay: 8,
  /**
   * From 1 April 2026 an application must be filed within 30 days, otherwise no
   * compensation is paid.
   */
  applicationDeadlineDays: 30,
  /**
   * Vab days can be transferred to someone else who cares for the child (e.g. a
   * grandparent). TODO(confirm) the exact transfer caps with FK (sources cite
   * up to 45 days with joint custody / 90 with sole custody).
   */
  transfer: { jointCustodyMaxDays: 45, soleCustodyMaxDays: 90 },
} as const;

// -----------------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------------

export function estimateVabSgi(grossMonthlyIncome: number): number {
  const annual = Math.max(0, grossMonthlyIncome) * 12;
  return Math.min(annual, VAB_MONEY.sgiAnnualCap);
}

/**
 * Daily vab amount (≈ 80 % of SGI, capped at 7.5 PBB). Unlike föräldrapenning
 * there is no grundnivå floor — little/no SGI means little/no vab.
 */
export function vabDailyAmount(grossMonthlyIncome: number): number {
  const sgi = estimateVabSgi(grossMonthlyIncome);
  const raw = Math.round(
    (sgi * VAB_MONEY.sgiAdjustmentFactor * VAB_MONEY.replacementRate) /
      VAB_MONEY.daysPerYearDivisor,
  );
  return Math.min(raw, VAB_MONEY.maxPerDay);
}

export function vabDaysPerChildPerYear(singleParent: boolean): number {
  return singleParent
    ? VAB_DAYS.perChildPerYearSingleParent
    : VAB_DAYS.perChildPerYear;
}

export function isAboveVabSgiCap(grossMonthlyIncome: number): boolean {
  return grossMonthlyIncome * 12 > VAB_MONEY.sgiAnnualCap;
}

export type VabAgeStatus =
  | "underMinAge"
  | "standard"
  | "needsCertificate"
  | "ineligible";

/** Eligibility bucket for a child of a given age in months. */
export function vabAgeStatus(ageMonths: number): VabAgeStatus {
  if (ageMonths < VAB_AGE.minMonths) return "underMinAge";
  if (ageMonths < VAB_AGE.standardUntilAge * 12) return "standard";
  if (ageMonths < VAB_AGE.certificateUntilAge * 12) return "needsCertificate";
  return "ineligible";
}

// -----------------------------------------------------------------------------
// Simple calculator (vab is a day tracker, not an optimization problem)
// -----------------------------------------------------------------------------

export interface VabInput {
  grossMonthlyIncome: number;
  numberOfChildren: number;
  singleParent: boolean;
  /** Vab days already used this calendar year (across the children). */
  daysUsedThisYear: number;
}

export interface VabResult {
  /** Per-child annual allowance (120, or 240 for a sole-custody parent). */
  daysPerChild: number;
  /** Household capacity this year = children × per-child allowance. */
  annualCapacity: number;
  used: number;
  /** Days left this year, clamped at 0. */
  remaining: number;
  overUsed: boolean;
  dailyAmount: number;
  /** Estimated value of the remaining days at this income. */
  remainingValue: number;
  /** True when income exceeds the vab SGI ceiling. */
  sgiCapped: boolean;
}

export function computeVab(input: VabInput): VabResult {
  const daysPerChild = vabDaysPerChildPerYear(input.singleParent);
  const children = Math.max(0, Math.floor(input.numberOfChildren));
  const annualCapacity = children * daysPerChild;
  const used = Math.max(0, input.daysUsedThisYear);
  const remaining = Math.max(0, annualCapacity - used);
  const dailyAmount = vabDailyAmount(input.grossMonthlyIncome);

  return {
    daysPerChild,
    annualCapacity,
    used,
    remaining,
    overUsed: used > annualCapacity,
    dailyAmount,
    remainingValue: remaining * dailyAmount,
    sgiCapped: isAboveVabSgiCap(input.grossMonthlyIncome),
  };
}
