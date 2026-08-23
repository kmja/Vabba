"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IncomeField } from "@/components/income-field";
import { NumberField } from "@/components/number-field";
import { cn } from "@/lib/utils";
import type { ShareableState } from "@/lib/share";

/**
 * Every choice about one caregiver, in one dialog instead of the wizard's
 * question-by-question flow — jump straight to whichever field needs
 * changing and close whenever. Every field writes straight to `form` as
 * it's touched, the same live-edit pattern the advanced-settings page
 * uses, so there's nothing separate to "save" — closing the dialog is the
 * only action needed.
 */
export function CaregiverEditDialog({
  open,
  onClose,
  id,
  title,
  form,
  setForm,
}: {
  open: boolean;
  onClose: () => void;
  id: "A" | "B";
  title: string;
  form: ShareableState;
  setForm: (updater: (f: ShareableState) => ShareableState) => void;
}) {
  const isA = id === "A";
  const parent = form.plan.parents[id];
  const goalMode = (isA ? form.goalModeA : form.goalModeB) ?? "budget";
  const goalDate = (isA ? form.goalDateA : form.goalDateB) ?? "";
  const supplementOn = (isA ? form.supplementA : form.supplementB) ?? true;
  const supplementMonths =
    (isA ? form.supplementMonthsA : form.supplementMonthsB) ?? 6;
  const supplementPct =
    (isA ? form.supplementPctA : form.supplementPctB) ?? 90;

  const patchParent = (patch: Partial<typeof parent>) =>
    setForm((f) => ({
      ...f,
      plan: {
        ...f.plan,
        parents: {
          ...f.plan.parents,
          [id]: { ...f.plan.parents[id], ...patch },
        },
      },
    }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button type="button" onClick={onClose}>
          Klar
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor={`edit-${id}-name`}>Namn (valfritt)</Label>
          <Input
            id={`edit-${id}-name`}
            value={parent.name ?? ""}
            onChange={(e) => patchParent({ name: e.target.value })}
            placeholder={isA ? "Vårdnadshavare A" : "Vårdnadshavare B"}
          />
        </div>

        <IncomeField
          id={`edit-${id}-income`}
          label="Månadslön innan skatt"
          value={parent.grossMonthlyIncome ?? 0}
          aboveCap={parent.incomeAboveCap ?? false}
          onValueChange={(n) => patchParent({ grossMonthlyIncome: n })}
          onAboveCapChange={(aboveCap) => patchParent({ incomeAboveCap: aboveCap })}
          capHint="Föräldrapenningen räknas till högsta beloppet oavsett exakt lön."
        />

        <div className="space-y-2">
          <Label>Hur länge?</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                setForm((f) =>
                  isA
                    ? { ...f, goalModeA: "budget" }
                    : { ...f, goalModeB: "budget" },
                )
              }
              className={cn(
                "rounded-lg border p-3 text-left text-sm font-medium transition-colors",
                goalMode !== "untilDate"
                  ? "border-primary bg-primary/5"
                  : "hover:bg-secondary/50",
              )}
            >
              Så länge som möjligt
            </button>
            <button
              type="button"
              onClick={() =>
                setForm((f) =>
                  isA
                    ? { ...f, goalModeA: "untilDate", goalMonthsA: undefined }
                    : { ...f, goalModeB: "untilDate", goalMonthsB: undefined },
                )
              }
              className={cn(
                "rounded-lg border p-3 text-left text-sm font-medium transition-colors",
                goalMode === "untilDate"
                  ? "border-primary bg-primary/5"
                  : "hover:bg-secondary/50",
              )}
            >
              Bestämd längd
            </button>
          </div>
          {goalMode === "untilDate" && (
            <div className="space-y-1.5 pt-1">
              <Label htmlFor={`edit-${id}-date`}>Hemma till och med</Label>
              <Input
                id={`edit-${id}-date`}
                type="date"
                value={goalDate}
                onChange={(e) =>
                  setForm((f) =>
                    isA
                      ? {
                          ...f,
                          goalDateA: e.target.value,
                          goalMonthsA: undefined,
                        }
                      : {
                          ...f,
                          goalDateB: e.target.value,
                          goalMonthsB: undefined,
                        },
                  )
                }
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={supplementOn}
              onChange={(e) =>
                setForm((f) =>
                  isA
                    ? { ...f, supplementA: e.target.checked }
                    : { ...f, supplementB: e.target.checked },
                )
              }
            />
            Föräldralön från arbetsgivaren
          </label>
          {supplementOn && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <NumberField
                id={`edit-${id}-supp-months`}
                label="Antal månader"
                value={supplementMonths}
                onChange={(n) =>
                  setForm((f) =>
                    isA
                      ? { ...f, supplementMonthsA: n }
                      : { ...f, supplementMonthsB: n },
                  )
                }
                min={0}
                max={36}
              />
              <NumberField
                id={`edit-${id}-supp-pct`}
                label="Procent av lönen"
                value={supplementPct}
                onChange={(n) =>
                  setForm((f) =>
                    isA
                      ? { ...f, supplementPctA: n }
                      : { ...f, supplementPctB: n },
                  )
                }
                min={0}
                max={100}
                step={5}
              />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
