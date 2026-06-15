import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LeaveLevers,
  LeaveLengthSlider,
  type PhaseControls,
  type PartTime,
} from "@/components/leave-levers";
import type { ParentPayout } from "@/lib/optimizer";
import { TIER_LABEL, lagstanivaDailyAmount, netAfterTax } from "@/lib/rules";
import { cn } from "@/lib/utils";
import {
  approxLeaveMonths,
  approxLeaveWeeks,
  formatDays,
  formatNumber,
  formatSek,
} from "@/lib/format";

/** Results card for sole-custody planning — all the days belong to one parent. */
export function SoloSummary({
  payout,
  total,
  name,
  daysPerWeek,
  onSetTarget,
  phase,
  bonusFullMonthly,
  salary,
  partTime,
}: {
  payout: ParentPayout;
  total: number;
  name: string;
  daysPerWeek: number;
  onSetTarget: (minMonthly: number) => void;
  phase: PhaseControls;
  bonusFullMonthly: number;
  salary: number;
  partTime: PartTime;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section
      className={cn(
        "bg-card text-card-foreground ml-[calc(50%_-_50vw)] w-screen space-y-3 border-b py-3",
        !open && "sticky top-0 z-30",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 sm:px-6">
        <span className="font-semibold">Justera planen</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
        >
          Fler inställningar
          <IconChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>

      {/* Collapsed: the leave-length slider; drag and watch the timeline shift. */}
      {!open && (
        <div className="px-4 sm:px-6">
          <LeaveLengthSlider
            name={name}
            days={total}
            dailyRate={payout.dailyRate}
            pace={daysPerWeek}
            onSetTarget={onSetTarget}
          />
        </div>
      )}

      {open && (
        <div className="space-y-4 px-4 sm:px-6">
          <p className="text-muted-foreground text-sm">
            Som ensam vårdnadshavare har du rätt till alla dagarna.
          </p>

          <div className="bg-secondary/40 rounded-lg border p-4 text-center">
            <div className="text-muted-foreground text-sm">
              Total uppskattad ersättning
            </div>
            <div className="text-3xl font-bold tracking-tight tabular-nums">
              {formatSek(payout.amount)}
            </div>
            <div className="text-muted-foreground text-xs">
              ≈ {formatSek(netAfterTax(payout.amount))} efter skatt
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{name}</span>
              <Badge variant="secondary">
                {approxLeaveMonths(total, daysPerWeek)}
              </Badge>
            </div>
            <div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatDays(total)}
              </div>
              <div className="text-muted-foreground text-sm">
                {formatNumber(payout.sjukpenningDays)}{" "}
                {TIER_LABEL.sjukpenning.toLowerCase()} ·{" "}
                {formatNumber(payout.lagstaDays)}{" "}
                {TIER_LABEL.lagsta.toLowerCase()}
              </div>
              {daysPerWeek !== 7 && total > 0 && (
                <div className="text-muted-foreground mt-1 text-xs">
                  ≈ {approxLeaveWeeks(total, daysPerWeek)} veckor vid{" "}
                  {daysPerWeek} dagar/vecka
                </div>
              )}
            </div>
            <Separator />
            <p className="text-muted-foreground text-xs">
              {formatSek(payout.dailyRate)}/dag på sjukpenningnivå ·{" "}
              {formatSek(lagstanivaDailyAmount())}/dag på lägstanivå
            </p>
          </div>

          <LeaveLevers
            name={name}
            days={total}
            dailyRate={payout.dailyRate}
            pace={daysPerWeek}
            bonusFullMonthly={bonusFullMonthly}
            salary={salary}
            partnerSalary={0}
            partTime={partTime}
            onSetTarget={onSetTarget}
            phase={phase}
          />

          <p className="text-muted-foreground text-xs">
            Förslaget fördelar alla återstående dagar — du kan förstås ta ut
            färre. Ersättningen är en uppskattning före skatt.
          </p>
        </div>
      )}
    </section>
  );
}
