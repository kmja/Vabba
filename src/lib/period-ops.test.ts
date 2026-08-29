import { describe, it, expect } from "vitest";

import {
  addPeriod,
  editPeriodDays,
  reorderPeriods,
  splitPeriod,
} from "@/lib/period-ops";
import type { PeriodSpec } from "@/lib/share";

describe("period-ops", () => {
  it("adds a period", () => {
    const next = addPeriod([], "A", "fixed", 30);
    expect(next).toHaveLength(1);
    expect(next[0].caregiver).toBe("A");
    expect(next[0].kind).toBe("fixed");
    expect(next[0].days).toBe(30);
  });

  it("splits a fixed period into two fixed pieces", () => {
    const list: PeriodSpec[] = [{ id: "a", caregiver: "A", kind: "fixed", days: 90 }];
    const next = splitPeriod(list, "a", 30);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ id: "a", kind: "fixed", days: 30 });
    expect(next[1]).toMatchObject({ kind: "fixed", days: 60 });
    expect(next[1].caregiver).toBe("A");
  });

  it("splits an as-long-as-possible period into fixed + leftover", () => {
    const list: PeriodSpec[] = [{ id: "b", caregiver: "B", kind: "leftover", days: 0 }];
    const next = splitPeriod(list, "b", 45);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ id: "b", kind: "fixed", days: 45 });
    expect(next[1]).toMatchObject({ kind: "leftover", days: 0 });
  });

  it("reorders a list", () => {
    const list: PeriodSpec[] = [
      { id: "1", caregiver: "A", kind: "fixed", days: 1 },
      { id: "2", caregiver: "B", kind: "fixed", days: 2 },
      { id: "3", caregiver: "A", kind: "fixed", days: 3 },
    ];
    const next = reorderPeriods(list, 2, 0);
    expect(next.map((p) => p.id)).toEqual(["3", "1", "2"]);
  });

  it("edits only fixed periods' length", () => {
    const list: PeriodSpec[] = [
      { id: "a", caregiver: "A", kind: "fixed", days: 10 },
      { id: "b", caregiver: "B", kind: "leftover", days: 0 },
    ];
    const next = editPeriodDays(list, "a", 40);
    expect(next[0].days).toBe(40);
    // leftover untouched (editPeriodDays ignores non-fixed)
    expect(next[1].days).toBe(0);
  });
});
