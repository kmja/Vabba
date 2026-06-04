import { CircleAlert, Info, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { PlanWarning, WarningLevel } from "@/lib/optimizer";

const LEVEL_ORDER: Record<WarningLevel, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const LEVEL_TITLE: Record<WarningLevel, string> = {
  critical: "Viktigt",
  warning: "Att tänka på",
  info: "Bra att veta",
};

export function WarningsList({ warnings }: { warnings: PlanWarning[] }) {
  if (warnings.length === 0) return null;

  const sorted = [...warnings].sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level],
  );

  const prominent = sorted.filter((w) => w.level !== "info");
  const info = sorted.filter((w) => w.level === "info");

  return (
    <div className="space-y-3">
      {prominent.map((w, i) => (
        <Alert
          key={`p-${i}`}
          variant={w.level === "critical" ? "destructive" : "warning"}
        >
          {w.level === "critical" ? <TriangleAlert /> : <CircleAlert />}
          <AlertTitle>{LEVEL_TITLE[w.level]}</AlertTitle>
          <AlertDescription>{w.message}</AlertDescription>
        </Alert>
      ))}

      {info.length > 0 && (
        <div className="rounded-lg border p-4">
          <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm font-medium">
            <Info className="size-4" />
            {LEVEL_TITLE.info}
          </div>
          <ul className="space-y-1.5">
            {info.map((w, i) => (
              <li
                key={`i-${i}`}
                className="text-muted-foreground flex gap-2 text-sm"
              >
                <span aria-hidden className="text-muted-foreground/60 mt-0.5">
                  •
                </span>
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
