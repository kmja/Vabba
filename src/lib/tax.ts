/**
 * tax.ts — income tax for one person's month, so a household's net income is
 * the sum of what each of them actually keeps rather than one flat rate on the
 * total.
 *
 * Three things make that difference material, and all three are per person:
 *
 *  - **Jobbskatteavdrag** reduces tax on *arbetsinkomst* only — salary,
 *    part-time salary, the employer's föräldralön. It never applies to
 *    föräldrapenning, so a benefit krona is taxed harder than a salary krona
 *    at the same level. Taxing a household total at one rate hides this
 *    entirely, and it is the single biggest error in doing so.
 *  - **Grundavdrag** is a per-person allowance that shrinks as income rises.
 *  - **Statlig inkomstskatt** is 20 % above a per-person threshold, so one
 *    earner on 80 000 kr pays far more than two on 40 000 each.
 *
 * This is a model of the real tables, not the tables themselves: it uses the
 * national average municipal rate, ignores kyrkoavgift, begravningsavgift, and
 * the higher grundavdrag from the year you turn 66. Every figure the app shows
 * from it is marked "≈".
 *
 * Pure and framework-agnostic.
 */

import { MONEY } from "@/lib/rules";

const PBB = MONEY.prisbasbelopp;

export const TAX_MODEL = {
  /**
   * Statlig inkomstskatt: 20 % of taxable income above the skiktgräns.
   * 2026: 643 000 kr (brytpunkt 660 400 for under-66s). Source: Skatteverket,
   * "Belopp och procent inkomstår 2026". Indexed yearly — re-check.
   */
  stateRate: 0.2,
  stateThresholdAnnual: 643_000,
} as const;

/**
 * Kommunalskatt (kommun + region), the national average for 2026 — SCB puts
 * it at 32,38 %, down 3 öre from 2025. It is only an average: rates run from
 * 28,93 % (Österåker) to about 35 % (Dorotea), which at a 63 000 kr salary is
 * a spread of some 3 300 kr a month. Every function here takes the real rate
 * as an argument for that reason; this is just the fallback.
 */
export const DEFAULT_MUNICIPAL_RATE = 0.3238;

/** What someone is paid in a month, split by how it is taxed. */
export interface PersonIncome {
  /** Arbetsinkomst: salary, part-time salary, employer föräldralön. */
  salary?: number;
  /** Benefit: föräldrapenning, tillfällig föräldrapenning. No JSA. */
  benefit?: number;
}

/**
 * Grundavdrag for a year's total income, in the statutory bands (expressed as
 * multiples of prisbasbelopp, which is why it tracks PBB automatically).
 */
function grundavdrag(annual: number): number {
  const i = annual / PBB;
  const pbbUnits =
    i <= 0.99
      ? 0.423
      : i <= 2.72
        ? 0.423 + 0.2 * (i - 0.99)
        : i <= 3.11
          ? 0.77
          : i <= 7.88
            ? 0.77 - 0.1 * (i - 3.11)
            : 0.293;
  // The tables round to whole hundreds.
  return Math.min(annual, Math.round((pbbUnits * PBB) / 100) * 100);
}

/**
 * Jobbskatteavdrag on a year's arbetsinkomst. A tax *credit*, so it is
 * subtracted from the tax due — and only earned income creates it, which is
 * what separates a month on föräldrapenning from a month at work.
 */
function jobbskatteavdrag(
  earnedAnnual: number,
  deduction: number,
  municipalRate: number,
): number {
  if (earnedAnnual <= 0) return 0;
  const a = earnedAnnual / PBB;
  const g = deduction / PBB;
  const base =
    a <= 0.91
      ? a - g
      : a <= 3.24
        ? 0.91 + 0.3874 * (a - 0.91) - g
        : a <= 8.08
          ? 1.812 + 0.1 * (a - 3.24) - g
          : 2.296 - g;
  return Math.max(0, base * PBB * municipalRate);
}

/** A year's income tax for one person, given the split by income type. */
function annualTax(
  { salary = 0, benefit = 0 }: PersonIncome,
  municipalRate: number,
): number {
  const earned = Math.max(0, salary) * 12;
  const benefits = Math.max(0, benefit) * 12;
  const total = earned + benefits;
  if (total <= 0) return 0;

  const deduction = grundavdrag(total);
  const taxable = Math.max(0, total - deduction);
  const municipal = taxable * municipalRate;
  const state =
    Math.max(0, taxable - TAX_MODEL.stateThresholdAnnual) * TAX_MODEL.stateRate;
  // The credit cannot exceed the municipal tax it is credited against.
  const credit = Math.min(
    municipal,
    jobbskatteavdrag(earned, deduction, municipalRate),
  );
  return Math.max(0, municipal + state - credit);
}

/** What one person keeps of a month's income, at their municipal rate. */
export function monthlyNet(
  income: PersonIncome,
  municipalRate = DEFAULT_MUNICIPAL_RATE,
): number {
  const { salary = 0, benefit = 0 } = income;
  return Math.round(
    Math.max(0, salary) +
      Math.max(0, benefit) -
      annualTax(income, municipalRate) / 12,
  );
}

/** What the household keeps — each person taxed on their own income. */
export function householdNet(
  people: PersonIncome[],
  municipalRate = DEFAULT_MUNICIPAL_RATE,
): number {
  return people.reduce((sum, p) => sum + monthlyNet(p, municipalRate), 0);
}

/**
 * The share of one more krona that is lost to tax at this income — for money
 * that arrives on top of what someone already earns, like vab or the days
 * around a birth, where the marginal rate is what they actually feel.
 */
export function marginalRate(
  income: PersonIncome,
  extraIsBenefit = true,
  municipalRate = DEFAULT_MUNICIPAL_RATE,
): number {
  const step = 1000 / 12; // a small monthly bump, annualised inside annualTax
  const bumped: PersonIncome = extraIsBenefit
    ? { ...income, benefit: (income.benefit ?? 0) + step }
    : { ...income, salary: (income.salary ?? 0) + step };
  const extraTax =
    annualTax(bumped, municipalRate) - annualTax(income, municipalRate);
  return Math.min(0.7, Math.max(0, extraTax / (step * 12)));
}

/** A lump sum's net, taxed at the marginal rate of the income it lands on. */
export function netOfExtra(
  total: number,
  alongside: PersonIncome,
  extraIsBenefit = true,
  municipalRate = DEFAULT_MUNICIPAL_RATE,
): number {
  return Math.round(
    total * (1 - marginalRate(alongside, extraIsBenefit, municipalRate)),
  );
}
