import { approxMonthlyGross } from "@/lib/format";
import { householdNet } from "@/lib/tax";

/**
 * One caregiver's leave, as the results page models it. The timeline renders a
 * detail card from this beside each Gantt bar; the levers adjust it.
 */
export interface MonthlyRow {
  name: string;
  /** Income-based (sjukpenningnivå) daily rate for this person. */
  dailyRate: number;
  /** Total days for this person (incl. any leftover from previous children). */
  days: number;
  /** This person's leave pace — may differ per caregiver under "förläng…". */
  daysPerWeek: number;
  /** Leftover days from previous children included in `days`, if any. */
  extraDays?: number;
  /** This caregiver's chosen pace goal, e.g. "Förläng ledigheten". */
  goalLabel?: string;
  /** Whether this caregiver's salary is above the SGI cap. */
  aboveCap?: boolean;
  /** Employer top-up (föräldralön) during the first months, if any. */
  supplement?: { monthly: number; total: number; months: number };
  /** Income-based days paid at grundnivå (240-day rule not met), if any. */
  grundnivaFirstDays?: number;
  /** Accurate total leave length in months (overrides the days/pace estimate). */
  leaveMonths?: number;
  /** Second leave period after the 1-year switch, if any. */
  secondPhase?: { daysPerWeek: number; monthly: number };
  /** The working partner's monthly salary, for the household total. */
  householdBase?: number;
  /** Name of the partner who is working during this caregiver's leave. */
  partnerWorking?: string;
  /** Part-time salary this caregiver earns on non-FP days (if working). */
  partTimeSalary?: number;
  /** Days deliberately left unused (saved for later) under a date goal. */
  savedDays?: number;
}

export function formatMonths(months: number): string {
  if (months < 1) return "< 1 mån";
  const n = months < 10 ? months.toFixed(1) : String(Math.round(months));
  return `≈ ${n.replace(".", ",")} mån`;
}

/** This caregiver's föräldrapenning + föräldralön at their pace. */
export function ownMonthly(r: MonthlyRow): number {
  return (
    approxMonthlyGross(r.dailyRate, r.daysPerWeek) + (r.supplement?.monthly ?? 0)
  );
}

/** Household income while this caregiver is on leave and the partner works. */
export function householdMonthly(r: MonthlyRow): number {
  return ownMonthly(r) + (r.partTimeSalary ?? 0) + (r.householdBase ?? 0);
}

/**
 * The same month after tax — each person taxed on their own income, split by
 * type. The leave-taker's föräldrapenning is a benefit (no jobbskatteavdrag);
 * the employer's föräldralön and any part-time work are salary, as is the
 * partner's pay.
 */
export function householdNetMonthly(
  r: MonthlyRow,
  municipalRate?: number,
): number {
  return householdNet(
    [
    {
      salary: (r.supplement?.monthly ?? 0) + (r.partTimeSalary ?? 0),
      benefit: approxMonthlyGross(r.dailyRate, r.daysPerWeek),
    },
      { salary: r.householdBase ?? 0 },
    ],
    municipalRate,
  );
}
