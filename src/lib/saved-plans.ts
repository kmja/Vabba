import type { ShareableState } from "@/lib/share";

/** A named snapshot of a completed plan, kept alongside the working plan. */
export interface SavedPlan {
  id: string;
  name: string;
  /** ISO datetime of the last save. */
  savedAt: string;
  state: ShareableState;
}

export const SAVED_PLANS_KEY = "foraldradagar.savedPlans.v1";
export const ACTIVE_SAVED_PLAN_KEY = "foraldradagar.activeSavedPlanId.v1";

/** A short label for a plan, derived from the caregiver names already on it. */
export function planLabel(state: ShareableState): string {
  const a = state.plan.parents.A.name?.trim();
  const b = state.plan.parents.B.name?.trim();
  if (state.soloMode) return a || "Namnlös plan";
  if (a && b) return `${a} & ${b}`;
  return a || b || "Namnlös plan";
}

export function newPlanId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  }
}
