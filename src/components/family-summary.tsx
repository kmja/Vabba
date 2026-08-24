import { CaregiverPortrait } from "@/components/family-scene";
import { CaregiverSummary, type CaregiverInfo } from "@/components/caregiver-summary";

/**
 * Who is in this plan, at the top of the results: both portraits standing
 * together as one family — not two unrelated people — in the middle, with
 * each caregiver's own name, edit button, salary and goal flanking them on
 * the outside. Whoever is home first (holding the baby) is on the left, the
 * other on the right.
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
      {/* The two figures stand together, close — one family, not two strangers. */}
      <div className="min-w-0 flex-1">
        <CaregiverSummary {...first} />
      </div>
      <div className="flex shrink-0">
        <div className="aspect-[15/22] w-24 sm:w-40">
          <CaregiverPortrait second={false} holding />
        </div>
        <div className="aspect-[15/22] w-24 sm:w-40">
          <CaregiverPortrait second holding={false} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <CaregiverSummary {...second} />
      </div>
    </div>
  );
}
