"use client";

import { useMemo, useState } from "react";
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsVertical,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  addPeriod,
  editPeriodDays,
  reorderPeriods,
  splitPeriod,
} from "@/lib/period-ops";
import { buildPlanPeriods } from "@/lib/periods";
import type { PeriodSpec } from "@/lib/share";
import { formatDate, formatDays } from "@/lib/format";
import type { PlanDeadlines } from "@/lib/calc";

/**
 * Editable leave periods. Reads/writes the plan's `periods` list (via
 * `onChange`), shows each period dated by `buildPlanPeriods`, and offers
 * Add / Split (with a slider) / Edit length / Move (up-down) / Delete.
 *
 * The day allocation (fixed precedence, leftover fill) and the SGI/age-4
 * constraints live in lib/periods.ts + lib/stretch.ts — this is the UI layer.
 */
export function PeriodEditor({
  periods,
  onChange,
  budgets,
  deadlines,
  names,
}: {
  periods: PeriodSpec[];
  onChange: (periods: PeriodSpec[]) => void;
  /** Total days each caregiver may draw. */
  budgets: Record<"A" | "B", number>;
  deadlines: PlanDeadlines;
  /** Caregiver display names (fall back to "Vårdnadshavare A/B"). */
  names: Record<"A" | "B", string>;
}) {
  const [adding, setAdding] = useState<"A" | "B" | null>(null);
  const [splitting, setSplitting] = useState<string | null>(null);
  const [splitDays, setSplitDays] = useState(0);

  // Reordering is done with clear up/down buttons (reliable on mobile); the
  // row's drag-and-drop was unreliable on touch, so it has been removed.
  const oneYear = useMemo(() => {
    const d = new Date(deadlines.birth);
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d;
  }, [deadlines.birth]);

  const { periods: dated, unused, warnings } = useMemo(
    () =>
      buildPlanPeriods({
        periods,
        budgets,
        start: deadlines.birth,
        oneYear,
        incomeDeadline: deadlines.sjukpenningDeadline,
      }),
    [periods, budgets, deadlines.birth, oneYear, deadlines.sjukpenningDeadline],
  );

  const splitTarget = periods.find((p) => p.id === splitting);
  const splitMax = splitTarget?.kind === "fixed" ? splitTarget.days : budgets[splitTarget?.caregiver ?? "A"];

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Redigera perioderna</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAdding("A")}
          >
            <IconPlus /> Lägg till {names.A}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAdding("B")}
          >
            <IconPlus /> Lägg till {names.B}
          </Button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="text-destructive text-xs space-y-1">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      {dated.length === 0 ? (
        <p className="bg-muted text-muted-foreground rounded-lg p-3 text-xs">
          Inga perioder ännu. Lägg till minst två så kan du byta ordning på dem
          med <strong>Upp</strong>/<strong>Ner</strong>-knapparna.
        </p>
      ) : (
        <ol className="space-y-2">
        {dated.map((p, i) => (
          <li
            key={p.id}
            className="bg-card flex flex-wrap items-center gap-3 rounded-lg border p-3"
          >
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Flytta upp"
                disabled={i === 0}
                onClick={() => onChange(reorderPeriods(periods, i, i - 1))}
              >
                <IconArrowUp /> Upp
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Flytta ner"
                disabled={i === dated.length - 1}
                onClick={() => onChange(reorderPeriods(periods, i, i + 1))}
              >
                <IconArrowDown /> Ner
              </Button>
            </div>

            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {names[p.caregiver]}
                </span>
                <span className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                  {p.kind === "fixed" ? "Fast längd" : "Så länge som möjligt"}
                </span>
              </div>
              <p className="text-muted-foreground text-xs tabular-nums">
                {formatDate(p.startsAt)} → {formatDate(p.endsAt)} ·{" "}
                {formatDays(p.days)} · {p.pace.phase2} dgr/v
                {p.overrunDays > 0 && (
                  <span className="text-destructive">
                    {" "}
                    · {formatDays(p.overrunDays)} efter 4 år
                  </span>
                )}
              </p>
              {p.kind === "fixed" && (
                <div className="flex items-center gap-1.5">
                  <Label className="text-muted-foreground text-xs">
                    Dagar
                  </Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={p.days}
                    onChange={(e) =>
                      onChange(editPeriodDays(periods, p.id, Number(e.target.value)))
                    }
                    className="h-8 w-20 text-xs"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              {p.kind === "leftover" || (splitMax ?? 0) > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSplitting(p.id);
                    setSplitDays(p.kind === "fixed" ? Math.floor(p.days / 2) : 0);
                  }}
                >
                  <IconArrowsVertical /> Dela
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Ta bort period"
                onClick={() => onChange(periods.filter((x) => x.id !== p.id))}
              >
                <IconTrash />
              </Button>
            </div>
          </li>
        ))}
        </ol>
      )}

      {periods.length > 0 && (unused.A || unused.B ? (
        <p className="text-muted-foreground text-xs">
          {unused.A > 0 && `${formatDays(unused.A)} oanvända hos ${names.A} `}
          {unused.B > 0 && `${formatDays(unused.B)} oanvända hos ${names.B}`} — lägg
          till en period (fast eller ”så länge”) för att använda dem.
        </p>
      ) : null)}

      {/* Split dialog */}
      {splitting !== null && (
        <Dialog
          open
          title="Dela perioden"
          onClose={() => setSplitting(null)}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSplitting(null)}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (splitting !== null) {
                  onChange(splitPeriod(periods, splitting, splitDays));
                  setSplitting(null);
                }
              }}
            >
              Dela
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm">
            Välj hur många dagar den första delen ska vara.
          </p>
          <input
            type="range"
            min={0}
            max={Math.max(0, splitMax)}
            step={1}
            value={splitDays}
            onChange={(e) => setSplitDays(Number(e.target.value))}
            className="accent-primary w-full"
          />
          <div className="flex justify-between text-xs tabular-nums">
            <span>0</span>
            <span className="text-foreground font-medium">
              {splitDays} dagar
            </span>
            <span>{Math.max(0, splitMax)}</span>
          </div>
        </div>
      </Dialog>
      )}

      {/* Add dialog */}
      {adding !== null && (
        <Dialog
          open
          title={adding ? `Lägg till period – ${adding}` : "Lägg till period"}
          onClose={() => setAdding(null)}
        footer={
          <Button
            type="button"
            variant="ghost"
            onClick={() => setAdding(null)}
          >
            Stäng
          </Button>
        }
      >
        <div className="space-y-3">
          <AddPeriodForm
            onDone={(p) => {
              onChange(addPeriod(periods, adding ?? "A", p.kind, p.days));
              setAdding(null);
            }}
          />
        </div>
      </Dialog>
      )}
    </div>
  );
}

function AddPeriodForm({
  onDone,
}: {
  onDone: (p: { kind: "fixed" | "leftover"; days: number }) => void;
}) {
  const [kind, setKind] = useState<"fixed" | "leftover">("fixed");
  const [days, setDays] = useState(30);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Typ</Label>
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as "fixed" | "leftover")}
        >
          <option value="fixed">Fast längd</option>
          <option value="leftover">Så länge som möjligt</option>
        </Select>
      </div>
      {kind === "fixed" && (
        <div className="space-y-1.5">
          <Label>Längd (dagar)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(Math.max(0, Number(e.target.value)))}
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onDone({ kind, days })}
        >
          Lägg till
        </Button>
      </div>
    </div>
  );
}
