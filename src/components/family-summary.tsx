import { CaregiverPortrait } from "@/components/family-scene";
import { CaregiverSummary, type CaregiverInfo } from "@/components/caregiver-summary";

/**
 * Who is in this plan, at the top of the results: both portraits standing
 * together as one family — not two unrelated people — with each
 * caregiver's own name, edit button, salary and goal flanking them.
 * Whoever is home first (holding the baby) is on the left, the other on
 * the right, stacked above/below them on narrow screens.
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
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <div className="order-2 min-w-0 sm:order-1 sm:flex-1">
        <CaregiverSummary {...first} />
      </div>
      <div className="order-1 flex shrink-0 sm:order-2">
        <div className="aspect-[15/22] w-28 sm:w-40">
          <CaregiverPortrait second={false} holding />
        </div>
        <div className="aspect-[15/22] w-28 sm:w-40">
          <CaregiverPortrait second holding={false} />
        </div>
      </div>
      <div className="order-3 min-w-0 sm:flex-1">
        <CaregiverSummary {...second} />
      </div>
    </div>
  );
}
