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
import {
  type MonthlyRow,
  formatMonths,
  householdMonthly,
  ownMonthly,
} from "@/components/monthly-estimate";
import { cn } from "@/lib/utils";
import type { PlanDeadlines } from "@/lib/calc";
import { addYears, differenceInDays, monthsBetween } from "@/lib/dates";
import {
  approxLeaveMonths,
  approxMonthlyGross,
  formatDate,
  formatDays,
  formatPace,
  formatSek,
} from "@/lib/format";
import {
  MONEY,
  SGI_PROTECTION,
  lagstanivaDailyAmount,
  netAfterTax,
} from "@/lib/rules";
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
// gridline's label so neighbours don't collide.
const COMPRESS_MONTHS = 15;
const PX_PER_MONTH = 30;
const MIN_GAP_PX = 64;
const MAX_GAP_PX = 180;
const COMPRESSED_PX = 70;
const TOP_PAD = 26;
const BOTTOM_PAD = 40;
// Rough height a period card needs, so the rail reserves room beside it.
const EST_CARD_PX = 156;

const CG_BAR = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4"];
const CG_BORDER_L = [
  "border-l-chart-1",
  "border-l-chart-2",
  "border-l-chart-3",
  "border-l-chart-4",
];
const CG_BORDER_R = [
  "border-r-chart-1",
  "border-r-chart-2",
  "border-r-chart-3",
  "border-r-chart-4",
];

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

/**
 * The detail for one caregiver's leave period: what the household lives on,
 * how long it lasts, the pace, and the per-day compensation. It sits in the
 * middle of the timeline, hugging the side of that caregiver's rail.
 */
function PeriodCard({
  row,
  colorIdx,
  side = "left",
}: {
  row: MonthlyRow;
  colorIdx: number;
  side?: "left" | "right";
}) {
  const gross = approxMonthlyGross(row.dailyRate, row.daysPerWeek);
  const own = ownMonthly(row);
  const hasHousehold = (row.householdBase ?? 0) > 0;
  const months =
    row.leaveMonths != null
      ? formatMonths(row.leaveMonths)
      : approxLeaveMonths(row.days, row.daysPerWeek);

  return (
    <div
      className={cn(
        "bg-card rounded-md border p-3 shadow-sm",
        side === "right"
          ? `border-r-4 ${CG_BORDER_R[colorIdx % CG_BORDER_R.length]}`
          : `border-l-4 ${CG_BORDER_L[colorIdx % CG_BORDER_L.length]}`,
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-medium">{row.name}</span>
        {row.goalLabel && (
          <span className="text-muted-foreground bg-secondary rounded-full px-2 py-0.5 text-[11px] font-medium">
            {row.goalLabel}
          </span>
        )}
      </div>

      {/* Household income — the headline */}
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {hasHousehold ? "Hushåll" : "Per månad"}
        </span>
        <span className="text-xl font-bold tabular-nums">
          {formatSek(householdMonthly(row))}
          <span className="text-muted-foreground text-xs font-normal">/mån</span>
        </span>
      </div>
      {hasHousehold && (
        <div className="text-muted-foreground text-[11px] tabular-nums">
          {row.name} ≈ {formatSek(own)}
          {row.partTimeSalary
            ? ` + deltidslön ≈ ${formatSek(row.partTimeSalary)}`
            : ""}
          {row.partnerWorking
            ? ` + ${row.partnerWorking}s lön ≈ ${formatSek(row.householdBase ?? 0)}`
            : ""}
        </div>
      )}

      {/* Length + pace + per-day compensation */}
      <div className="mt-1.5 text-xs tabular-nums">
        <span className="font-medium">{months}</span> · {formatDays(row.days)} ·{" "}
        {formatPace(row.daysPerWeek)} dagar/vecka
        {row.secondPhase ? " första året" : ""}
      </div>
      <div className="text-muted-foreground text-[11px] tabular-nums">
        {formatSek(gross)}/mån föräldrapenning · {formatSek(row.dailyRate)}/dag ·
        ≈ {formatSek(netAfterTax(gross))} efter skatt
      </div>

      {row.secondPhase && (
        <div className="mt-0.5 text-[11px] tabular-nums">
          Efter 1 år: ≈ {formatSek(row.secondPhase.monthly)}/mån vid{" "}
          {formatPace(row.secondPhase.daysPerWeek)} dagar/vecka
        </div>
      )}
      {row.supplement && (
        <div className="mt-0.5 text-[11px]">
          + Föräldralön (arbetsgivaren) ≈ {formatSek(row.supplement.monthly)}/mån
          i ca {row.supplement.months} mån
          {row.aboveCap ? " · täcker även lön över taket" : ""}
        </div>
      )}
      {row.grundnivaFirstDays ? (
        <div className="mt-0.5 text-[11px]">
          Första {formatDays(row.grundnivaFirstDays)} på grundnivå (
          {formatSek(MONEY.grundnivaPerDay)}/dag) — 240-dagarsvillkoret är inte
          uppfyllt.
        </div>
      ) : null}
      {row.extraDays ? (
        <div className="text-muted-foreground mt-0.5 text-[11px]">
          inkl. {formatDays(row.extraDays)} sparade från tidigare barn
        </div>
      ) : null}
    </div>
  );
}

export function Timeline({
  deadlines,
  asOf,
  projection,
  rows = [],
}: {
  deadlines: PlanDeadlines;
  asOf: Date;
  projection?: LeaveProjection;
  /** Per-caregiver leave detail, shown in the middle of the timeline. */
  rows?: MonthlyRow[];
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

  // Vertical position of each milestone (proportional within ~15 months, then
  // compressed), and a date→y map the rails and cards share.
  const last = milestones.length - 1;
  const yPos: number[] = [];
  const segCompressed: boolean[] = [];
  let y = TOP_PAD;
  milestones.forEach((m, i) => {
    yPos[i] = y;
    if (i < last) {
      const gd = differenceInDays(m.date, milestones[i + 1].date);
      const compressed = gd / DAYS_PER_MONTH > COMPRESS_MONTHS;
      segCompressed[i] = compressed;
      y += compressed ? COMPRESSED_PX : proportionalGap(gd);
    }
  });

  // Group leave segments per caregiver, in turn order. The first caregiver
  // becomes the left rail, the second the right rail.
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
  const hasLagsta = segments.some((s) => s.tier === "lagsta");
  const rowByName = new Map(rows.map((r) => [r.name, r]));

  // Guarantee each period has enough vertical room that its card clears the
  // label sitting at its end boundary (handover / leave-end), which lands on
  // the same side as the card. Short leaves (e.g. the reserved 90 days) would
  // otherwise collide — so we stretch the timeline there instead.
  const milestoneIndexAt = (d: Date): number => {
    const t = d.getTime();
    let best = 0;
    let bestDiff = Infinity;
    milestones.forEach((m, i) => {
      const diff = Math.abs(m.date.getTime() - t);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    });
    return best;
  };
  const MIN_PERIOD_PX = EST_CARD_PX + 30;
  for (const name of cgOrder) {
    const segs = cgSegs.get(name)!;
    if (!rowByName.has(name)) continue;
    const sIdx = milestoneIndexAt(segs[0].startsAt);
    const eIdx = milestoneIndexAt(segs[segs.length - 1].endsAt);
    const deficit = MIN_PERIOD_PX - (yPos[eIdx] - yPos[sIdx]);
    if (eIdx > sIdx && deficit > 0) {
      for (let k = eIdx; k <= last; k++) yPos[k] += deficit;
    }
  }

  const yAt = (date: Date): number => {
    if (milestones.length === 0) return TOP_PAD;
    const t = date.getTime();
    if (t <= milestones[0].date.getTime()) return yPos[0];
    for (let i = 0; i < last; i++) {
      const a = milestones[i].date.getTime();
      const b = milestones[i + 1].date.getTime();
      if (t <= b) {
        const frac = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
        return yPos[i] + frac * (yPos[i + 1] - yPos[i]);
      }
    }
    return yPos[last];
  };

  // Which caregiver (rail index) is on leave at a given date — used to place a
  // milestone's label on the opposite side from the active period card.
  const sideAt = (date: Date): number => {
    const t = date.getTime();
    for (const s of segments) {
      if (s.startsAt.getTime() <= t && t < s.endsAt.getTime()) {
        return cgOrder.indexOf(s.caregiver ?? "Ledig");
      }
    }
    return -1;
  };

  // Pair each caregiver's leave with its detail row; the card hugs that
  // caregiver's rail (even index → left, odd → right) at the leave's start.
  const periods = cgOrder
    .map((name, idx) => {
      const row = rowByName.get(name);
      if (!row) return null;
      const segs = cgSegs.get(name)!;
      return {
        row,
        colorIdx: idx,
        side: (idx % 2 === 0 ? "left" : "right") as "left" | "right",
        top: yAt(segs[0].startsAt),
      };
    })
    .filter(
      (
        p,
      ): p is {
        row: MonthlyRow;
        colorIdx: number;
        side: "left" | "right";
        top: number;
      } => Boolean(p),
    );

  // Reserve enough height that the lowest card and rail don't spill over.
  const milestoneHeight = (yPos[last] ?? TOP_PAD) + BOTTOM_PAD;
  const cardsBottom = periods.reduce(
    (mx, p) => Math.max(mx, p.top + EST_CARD_PX),
    0,
  );
  const railBottom = segments.reduce((mx, s) => Math.max(mx, yAt(s.endsAt)), 0);
  const totalHeight = Math.max(
    milestoneHeight,
    cardsBottom + BOTTOM_PAD,
    railBottom + BOTTOM_PAD,
  );

  const leftName = cgOrder[0];
  const rightName = cgOrder.length > 1 ? cgOrder[1] : undefined;

  const renderRail = (name: string, colorIdx: number) => (
    <div className="relative w-3 shrink-0 sm:w-4" style={{ height: totalHeight }}>
      <div className="bg-muted absolute inset-0 rounded-full" />
      {(cgSegs.get(name) ?? []).map((seg, j) => {
        const top = yAt(seg.startsAt);
        const h = Math.max(4, yAt(seg.endsAt) - top);
        return (
          <div
            key={j}
            title={`${name}: ${formatPace(seg.pace)} dagar/vecka · ≈ ${formatSek(
              seg.monthly,
            )}/mån`}
            className={cn(
              "absolute inset-x-0 rounded-full",
              CG_BAR[colorIdx % CG_BAR.length],
              seg.tier === "lagsta" && "opacity-50",
            )}
            style={{ top, height: h }}
          />
        );
      })}
    </div>
  );

  // Föräldralön / SGI footnotes, carried over from the old monthly card.
  const supplementTotal = rows.reduce(
    (sum, r) => sum + (r.supplement?.total ?? 0),
    0,
  );
  const aboveCapWithSupplement = rows.some((r) => r.supplement && r.aboveCap);
  const belowSgiFloor = rows.some(
    (r) =>
      (r.secondPhase?.daysPerWeek ?? r.daysPerWeek) <
      SGI_PROTECTION.minDaysPerWeekAfterAge1,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tidslinje</CardTitle>
        <CardDescription>
          Vem är ledig när (rälsarna i kanten), vad hushållet får in under varje
          period (i mitten), och de viktiga åldersgränserna.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-stretch gap-2 sm:gap-3">
          {/* Left rail — first caregiver */}
          {leftName && renderRail(leftName, 0)}

          {/* Middle — milestone gridlines and the active period cards */}
          <div className="relative flex-1" style={{ height: totalHeight }}>
            {milestones.map((m, i) => {
              const Icon = m.icon;
              const isToday = m.variant === "today";
              const isProjected = m.variant === "projected";
              const isPast = !isToday && m.date.getTime() < asOf.getTime();
              const pillSide = sideAt(m.date) === 0 ? "right" : "left";
              return (
                <div key={i}>
                  {/* full-width reference line */}
                  <div
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-0 border-t border-dashed",
                      isToday ? "border-primary/40" : "border-border/60",
                    )}
                    style={{ top: yPos[i] }}
                  />
                  {/* compact label, placed opposite the active period card */}
                  <div
                    className={cn(
                      "bg-card/95 absolute z-20 flex max-w-[40%] -translate-y-1/2 flex-col rounded-md border px-2 py-1 shadow-sm",
                      isToday && "border-primary/50",
                    )}
                    style={{ top: yPos[i], [pillSide]: 0 }}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon
                        className={cn(
                          "size-3.5 shrink-0",
                          isToday
                            ? "text-primary"
                            : isProjected
                              ? "text-chart-2"
                              : isPast
                                ? "text-muted-foreground"
                                : "text-foreground",
                        )}
                      />
                      <span
                        className={cn(
                          "text-xs font-medium",
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
                        className="text-muted-foreground ml-auto pl-1 text-[10px] tabular-nums"
                      >
                        {formatDate(m.date)}
                      </time>
                    </div>
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[10px] leading-snug">
                      {m.desc}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* "≈ X år" where a long gap is compressed */}
            {milestones.map((m, i) =>
              i < last && segCompressed[i] ? (
                <span
                  key={`gap-${i}`}
                  className="bg-card text-muted-foreground absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded px-1.5 text-[10px] whitespace-nowrap"
                  style={{ top: (yPos[i] + yPos[i + 1]) / 2 }}
                >
                  {gapLabel(differenceInDays(m.date, milestones[i + 1].date))}
                </span>
              ) : null,
            )}

            {/* Period detail cards, hugging their caregiver's rail */}
            {periods.map((p) => (
              <div
                key={`pc-${p.colorIdx}`}
                className="absolute w-[58%]"
                style={{ top: p.top, [p.side]: 0 }}
              >
                <PeriodCard row={p.row} colorIdx={p.colorIdx} side={p.side} />
              </div>
            ))}
          </div>

          {/* Right rail — second caregiver */}
          {rightName && renderRail(rightName, 1)}
        </div>

        {/* When there are no dated segments to anchor to, just list the cards. */}
        {periods.length === 0 && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((row, i) => (
              <PeriodCard key={`f-${i}`} row={row} colorIdx={i} />
            ))}
          </div>
        )}

        {/* Legend for the rails */}
        {cgOrder.length > 0 && (
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {cgOrder.map((name, idx) => (
              <span key={name} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-block size-2.5 rounded-sm",
                    CG_BAR[idx % CG_BAR.length],
                  )}
                />
                {name}
                {idx === 0 ? " (vänster)" : idx === 1 ? " (höger)" : ""}
              </span>
            ))}
            {hasLagsta && <span>ljusare = lägstanivå</span>}
          </div>
        )}

        {/* Carried-over notes about föräldralön and SGI. */}
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
