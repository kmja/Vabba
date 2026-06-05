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
