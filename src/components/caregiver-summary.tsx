import { IconPencil } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import type { MonthlyRow } from "@/components/monthly-estimate";
import { CG_BAR } from "@/components/timeline";
import { formatDays, formatSek } from "@/lib/format";
import { cn } from "@/lib/utils";

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
 * Who a caregiver is in this plan: what they earn, what they have to spend
 * and what they are aiming for — with a way straight back to their own
 * settings. The portrait these used to carry now sits with the other
 * caregiver's, grouped as one family — see `FamilySummary`.
 */
export function CaregiverSummary({
  name,
  salary,
  row,
  goalText,
  second,
  onEdit,
}: CaregiverInfo & {
  /** Second caregiver — picks the other figure tone and bar colour. */
  second: boolean;
}) {
  const facts: string[] = [];
  if (salary > 0) facts.push(`${formatSek(salary)}/mån`);
  if (row && row.days > 0) facts.push(formatDays(row.days));
  if (row?.supplement) {
    facts.push(
      `föräldralön i ca ${String(row.supplement.months).replace(".", ",")} mån`,
    );
  }
  if (row?.savedDays) facts.push(`sparar ${formatDays(row.savedDays)}`);

  return (
    <div className="bg-card h-full space-y-1 rounded-lg border p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <span
            className={cn(
              "size-2.5 shrink-0 rounded-sm",
              CG_BAR[(second ? 1 : 0) % CG_BAR.length],
            )}
          />
          <span className="truncate">{name}</span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="-mt-1 -mr-1 shrink-0"
          onClick={onEdit}
        >
          <IconPencil /> Ändra
        </Button>
      </div>
      {facts.length > 0 && (
        <p className="text-muted-foreground text-xs tabular-nums">
          {facts.join(" · ")}
        </p>
      )}
      <p className="text-sm">
        {goalText ?? row?.goalLabel ?? "Full takt — justera i perioderna."}
      </p>
    </div>
  );
}
