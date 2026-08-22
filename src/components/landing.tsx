"use client";

import { IconChevronRight, IconPlus, IconTrash } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { SavedPlan } from "@/lib/saved-plans";

export function Landing({
  savedPlans,
  hasProgress,
  progressLabel,
  progressDone,
  onCreate,
  onContinue,
  onOpen,
  onDelete,
}: {
  savedPlans: SavedPlan[];
  /** There's a plan in progress (or done) that hasn't necessarily been saved. */
  hasProgress: boolean;
  progressLabel: string;
  progressDone: boolean;
  onCreate: () => void;
  onContinue: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Planera föräldraledigheten</h1>
        <p className="text-muted-foreground text-sm">
          Räkna ut hur föräldradagarna och inkomsten fördelar sig bäst mellan
          er, dag för dag. Allt sker i webbläsaren — inget skickas till någon
          server.
        </p>
      </div>

      {hasProgress && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                Fortsätt: {progressLabel}
              </p>
              <p className="text-muted-foreground text-xs">
                {progressDone ? "Klar plan" : "Påbörjad, inte klar"}
              </p>
            </div>
            <Button type="button" size="sm" onClick={onContinue}>
              Fortsätt <IconChevronRight />
            </Button>
          </CardContent>
        </Card>
      )}

      <Button type="button" id="create-plan" size="lg" onClick={onCreate}>
        <IconPlus /> Skapa ny plan
      </Button>

      {savedPlans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-muted-foreground text-sm font-medium">
            Sparade planer
          </h2>
          <ul className="space-y-2">
            {savedPlans.map((p) => (
              <li key={p.id}>
                <Card className="py-0">
                  <CardContent className="flex items-center gap-2 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onOpen(p.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-muted-foreground text-xs">
                        Sparad {formatDate(new Date(p.savedAt))}
                      </p>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Ta bort ${p.name}`}
                      onClick={() => {
                        if (window.confirm(`Ta bort "${p.name}"?`)) {
                          onDelete(p.id);
                        }
                      }}
                    >
                      <IconTrash />
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
