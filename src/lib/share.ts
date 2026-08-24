import type { PlanInput, ParentId } from "@/lib/calc";
import type { Objective } from "@/lib/optimizer";
import type { GoalMode } from "@/lib/goal-seek";

/**
 * Per-caregiver planning preferences, keyed by parent. The old flat `goalModeA`
 * / `goalModeB` … fields live here now, under one map — so the two caregivers
 * never drift apart in naming.
 */
export interface ShareParentPrefs {
  /** Target gross monthly for the "förläng ledigheten" goal. */
  minMonthly?: number;
  /** Take days at the full schedule ("full") or stretch to a floor ("prolong"). */
  paceMode?: "full" | "prolong";
  /** Optional second leave period: switch pace at the child's 1st birthday. */
  switchAt1?: boolean;
  /** Days/week during the first year (when `switchAt1`). */
  phase1?: number;
  /** Days/week after the 1st birthday (when `switchAt1`). */
  phase2?: number;
  /** Works the rest of the week while on reduced-pace leave. */
  worksPartTime?: boolean;
  /** Adjust paces manually, be home until a date, or the longest leave in budget. */
  goalMode?: GoalMode;
  /** ISO date (yyyy-mm-dd) for the "hemma till ett datum" goal. */
  goalDate?: string;
  /** UntilDate as a length — this many months from where the stretch begins. */
  goalMonths?: number;
  /** Net kr/month floor for the "längsta ledighet inom budget" goal. */
  goalBudget?: number;
  /** Days deliberately saved for later (klämdagar, lov …). */
  saveDays?: number;
  /** Optional later start of the period (ISO). */
  periodStart?: string;
  /** Employer top-up applies. */
  supplement?: boolean;
  /** How many months the employer top-up runs. */
  supplementMonths?: number;
  /** Percent of salary the top-up brings it to. */
  supplementPct?: number;
  /** Föräldrapenning days carried over from previous children. */
  extraDays?: number;
}

/**
 * The full planner state we can put in a shareable URL, so one partner can fill
 * it in and send it to the other. Everything stays client-side — the payload
 * lives in the URL fragment (`#p=…`), which browsers do not send to servers.
 */
export interface ShareableState {
  plan: PlanInput;
  objective: Objective;
  soloMode: boolean;
  hasUsedDays: boolean;
  detailedUsed: boolean;
  /** Per-caregiver preferences (goal, pace, save-days, föräldralön …). */
  parents: Record<ParentId, ShareParentPrefs>;
  /** Benefit days drawn per week — stretches the leave's calendar duration. */
  daysPerWeek?: number;
  /** Requested dubbeldagar (both parents home the same day). */
  doubleDays?: number;
  /** Share of the days to caregiver A (0–1) for the "egen fördelning" goal. */
  customSplitA?: number;
  /**
   * Which child this is for the family (1 = first, 2 = second, 3 = third,
   * 4 = fourth or later). From 2 the wizard asks about days carried over from
   * previous children.
   */
  childNumber?: number;
  /**
   * Whether to spend the 90 flat lägstanivå days (180 kr) in the plan. When
   * false they're saved and the leave ends as the income-based days run out.
   */
  includeLagsta?: boolean;
  /** Which caregiver takes their leave first (affects the timeline order). */
  firstCaregiver?: "A" | "B";
  /**
   * "10-dagar": tillfällig föräldrapenning the other parent draws around
   * birth, on top of the 480. On unless turned off.
   */
  birthDaysEnabled?: boolean;
  birthDaysCount?: number;
  /** Leftover föräldrapenning days carried over from previous children. */
  hasExtraDays?: boolean;
  /**
   * Kommunalskatt where they live, as a percentage. Rates run 28,93–35 %, and
   * at a 63 000 kr salary that is a spread of some 3 300 kr a month — so the
   * national average is only a starting point.
   */
  municipalRatePct?: number;
  /** Whether the vab (sick-child) step is included. */
  vabEnabled?: boolean;
  /** Number of children vab should cover (its own per-child allowance). */
  vabChildren?: number;
  /** Vab days already used this calendar year. */
  vabDaysUsedThisYear?: number;
  /** Wizard finished → land on the results view (vs. editing inputs). */
  submitted?: boolean;
  /** Which wizard step to reopen on — so resuming an unfinished plan picks
   *  up where it was left, not back at the start. */
  wizardStep?: number;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeState(state: ShareableState): string {
  return toBase64Url(JSON.stringify(state));
}

/** Decode a shared string back to state, or `null` if it's missing/corrupt. */
export function decodeState(encoded: string): ShareableState | null {
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(encoded));
    if (typeof parsed !== "object" || !parsed?.plan || !parsed?.parents) return null;
    return parsed as ShareableState;
  } catch {
    return null;
  }
}
