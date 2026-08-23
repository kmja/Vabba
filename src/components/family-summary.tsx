import { CaregiverPortrait } from "@/components/family-scene";
import { CaregiverSummary, type CaregiverInfo } from "@/components/caregiver-summary";

/**
 * Who is in this plan, at the top of the results. Both portraits sit
 * together in the middle — the family, not two unrelated people — with
 * each caregiver's own summary and edit button flanking them: whoever is
 * home first on the left (holding the baby), the other on the right.
 *
 * Solo mode has no second caregiver to flank with, so it keeps the older,
 * simpler side-by-side shape.
 */
export function FamilySummary({
  first,
  second,
  babyCount,
}: {
  first: CaregiverInfo;
  /** Null in solo mode. */
  second: CaregiverInfo | null;
  babyCount: number;
}) {
  if (!second) {
    return (
      <div className="flex items-stretch gap-3">
        <div className="aspect-[15/22] w-16 shrink-0 self-start">
          <CaregiverPortrait second={false} holding babyCount={babyCount} />
        </div>
        <div className="min-w-0 flex-1">
          <CaregiverSummary {...first} second={false} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-3 sm:flex-row">
      <div className="order-2 min-w-0 sm:order-1 sm:flex-1">
        <CaregiverSummary {...first} second={false} />
      </div>
      <div className="order-1 flex shrink-0 items-end justify-center gap-1.5 sm:order-2">
        <div className="aspect-[15/22] w-20 sm:w-[4.5rem]">
          <CaregiverPortrait second={false} holding babyCount={babyCount} />
        </div>
        <div className="aspect-[15/22] w-20 sm:w-[4.5rem]">
          <CaregiverPortrait second holding={false} babyCount={babyCount} />
        </div>
      </div>
      <div className="order-3 min-w-0 sm:flex-1">
        <CaregiverSummary {...second} second />
      </div>
    </div>
  );
}
