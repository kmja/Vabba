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
import { addYears, monthsBetween } from "@/lib/dates";
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
          Viktiga åldersgränser och datum för er plan.
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

        <div className="relative">
          {/* Vertical connector line */}
          <div
            className="bg-border absolute bottom-4 left-4 top-4 w-px"
            aria-hidden="true"
          />

          <ol className="space-y-6">
            {milestones.map((m, i) => {
              const Icon = m.icon;
              const isToday = m.variant === "today";
              const isProjected = m.variant === "projected";
              const isPast = !isToday && m.date.getTime() < asOf.getTime();

              return (
                <li key={i} className="relative flex gap-4">
                  {/* Icon circle — sits on top of the vertical line */}
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

                  {/* Text */}
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
        </div>
      </CardContent>
    </Card>
  );
}
