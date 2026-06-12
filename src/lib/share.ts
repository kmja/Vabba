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
  /** Share of the days to caregiver A (0–1) for the "egen fördelning" goal. */
  customSplitA?: number;
  /** Which caregiver takes their leave first (affects the timeline order). */
  firstCaregiver?: "A" | "B";
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
