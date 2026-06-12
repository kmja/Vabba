import {
  ArrowRightLeft,
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
import { GanttChart } from "@/components/gantt-chart";
import type { PlanDeadlines } from "@/lib/calc";
import { addYears, differenceInDays, monthsBetween } from "@/lib/dates";
import { formatDate, formatSek } from "@/lib/format";
import type { LeaveInterval } from "@/lib/projection";

export interface LeaveProjection {
  /** Ordered stretches of leave; boundaries become timeline markers. */
  segments: LeaveInterval[];
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
// Most important dates fall in the first ~2 years, so those gaps are spaced
// proportionally to the real time between them. Anything longer is collapsed
// to a compact ellipsis so the multi-year tail doesn't dominate.
const COMPRESS_MONTHS = 15;
// One month is the tightest spacing (any closer and the markers' text would
// collide), so that's the floor; longer gaps scale up from there, capped so a
// near-COMPRESS gap doesn't run off the screen.
const PX_PER_MONTH = 26;
const MIN_GAP_PX = PX_PER_MONTH; // ≈ 1 month
const MAX_GAP_PX = 130; // ≈ 5 months
const COMPRESSED_PX = 64; // fixed height of an ellipsis ("…") gap

function proportionalGap(days: number): number {
  const px = Math.round((days / DAYS_PER_MONTH) * PX_PER_MONTH);
  return Math.min(MAX_GAP_PX, Math.max(MIN_GAP_PX, px));
}

function gapLabel(days: number): string {
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

  // Each boundary between (or at the end of) the leave segments is an event:
  // a caregiver handover, a step down to lägstanivå, or the leave ending.
  const projected: Milestone[] = [];
  const segments = projection?.segments ?? [];
  segments.forEach((seg, i) => {
    const next = segments[i + 1];
    if (!next) {
      projected.push({
        date: seg.endsAt,
        icon: Wallet,
        title: "Ledigheten tar slut",
        desc: "Alla planerade föräldrapenningdagar är uttagna i den här takten.",
        variant: "projected",
      });
    } else if (next.caregiver !== seg.caregiver) {
      projected.push({
        date: seg.endsAt,
        icon: ArrowRightLeft,
        title: "Byte av vårdnadshavare",
        desc: `${next.caregiver} tar över efter ${seg.caregiver}.`,
        variant: "projected",
      });
    } else if (seg.tier === "income" && next.tier === "lagsta") {
      projected.push({
        date: seg.endsAt,
        icon: Coins,
        title: "Inkomstbaserade dagar slut",
        desc: `${seg.caregiver ? `${seg.caregiver}: e` : "E"}rsättningen går ner till ca ${formatSek(
          next.monthly,
        )}/mån (lägstanivå).`,
        variant: "projected",
      });
    }
  });

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
          Avståndet speglar tiden mellan datumen; långa hopp visas hopfällda.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {segments.length > 0 && (
          <div className="mb-6">
            <GanttChart segments={segments} birth={birth} asOf={asOf} />
          </div>
        )}
        <div>
          {milestones.map((m, i) => {
            const Icon = m.icon;
            const isLast = i === milestones.length - 1;
            const isToday = m.variant === "today";
            const isProjected = m.variant === "projected";
            const isPast = !isToday && m.date.getTime() < asOf.getTime();

            // The gap *below* this marker, to the next one.
            const gapDays = isLast
              ? 0
              : differenceInDays(m.date, milestones[i + 1].date);
            const compressed =
              !isLast && gapDays / DAYS_PER_MONTH > COMPRESS_MONTHS;
            const spacingPx = compressed
              ? COMPRESSED_PX
              : proportionalGap(gapDays);

            return (
              <div
                key={i}
                className="relative flex gap-4"
                // The row's min-height drives the spacing; the connector line
                // flex-fills it, so it always reaches the next dot.
                style={isLast ? undefined : { minHeight: 32 + spacingPx }}
              >
                {/* Rail: dot + connector in one column so the line touches the dot */}
                <div className="flex w-8 shrink-0 flex-col items-center">
                  <div
                    className={cn(
                      "z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2",
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

                  {!isLast &&
                    (compressed ? (
                      <div className="flex w-full flex-1 flex-col items-center gap-1.5">
                        <div className="bg-border w-px flex-1" />
                        <div className="flex flex-col gap-1">
                          {[0, 1, 2].map((j) => (
                            <div
                              key={j}
                              className="bg-muted-foreground/40 size-[3px] rounded-full"
                            />
                          ))}
                        </div>
                        <div className="bg-border w-px flex-1" />
                      </div>
                    ) : (
                      <div className="bg-border w-px flex-1" />
                    ))}
                </div>

                {/* Duration label for a collapsed gap, centred on the ellipsis */}
                {compressed && (
                  <span
                    className="text-muted-foreground absolute left-12 -translate-y-1/2 text-xs"
                    style={{ top: 32 + COMPRESSED_PX / 2 }}
                  >
                    {gapLabel(gapDays)}
                  </span>
                )}

                {/* Marker text */}
                <div className="flex-1 pt-0.5 pb-1">
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
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
