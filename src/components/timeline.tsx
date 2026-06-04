import {
  Baby,
  CircleAlert,
  Clock,
  ShieldCheck,
  Users,
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
import { formatDate } from "@/lib/format";

interface Milestone {
  date: Date;
  icon: LucideIcon;
  title: string;
  desc: string;
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
}: {
  deadlines: PlanDeadlines;
  asOf: Date;
}) {
  const birth = deadlines.birth;

  const milestones: Milestone[] = [
    {
      date: birth,
      icon: Baby,
      title: "Barnet föds",
      desc: "SGI är fullt skyddad under barnets första år.",
    },
    {
      date: addYears(birth, 1),
      icon: ShieldCheck,
      title: "1 år",
      desc: "Därefter krävs minst 5 uttag/vecka (eller arbete) för att behålla SGI.",
    },
    {
      date: deadlines.doubleDaysDeadline,
      icon: Users,
      title: "15 månader",
      desc: "Sista chansen att ta ut dubbeldagar (upp till 60 stycken).",
    },
    {
      date: deadlines.sjukpenningDeadline,
      icon: Clock,
      title: "4 år",
      desc: "Inkomstbaserade dagar måste vara uttagna. Därefter får högst 96 dagar sparas.",
    },
    {
      date: deadlines.expiry,
      icon: CircleAlert,
      title: "12 år",
      desc: "Alla föräldrapenningdagar förfaller.",
    },
  ];

  const span = monthsBetween(birth, deadlines.expiry) || 144;
  const ageMonths = monthsBetween(birth, asOf);
  const pos = (d: Date) =>
    Math.max(0, Math.min(100, (monthsBetween(birth, d) / span) * 100));
  const age4Pos = pos(deadlines.sjukpenningDeadline);
  const todayPos = pos(asOf);
  const showToday = ageMonths >= 0 && ageMonths <= span;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tidslinje</CardTitle>
        <CardDescription>
          Viktiga åldersgränser. Barnets ålder idag: {childAgeLabel(ageMonths)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Phase bar: income-based window (0–4 y) then saved-days window (4–12 y) */}
        <div className="space-y-2 pt-3">
          <div className="relative h-2.5 w-full rounded-full bg-muted">
            <div
              className="bg-chart-1/50 absolute inset-y-0 left-0 rounded-l-full"
              style={{ width: `${age4Pos}%` }}
            />
            <div
              className="bg-chart-4/40 absolute inset-y-0 right-0 rounded-r-full"
              style={{ left: `${age4Pos}%` }}
            />
            {showToday && (
              <div
                className="bg-foreground absolute -top-1.5 -bottom-1.5 w-0.5 -translate-x-1/2 rounded"
                style={{ left: `${todayPos}%` }}
                title="Idag"
              >
                <span className="text-foreground absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium">
                  Idag
                </span>
              </div>
            )}
          </div>
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>0 år</span>
            <span className="hidden sm:inline">inkomstbaserade dagar</span>
            <span>4 år</span>
            <span className="hidden sm:inline">sparade dagar</span>
            <span>12 år</span>
          </div>
        </div>

        {/* Milestones */}
        <ol className="space-y-4">
          {milestones.map((m, i) => {
            const Icon = m.icon;
            const isPast =
              ageMonths >= 0 && monthsBetween(birth, m.date) <= ageMonths;
            return (
              <li key={i} className="flex gap-3">
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border",
                    isPast
                      ? "bg-muted text-muted-foreground"
                      : "bg-background text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{m.title}</span>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {formatDate(m.date)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm">{m.desc}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
