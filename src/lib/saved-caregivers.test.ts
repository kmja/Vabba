import { describe, it, expect } from "vitest";

import {
  applyProfile,
  profileFromForm,
  upsertProfile,
  type CaregiverProfile,
} from "@/lib/saved-caregivers";
import type { ShareableState } from "@/lib/share";
import { defaultPlanInput } from "@/lib/calc";

const form: ShareableState = {
  plan: {
    ...defaultPlanInput(""),
    parents: {
      A: {
        name: "Niki",
        grossMonthlyIncome: 42000,
        incomeAboveCap: false,
        meets240DayRule: true,
        daysUsed: { sjukpenning: 0, lagsta: 0 },
      },
      B: {
        name: "Kalle",
        grossMonthlyIncome: 30000,
        daysUsed: { sjukpenning: 0, lagsta: 0 },
      },
    },
  },
  objective: "maxHousehold",
  soloMode: false,
  hasUsedDays: false,
  detailedUsed: false,
  parents: {
    A: {
      supplement: true,
      supplementMonths: 9,
      supplementPct: 95,
      worksPartTime: true,
      extraDays: 30,
      goalMode: "untilDate",
      goalDate: "2027-06-01",
      goalMonths: 6,
      goalBudget: 0,
      saveDays: 40,
    },
    B: {},
  },
};

const profile = (over: Partial<CaregiverProfile> = {}): CaregiverProfile => ({
  id: "p1",
  name: "Niki",
  grossMonthlyIncome: 42000,
  incomeAboveCap: false,
  meets240DayRule: true,
  supplement: true,
  supplementMonths: 9,
  supplementPct: 95,
  worksPartTime: true,
  extraDays: 30,
  goalMode: "budget",
  goalDate: "",
  goalMonths: 6,
  goalBudget: 0,
  saveDays: 20,
  savedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("saved caregiver profiles", () => {
  it("extracts a profile from the plan and its prefs", () => {
    const p = profileFromForm(form, "A");
    expect(p.name).toBe("Niki");
    expect(p.grossMonthlyIncome).toBe(42000);
    expect(p.supplementMonths).toBe(9);
    expect(p.worksPartTime).toBe(true);
    expect(p.extraDays).toBe(30);
    expect(p.meets240DayRule).toBe(true);
    expect(p.goalMode).toBe("untilDate");
    expect(p.goalDate).toBe("2027-06-01");
    expect(p.saveDays).toBe(40);
  });

  it("applies a profile onto a fresh plan's caregiver", () => {
    const fresh: ShareableState = {
      ...form,
      plan: defaultPlanInput(""),
      parents: { A: {}, B: {} },
    };
    const out = applyProfile(fresh, "A", profile());
    expect(out.plan.parents.A.name).toBe("Niki");
    expect(out.plan.parents.A.grossMonthlyIncome).toBe(42000);
    expect(out.parents.A.supplementMonths).toBe(9);
    expect(out.parents.A.goalMode).toBe("budget");
    expect(out.parents.A.saveDays).toBe(20);
    expect(out.plan.parents.B.name).toBeUndefined();
  });

  it("upserts by name so the same person isn't duplicated", () => {
    const next = upsertProfile([profile({ grossMonthlyIncome: 100 })], profile({ grossMonthlyIncome: 42000 }), () => "new");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("p1"); // updated in place, same id
    expect(next[0].grossMonthlyIncome).toBe(42000);
  });

  it("adds a genuinely new person to the end of the list", () => {
    const next = upsertProfile([], profile({ id: "", name: "Kalle" }), () => "fresh");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("fresh");
  });
});
