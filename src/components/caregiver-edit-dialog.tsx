"use client";

import { useRef, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckRow } from "@/components/check-row";
import { IncomeField } from "@/components/income-field";
import { NumberField } from "@/components/number-field";
import { DEFAULT_SAVE_DAYS } from "@/components/wizard";
import { cn } from "@/lib/utils";
import type { ShareableState } from "@/lib/share";

/**
 * Every choice about one caregiver, in one dialog instead of the wizard's
 * question-by-question flow — jump straight to whichever field needs
 * changing. Every field writes straight to `form` as it's touched, the
 * same live-edit pattern the advanced-settings page uses — so "cancel" has
 * to actively put a snapshot back rather than just walking away from a
 * draft, exactly like that page's own Avbryt.
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
  const worksPartTime = (isA ? form.worksPartTimeA : form.worksPartTimeB) ?? false;
  const saveDays = (isA ? form.saveDaysA : form.saveDaysB) ?? DEFAULT_SAVE_DAYS;
  const meets240 = parent.meets240DayRule !== false;

  // Captured once, the moment this dialog instance is created — a fresh
  // instance is mounted every time it opens, so this is always the state
  // from right before this editing session began.
  const snapshot = useRef(form);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const cancel = () => {
    setForm(() => snapshot.current);
    onClose();
  };
  const save = () => onClose();

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
      onClose={cancel}
      title={title}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={cancel}>
            Avbryt
          </Button>
          <Button type="button" onClick={save}>
            Spara
          </Button>
        </>
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

        <div className="border-t pt-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between text-sm font-medium"
          >
            Avancerat
            <IconChevronDown
              className={cn(
                "size-4 transition-transform duration-200",
                advancedOpen && "rotate-180",
              )}
            />
          </button>
          {advancedOpen && (
            <div className="space-y-4 pt-3">
              <CheckRow
                id={`edit-${id}-parttime`}
                checked={worksPartTime}
                onChange={(b) =>
                  setForm((f) =>
                    isA ? { ...f, worksPartTimeA: b } : { ...f, worksPartTimeB: b },
                  )
                }
              >
                <span className="font-normal">
                  Jobbar deltid under ledigheten
                </span>
              </CheckRow>

              <NumberField
                id={`edit-${id}-save-days`}
                label="Dagar att spara till senare"
                value={saveDays}
                min={0}
                stepper
                slider
                sliderMax={200}
                onChange={(n) =>
                  setForm((f) =>
                    isA ? { ...f, saveDaysA: n } : { ...f, saveDaysB: n },
                  )
                }
                hint={`Till klämdagar, lov och inskolning. ${DEFAULT_SAVE_DAYS} dagar räcker ungefär till inskolning och några lov. Högst 96 dagar totalt får finnas kvar efter 4-årsdagen.`}
              />

              <div className="space-y-1.5">
                <CheckRow
                  id={`edit-${id}-240`}
                  checked={meets240}
                  onChange={(b) => patchParent({ meets240DayRule: b })}
                >
                  <span className="font-normal">
                    Har haft inkomst (SGI) i minst 240 dagar före födseln
                  </span>
                </CheckRow>
                {!meets240 && (
                  <p className="text-muted-foreground text-xs">
                    De första 180 dagarna betalas då på grundnivå (250 kr/dag)
                    i stället för på sjukpenningnivå.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
