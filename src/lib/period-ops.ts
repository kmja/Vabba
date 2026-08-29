/**
 * period-ops.ts — Pure operations on the editable period list. These are the
 * CRUD primitives the UI calls (Add, Split, Reorder, Edit length), kept pure
 * and framework-agnostic so the behaviour is unit-testable. The UI is a thin
 * layer over these.
 */
import type { PeriodSpec } from "@/lib/share";

let counter = 0;
/** Stable unique id for periods created in-session / applied from the UI. */
export function newPeriodId(): string {
  counter += 1;
  return `period-${Date.now().toString(36)}-${counter}`;
}

/** Add a new period for a caregiver. Returns a new list. */
export function addPeriod(
  list: PeriodSpec[],
  caregiver: "A" | "B",
  kind: "fixed" | "leftover",
  days = 0,
): PeriodSpec[] {
  return [...list, { id: newPeriodId(), caregiver, kind, days }];
}

/**
 * Split a period into two, in place:
 *   - a `fixed` period → two fixed pieces: `splitDays` and `days - splitDays`.
 *   - a `leftover` period → one `fixed` piece of `splitDays` + one `leftover`
 *     (the remainder absorbs the leftover days).
 * Returns the new list (unchanged if `id` isn't found).
 */
export function splitPeriod(
  list: PeriodSpec[],
  id: string,
  splitDays: number,
): PeriodSpec[] {
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return list;
  const p = list[idx];
  const d = Math.max(0, Math.floor(splitDays));
  // The first piece is always `fixed` (a split sets a length on one side).
  const left: PeriodSpec = { id: p.id, caregiver: p.caregiver, kind: "fixed", days: d };
  const right: PeriodSpec =
    p.kind === "fixed"
      ? { id: newPeriodId(), caregiver: p.caregiver, kind: "fixed", days: Math.max(0, p.days - d) }
      : { id: newPeriodId(), caregiver: p.caregiver, kind: "leftover", days: 0 };
  return [...list.slice(0, idx), left, right, ...list.slice(idx + 1)];
}

/** Move a period to a new index (drag-and-drop reorder). */
export function reorderPeriods(
  list: PeriodSpec[],
  fromIndex: number,
  toIndex: number,
): PeriodSpec[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list;
  if (fromIndex >= list.length || toIndex >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/** Set a fixed period's length (days). Ignores leftover periods. */
export function editPeriodDays(
  list: PeriodSpec[],
  id: string,
  days: number,
): PeriodSpec[] {
  return list.map((p) =>
    p.id === id && p.kind === "fixed"
      ? { ...p, days: Math.max(0, Math.floor(days)) }
      : p,
  );
}
