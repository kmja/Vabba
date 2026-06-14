import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  MONEY,
  SGI_PROTECTION,
  lagstanivaDailyAmount,
  netAfterTax,
} from "@/lib/rules";
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
  /** This caregiver's chosen pace goal, e.g. "Förläng ledigheten". */
  goalLabel?: string;
  /** Whether this caregiver's salary is above the SGI cap. */
  aboveCap?: boolean;
  /** Employer top-up (föräldralön) during the first months, if any. */
  supplement?: { monthly: number; total: number; months: number };
  /** Income-based days paid at grundnivå (240-day rule not met), if any. */
  grundnivaFirstDays?: number;
  /** Accurate total leave length in months (overrides the days/pace estimate). */
  leaveMonths?: number;
  /** Second leave period after the 1-year switch, if any. */
  secondPhase?: { daysPerWeek: number; monthly: number };
  /** The working partner's monthly salary, for the household total. */
  householdBase?: number;
  /** Name of the partner who is working during this caregiver's leave. */
  partnerWorking?: string;
  /** Part-time salary this caregiver earns on non-FP days (if working). */
  partTimeSalary?: number;
}

function formatMonths(months: number): string {
  if (months < 1) return "< 1 mån";
  const n = months < 10 ? months.toFixed(1) : String(Math.round(months));
  return `≈ ${n.replace(".", ",")} mån`;
}

/** This caregiver's föräldrapenning + föräldralön at their pace. */
function ownMonthly(r: MonthlyRow): number {
  return approxMonthlyGross(r.dailyRate, r.daysPerWeek) + (r.supplement?.monthly ?? 0);
}

/**
 * Results lead: what the **household** lives on each month while one caregiver
 * is on leave and the other works, then the per-vårdnadshavare detail below.
 */
export function MonthlyEstimate({ rows }: { rows: MonthlyRow[] }) {
  const hasHousehold = rows.some((r) => (r.householdBase ?? 0) > 0);
  const belowSgiFloor = rows.some(
    (r) =>
      (r.secondPhase?.daysPerWeek ?? r.daysPerWeek) <
      SGI_PROTECTION.minDaysPerWeekAfterAge1,
  );
  const supplementTotal = rows.reduce(
    (sum, r) => sum + (r.supplement?.total ?? 0),
    0,
  );
  const aboveCapWithSupplement = rows.some((r) => r.supplement && r.aboveCap);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {hasHousehold
            ? "Hushållets inkomst – och hur länge"
            : "Så mycket per månad – och hur länge"}
        </CardTitle>
        <CardDescription>
          {hasHousehold
            ? "Medan en är ledig arbetar den andra. Så här mycket får hushållet in varje månad."
            : "Uppskattat månadsbelopp medan inkomstbaserade dagar tas ut."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Household income — the headline */}
        {hasHousehold && (
          <div className="bg-secondary/40 space-y-3 rounded-lg border p-4">
            {rows.map((r, i) => (
              <div key={i}>
                <div className="flex items-end justify-between gap-3">
                  <span className="text-sm">
                    Medan {r.name} är ledig
                    {r.leaveMonths != null
                      ? ` (${formatMonths(r.leaveMonths)})`
                      : ""}
                  </span>
                  <span className="text-2xl font-bold tabular-nums">
                    {formatSek(
                      ownMonthly(r) +
                        (r.partTimeSalary ?? 0) +
                        (r.householdBase ?? 0),
                    )}
                    <span className="text-muted-foreground text-sm font-normal">
                      /mån
                    </span>
                  </span>
                </div>
                <div className="text-muted-foreground text-xs tabular-nums">
                  {r.name}s ersättning ≈ {formatSek(ownMonthly(r))}
                  {r.partTimeSalary
                    ? ` + deltidslön ≈ ${formatSek(r.partTimeSalary)}`
                    : ""}
                  {r.partnerWorking
                    ? ` + ${r.partnerWorking}s lön ≈ ${formatSek(r.householdBase ?? 0)}`
                    : ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {hasHousehold && (
          <div className="text-muted-foreground text-xs font-medium">
            Per vårdnadshavare
          </div>
        )}

        {/* Per-caregiver föräldrapenning detail */}
        {rows.map((r, i) => {
          const gross = approxMonthlyGross(r.dailyRate, r.daysPerWeek);
          return (
            <div key={i} className="rounded-lg border p-4">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{r.name}</span>
                {r.goalLabel && (
                  <span className="text-muted-foreground bg-secondary rounded-full px-2 py-0.5 text-[11px] font-medium">
                    {r.goalLabel}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <div className="text-2xl font-bold tabular-nums">
                    {r.leaveMonths != null
                      ? formatMonths(r.leaveMonths)
                      : approxLeaveMonths(r.days, r.daysPerWeek)}
                  </div>
                  <div className="text-muted-foreground text-xs tabular-nums">
                    {formatDays(r.days)} · {formatPace(r.daysPerWeek)} dagar/vecka
                    {r.secondPhase ? " första året" : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums">
                    {formatSek(gross)}
                    <span className="text-muted-foreground text-sm font-normal">
                      /mån
                    </span>
                  </div>
                  <div className="text-muted-foreground text-xs tabular-nums">
                    ≈ {formatSek(netAfterTax(gross))} efter skatt ·{" "}
                    {formatSek(r.dailyRate)}/dag
                  </div>
                </div>
              </div>
              {r.secondPhase && (
                <div className="text-foreground mt-1 text-xs tabular-nums">
                  Efter 1 år: ≈ {formatSek(r.secondPhase.monthly)}/mån vid{" "}
                  {formatPace(r.secondPhase.daysPerWeek)} dagar/vecka
                </div>
              )}
              {r.extraDays ? (
                <div className="text-muted-foreground mt-0.5 text-xs">
                  inkl. {formatDays(r.extraDays)} sparade från tidigare barn
                </div>
              ) : null}

              {r.grundnivaFirstDays ? (
                <div className="mt-1 text-xs">
                  De första {formatDays(r.grundnivaFirstDays)} betalas på
                  grundnivå ({formatSek(MONEY.grundnivaPerDay)}/dag ≈{" "}
                  {formatSek(
                    approxMonthlyGross(MONEY.grundnivaPerDay, r.daysPerWeek),
                  )}
                  /mån) — 240-dagarsvillkoret är inte uppfyllt.
                </div>
              ) : null}

              {r.supplement && (
                <div className="bg-secondary/40 mt-2 rounded-md px-3 py-2 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">
                      + Föräldralön (arbetsgivaren)
                    </span>
                    <span className="font-semibold tabular-nums">
                      ≈ {formatSek(r.supplement.monthly)}/mån
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    i ca {r.supplement.months} mån · ≈{" "}
                    {formatSek(r.supplement.total)} totalt
                    {r.aboveCap ? " · täcker även lön över taket" : ""}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <Separator />

        <p className="text-muted-foreground text-xs">
          Föräldrapenning betalas per uttagen dag, så månadsbeloppet följer hur
          många dagar i veckan som tas ut. Lägstanivådagar ger{" "}
          {formatSek(lagstanivaDailyAmount())}/dag.
        </p>

        {supplementTotal > 0 && (
          <p className="text-xs">
            <span className="font-medium">Föräldralön totalt:</span> ≈{" "}
            {formatSek(supplementTotal)} utöver föräldrapenningen (uppskattning,
            brutto). Exakt belopp och längd styrs av kollektivavtalet —
            {aboveCapWithSupplement
              ? " för lön över taket täcker arbetsgivaren ofta merparten, vilket föräldrapenningen inte gör."
              : " kolla villkoren med din arbetsgivare."}
          </p>
        )}

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
