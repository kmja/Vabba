/**
 * plan-periods.ts — Bridge between the editable period list and the plan's
 * dated intervals shown on the results page.
 *
 * When the user has configured periods, we build the "Perioder" list from
 * those (via lib/periods + lib/stretch) instead of the goal-based solver. Each
 * period becomes a LeaveInterval: the dated stretch at its SGI-compliant post-
 * 1-year pace, with a monthly estimate from the caregiver's daily rate.
 */
import type { DatedPeriod } from "@/lib/periods";
import type { LeaveInterval } from "@/lib/projection";

const DAYS_PER_MONTH = 30.4;

/**
 * Turn allocated, dated periods into the segments the period pager renders.
 * `caregiver` is set to the display name so the pager can group blocks and
 * match income rows; the pace used is the post-1-year (SGI) pace. Income-based
 * periods use the caregiver's daily rate; lägstanivå periods use the flat rate.
 */
export function periodIntervals(
  periods: DatedPeriod[],
  names: Record<"A" | "B", string>,
  rateOf: (cg: "A" | "B") => number,
  lagstaRate: number,
): LeaveInterval[] {
  return periods
    .filter((p) => p.days > 0 && p.kind !== "birth")
    .map((p) => {
      const pace = Math.max(0.5, p.pace.phase2);
      const daily = p.tier === "lagsta" ? lagstaRate : rateOf(p.caregiver);
      return {
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        pace,
        monthly: Math.round((daily * pace * DAYS_PER_MONTH) / 7),
        tier: p.tier,
        caregiver: names[p.caregiver],
      };
    });
}
