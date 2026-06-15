import { IconStethoscope } from "@tabler/icons-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { VabResult } from "@/lib/vab";
import { netAfterTax } from "@/lib/rules";
import { formatNumber, formatSek } from "@/lib/format";

/** Compact vab (sick-child) summary for the results page. */
export function VabResultCard({ result }: { result: VabResult }) {
  const usedPct =
    result.annualCapacity > 0 ? (result.used / result.annualCapacity) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconStethoscope className="size-5" /> Vab – vård av sjukt barn
        </CardTitle>
        <CardDescription>
          Tillfällig föräldrapenning, {formatNumber(result.daysPerChild)} dagar
          per barn och kalenderår.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-bold tabular-nums">
          {formatNumber(result.remaining)}{" "}
          <span className="text-muted-foreground text-base font-normal">
            av {formatNumber(result.annualCapacity)} dagar kvar i år
          </span>
        </div>
        <Progress value={usedPct} indicatorClassName="bg-chart-2" />
        <Separator />
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-sm">
            Värde av kvarvarande dagar
          </span>
          <span className="font-semibold tabular-nums">
            {formatSek(result.remainingValue)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-sm">≈ efter skatt</span>
          <span className="text-muted-foreground tabular-nums">
            {formatSek(netAfterTax(result.remainingValue))}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          {formatSek(result.dailyAmount)}/dag
          {result.sgiCapped ? " (över vab-taket, högsta belopp)" : ""}. Vab
          räknas per barn och kalenderår och kan inte sparas till nästa år.
        </p>
        {result.overUsed && (
          <p className="text-destructive text-xs">
            De uttagna dagarna överstiger årets tak — kontrollera siffran.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
