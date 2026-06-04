import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TIER_LABEL } from "@/lib/rules";
import type { RemainingSummary } from "@/lib/calc";
import { formatNumber } from "@/lib/format";

function TierRow({
  label,
  used,
  budget,
  remaining,
  over,
  indicatorClassName,
}: {
  label: string;
  used: number;
  budget: number;
  remaining: number;
  over: boolean;
  indicatorClassName?: string;
}) {
  const pct = budget > 0 ? (used / budget) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          <span
            className={
              over ? "text-destructive font-semibold" : "text-foreground font-semibold"
            }
          >
            {formatNumber(remaining)}
          </span>{" "}
          kvar av {formatNumber(budget)}
        </span>
      </div>
      <Progress value={pct} indicatorClassName={indicatorClassName} />
      <p className="text-muted-foreground text-xs tabular-nums">
        {formatNumber(used)} använda
        {over ? " — fler än budgeten tillåter" : ""}
      </p>
    </div>
  );
}

export function RemainingTiers({ remaining }: { remaining: RemainingSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dagar kvar att fördela</CardTitle>
        <CardDescription>
          {formatNumber(remaining.remaining.total)} av{" "}
          {formatNumber(remaining.budget.total)} dagar återstår totalt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <TierRow
          label={TIER_LABEL.sjukpenning}
          used={remaining.used.sjukpenning}
          budget={remaining.budget.sjukpenning}
          remaining={remaining.remaining.sjukpenning}
          over={remaining.overAllocated.sjukpenning}
          indicatorClassName="bg-chart-1"
        />
        <TierRow
          label={TIER_LABEL.lagsta}
          used={remaining.used.lagsta}
          budget={remaining.budget.lagsta}
          remaining={remaining.remaining.lagsta}
          over={remaining.overAllocated.lagsta}
          indicatorClassName="bg-chart-4"
        />
      </CardContent>
    </Card>
  );
}
