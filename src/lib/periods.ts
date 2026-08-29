/**
 * periods.ts — Solver for the editable leave-period list.
 *
 * The model: a plan is a list of leave PERIODS, each owned by one caregiver.
 * A period is either:
 *   - `fixed`: a specific LENGTH (days of leave) the user set, or
 *   - `leftover`: "as long as possible" — it takes whatever days are left.
 *
 * Allocation rules (per the product spec):
 *   1. Fixed periods take precedence — they consume their days from their
 *      caregiver's budget first.
 *   2. "As long as possible" periods claim the days left over from all the
 *      fixed periods.
 *   3. If BOTH caregivers have an "as long as possible" period, the leftover
 *      days are split between them; each is capped at their own remaining
 *      budget (a caregiver can't draw on the other's earmarked days). When a
 *      cap bites, the shortfall goes to the other caregiver so the leftover
 *      days are used where there's room.
 *
 * Every allocation honours the caregiver's remaining budget — a period can
 * never overdraw its caregiver's pot. Pure and framework-agnostic, so the
 * precedence rules are unit-testable in isolation.
 */

export type PeriodKind = "fixed" | "leftover";

export interface PeriodInput {
  id: string;
  caregiver: "A" | "B";
  kind: PeriodKind;
  /** Days of leave for a `fixed` period (ignored for `leftover`). */
  days: number;
}

export interface PeriodAllocation {
  id: string;
  caregiver: "A" | "B";
  kind: PeriodKind;
  /** Days actually allocated after the solve (never negative). */
  days: number;
}

export interface SolvePeriodsInput {
  periods: PeriodInput[];
  /** Total days each caregiver may draw (their pot). */
  budgets: Record<"A" | "B", number>;
}

export interface SolvePeriodsResult {
  allocations: PeriodAllocation[];
  /** Days left unused per caregiver after the solve (forfeited/saved). */
  unused: Record<"A" | "B", number>;
  /** e.g. a fixed period that exceeded its caregiver's budget. */
  warnings: string[];
}

export function solvePeriods(input: SolvePeriodsInput): SolvePeriodsResult {
  const budgets = { A: Math.max(0, input.budgets.A), B: Math.max(0, input.budgets.B) };
  const remaining = { A: budgets.A, B: budgets.B };
  const warnings: string[] = [];

  // 1. Fixed periods first, drawing from their own caregiver's budget.
  const allocations: PeriodAllocation[] = [];
  for (const p of input.periods) {
    if (p.kind !== "fixed") continue;
    const want = Math.max(0, Math.floor(p.days));
    const take = Math.min(want, remaining[p.caregiver]);
    if (take < want) {
      warnings.push(
        `Perioden "${p.id}" kräver ${want} dagar men bara ${take} finns kvar.`,
      );
    }
    allocations.push({ ...p, kind: "fixed", days: take });
    remaining[p.caregiver] -= take;
  }

  // Leftover days are a joint pool: what's left across both caregivers.
  const leftoverTotal = remaining.A + remaining.B;
  const leftovers = input.periods.filter((p) => p.kind === "leftover");

  if (leftoverTotal > 0 && leftovers.length > 0) {
    // 3. Even split when both caregivers have a leftover period; each capped
    //    at their own remaining budget.
    if (leftovers.length === 1) {
      const d = leftovers[0];
      const cap = remaining[d.caregiver];
      const give = Math.min(leftoverTotal, cap);
      allocations.push({ ...d, kind: "leftover", days: give });
      remaining[d.caregiver] -= give;
    } else {
      // Even split in intent; the shortfall from a capped side is given to
      // the other so available days aren't left on the table.
      let a = Math.floor(leftoverTotal / 2);
      let b = leftoverTotal - a;
      const capA = remaining.A;
      const capB = remaining.B;
      if (a > capA) { b += a - capA; a = capA; }
      if (b > capB) { a += b - capB; b = capB; }
      // Re-clamp in case the redistributed side also overflows (defensive).
      if (a > capA) { b += a - capA; a = capA; }
      if (b > capB) { a += b - capB; b = capB; }
      const da = leftovers.find((p) => p.caregiver === "A");
      const db = leftovers.find((p) => p.caregiver === "B");
      if (da) { allocations.push({ ...da, kind: "leftover", days: a }); remaining.A -= a; }
      if (db) { allocations.push({ ...db, kind: "leftover", days: b }); remaining.B -= b; }
    }
  }

  // For each leftover period that got nothing (e.g. no days left), report it.
  for (const p of leftovers) {
    if (!allocations.some((al) => al.id === p.id)) {
      allocations.push({ ...p, kind: "leftover", days: 0 });
    }
  }

  return { allocations, unused: remaining, warnings };
}
