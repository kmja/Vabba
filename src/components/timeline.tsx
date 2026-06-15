import {
  Apple,
  ArrowRightLeft,
  Baby,
  Bird,
  Bug,
  CalendarDays,
  CircleAlert,
  Clock,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  Coffee,
  Coins,
  Cookie,
  Flower,
  Flower2,
  Footprints,
  IceCreamCone,
  Laugh,
  Leaf,
  MessageCircle,
  Palmtree,
  PersonStanding,
  Sailboat,
  ShieldCheck,
  Smile,
  Snowflake,
  Sprout,
  Sun,
  Umbrella,
  Users,
  Wallet,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";

import {
  type MonthlyRow,
  formatMonths,
  householdMonthly,
  ownMonthly,
} from "@/components/monthly-estimate";
import { cn } from "@/lib/utils";
import type { PlanDeadlines } from "@/lib/calc";
import {
  addDays,
  addMonths,
  addYears,
  differenceInDays,
  monthsBetween,
} from "@/lib/dates";
import {
  approxLeaveMonths,
  approxMonthlyGross,
  formatDate,
  formatDays,
  formatPace,
  formatSek,
} from "@/lib/format";
import { MONEY, netAfterTax } from "@/lib/rules";
import type { LeaveInterval } from "@/lib/projection";

export interface LeaveProjection {
  /** Ordered stretches of leave; boundaries become timeline markers. */
  segments: LeaveInterval[];
}

type MilestoneVariant = "legal" | "projected" | "today" | "ambient";

// Relatable, low-key reference points so the long first stretch is readable.
const DEVELOPMENT: { months: number; icon: LucideIcon; title: string }[] = [
  { months: 1.5, icon: Smile, title: "Första leendet" },
  { months: 4, icon: Laugh, title: "Skrattar och jollrar" },
  { months: 8, icon: Footprints, title: "Börjar krypa" },
  { months: 12, icon: PersonStanding, title: "Första stegen" },
  { months: 18, icon: MessageCircle, title: "Springer och pratar" },
];
// Seasonal imagery scattered sparsely across the timeline. Each motif only
// appears in the months it makes sense (snow in deep winter, cocoa across
// autumn/winter, blooms in spring, …) so icons land at reasonable dates.
const MOTIFS: { icon: LucideIcon; months: number[] }[] = [
  { icon: Sprout, months: [2, 3] },
  { icon: Bird, months: [2, 3, 4] },
  { icon: CloudRain, months: [2, 3] },
  { icon: Flower2, months: [3, 4, 5] },
  { icon: Flower, months: [3, 4, 5] },
  { icon: Bug, months: [4, 5, 6] },
  { icon: Sun, months: [5, 6, 7] },
  { icon: Umbrella, months: [5, 6, 7] },
  { icon: IceCreamCone, months: [5, 6, 7] },
  { icon: Waves, months: [5, 6, 7] },
  { icon: Palmtree, months: [6, 7] },
  { icon: Sailboat, months: [5, 6, 7] },
  { icon: Apple, months: [7, 8, 9] },
  { icon: Leaf, months: [8, 9, 10] },
  { icon: Wind, months: [8, 9, 10] },
  { icon: CloudDrizzle, months: [8, 9, 10] },
  { icon: Coffee, months: [8, 9, 10, 11, 0, 1] }, // warm drinks, autumn → winter
  { icon: CloudSnow, months: [10, 11, 0, 1] },
  { icon: Snowflake, months: [11, 0, 1] },
  { icon: Cookie, months: [11, 0] },
];

// Hue + brightness at the middle of each season; the wash interpolates between
// them so seasons blend. Spring and summer are brighter (the sun coming out).
const SEASON_HUES: { day: number; rgb: [number, number, number]; a: number }[] =
  [
    { day: 15, rgb: [125, 211, 252], a: 0.1 }, // winter — icy blue
    { day: 105, rgb: [150, 240, 165], a: 0.17 }, // spring — fresh green, brighter
    { day: 196, rgb: [253, 224, 90], a: 0.21 }, // summer — sunlight, brightest
    { day: 288, rgb: [251, 170, 100], a: 0.12 }, // autumn — orange
  ];

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getFullYear(), 0, 0);
  const here = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((here - start) / 86_400_000);
}

/** Smoothly blended, brightness-varying seasonal wash for a date. */
function seasonColor(date: Date): string {
  const ext = [
    { ...SEASON_HUES[3], day: SEASON_HUES[3].day - 365 },
    ...SEASON_HUES,
    { ...SEASON_HUES[0], day: SEASON_HUES[0].day + 365 },
  ];
  const d = dayOfYear(date);
  let i = 0;
  while (i < ext.length - 2 && d >= ext[i + 1].day) i++;
  const a = ext[i];
  const b = ext[i + 1];
  const t = b.day === a.day ? 0 : (d - a.day) / (b.day - a.day);
  const mix = (k: number) => Math.round(a.rgb[k] + (b.rgb[k] - a.rgb[k]) * t);
  const alpha = (a.a + (b.a - a.a) * t).toFixed(3);
  return `rgba(${mix(0)}, ${mix(1)}, ${mix(2)}, ${alpha})`;
}
const SV_MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

interface Milestone {
  date: Date;
  icon: LucideIcon;
  title: string;
  desc: string;
  variant: MilestoneVariant;
}

interface Period {
  row: MonthlyRow;
  colorIdx: number;
  side: "left" | "right";
  startDate: Date;
}

const DAYS_PER_MONTH = 30.44;
// Rows are spaced proportionally to the real time between them within ~15
// months; longer gaps collapse to a compact label. The scale is generous so
// each leave period keeps a true, card-sized proportion (the timeline simply
// grows taller) and dragging a length slider visibly moves the timeline.
const COMPRESS_MONTHS = 15;
const PX_PER_MONTH = 46;
const MIN_GAP_PX = 12;
const MAX_GAP_PX = 480;
const COMPRESSED_PX = 56;

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

/** A dated marker in the middle column: birth, the age gates, handovers, etc. */
function MilestoneLabel({ m, asOf }: { m: Milestone; asOf: Date }) {
  const Icon = m.icon;
  const isToday = m.variant === "today";
  const isProjected = m.variant === "projected";
  const isPast = !isToday && m.date.getTime() < asOf.getTime();

  // Developmental & seasonal hints are quiet, single-line reference points.
  if (m.variant === "ambient") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-xs",
          isPast ? "text-muted-foreground/60" : "text-muted-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span>{m.title}</span>
        <time
          dateTime={m.date.toISOString().slice(0, 10)}
          className="ml-auto text-[10px] tabular-nums opacity-80"
        >
          {formatDate(m.date)}
        </time>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border",
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
          </span>
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
        </span>
        <time
          dateTime={m.date.toISOString().slice(0, 10)}
          className="text-muted-foreground text-xs tabular-nums"
        >
          {formatDate(m.date)}
        </time>
      </div>
      <p className="text-muted-foreground mt-0.5 pl-8 text-xs">{m.desc}</p>
    </div>
  );
}

/**
 * The detail for one caregiver's leave period: what the household lives on,
 * how long it lasts, the pace, and the per-day compensation.
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
          {formatSek(MONEY.grundnivaPerDay)}/dag)
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

  // Developmental reference points across the first two years, so the long
  // pre-1-year stretch has relatable markers to read against.
  const ambientCap = addMonths(birth, 24);
  const inAmbientWindow = (d: Date) =>
    d.getTime() > birth.getTime() &&
    d.getTime() <= ambientCap.getTime() &&
    d.getTime() <= deadlines.expiry.getTime();
  const ambient: Milestone[] = [];
  for (const d of DEVELOPMENT) {
    const date = addDays(birth, Math.round(d.months * 30.44));
    if (inAmbientWindow(date)) {
      ambient.push({
        date,
        icon: d.icon,
        title: d.title,
        desc: "",
        variant: "ambient",
      });
    }
  }

  const milestones = [
    ...legal,
    ...projected,
    ...ambient,
    ...(showToday ? [today] : []),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

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
  const leftName = cgOrder[0];
  const rightName = cgOrder.length > 1 ? cgOrder[1] : undefined;

  const rowByName = new Map(rows.map((r) => [r.name, r]));
  const periods: Period[] = cgOrder
    .map((name, idx) => {
      const row = rowByName.get(name);
      if (!row) return null;
      const segs = cgSegs.get(name)!;
      return {
        row,
        colorIdx: idx,
        side: (idx % 2 === 0 ? "left" : "right") as "left" | "right",
        startDate: segs[0].startsAt,
      };
    })
    .filter((p): p is Period => Boolean(p));

  const segAt = (date: Date): LeaveInterval | undefined => {
    const t = date.getTime();
    return segments.find(
      (s) => s.startsAt.getTime() <= t && t < s.endsAt.getTime(),
    );
  };

  // Merge milestones, period-starts and faint month notches into one
  // date-ordered list of rows. Each row gets the leave segments as full-height
  // side rails, with the detail/label in the middle — so nothing is squeezed
  // side-by-side, and the timeline simply grows taller when content needs room.
  type Item =
    | { kind: "milestone"; date: Date; ord: number; m: Milestone }
    | { kind: "period"; date: Date; ord: number; period: Period }
    | { kind: "month"; date: Date; ord: number; label: string };

  // Faint month notches across the proportional first ~15 months, skipping any
  // that land on an existing marker so they read as a quiet ruler underneath.
  const occupied = milestones.map((m) => m.date.getTime());
  const monthItems: { date: Date; label: string }[] = [];
  for (let n = 1; n <= 15; n++) {
    const date = addMonths(birth, n);
    if (date.getTime() > deadlines.expiry.getTime()) break;
    const near = occupied.some(
      (t) => Math.abs(t - date.getTime()) < 12 * 86_400_000,
    );
    if (!near) monthItems.push({ date, label: SV_MONTHS[date.getMonth()] });
  }

  const items: Item[] = [
    ...milestones.map((m) => ({
      kind: "milestone" as const,
      date: m.date,
      ord: 1,
      m,
    })),
    ...periods.map((p) => ({
      kind: "period" as const,
      date: p.startDate,
      ord: 2,
      period: p,
    })),
    ...monthItems.map((mo) => ({
      kind: "month" as const,
      date: mo.date,
      ord: 0,
      label: mo.label,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.ord - b.ord);

  const minH: number[] = [];
  const compressed: boolean[] = [];
  const gapDays: number[] = [];
  items.forEach((it, i) => {
    const next = items[i + 1];
    if (!next) {
      minH[i] = 0;
      compressed[i] = false;
      gapDays[i] = 0;
      return;
    }
    const gd = differenceInDays(it.date, next.date);
    const c = gd / DAYS_PER_MONTH > COMPRESS_MONTHS;
    minH[i] = c ? COMPRESSED_PX : proportionalGap(gd);
    compressed[i] = c;
    gapDays[i] = gd;
  });

  // A small, date-appropriate seasonal icon on roughly some rows — sparse and
  // scattered, drawn faintly behind the content.
  const decorFor = (date: Date, idx: number) => {
    if (
      date.getTime() <= birth.getTime() ||
      date.getTime() > ambientCap.getTime()
    )
      return null;
    const month = date.getMonth();
    const valid = MOTIFS.filter((mo) => mo.months.includes(month));
    if (valid.length === 0) return null;
    const seed = (idx * 31 + month * 7 + date.getDate()) % 997;
    if (seed % 5 < 2) return null; // skip ~40% of rows → moderately sparse
    return {
      Icon: valid[seed % valid.length].icon,
      left: 8 + (seed % 82), // 8%–90%
      top: ((seed * 13) % 22) - 4, // small vertical jitter
      size: 16 + (seed % 17), // 16–32px
    };
  };

  const railCell = (idx: number, activeIdx: number, lagsta: boolean) => (
    <div
      className={cn(
        "w-2.5 shrink-0 self-stretch sm:w-3.5",
        activeIdx === idx
          ? cn(CG_BAR[idx % CG_BAR.length], lagsta && "opacity-50")
          : "bg-muted",
      )}
    />
  );

  return (
    <section className="bg-card text-card-foreground ml-[calc(50%_-_50vw)] w-screen space-y-4 py-6">
      <div className="space-y-1.5 px-4 sm:px-6">
        <h2 className="leading-none font-semibold">Tidslinje</h2>
        <p className="text-muted-foreground text-sm">
          Vem är ledig när (färgremsorna i kanten) och vad hushållet får in
          under varje period — längs de viktiga åldersgränserna.
        </p>
      </div>
      <div>
          {items.map((it, i) => {
            const active = segAt(it.date);
            const activeIdx = active
              ? cgOrder.indexOf(active.caregiver ?? "Ledig")
              : -1;
            const lagsta = active?.tier === "lagsta";
            // Blend the wash as a gradient from this row's date to the next, so
            // it flows smoothly through the seasons regardless of row heights.
            const colorAt = (d: Date) =>
              d.getTime() <= ambientCap.getTime() ? seasonColor(d) : "transparent";
            const nextItem = items[i + 1];
            const wash = `linear-gradient(to bottom, ${colorAt(it.date)}, ${colorAt(
              nextItem ? nextItem.date : it.date,
            )})`;
            const decor = decorFor(it.date, i);
            return (
              <div
                key={i}
                className="relative isolate flex items-stretch gap-2 sm:gap-3"
                style={{ minHeight: minH[i] || undefined, backgroundImage: wash }}
              >
                {decor && (
                  <decor.Icon
                    aria-hidden
                    size={decor.size}
                    className="text-muted-foreground/25 pointer-events-none absolute -z-10 -translate-x-1/2"
                    style={{ left: `${decor.left}%`, top: decor.top }}
                  />
                )}
                {leftName && railCell(0, activeIdx, lagsta)}

                <div className="flex min-w-0 flex-1 flex-col py-1.5">
                  {it.kind === "period" ? (
                    <div
                      className={cn(
                        "w-full max-w-md",
                        it.period.side === "right" && "ml-auto",
                      )}
                    >
                      <PeriodCard
                        row={it.period.row}
                        colorIdx={it.period.colorIdx}
                        side={it.period.side}
                      />
                    </div>
                  ) : it.kind === "month" ? (
                    <div className="text-muted-foreground/45 flex items-center gap-1.5 text-[9px] font-medium tracking-wide uppercase">
                      <span aria-hidden className="bg-border/70 h-px w-3 shrink-0" />
                      {it.label}
                    </div>
                  ) : (
                    <MilestoneLabel m={it.m} asOf={asOf} />
                  )}
                  {compressed[i] && (
                    <div className="text-muted-foreground my-auto self-center pt-2 text-[10px] tabular-nums">
                      {gapLabel(gapDays[i])}
                    </div>
                  )}
                </div>

                {rightName && railCell(1, activeIdx, lagsta)}
              </div>
            );
          })}
        </div>

        {/* No dated segments to anchor to — just list the period detail. */}
        {periods.length === 0 && rows.length > 0 && (
          <div className="space-y-2 px-4 sm:px-6">
            {rows.map((row, i) => (
              <PeriodCard key={`f-${i}`} row={row} colorIdx={i} />
            ))}
          </div>
        )}

        {/* Legend for the rails */}
        {cgOrder.length > 0 && (
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 px-4 text-[11px] sm:px-6">
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
    </section>
  );
}
