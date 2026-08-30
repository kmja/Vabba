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
  oneYear: Date | null,
): LeaveInterval[] {
  const out: LeaveInterval[] = [];
  const append = (p: DatedPeriod, startsAt: Date, endsAt: Date, pace: number) => {
    const daily = p.tier === "lagsta" ? lagstaRate : rateOf(p.caregiver);
    out.push({
      startsAt,
      endsAt,
      pace,
      monthly: Math.round((daily * pace * DAYS_PER_MONTH) / 7),
      tier: p.tier,
      caregiver: names[p.caregiver],
      periodId: p.id,
    });
  };

  for (const p of periods) {
    if (p.days <= 0 || p.kind === "birth") continue;
    const p1 = Math.max(0.5, p.pace.phase1);
    const p2 = Math.max(0.5, p.pace.phase2);
    const s = p.startsAt.getTime();
    const e = p.endsAt.getTime();
    const one = oneYear?.getTime() ?? null;

    if (one != null && s < one && one < e) {
      append(p, p.startsAt, new Date(one), p1);
      append(p, new Date(one), p.endsAt, p2);
    } else if (one != null && e <= one) {
      append(p, p.startsAt, p.endsAt, p1);
    } else {
      append(p, p.startsAt, p.endsAt, p2);
    }
  }
  return out;
}
