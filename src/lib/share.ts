import type { PlanInput } from "@/lib/calc";
import type { Objective } from "@/lib/optimizer";

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
  /** Benefit days drawn per week — stretches the leave's calendar duration. */
  daysPerWeek?: number;
  /** Requested dubbeldagar (both parents home the same day). */
  doubleDays?: number;
  /** Legacy single target (kept so older links/storage still decode). */
  minMonthly?: number;
  /** Per-caregiver target gross monthly for the "förläng ledigheten" goal. */
  minMonthlyA?: number;
  minMonthlyB?: number;
  /**
   * Each caregiver's pace goal, set independently: take days at the full
   * schedule ("full") or stretch them out to a monthly floor ("prolong").
   */
  paceModeA?: "full" | "prolong";
  paceModeB?: "full" | "prolong";
  /**
   * Optional second leave period: switch pace at the child's 1st birthday
   * (the SGI milestone). `phase1*` is the days/week during the first year,
   * `phase2*` after it.
   */
  switchAt1A?: boolean;
  switchAt1B?: boolean;
  phase1A?: number;
  phase1B?: number;
  phase2A?: number;
  phase2B?: number;
  /** Share of the days to caregiver A (0–1) for the "egen fördelning" goal. */
  customSplitA?: number;
  /**
   * Whether to spend the 90 flat lägstanivå days (180 kr) in the plan. When
   * false they're saved and the leave ends as the income-based days run out.
   */
  includeLagsta?: boolean;
  /** Which caregiver takes their leave first (affects the timeline order). */
  firstCaregiver?: "A" | "B";
  /**
   * Employer top-up during leave (föräldralön / föräldrapenningtillägg from a
   * kollektivavtal), per caregiver: whether it applies, for how many months, and
   * the percent of salary it tops up to.
   */
  supplementA?: boolean;
  supplementB?: boolean;
  supplementMonthsA?: number;
  supplementMonthsB?: number;
  supplementPctA?: number;
  supplementPctB?: number;
  /**
   * "10-dagar": tillfällig föräldrapenning the other parent draws around birth,
   * on top of the 480. Which caregiver takes them and how many (0–10).
   */
  birthDaysEnabled?: boolean;
  birthDaysCaregiver?: "A" | "B";
  birthDaysCount?: number;
  /** Leftover föräldrapenning days carried over from previous children. */
  hasExtraDays?: boolean;
  extraDaysA?: number;
  extraDaysB?: number;
  /** Whether the vab (sick-child) step is included. */
  vabEnabled?: boolean;
  /** Number of children vab should cover (its own per-child allowance). */
  vabChildren?: number;
  /** Vab days already used this calendar year. */
  vabDaysUsedThisYear?: number;
  /** Wizard finished → land on the results view (vs. editing inputs). */
  submitted?: boolean;
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
    if (!parsed || typeof parsed !== "object" || !parsed.plan) return null;
    return parsed as ShareableState;
  } catch {
    return null;
  }
}
