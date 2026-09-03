/**
 * plan-periods.ts — Bridge between the editable period list and the plan's
 * dated intervals shown on the results page.
 *
 * A period becomes one LeaveInterval before the child's 1st birthday and, if
 * it crosses it, a second one after — each at the pace the rules require (the
 * slow, SGI-shielded pace before 1, the SGI floor after). Splitting at the
 * birthday is what makes the "minimum 5 days/week after age 1" rule visible
 * and prices income correctly on each side. Income-based periods use the
 * caregiver's daily rate; lägstanivå periods use the flat rate.
 */
import type { DatedPeriod } from "@/lib/periods";
import type { LeaveInterval } from "@/lib/projection";

const DAYS_PER_MONTH = 30.4;

/**
 * Turn allocated, dated periods into the segments the period pager renders.
 * `caregiver` is set to the display name so the pager can group blocks and
 * match income rows. The birth window is owned by the pager's `birthDays`
 * logic, so it is not emitted here.
 */
export function periodIntervals(
  periods: DatedPeriod[],
  names: Record<"A" | "B", string>,
  rateOf: (cg: "A" | "B") => number,
  lagstaRate: number,
  _oneYear: Date | null,
): LeaveInterval[] {
  return periods
    .filter((p) => p.days > 0 && p.kind !== "birth")
    .map((p) => {
      const pace = Math.max(0.5, p.pace.phase1);
      const daily = p.tier === "lagsta" ? lagstaRate : rateOf(p.caregiver);
      return {
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        pace,
        monthly: Math.round((daily * pace * DAYS_PER_MONTH) / 7),
        tier: p.tier,
        caregiver: names[p.caregiver],
        periodId: p.id,
        kind: p.kind,
        days: p.days,
      };
    });
}
