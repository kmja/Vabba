import { IconPencil } from "@tabler/icons-react";

import type { MonthlyRow } from "@/components/monthly-estimate";
import { formatSek } from "@/lib/format";

export interface CaregiverInfo {
  name: string;
  /** Gross monthly salary, as entered in the wizard. */
  salary: number;
  /** Their whole stretch, or undefined when they take no days. */
  row?: MonthlyRow;
  /** What drives their length ("Hemma till 1 aug 2028"); null = manual. */
  goalText: string | null;
  onEdit: () => void;
}

/**
 * Who a caregiver is in this plan, as plain text beside the family
 * portrait (see `FamilySummary`) rather than a card of its own: their
 * name with a small edit affordance, what they earn, and what they're
 * aiming for.
 */
export function CaregiverSummary({
  name,
  salary,
  row,
  goalText,
  onEdit,
}: CaregiverInfo) {
  return (
    <div className="space-y-0.5">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="truncate text-lg leading-tight font-semibold">
          {name}
        </h3>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Ändra ${name}s uppgifter`}
          className="text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0 rounded-md p-1"
        >
          <IconPencil className="size-3.5" />
        </button>
      </div>
      {salary > 0 && (
        <p className="text-muted-foreground text-xs tabular-nums">
          {formatSek(salary)}/mån
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        {goalText ?? row?.goalLabel ?? "Full takt — justera i perioderna."}
      </p>
    </div>
  );
}
