import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SGI_PROTECTION, lagstanivaDailyAmount, netAfterTax } from "@/lib/rules";
import {
  approxLeaveMonths,
  approxMonthlyGross,
  formatDays,
  formatPace,
  formatSek,
} from "@/lib/format";

export interface MonthlyRow {
  name: string;
  /** Income-based (sjukpenningnivå) daily rate for this person. */
  dailyRate: number;
  /** Total days for this person (incl. any leftover from previous children). */
  days: number;
  /** This person's leave pace — may differ per caregiver under "förläng…". */
  daysPerWeek: number;
  /** Leftover days from previous children included in `days`, if any. */
  extraDays?: number;
}

/**
 * Results lead: each vårdnadshavare's rough monthly deposit at their own leave
 * pace, plus how many days that is and how long it lasts. Surfaces the
 * post-12-month SGI condition when a pace is below the weekly floor.
 */
export function MonthlyEstimate({ rows }: { rows: MonthlyRow[] }) {
  const belowSgiFloor = rows.some(
    (r) => r.daysPerWeek < SGI_PROTECTION.minDaysPerWeekAfterAge1,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Så mycket per månad – och hur länge</CardTitle>
        <CardDescription>
          Uppskattat månadsbelopp medan inkomstbaserade dagar tas ut.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r, i) => {
          const gross = approxMonthlyGross(r.dailyRate, r.daysPerWeek);
          return (
            <div key={i} className="rounded-lg border p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{r.name}</span>
                <span className="text-2xl font-bold tabular-nums">
                  {formatSek(gross)}
                  <span className="text-muted-foreground text-sm font-normal">
                    /mån
                  </span>
                </span>
              </div>
              <div className="text-muted-foreground mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums">
                <span>
                  {formatDays(r.days)} · {approxLeaveMonths(r.days, r.daysPerWeek)}{" "}
                  vid {formatPace(r.daysPerWeek)} dagar/vecka
                </span>
                <span>
                  ≈ {formatSek(netAfterTax(gross))} efter skatt ·{" "}
                  {formatSek(r.dailyRate)}/dag
                </span>
              </div>
              {r.extraDays ? (
                <div className="text-muted-foreground mt-0.5 text-xs">
                  inkl. {formatDays(r.extraDays)} sparade från tidigare barn
                </div>
              ) : null}
            </div>
          );
        })}

        <Separator />

        <p className="text-muted-foreground text-xs">
          Föräldrapenning betalas per uttagen dag, så månadsbeloppet följer hur
          många dagar i veckan som tas ut. Lägstanivådagar ger{" "}
          {formatSek(lagstanivaDailyAmount())}/dag.
        </p>

        {belowSgiFloor && (
          <p className="text-xs">
            <span className="font-medium">Tänk på SGI:</span> efter barnets
            1-årsdag skyddas SGI bara om du tar ut minst{" "}
            {SGI_PROTECTION.minDaysPerWeekAfterAge1} dagar/vecka — eller arbetar
            resten av veckan. Under det första året är SGI skyddad oavsett takt.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
