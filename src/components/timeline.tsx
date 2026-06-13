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
import type { PlanDeadlines } from "@/lib/calc";
import { addYears, differenceInDays, monthsBetween } from "@/lib/dates";
import { formatDate, formatPace, formatSek } from "@/lib/format";
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
// Gaps within ~15 months are spaced proportionally to the real time between
// them; longer gaps collapse to a compact ellipsis. The floor leaves room for a
// marker's text so neighbours don't collide.
const COMPRESS_MONTHS = 15;
const PX_PER_MONTH = 30;
const MIN_GAP_PX = 60;
const MAX_GAP_PX = 170;
const COMPRESSED_PX = 66;
const TOP_PAD = 30;
const BOTTOM_PAD = 38;
const RAIL_X = 16; // dot centre within the timeline column

const CG_BAR = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4"];

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

  // Vertical position of each marker, and a date→y map the Gantt bars share.
  const last = milestones.length - 1;
  const yPos: number[] = [];
  const segPx: number[] = [];
  const segCompressed: boolean[] = [];
  let y = TOP_PAD;
  milestones.forEach((m, i) => {
    yPos[i] = y;
    if (i < last) {
      const gd = differenceInDays(m.date, milestones[i + 1].date);
      const compressed = gd / DAYS_PER_MONTH > COMPRESS_MONTHS;
      segCompressed[i] = compressed;
      segPx[i] = compressed ? COMPRESSED_PX : proportionalGap(gd);
      y += segPx[i];
    }
  });
  const totalHeight = y + BOTTOM_PAD;

  const yAt = (date: Date): number => {
    if (milestones.length === 0) return TOP_PAD;
    const t = date.getTime();
    if (t <= milestones[0].date.getTime()) return yPos[0];
    for (let i = 0; i < last; i++) {
      const a = milestones[i].date.getTime();
      const b = milestones[i + 1].date.getTime();
      if (t <= b) {
        const frac = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
        return yPos[i] + frac * segPx[i];
      }
    }
    return yPos[last];
  };

  // Group leave segments into one Gantt column per caregiver (in turn order).
  const cgOrder: string[] = [];
  const cgSegs = new Map<string, LeaveInterval[]>();
  for (const s of segments) {
    const key = s.caregiver ?? "Ledig";
    if (!cgSegs.has(key)) {
      cgSegs.set(key, []);
      cgOrder.push(key);
    }
    cgSegs.get(key)!.push(s);
  }
  const colW = cgOrder.length > 1 ? 12 : 16;
  const colGap = 6;
  const gutterW =
    cgOrder.length > 0
      ? cgOrder.length * colW + (cgOrder.length - 1) * colGap
      : 0;
  const hasLagsta = segments.some((s) => s.tier === "lagsta");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tidslinje</CardTitle>
        <CardDescription>
          Vem är ledig när, längs viktiga åldersgränser och datum.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3">
          {/* Gantt gutter — one column per caregiver, sharing the axis */}
          {gutterW > 0 && (
            <div
              className="relative shrink-0"
              style={{ width: gutterW, height: totalHeight }}
            >
              {cgOrder.map((name, idx) =>
                cgSegs.get(name)!.map((seg, j) => {
                  const top = yAt(seg.startsAt);
                  const h = Math.max(3, yAt(seg.endsAt) - top);
                  return (
                    <div
                      key={`${idx}-${j}`}
                      title={`${name}: ${formatPace(seg.pace)} dagar/vecka · ≈ ${formatSek(
                        seg.monthly,
                      )}/mån`}
                      className={cn(
                        "absolute rounded-sm",
                        CG_BAR[idx % CG_BAR.length],
                        seg.tier === "lagsta" && "opacity-50",
                      )}
                      style={{
                        left: idx * (colW + colGap),
                        width: colW,
                        top,
                        height: h,
                      }}
                    />
                  );
                }),
              )}
            </div>
          )}

          {/* Timeline column — connector, ellipses and dated markers */}
          <div className="relative flex-1" style={{ height: totalHeight }}>
            {last > 0 && (
              <div
                aria-hidden="true"
                className="bg-border absolute w-px -translate-x-1/2"
                style={{ left: RAIL_X, top: yPos[0], height: yPos[last] - yPos[0] }}
              />
            )}

            {/* "≈ X år" chips where a long gap is compressed */}
            {milestones.map((m, i) =>
              i < last && segCompressed[i] ? (
                <span
                  key={`gap-${i}`}
                  className="bg-card text-muted-foreground absolute -translate-x-1/2 -translate-y-1/2 rounded px-1 text-[10px] whitespace-nowrap"
                  style={{
                    left: RAIL_X,
                    top: (yPos[i] + yPos[i + 1]) / 2,
                  }}
                >
                  {gapLabel(differenceInDays(m.date, milestones[i + 1].date))}
                </span>
              ) : null,
            )}

            {milestones.map((m, i) => {
              const Icon = m.icon;
              const isToday = m.variant === "today";
              const isProjected = m.variant === "projected";
              const isPast = !isToday && m.date.getTime() < asOf.getTime();
              return (
                <div
                  key={i}
                  className="absolute flex -translate-y-1/2 items-center gap-3"
                  style={{ left: 0, right: 0, top: yPos[i] }}
                >
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
                  <div className="min-w-0 flex-1">
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
                    <p className="text-muted-foreground text-xs">{m.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend for the Gantt columns */}
        {cgOrder.length > 0 && (
          <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {cgOrder.map((name, idx) => (
              <span key={name} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-block size-2.5 rounded-sm",
                    CG_BAR[idx % CG_BAR.length],
                  )}
                />
                {name}
              </span>
            ))}
            {hasLagsta && <span>ljusare = lägstanivå</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
