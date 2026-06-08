import {
  Baby,
  CalendarDays,
  CircleAlert,
  Clock,
  Coins,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PlanDeadlines } from "@/lib/calc";
import { addYears, differenceInDays, monthsBetween } from "@/lib/dates";
import { formatDate, formatSek } from "@/lib/format";

/**
 * A projection of how the leave plays out in calendar time at the chosen pace:
 * when the (valuable) income-based days run out and the monthly amount steps
 * down to lägstanivå, and when the leave ends entirely.
 */
export interface LeaveProjection {
  incomeBasedEnds: Date;
  leaveEnds: Date;
  incomeBasedMonthly: number;
  lagstaMonthly: number;
}

type MilestoneVariant = "legal" | "projected" | "today";

interface Milestone {
  date: Date;
  icon: LucideIcon;
  title: string;
  desc: string;
  variant: MilestoneVariant;
}

const DAYS_PER_MONTH = 30.44;

// The vertical gap between two markers is proportional to the real time between
// them, so a glance reads "long stretch" vs "right after". Clamped so adjacent
// dates a few days apart stay readable and the multi-year tail stays compact.
const PX_PER_MONTH = 6;
const MIN_SEGMENT = 36;
const MAX_SEGMENT = 176;

function segmentHeight(days: number): number {
  const months = days / DAYS_PER_MONTH;
  return Math.round(
    Math.min(MAX_SEGMENT, Math.max(MIN_SEGMENT, months * PX_PER_MONTH)),
  );
}

/** A short human duration for the gap between two markers (null if negligible). */
function formatGap(days: number): string | null {
  if (days < 25) return null;
  const months = Math.round(days / DAYS_PER_MONTH);
  if (months < 12) return `≈ ${months} mån`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `≈ ${years} år` : `≈ ${years} år ${rem} mån`;
}

function childAgeLabel(ageMonths: number): string {
  if (ageMonths < 0) return "inte född än";
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  if (years === 0) return `${months} mån`;
  return `${years} år ${months} mån`;
}

export function Timeline({
  deadlines,
  asOf,
  projection,
}: {
  deadlines: PlanDeadlines;
  asOf: Date;
  projection?: LeaveProjection;
}) {
  const birth = deadlines.birth;
  const ageMonths = monthsBetween(birth, asOf);
  const span = monthsBetween(birth, deadlines.expiry) || 144;

  const legal: Milestone[] = [
    {
      date: birth,
      icon: Baby,
      title: "Barnet föds",
      desc: "SGI är fullt skyddad under barnets första år.",
      variant: "legal",
    },
    {
      date: addYears(birth, 1),
      icon: ShieldCheck,
      title: "1 år",
      desc: "Därefter krävs minst 5 uttag/vecka (eller arbete) för att behålla SGI.",
      variant: "legal",
    },
    {
      date: deadlines.doubleDaysDeadline,
      icon: Users,
      title: "15 månader",
      desc: "Sista chansen att ta ut dubbeldagar (upp till 60 stycken).",
      variant: "legal",
    },
    {
      date: deadlines.sjukpenningDeadline,
      icon: Clock,
      title: "4 år",
      desc: "Inkomstbaserade dagar måste vara uttagna. Därefter får högst 96 dagar sparas.",
      variant: "legal",
    },
    {
      date: deadlines.expiry,
      icon: CircleAlert,
      title: "12 år",
      desc: "Alla föräldrapenningdagar förfaller.",
      variant: "legal",
    },
  ];

  const projected: Milestone[] = projection
    ? [
        {
          date: projection.incomeBasedEnds,
          icon: Coins,
          title: "Inkomstbaserade dagar slut",
          desc: `Ersättningen går ner till ca ${formatSek(
            projection.lagstaMonthly,
          )}/mån (lägstanivå) i den här takten.`,
          variant: "projected" as MilestoneVariant,
        },
        {
          date: projection.leaveEnds,
          icon: Wallet,
          title: "Ledigheten tar slut",
          desc: "Alla planerade föräldrapenningdagar är uttagna i den här takten.",
          variant: "projected" as MilestoneVariant,
        },
      ]
    : [];

  const showToday = ageMonths >= 0 && ageMonths <= span;
  const today: Milestone = {
    date: asOf,
    icon: CalendarDays,
    title: "Idag",
    desc: childAgeLabel(ageMonths),
    variant: "today",
  };

  const milestones = [
    ...legal,
    ...projected,
    ...(showToday ? [today] : []),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tidslinje</CardTitle>
        <CardDescription>
          Avståndet mellan punkterna speglar den faktiska tiden emellan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {projection && (
          <div className="bg-secondary/40 mb-6 rounded-lg border p-4">
            <div className="text-sm font-medium">Så fluktuerar ersättningen</div>
            <p className="text-muted-foreground mt-1 text-xs">
              ≈ {formatSek(projection.incomeBasedMonthly)}/mån tills{" "}
              {formatDate(projection.incomeBasedEnds)}, därefter ≈{" "}
              {formatSek(projection.lagstaMonthly)}/mån på lägstanivå tills
              ledigheten tar slut omkring {formatDate(projection.leaveEnds)}.
            </p>
          </div>
        )}

        <ol className="relative">
          {milestones.map((m, i) => {
            const Icon = m.icon;
            const isFirst = i === 0;
            const isLast = i === milestones.length - 1;
            const gapDays = isFirst
              ? 0
              : differenceInDays(milestones[i - 1].date, m.date);
            const segPx = isFirst ? 0 : segmentHeight(gapDays);
            const gapLabel = isFirst ? null : formatGap(gapDays);

            const isToday = m.variant === "today";
            const isProjected = m.variant === "projected";
            const isPast = !isToday && m.date.getTime() < asOf.getTime();

            return (
              <li
                key={i}
                className="relative flex gap-4"
                style={{ paddingTop: segPx }}
              >
                {/* Connector — continuous vertical line through the dots. The
                    first marker draws from its own dot down; the last stops
                    at its dot. */}
                {!(isFirst && isLast) && (
                  <div
                    aria-hidden="true"
                    className="bg-border absolute left-4 w-px -translate-x-1/2"
                    style={
                      isFirst
                        ? { top: 16, bottom: 0 }
                        : isLast
                          ? { top: 0, height: segPx + 16 }
                          : { top: 0, bottom: 0 }
                    }
                  />
                )}

                {/* Elapsed-time label, centred in the gap above the dot. */}
                {gapLabel && (
                  <span
                    className="text-muted-foreground absolute left-12 -translate-y-1/2 text-[11px] tabular-nums"
                    style={{ top: segPx / 2 }}
                  >
                    {gapLabel}
                  </span>
                )}

                {/* Marker dot — sits on top of the connector line. */}
                <div
                  className={cn(
                    "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                    isToday
                      ? "border-primary bg-primary text-primary-foreground"
                      : isPast
                        ? "bg-muted border-muted-foreground/30 text-muted-foreground"
                        : isProjected
                          ? "border-chart-2/60 bg-chart-2/10 text-chart-2"
                          : "bg-background border-border text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </div>

                {/* Marker text */}
                <div className="flex-1 pb-1 pt-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isToday
                          ? "text-primary"
                          : isPast
                            ? "text-muted-foreground"
                            : "text-foreground",
                      )}
                    >
                      {m.title}
                    </span>
                    <time
                      dateTime={m.date.toISOString().slice(0, 10)}
                      className="text-muted-foreground text-xs tabular-nums"
                    >
                      {formatDate(m.date)}
                    </time>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {m.desc}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
