import type { ShareableState, ShareParentPrefs } from "@/lib/share";
import type { GoalMode } from "@/lib/goal-seek";
import type { ParentId, ParentInput } from "@/lib/calc";

/**
 * A reusable slice of a caregiver's info, so you don't retype name, income,
 * föräldralön and goal settings for every new plan. Kept alongside saved plans
 * in localStorage (its own key), and applied to a parent when you create a plan.
 */
export interface CaregiverProfile {
  id: string;
  /** The caregiver's display name (also used to spot duplicates). */
  name: string;
  grossMonthlyIncome: number;
  incomeAboveCap: boolean;
  meets240DayRule: boolean;
  supplement: boolean;
  supplementMonths: number;
  supplementPct: number;
  worksPartTime: boolean;
  extraDays: number;
  goalMode: GoalMode;
  goalDate: string;
  goalMonths: number;
  goalBudget: number;
  saveDays: number;
  savedAt: string;
}

export const CAREGIVERS_KEY = "foraldradagar.caregivers.v1";

/** Extract one caregiver's reusable info from the current plan. */
export function profileFromForm(form: ShareableState, id: ParentId): CaregiverProfile {
  const plan = form.plan.parents[id];
  const p: ShareParentPrefs = form.parents[id] ?? {};
  return {
    id: "",
    name: plan.name?.trim() ?? "",
    grossMonthlyIncome: plan.grossMonthlyIncome,
    incomeAboveCap: plan.incomeAboveCap ?? false,
    meets240DayRule: plan.meets240DayRule ?? true,
    supplement: p.supplement ?? true,
    supplementMonths: p.supplementMonths ?? 6,
    supplementPct: p.supplementPct ?? 90,
    worksPartTime: p.worksPartTime ?? false,
    extraDays: p.extraDays ?? 0,
    goalMode: p.goalMode ?? "budget",
    goalDate: p.goalDate ?? "",
    goalMonths: p.goalMonths ?? 6,
    goalBudget: p.goalBudget ?? 0,
    saveDays: p.saveDays ?? 20,
    savedAt: new Date().toISOString(),
  };
}

/** Apply a saved profile onto one caregiver of a (typically fresh) plan. */
export function applyProfile(
  form: ShareableState,
  id: ParentId,
  profile: CaregiverProfile,
): ShareableState {
  return {
    ...form,
    plan: {
      ...form.plan,
      parents: {
        ...form.plan.parents,
        [id]: {
          ...form.plan.parents[id],
          name: profile.name || undefined,
          grossMonthlyIncome: Math.max(0, profile.grossMonthlyIncome),
          incomeAboveCap: profile.incomeAboveCap || undefined,
          meets240DayRule: profile.meets240DayRule || undefined,
        } as ParentInput,
      },
    },
    parents: {
      ...form.parents,
      [id]: {
        ...form.parents[id],
        supplement: profile.supplement,
        supplementMonths: profile.supplementMonths,
        supplementPct: profile.supplementPct,
        worksPartTime: profile.worksPartTime,
        extraDays: profile.extraDays,
        goalMode: profile.goalMode,
        goalDate: profile.goalDate,
        goalMonths: profile.goalMonths,
        goalBudget: profile.goalBudget,
        saveDays: profile.saveDays,
      },
    },
  };
}

/** Upsert by name (no duplicates for the same person), returning the new list. */
export function upsertProfile(
  list: CaregiverProfile[],
  profile: CaregiverProfile,
  idOf: () => string,
): CaregiverProfile[] {
  const next = { ...profile, id: profile.id || idOf(), savedAt: new Date().toISOString() };
  const idx = list.findIndex((p) => p.name.toLowerCase() === next.name.toLowerCase());
  if (idx === -1) return [next, ...list];
  const updated = [...list];
  updated[idx] = next;
  return updated;
}
