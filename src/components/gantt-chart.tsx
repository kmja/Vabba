import { cn } from "@/lib/utils";
import { addYears } from "@/lib/dates";
import { formatPace, formatSek } from "@/lib/format";
import type { LeaveInterval } from "@/lib/projection";

/**
 * A compact Gantt of the leave: one row per caregiver, bars placed on a shared
 * calendar axis so you can see who is home when, where they hand over, and where
 * the pace (or pay level) changes.
 */
export function GanttChart({
  segments,
  birth,
  asOf,
}: {
  segments: LeaveInterval[];
  birth: Date;
  asOf: Date;
}) {
  if (segments.length === 0) return null;

  const minTime = Math.min(...segments.map((s) => s.startsAt.getTime()));
  const maxTime = Math.max(...segments.map((s) => s.endsAt.getTime()));
  const span = Math.max(1, maxTime - minTime);
  const pos = (t: number) => ((t - minTime) / span) * 100;

  // Group consecutive segments by caregiver, preserving order of appearance.
  const order: string[] = [];
  const rows = new Map<string, LeaveInterval[]>();
  for (const s of segments) {
    const key = s.caregiver ?? "Ledig";
    if (!rows.has(key)) {
      rows.set(key, []);
      order.push(key);
    }
    rows.get(key)!.push(s);
  }

  // Year gridlines that fall inside the window.
  const ticks: { label: string; left: number }[] = [];
  for (let y = 0; y < 13; y++) {
    const t = addYears(birth, y).getTime();
    const left = pos(t);
    if (left >= -0.5 && left <= 100.5) {
      ticks.push({ label: y === 0 ? "Födsel" : `${y} år`, left });
    }
    if (t > maxTime) break;
  }
  const showToday = asOf.getTime() >= minTime && asOf.getTime() <= maxTime;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Vem är ledig när</div>
      <div className="relative">
        {/* gridlines + today, overlaid on the track area (right of the labels) */}
        <div className="absolute top-0 bottom-5 right-0 left-[4.5rem]">
          {ticks.map((t, i) => (
            <div
              key={i}
              className="bg-border absolute top-0 bottom-0 w-px"
              style={{ left: `${t.left}%` }}
            />
          ))}
          {showToday && (
            <div
              className="bg-foreground/70 absolute top-0 bottom-0 w-px"
              style={{ left: `${pos(asOf.getTime())}%` }}
            />
          )}
        </div>

        {/* one row per caregiver */}
        <div className="relative space-y-1.5">
          {order.map((name) => (
            <div key={name} className="flex items-center gap-2">
              <div className="text-muted-foreground w-16 shrink-0 truncate text-xs">
                {name}
              </div>
              <div className="bg-muted/40 relative h-6 flex-1 rounded">
                {rows.get(name)!.map((seg, i) => {
                  const left = pos(seg.startsAt.getTime());
                  const width = Math.max(
                    1.5,
                    pos(seg.endsAt.getTime()) - left,
                  );
                  return (
                    <div
                      key={i}
                      title={`${formatPace(seg.pace)} dagar/vecka · ≈ ${formatSek(
                        seg.monthly,
                      )}/mån`}
                      className={cn(
                        "absolute inset-y-0 flex items-center justify-center overflow-hidden rounded text-[10px] font-medium text-white",
                        seg.tier === "income" ? "bg-chart-1" : "bg-chart-4/80",
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      {width > 9 ? `${formatPace(seg.pace)}/v` : ""}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* axis labels */}
        <div className="relative mt-1 ml-[4.5rem] h-4">
          {ticks.map((t, i) => (
            <span
              key={i}
              className="text-muted-foreground absolute -translate-x-1/2 text-[10px] whitespace-nowrap"
              style={{ left: `${t.left}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="bg-chart-1 inline-block size-2.5 rounded-sm" />
          Inkomstbaserad nivå
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-chart-4/80 inline-block size-2.5 rounded-sm" />
          Lägstanivå
        </span>
        <span>Siffran i stapeln = dagar/vecka</span>
      </div>
    </div>
  );
}
