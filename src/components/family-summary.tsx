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
    <div className="flex flex-col items-center gap-4">
      {/* The two figures stand together, close — the second overlaps the
          first a little so they read as one pair, not two strangers. */}
      <div className="flex items-end justify-center">
        <div className="aspect-[15/22] w-24 sm:w-32">
          <CaregiverPortrait second={false} holding />
        </div>
        <div className="aspect-[15/22] w-24 -ml-3 sm:w-32 sm:-ml-4">
          <CaregiverPortrait second holding={false} />
        </div>
      </div>
      {/* Each caregiver's facts on their own side, under their own figure. */}
      <div className="grid w-full max-w-2xl grid-cols-2 items-start gap-x-6 gap-y-3">
        <CaregiverSummary {...first} />
        <CaregiverSummary {...second} />
      </div>
    </div>
  );
}
