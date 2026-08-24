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
          together. `cover` crops the artwork's transparent padding so the
          figures meet; the first (holding the baby) is in front, the second
          behind. Equal-height boxes keep the pair level. */}
      <div className="flex shrink-0 items-end">
        <div className="relative z-10 h-44 w-20 sm:h-56 sm:w-28">
          <CaregiverPortrait second={false} holding cover />
        </div>
        <div className="relative -ml-5 h-44 w-20 sm:h-56 sm:-ml-6 sm:w-28">
          <CaregiverPortrait second holding={false} cover />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <CaregiverSummary {...second} />
      </div>
    </div>
  );
}
