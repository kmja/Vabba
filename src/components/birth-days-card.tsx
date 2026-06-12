import { Gift } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { netAfterTax } from "@/lib/rules";
import { formatDays, formatSek } from "@/lib/format";
import type { BirthDaysResult } from "@/lib/birth-days";

export function BirthDaysCard({
  result,
  caregiverName,
}: {
  result: BirthDaysResult;
  caregiverName: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="size-4" /> 10 dagar vid barns födelse
        </CardTitle>
        <CardDescription>
          Tillfällig föräldrapenning för {caregiverName} — utöver de 480 dagarna.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-secondary/40 flex items-baseline justify-between rounded-lg border p-4">
          <span className="text-muted-foreground text-sm">
            {formatDays(result.days)} × {formatSek(result.dailyAmount)}/dag
          </span>
          <span className="text-2xl font-bold tabular-nums">
            {formatSek(result.total)}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          ≈ {formatSek(netAfterTax(result.total))} efter skatt. Tas ut inom 60
          dagar efter hemkomsten.
          {result.sgiCapped
            ? " Beloppet är begränsat av taket för tillfällig föräldrapenning (7,5 prisbasbelopp)."
            : ""}
        </p>
      </CardContent>
    </Card>
  );
}
