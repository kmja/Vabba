import { CaregiverPortrait } from "@/components/family-scene";
import { CaregiverSummary, type CaregiverInfo } from "@/components/caregiver-summary";

/**
 * Who is in this plan, at the top of the results: both portraits standing
 * together as one family — not two unrelated people — close enough to
 * overlap slightly, with each caregiver's own name, edit button, salary and
 * goal laid out on their own side beneath their figure. Whoever is home
 * first (holding the baby) is on the left, the other on the right.
 *
 * Solo mode has no second caregiver to flank with, so it keeps the older,
 * simpler side-by-side shape.
 */
export function FamilySummary({
  first,
  second,
}: {
  first: CaregiverInfo;
  /** Null in solo mode. */
  second: CaregiverInfo | null;
}) {
  if (!second) {
    return (
      <div className="flex items-center gap-4">
        <div className="aspect-[15/22] w-24 shrink-0">
          <CaregiverPortrait second={false} holding />
        </div>
        <CaregiverSummary {...first} />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-6">
      {/* Each caregiver's facts on their own side. */}
      <div className="min-w-0 flex-1">
        <CaregiverSummary {...first} />
      </div>
      {/* The two figures stand close and overlap — one family huddled
          together. Each is cropped to its own figure (see the *_full.png
          assets) so both render the same height with their feet on the same
          baseline; the first (holding the baby) is in front, the second
          behind. */}
      <div className="flex shrink-0 items-end">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, decorative illustration */}
        <img
          src="/Caregiver1_full.png"
          alt=""
          className="pointer-events-none relative z-10 h-44 w-auto select-none sm:h-56"
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, decorative illustration */}
        <img
          src="/Caregiver2_empty_full.png"
          alt=""
          className="pointer-events-none relative -ml-4 h-44 w-auto select-none sm:-ml-5 sm:h-56"
        />
      </div>
      <div className="min-w-0 flex-1">
        <CaregiverSummary {...second} />
      </div>
    </div>
  );
}
