import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AdjustPlanPanel } from "@/components/adjust-plan-panel";
import type { ParentPayout } from "@/lib/optimizer";
import { TIER_LABEL, lagstanivaDailyAmount } from "@/lib/rules";
import { monthlyNet } from "@/lib/tax";
import {
  approxLeaveMonths,
  approxLeaveWeeks,
  formatDays,
  formatNumber,
  formatSek,
} from "@/lib/format";
import { approxMonthlyGross } from "@/lib/format";

/** Results card for sole-custody planning — all the days belong to one parent. */
export function SoloSummary({
  payout,
  total,
  name,
  daysPerWeek,
  goalSummary,
  municipalRate,
}: {
  payout: ParentPayout;
  total: number;
  name: string;
  daysPerWeek: number;
  /** One-line result of the solved plan, shown when a goal is active. */
  goalSummary: string | null;
  municipalRate: number;
}) {
  // Their föräldrapenning is their whole income, so tax it as that — a
  // benefit-only month carries no jobbskatteavdrag.
  const monthlyBenefit = approxMonthlyGross(payout.dailyRate, daysPerWeek);
  const netPayout =
    monthlyBenefit > 0
      ? Math.round(
          payout.amount * (monthlyNet({ benefit: monthlyBenefit }, municipalRate) / monthlyBenefit),
        )
      : 0;

  return (
    <AdjustPlanPanel
      collapsedSummary={goalSummary}
      toggleLabelClosed="Fler inställningar"
      toggleLabelOpen="Fler inställningar"
    >
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
          ≈ {formatSek(netPayout)} efter skatt
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

      <p className="text-muted-foreground text-xs">
        Takt, deltid och längd finjusteras på varje period nedan.
      </p>

      <p className="text-muted-foreground text-xs">
        Förslaget fördelar alla återstående dagar — du kan förstås ta ut färre.
        Ersättningen är en uppskattning före skatt.
      </p>
    </AdjustPlanPanel>
  );
}
