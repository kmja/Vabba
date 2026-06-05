import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ParentPayout } from "@/lib/optimizer";
import { TIER_LABEL, lagstanivaDailyAmount, netAfterTax } from "@/lib/rules";
import { approxMonths, formatDays, formatNumber, formatSek } from "@/lib/format";

/** Results card for sole-custody planning — all the days belong to one parent. */
export function SoloSummary({
  payout,
  total,
  name,
}: {
  payout: ParentPayout;
  total: number;
  name: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Din plan</CardTitle>
        <CardDescription>
          Som ensam vårdnadshavare har du rätt till alla dagarna.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <Badge variant="secondary">{approxMonths(total)}</Badge>
          </div>
          <div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatDays(total)}
            </div>
            <div className="text-muted-foreground text-sm">
              {formatNumber(payout.sjukpenningDays)}{" "}
              {TIER_LABEL.sjukpenning.toLowerCase()} ·{" "}
              {formatNumber(payout.lagstaDays)} {TIER_LABEL.lagsta.toLowerCase()}
            </div>
          </div>
          <Separator />
          <p className="text-muted-foreground text-xs">
            {formatSek(payout.dailyRate)}/dag på sjukpenningnivå ·{" "}
            {formatSek(lagstanivaDailyAmount())}/dag på lägstanivå
          </p>
        </div>

        <p className="text-muted-foreground text-xs">
          Förslaget fördelar alla återstående dagar — du kan förstås ta ut färre.
          Ersättningen är en uppskattning före skatt.
        </p>
      </CardContent>
    </Card>
  );
}
