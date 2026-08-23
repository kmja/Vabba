"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import {
  IconAdjustments,
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconBabyCarriage,
  IconDeviceFloppy,
  IconPlus,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { NumberField } from "@/components/number-field";
import { FkSourceHint } from "@/components/fk-source-hint";
import { CheckRow } from "@/components/check-row";
import { FamilyScene } from "@/components/family-scene";
import { FlowQuestion, FlowSlot } from "@/components/flow-question";
import { InlineCalendar } from "@/components/inline-calendar";
import { GoogleNameButton } from "@/components/google-name";
import {
  type ParentId,
  type ParentInput,
  type PlanInput,
  type TierCount,
} from "@/lib/calc";
import type { GoalMode } from "@/lib/goal-seek";
import { birthDaysFor } from "@/lib/birth-days";
import { DEFAULT_MUNICIPAL_RATE } from "@/lib/tax";
import { isAboveSgiCap, sjukpenningnivaDailyAmount } from "@/lib/rules";
import { formatDate, formatSek } from "@/lib/format";
import {
  addMonths,
  addYears,
  isValidIsoDate,
  parseIsoDate,
  toIsoDate,
} from "@/lib/dates";
import type { ShareableState } from "@/lib/share";
import { cn } from "@/lib/utils";

/**
 * The scrollable question area between the fixed progress/nav bars. Looked up
 * from the DOM rather than held in a ref: the flow's callbacks are created
 * while rendering, and a ref read from there is what the refs-during-render
 * rule (rightly) rejects.
 */
const scrollArea = () =>
  document.querySelector<HTMLElement>("[data-wizard-scroll]");

/** Fields the flow can focus — excludes toggles and the hidden date hook. */
const FIELD_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([disabled]):not([tabindex="-1"]), select';

/**
 * Days each caregiver holds back by default. Few families take every day in
 * one stretch — a month or so covers inskolning, klämdagar and school
 * holidays later on, and two caregivers at this level stay under the 96 days
 * that may remain after the child turns 4.
 */
export const DEFAULT_SAVE_DAYS = 20;

const CHILD_NUMBERS = [
  { value: 1, label: "Första" },
  { value: 2, label: "Andra" },
  { value: 3, label: "Tredje" },
  { value: 4, label: "Fjärde+" },
];

const BIRTH_COUNTS = [
  { value: 1, label: "Ett barn" },
  { value: 2, label: "Tvillingar" },
  { value: 3, label: "Trillingar" },
  { value: 4, label: "Fyra barn" },
];

const GOAL_MODES: { value: GoalMode; label: string; desc: string }[] = [
  {
    value: "untilDate",
    label: "Bestämd längd",
    desc: "Välj ett datum eller en längd, t.ex. 6 månader — vi räknar ut takten som krävs.",
  },
  {
    value: "budget",
    label: "Så länge som möjligt",
    desc: "Dagarna sträcks ut i den långsammaste takt reglerna tillåter, så ledigheten räcker längst.",
  },
];

/** The first of August after the child's 1st birthday — typical förskolestart. */
function forskolestart(birth: Date): Date {
  const oneYear = addYears(birth, 1);
  const aug = new Date(Date.UTC(oneYear.getUTCFullYear(), 7, 1));
  return aug.getTime() >= oneYear.getTime()
    ? aug
    : new Date(Date.UTC(oneYear.getUTCFullYear() + 1, 7, 1));
}

/** The next month/day after `from` (this year's, or next year's if it passed). */
function nextAnnual(from: Date, month: number, day: number): Date {
  const y = from.getUTCFullYear();
  const here = new Date(Date.UTC(y, month, day));
  return here.getTime() > from.getTime()
    ? here
    : new Date(Date.UTC(y + 1, month, day));
}

interface DatePreset {
  key: string;
  label: string;
  date: Date;
  /**
   * Set on the "så länge" shortcuts: what the user actually chose is a
   * length, so it is stored as one and re-resolved against wherever their
   * stretch ends up starting.
   */
  months?: number;
}

/**
 * The shortcuts offered for "hemma till ett datum", in two kinds: landmarks
 * in the child's life or the calendar, and plain lengths of leave.
 *
 * Both are measured from `from` — where THIS caregiver's leave begins, which
 * for the second caregiver is where the first one ends. A shortcut that falls
 * before their leave starts would only produce an impossible plan, so it is
 * left out.
 */
function datePresetGroups(
  birth: Date,
  from: Date,
): { title: string; items: DatePreset[] }[] {
  const later = (d: Date) => d.getTime() > from.getTime() + 7 * 864e5;
  const landmarks: DatePreset[] = [
    { key: "1ar", label: "Barnet fyller 1", date: addYears(birth, 1) },
    { key: "forskola", label: "Förskolestart", date: forskolestart(birth) },
    { key: "15ar", label: "Barnet fyller 1,5", date: addMonths(birth, 18) },
    { key: "2ar", label: "Barnet fyller 2", date: addYears(birth, 2) },
    { key: "nyar", label: "Årsskiftet", date: nextAnnual(from, 11, 31) },
    { key: "sommar", label: "Efter sommaren", date: nextAnnual(from, 7, 15) },
  ]
    .filter((p) => later(p.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  // Two landmarks can land on the same day (a 1 August förskolestart is also
  // "efter sommaren") — keep the first, which sorted earliest.
  const seen = new Set<string>();
  const dates = landmarks.filter((p) => {
    const iso = toIsoDate(p.date);
    if (seen.has(iso)) return false;
    seen.add(iso);
    return true;
  });
  const spans = [3, 6, 9, 12]
    .map((m) => ({
      key: `${m}man`,
      label: m === 12 ? "1 år" : `${m} månader`,
      date: addMonths(from, m),
      months: m,
    }))
    // A caregiver starting at the birth would see "1 år" and "barnet fyller
    // 1" as two buttons doing the same thing; the landmark says it better.
    .filter((p) => later(p.date) && !seen.has(toIsoDate(p.date)));
  return [
    { title: "Fram till", items: dates },
    { title: "Så länge", items: spans },
  ].filter((g) => g.items.length > 0);
}

/** A row of baby-carriage icons — the pictogram for "n children". */
function BabyIcons({ count }: { count: number }) {
  return (
    <span className="text-primary flex items-center justify-center gap-0.5">
      {Array.from({ length: count }, (_, i) => (
        <IconBabyCarriage key={i} className="size-6" />
      ))}
    </span>
  );
}

/**
 * A choice that cannot produce a working plan — surfaced on the question that
 * caused it, while the user is still in the wizard, with the way out.
 */
export interface WizardIssue {
  /** The FlowQuestion this belongs to (e.g. "a-q-goaldetail"). */
  questionId: string;
  message: string;
  /** A one-tap way out, when there is a concrete one. */
  fix?: { label: string; apply: () => void };
}

/** A big, animated selection target used by the choice questions. */
function OptionCard({
  id,
  selected,
  onSelect,
  icon,
  label,
  desc,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  label: string;
  desc?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-h-14 w-full flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-[transform,border-color,background-color] duration-200 active:scale-95",
        selected
          ? "border-primary bg-secondary/50 shadow-sm"
          : "hover:bg-secondary/30",
      )}
    >
      {icon}
      <span className="text-base font-medium sm:text-sm">{label}</span>
      {desc && (
        <span className="text-muted-foreground text-xs leading-snug">
          {desc}
        </span>
      )}
    </button>
  );
}

export function Wizard({
  form,
  setForm,
  valid,
  issues = [],
  periodStarts,
  initialStep = 1,
  onSubmit,
  onReset,
  onStepChange,
}: {
  form: ShareableState;
  setForm: Dispatch<SetStateAction<ShareableState>>;
  valid: boolean;
  /** Choices that can't work, keyed to the question that caused them. */
  issues?: WizardIssue[];
  /** When each caregiver's own stretch begins, from the live solve — the
   *  second one starts where the first leaves off. */
  periodStarts?: Partial<Record<ParentId, Date>>;
  /** Which step to open on — the results page sends people back to theirs. */
  initialStep?: number;
  onSubmit: () => void;
  onReset: () => void;
  /** Called whenever the step changes, so resuming later can pick it up. */
  onStepChange?: (step: number) => void;
}) {
  const [step, setStep] = useState(initialStep);
  // The wizard's three question steps, or the standalone advanced-settings
  // page reached from the summary at the end of step 3.
  const [page, setPage] = useState<"wizard" | "advanced">("wizard");
  // The plan as it was the moment the advanced-settings page was opened —
  // every field there writes straight to the plan as it's changed, so
  // "Avbryt" restores this rather than undoing anything itself.
  const formOnAdvancedOpen = useRef<ShareableState | null>(null);
  // The question currently in focus (its FlowQuestion id); "" = none.
  //
  // Landing on a step fresh — "Fortsätt" resuming a saved plan straight onto
  // step 2 or 3 — should open whatever's still unanswered, not always the
  // step's first question (mirrors `isAnswered`/`goTo` below, but this runs
  // before those are in scope, and `visited` — everything `isAnswered` can't
  // otherwise resolve from data alone — is necessarily still empty this
  // early, so nothing is lost by shortcutting straight past it here).
  const [activeQ, setActiveQ] = useState(() => {
    if (initialStep === 1) {
      return isValidIsoDate(form.plan.birthDate) ? "q-order" : "q-date";
    }
    // Step 2 is whoever is home first, step 3 the other one.
    const first = form.soloMode ? "A" : (form.firstCaregiver ?? "A");
    const id = initialStep === 2 ? first : first === "A" ? "B" : "A";
    const p = id.toLowerCase();
    const value = form.plan.parents[id];
    if (!value.name?.trim()) return `${p}-q-name`;
    if (!(value.incomeAboveCap ?? false) && value.grossMonthlyIncome <= 0)
      return `${p}-q-income`;
    const supplementEnabled =
      (id === "A" ? form.supplementA : form.supplementB) ?? true;
    return supplementEnabled ? `${p}-q-supplement` : `${p}-q-goal`;
  });
  // Whether the open question was REOPENED to edit an existing answer (an
  // in-place accordion) rather than reached in the forward flow (the
  // full-screen hero treatment).
  const [reopened, setReopened] = useState(false);
  // Questions the user has actually answered/passed this session. Defaults
  // alone must not render as answered — a fresh plan should look untouched.
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  // Validation stays quiet until the user tries to move on.
  const [triedNext, setTriedNext] = useState(false);
  // Until when the focus-reveal must not scroll: right after a step change
  // the family scene should stay in view rather than be pushed off.
  const [holdSceneUntil, setHoldSceneUntil] = useState(0);
  // Date questions with presets show the shortcuts first; this holds the
  // ones where the user asked for the calendar instead.
  const [calendarFor, setCalendarFor] = useState<Record<string, boolean>>({});
  // How much of the viewport the on-screen keyboard currently covers. Since
  // it overlays rather than resizes, the scroll area gets that much bottom
  // padding — otherwise a field near the end has no room to scroll clear.
  const [kbInset, setKbInset] = useState(0);
  const seen = (qid: string) => visited.has(qid);
  /** Issues raised by a question the user has already been through. */
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setKbInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
      // The keyboard opening is its own event — no focus change fires — so
      // lift the already-focused field if it just got covered.
      const el = document.activeElement as HTMLElement | null;
      if (!el?.matches?.(FIELD_SELECTOR)) return;
      window.setTimeout(() => {
        const box = el.getBoundingClientRect();
        const delta = box.bottom - (vv.offsetTop + vv.height - 12);
        if (delta > 0) {
          scrollArea()?.scrollBy?.({ top: delta, behavior: "smooth" });
        }
      }, 60);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);



  /** Focusable fields, excluding those inside collapsed (inert) panels. */
  const visibleFields = (root: ParentNode | null): HTMLElement[] =>
    Array.from(
      root?.querySelectorAll<HTMLElement>(FIELD_SELECTOR) ?? [],
    ).filter((el) => !el.closest("[inert]"));

  /**
   * Keep a focused field clear of the on-screen keyboard, which overlays the
   * page (see interactiveWidget in layout.tsx). visualViewport reports the
   * area the keyboard leaves visible; we scroll the content container by the
   * smallest amount that brings the field inside it — so anything already
   * visible (the family scene above) is left where it is. Runs again after
   * the keyboard animates in, since the first pass predates it.
   */
  const revealField = (el: HTMLElement) => {
    const nudge = () => {
      const box = el.getBoundingClientRect();
      if (box.height === 0) return;
      const vv = window.visualViewport;
      const top = vv ? vv.offsetTop : 0;
      const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const pad = 12;
      let delta = 0;
      if (box.bottom > bottom - pad) delta = box.bottom - (bottom - pad);
      else if (box.top < top + pad) delta = box.top - (top + pad);
      if (delta === 0) return;
      const scroller = scrollArea();
      if (scroller && scroller.scrollHeight > scroller.clientHeight) {
        scroller.scrollBy({ top: delta, behavior: "smooth" });
      } else {
        window.scrollBy({ top: delta, behavior: "smooth" });
      }
    };
    nudge();
    window.setTimeout(() => {
      if (document.activeElement === el) nudge();
    }, 350);
  };

  const openQ = (qid: string, viaReopen = false) => {
    flushSync(() => {
      setActiveQ(qid);
      setReopened(viaReopen);
    });
    // Scroll by the SMALLEST amount that brings the question into view, so
    // the family scene above it stays where it is. Only a question too tall
    // for the remaining space falls back to sitting at the top.
    const box = document.getElementById(qid)?.parentElement;
    const sc = scrollArea();
    if (box && sc?.getBoundingClientRect) {
      const area = sc.getBoundingClientRect();
      const rect = box.getBoundingClientRect();
      const pad = 8;
      // How far the box would move to sit flush with the top of the area —
      // the most we ever scroll, since past that it would leave the screen.
      const toTop = rect.top - area.top - pad;
      let delta = 0;
      if (rect.bottom > area.bottom - pad) {
        delta = Math.min(rect.bottom - (area.bottom - pad), Math.max(0, toTop));
      } else if (toTop < 0) {
        delta = toTop;
      }
      if (delta !== 0) sc.scrollBy?.({ top: delta, behavior: "smooth" });
    }
    const panel = document.getElementById(`${qid}-panel`);
    const field = visibleFields(panel)[0];
    if (!field) return;
    field.focus({ preventScroll: true });
    // Re-check once the scroll above has settled, so the keyboard check
    // measures the final position rather than a mid-animation one.
    window.setTimeout(() => {
      if (document.activeElement === field) revealField(field);
    }, 400);
  };

  const goTo = (s: number, focus = false) => {
    flushSync(() => {
      setStep(s);
      setActiveQ(firstUnansweredOf(s));
      setReopened(false);
      setHoldSceneUntil(Date.now() + 900);
    });
    onStepChange?.(s);
    // A step change always starts at the top so the family scene — and its
    // zoom/handover animation — is on screen. The first field still takes
    // focus (keyboard up), but without scrolling the stage away.
    scrollArea()?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
    if (focus) {
      visibleFields(scrollArea())[0]?.focus({ preventScroll: true });
    }
  };

  const { plan, soloMode, hasUsedDays, detailedUsed } = form;
  const childNumber =
    form.childNumber ?? ((form.hasExtraDays ?? false) ? 2 : 1);
  const doubleDays = form.doubleDays ?? 0;
  const includeLagsta = form.includeLagsta ?? false;
  const firstCaregiver = form.firstCaregiver ?? "A";
  const supplementA = {
    enabled: form.supplementA ?? true,
    months: form.supplementMonthsA ?? 6,
    pct: form.supplementPctA ?? 90,
  };
  const supplementB = {
    enabled: form.supplementB ?? true,
    months: form.supplementMonthsB ?? 6,
    pct: form.supplementPctB ?? 90,
  };
  const extraDaysA = form.extraDaysA ?? 0;
  const extraDaysB = form.extraDaysB ?? 0;
  const vabEnabled = form.vabEnabled ?? false;
  const vabChildren = form.vabChildren ?? 1;
  const vabDaysUsedThisYear = form.vabDaysUsedThisYear ?? 0;
  const birthDaysEnabled = form.birthDaysEnabled ?? true;
  // Ten per child, so a multiple birth gives more.
  const birthDaysMax = birthDaysFor(plan.childrenInBirth);
  const birthDaysCount = form.birthDaysCount ?? birthDaysMax;
  const birth =
    valid && isValidIsoDate(plan.birthDate)
      ? parseIsoDate(plan.birthDate)
      : null;

  const setPlan = (updater: (p: PlanInput) => PlanInput) =>
    setForm((f) => ({ ...f, plan: updater(f.plan) }));
  const setParent = (id: ParentId, next: ParentInput) =>
    setPlan((p) => ({ ...p, parents: { ...p.parents, [id]: next } }));
  const setParentDays = (id: ParentId, daysUsed: TierCount) =>
    setParent(id, { ...plan.parents[id], daysUsed });

  // Always three steps — the number of caregivers is never asked. Step 2 is
  // whoever goes on leave first; step 3 is the other caregiver, with an
  // "I'm alone" opt-out.
  const stepCount = 3;
  const current = Math.min(step, stepCount);
  const visibleIds: ParentId[] = soloMode ? ["A"] : ["A", "B"];
  const canAdvance = current !== 1 || valid;

  // Which caregiver each step edits: step 2 = the one home first.
  const firstId: ParentId = soloMode ? "A" : firstCaregiver;
  const secondId: ParentId = firstId === "A" ? "B" : "A";

  /** The line of context above the stage, per step. */
  const stepIntro =
    current === 2
      ? soloMode
        ? "Dina uppgifter — du har alla dagarna."
        : "Vem går på ledighet först? Ofta den som fött barnet."
      : current === 3 && !soloMode
        ? `Vem tar över efter ${plan.parents[firstId].name?.trim() || `Vårdnadshavare ${firstId}`}?`
        : null;

  /**
   * Every goal is judged against the whole household — a budget floor counts
   * the partner's salary, and a length depends on how the days split between
   * the two of them. Neither can be said anything about before the other
   * caregiver has been asked, so until then there is nothing to report,
   * rather than a verdict worked out from a salary of zero.
   */
  const secondIncome = plan.parents[secondId];
  const householdKnown =
    soloMode ||
    (secondIncome.incomeAboveCap ?? false) ||
    secondIncome.grossMonthlyIncome > 0;

  /** Issues raised by a question the user has already been through. */
  const issuesOn = (qid: string) =>
    householdKnown
      ? issues.filter(
          (i) => i.questionId === qid && (seen(qid) || activeQ === qid),
        )
      : [];

  // Short name for the scene's name tags (first name, or the letter badge).
  const sceneName = (id: ParentId) =>
    plan.parents[id].name?.trim().split(/\s+/)[0] || id;

  /** The ordered question ids of a caregiver's flow. */
  const cgFlow = (id: ParentId): string[] => {
    const p = id.toLowerCase();
    const goal = (id === "A" ? form.goalModeA : form.goalModeB) ?? "budget";
    const supp = id === "A" ? supplementA : supplementB;
    return [
      `${p}-q-name`,
      `${p}-q-income`,
      `${p}-q-supplement`,
      ...(supp.enabled ? [`${p}-q-suppdetail`] : []),
      `${p}-q-goal`,
      ...(goal === "untilDate" ? [`${p}-q-goaldetail`] : []),
      `${p}-q-save`,
      ...(childNumber >= 2 ? [`${p}-q-extra`] : []),
    ];
  };

  const flowOf = (s: number): string[] => {
    if (s === 1) return ["q-date", "q-order"];
    if (s === 2) return cgFlow(firstId);
    return soloMode ? [] : cgFlow(secondId);
  };

  /**
   * Whether a question already has a real answer — mirrors each
   * FlowQuestion's own `answered` prop below. Lets a step reopen on
   * whatever's still unanswered instead of always its first question,
   * whether landing on it mid-session (`goTo`) or fresh on mount (the
   * effect just below).
   */
  const isAnswered = (qid: string): boolean => {
    if (qid === "q-date") return birth != null;
    if (qid === "q-order") return childNumber >= 2 || seen("q-order");
    const id: ParentId = qid.startsWith("a-") ? "A" : "B";
    const value = plan.parents[id];
    const supplement = id === "A" ? supplementA : supplementB;
    const dateStr = (id === "A" ? form.goalDateA : form.goalDateB) ?? "";
    const goalMonths = (id === "A" ? form.goalMonthsA : form.goalMonthsB) ?? 0;
    const extraDays = id === "A" ? extraDaysA : extraDaysB;
    const suffix = qid.slice(2);
    if (suffix === "q-name") return !!value.name?.trim();
    if (suffix === "q-income")
      return (value.incomeAboveCap ?? false) || value.grossMonthlyIncome > 0;
    if (suffix === "q-goaldetail")
      return goalMonths > 0 || isValidIsoDate(dateStr);
    if (suffix === "q-extra") return extraDays > 0;
    if (suffix === "q-supplement") return !supplement.enabled || seen(qid);
    // q-suppdetail, q-goal and q-save all default to a real (non-empty)
    // value, so only actually having been shown counts as an answer.
    return seen(qid);
  };

  /** The first unanswered question of a step, or "" once it's all done. */
  const firstUnansweredOf = (s: number): string =>
    flowOf(s).find((q) => !isAnswered(q)) ?? "";

  /**
   * Collapse the answered question and bring the next one into focus.
   * `nextOverride` is for answers that change the flow they're part of —
   * the list read here still reflects the state before the answer.
   */
  const advanceQ = (qid: string, nextOverride?: string) => {
    const wasReopened = reopened;
    const done = new Set(visited).add(qid);
    flushSync(() =>
      setVisited((prev) => {
        const out = new Set(prev);
        out.add(qid);
        return out;
      }),
    );
    const flow = flowOf(current);
    const next = wasReopened
      ? // Editing an earlier answer: pick up where the user left off rather
        // than walking them back through answers they already gave. (A new
        // follow-up the edit just created still comes first.)
        nextOverride && !done.has(nextOverride)
        ? nextOverride
        : flow.find((q) => !done.has(q) && !isAnswered(q))
      : (nextOverride ?? flow[flow.indexOf(qid) + 1]);
    if (next) {
      openQ(next);
      return;
    }
    flushSync(() => setActiveQ(""));
    // Answering the step's LAST question flows straight into the next step.
    // The final step keeps "Visa plan" as an explicit action (and step 1
    // stays put until the birth date is valid).
    if (current < stepCount && canAdvance) {
      goTo(current + 1, true);
    }
  };

  // The step's implicit next action (for the mobile keyboard's Enter):
  // advance the open question, then the step, then show the plan.
  const primaryAction = () => {
    const flow = flowOf(current);
    if (activeQ && flow.includes(activeQ)) {
      advanceQ(activeQ);
      return;
    }
    if (current < stepCount) {
      if (canAdvance) {
        goTo(current + 1, true);
      } else {
        // Blocked: say why, and take them back to the question that needs it.
        setTriedNext(true);
        openQ("q-date");
      }
      return;
    }
    if (valid) {
      onSubmit();
    } else {
      setTriedNext(true);
      goTo(1);
    }
  };

  // Enter walks through the fields like a checkout: focus the next visible
  // field first; when there is none, run the primary action.
  const onFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;
    const el = e.target as HTMLElement;
    if (
      el instanceof HTMLButtonElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLInputElement &&
        ["checkbox", "radio", "range"].includes(el.type))
    ) {
      return;
    }
    e.preventDefault();
    const fields = visibleFields(scrollArea());
    const next = fields[fields.indexOf(el) + 1];
    if (next) next.focus();
    else primaryAction();
  };

  const setSupplement = (
    id: ParentId,
    s: { enabled: boolean; months: number; pct: number },
  ) =>
    setForm((f) =>
      id === "A"
        ? {
            ...f,
            supplementA: s.enabled,
            supplementMonthsA: s.months,
            supplementPctA: s.pct,
          }
        : {
            ...f,
            supplementB: s.enabled,
            supplementMonthsB: s.months,
            supplementPctB: s.pct,
          },
    );

  // -----------------------------------------------------------------------
  // Advanced settings, grouped by theme. Shown only on the standalone
  // advanced-settings page reached from the end-of-wizard summary.
  // -----------------------------------------------------------------------

  /** Household finances — affects every net figure in the plan. */
  const birthCountAdvanced = (
    <NumberField
      id="children-in-birth"
      label="Barn i den här förlossningen"
      value={plan.childrenInBirth}
      min={1}
      max={4}
      stepper
      onChange={(n) => setPlan((p) => ({ ...p, childrenInBirth: n }))}
      hint="Tvillingar, trillingar … Varje barn utöver det första ger 180 extra dagar utöver de 480."
    />
  );

  const taxAdvanced = (
    <NumberField
      id="municipal-rate"
      label="Kommunalskatt (%)"
      value={
        form.municipalRatePct ??
        Math.round(DEFAULT_MUNICIPAL_RATE * 100 * 100) / 100
      }
      min={25}
      max={40}
      step={0.01}
      onChange={(n) => setForm((f) => ({ ...f, municipalRatePct: n }))}
      hint="Där ni bor — den avgör alla nettobelopp i planen. Riksgenomsnittet är 32,38 %, men satserna går från 28,93 % till drygt 35 %; vid 63 000 kr i lön skiljer det runt 3 300 kr i månaden."
    />
  );

  /** Days already drawn for this child before filling in the plan. */
  const usedDaysAdvanced = (
    <div className="space-y-3">
      <CheckRow
        id="has-used"
        checked={hasUsedDays}
        onChange={(b) => setForm((f) => ({ ...f, hasUsedDays: b }))}
      >
        {soloMode
          ? "Jag har redan tagit ut dagar för det här barnet"
          : "Vi har redan tagit ut dagar för det här barnet"}
      </CheckRow>

      {hasUsedDays && (
        <div className="space-y-3">
          <CheckRow
            id="detailed-used"
            checked={detailedUsed}
            onChange={(b) => setForm((f) => ({ ...f, detailedUsed: b }))}
          >
            <span className="text-muted-foreground font-normal">
              Ange nivåer separat (sjukpenning/lägsta)
            </span>
          </CheckRow>

          {visibleIds.map((id) => {
            const p = plan.parents[id];
            const who =
              p.name?.trim() || (soloMode ? "dig" : `Vårdnadshavare ${id}`);
            const suffix = visibleIds.length > 1 ? ` – ${who}` : "";
            return detailedUsed ? (
              <div key={id} className="grid grid-cols-2 gap-3">
                <NumberField
                  id={`${id.toLowerCase()}-used-sjuk`}
                  label={`Sjukpenningdagar${suffix}`}
                  value={p.daysUsed.sjukpenning}
                  stepper
                  slider
                  sliderMax={390}
                  onChange={(n) =>
                    setParentDays(id, {
                      sjukpenning: n,
                      lagsta: p.daysUsed.lagsta,
                    })
                  }
                />
                <NumberField
                  id={`${id.toLowerCase()}-used-lagsta`}
                  label={`Lägstanivådagar${suffix}`}
                  value={p.daysUsed.lagsta}
                  stepper
                  slider
                  sliderMax={90}
                  onChange={(n) =>
                    setParentDays(id, {
                      sjukpenning: p.daysUsed.sjukpenning,
                      lagsta: n,
                    })
                  }
                />
              </div>
            ) : (
              <NumberField
                key={id}
                id={`${id.toLowerCase()}-used`}
                label={`Uttagna dagar${suffix}`}
                value={p.daysUsed.sjukpenning + p.daysUsed.lagsta}
                stepper
                slider
                sliderMax={480}
                onChange={(n) =>
                  setParentDays(id, { sjukpenning: n, lagsta: 0 })
                }
              />
            );
          })}
          <FkSourceHint what="Uttagna dagar" />
        </div>
      )}
    </div>
  );

  /** How the days get spent: the flat-rate reserve, and both home together. */
  const leaveStrategyAdvanced = (
    <div className="space-y-4">
      <div className="space-y-2">
        <CheckRow
          id="include-lagsta"
          checked={includeLagsta}
          onChange={(b) => setForm((f) => ({ ...f, includeLagsta: b }))}
        >
          Ta ut lägstanivådagarna (90 dagar à 180 kr)
        </CheckRow>
        <p className="text-muted-foreground text-xs">
          {includeLagsta
            ? "Lägstanivådagarna läggs till sist och förlänger ledigheten, men ger bara 180 kr/dag."
            : "Ledigheten slutar när de inkomstbaserade dagarna tar slut. De 90 lägstanivådagarna sparas — de kan tas ut senare (180 kr/dag) eller sparas tills barnet fyller 12."}
        </p>
      </div>

      {!soloMode && (
        <NumberField
          id="double-days"
          label="Dubbeldagar (båda hemma samtidigt)"
          value={doubleDays}
          min={0}
          max={60}
          stepper
          slider
          onChange={(n) => setForm((f) => ({ ...f, doubleDays: n }))}
          hint="Varje dubbeldag kostar 2 dagar ur potten (max 60, före 15 mån)."
        />
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Step 1: the baby, one question at a time
  // ---------------------------------------------------------------------------

  const babyFlow = (
    <div className="space-y-2">
      <FlowQuestion
        id="q-date"
        label="Födelsedatum"
        value={birth ? formatDate(birth) : null}
        hero={!reopened}
        open={activeQ === "q-date"}
        answered={birth != null}
        visited={seen("q-date")}
        onOpen={() => openQ("q-date", true)}
      >
        <p className="text-muted-foreground -mt-1 text-xs">
          Eller beräknat datum, om barnet inte är fött än.
        </p>
        <InlineCalendar
          value={plan.birthDate}
          inputId="birth-date"
          onPick={(iso) => {
            setPlan((p) => ({ ...p, birthDate: iso }));
            advanceQ("q-date");
          }}
        />
      </FlowQuestion>

      <FlowQuestion
        id="q-order"
        label="Vilket barn i ordningen?"
        value={
          CHILD_NUMBERS.find((c) => c.value === childNumber)?.label ?? "Första"
        }
        hero={!reopened}
        open={activeQ === "q-order"}
        answered={childNumber >= 2 || seen("q-order")}
        visited={seen("q-order")}
        onOpen={() => openQ("q-order", true)}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHILD_NUMBERS.map((c) => (
            <OptionCard
              key={c.value}
              id={`child-number-${c.value}`}
              selected={childNumber === c.value}
              icon={<BabyIcons count={c.value} />}
              label={c.label}
              onSelect={() => {
                setForm((f) => ({
                  ...f,
                  childNumber: c.value,
                  hasExtraDays: c.value >= 2,
                }));
                advanceQ("q-order");
              }}
            />
          ))}
        </div>
        {childNumber >= 2 && (
          <p className="text-muted-foreground text-xs">
            Varje barn har sin egen pott på 480 dagar. Dagar som finns kvar från
            tidigare barn anger du hos respektive vårdnadshavare.
          </p>
        )}
      </FlowQuestion>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Steps 2 & 3: one caregiver, one question at a time
  // ---------------------------------------------------------------------------

  const caregiverFlow = (id: ParentId) => {
    const prefix = id.toLowerCase();
    const value = plan.parents[id];
    const income = value.grossMonthlyIncome;
    const aboveCap = value.incomeAboveCap ?? false;
    const rate = sjukpenningnivaDailyAmount(income);
    const supplement = id === "A" ? supplementA : supplementB;
    const mode = (id === "A" ? form.goalModeA : form.goalModeB) ?? "budget";
    const dateStr = (id === "A" ? form.goalDateA : form.goalDateB) ?? "";
    const goalMonths = (id === "A" ? form.goalMonthsA : form.goalMonthsB) ?? 0;
    const saveDays = (id === "A" ? form.saveDaysA : form.saveDaysB) ?? DEFAULT_SAVE_DAYS;
    const extraDays = id === "A" ? extraDaysA : extraDaysB;
    const displayName =
      value.name?.trim() || (soloMode ? "Du" : `Vårdnadshavare ${id}`);
    const goalName =
      value.name?.trim() || (soloMode ? "du" : `Vårdnadshavare ${id}`);
    const amountHint =
      income > 0
        ? isAboveSgiCap(income)
          ? `Över taket – ${formatSek(rate)}/dag (högsta belopp)`
          : `Ger ca ${formatSek(rate)}/dag på sjukpenningnivå`
        : "Vet du bara nettolönen? Brutto ≈ netto × 1,5.";
    const setGoal = (patch: {
      mode?: GoalMode;
      dateStr?: string;
      /** A length rather than a date; 0 clears it back to the date. */
      months?: number;
    }) =>
      setForm((f) =>
        id === "A"
          ? {
              ...f,
              ...(patch.mode !== undefined ? { goalModeA: patch.mode } : {}),
              ...(patch.dateStr !== undefined
                ? { goalDateA: patch.dateStr }
                : {}),
              ...(patch.months !== undefined
                ? { goalMonthsA: patch.months || undefined }
                : {}),
            }
          : {
              ...f,
              ...(patch.mode !== undefined ? { goalModeB: patch.mode } : {}),
              ...(patch.dateStr !== undefined
                ? { goalDateB: patch.dateStr }
                : {}),
              ...(patch.months !== undefined
                ? { goalMonthsB: patch.months || undefined }
                : {}),
            },
      );

    // Where this caregiver's own stretch begins — after the first caregiver,
    // for the second one. Their shortcuts and calendar start there.
    const ownStart = periodStarts?.[id] ?? birth;
    const groups = birth && ownStart ? datePresetGroups(birth, ownStart) : [];
    const presets = groups.flatMap((g) => g.items);
    // The calendar is a step past the shortcuts — unless there are none, or
    // the date already set isn't one of them (reopened to tweak a own pick).
    const showCalendar =
      calendarFor[`${prefix}-q-goaldetail`] ??
      (presets.length === 0 ||
        (isValidIsoDate(dateStr) &&
          !presets.some((p) => toIsoDate(p.date) === dateStr)));


    return (
      <div className="space-y-2">
        <FlowQuestion
          id={`${prefix}-q-name`}
          label="Namn"
          heroLabel={stepIntro ?? undefined}
          value={displayName}
          hero={!reopened}
          open={activeQ === `${prefix}-q-name`}
          answered={!!value.name?.trim()}
          visited={seen(`${prefix}-q-name`)}
          onOpen={() => openQ(`${prefix}-q-name`, true)}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-name`}>Namn (valfritt)</Label>
            <Input
              id={`${prefix}-name`}
              autoComplete="given-name"
              autoCapitalize="words"
              value={value.name ?? ""}
              placeholder={soloMode ? "Ditt namn" : `Vårdnadshavare ${id}`}
              onChange={(e) =>
                setParent(id, { ...value, name: e.target.value })
              }
            />
          </div>
          {/* The person filling this in is usually the first caregiver —
              offer their Google name as the default (prefills only when the
              field is empty). */}
          {id === firstId && (
            <GoogleNameButton
              onName={(n) =>
                setParent(id, {
                  ...value,
                  name: value.name?.trim() ? value.name : n,
                })
              }
            />
          )}
        </FlowQuestion>

        <FlowQuestion
          id={`${prefix}-q-income`}
          label="Månadslön"
          value={
            income > 0
              ? `${formatSek(income)}/mån`
              : aboveCap
                ? "Över taket"
                : null
          }
          hero={!reopened}
          open={activeQ === `${prefix}-q-income`}
          answered={aboveCap || income > 0}
          visited={seen(`${prefix}-q-income`)}
          onOpen={() => openQ(`${prefix}-q-income`, true)}
        >
          {/* A plain numeric input — salaries above the SGI cap are simply
              capped in the maths (the hint says so). */}
          <NumberField
            id={`${prefix}-income`}
            label="Bruttolön per månad (kr)"
            value={income}
            step={1000}
            onChange={(n) => setParent(id, { ...value, grossMonthlyIncome: n })}
            hint={amountHint}
          />
        </FlowQuestion>

        <FlowQuestion
          id={`${prefix}-q-supplement`}
          label="Föräldralön"
          // Once the terms are known, they say more than "Ja" would — no
          // need for a second row repeating the same yes right below it.
          value={
            supplement.enabled
              ? seen(`${prefix}-q-suppdetail`)
                ? `${supplement.pct} % i ${supplement.months} mån`
                : "Ja"
              : "Nej"
          }
          hero={!reopened}
          open={activeQ === `${prefix}-q-supplement`}
          answered={!supplement.enabled || seen(`${prefix}-q-supplement`)}
          visited={seen(`${prefix}-q-supplement`)}
          onOpen={() => openQ(`${prefix}-q-supplement`, true)}
        >
          <div className="grid grid-cols-2 gap-2">
            <OptionCard
              id={`${prefix}-supplement-yes`}
              selected={supplement.enabled}
              label="Ja"
              desc="Arbetsgivaren fyller upp lönen en tid — via kollektivavtal eller annan förmån."
              onSelect={() => {
                setSupplement(id, { ...supplement, enabled: true });
                // The next id is passed explicitly — the flow list still
                // reflects the previous answer at this point.
                advanceQ(`${prefix}-q-supplement`, `${prefix}-q-suppdetail`);
              }}
            />
            <OptionCard
              id={`${prefix}-supplement-no`}
              selected={!supplement.enabled}
              label="Nej"
              desc="Ingen extra ersättning från arbetsgivaren."
              onSelect={() => {
                setSupplement(id, { ...supplement, enabled: false });
                advanceQ(`${prefix}-q-supplement`, `${prefix}-q-goal`);
              }}
            />
          </div>
        </FlowQuestion>

        {/* Saying yes asks how generous the agreement is, right away. Once
            answered and collapsed, its own row would just repeat what the
            question above it now says — so it only renders while it's
            still being reached (the first time through) or being edited;
            editing it again means reopening "Föräldralön" above. */}
        {supplement.enabled &&
          (activeQ === `${prefix}-q-suppdetail` ||
            !seen(`${prefix}-q-suppdetail`)) && (
          <FlowQuestion
            id={`${prefix}-q-suppdetail`}
            label="Hur mycket föräldralön?"
            value={`${supplement.pct} % i ${supplement.months} mån`}
            hero={!reopened}
            open={activeQ === `${prefix}-q-suppdetail`}
            // Föräldralön is on by default, so this must not show up as an
            // answer until the user has actually been asked.
            answered={seen(`${prefix}-q-suppdetail`)}
            visited={seen(`${prefix}-q-suppdetail`)}
            onOpen={() => openQ(`${prefix}-q-suppdetail`, true)}
          >
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                id={`${prefix}-supp-months`}
                label="Antal månader"
                value={supplement.months}
                min={0}
                max={24}
                stepper
                slider
                onChange={(n) =>
                  setSupplement(id, { ...supplement, months: n })
                }
              />
              <NumberField
                id={`${prefix}-supp-pct`}
                label="Fyller upp till (% av lön)"
                value={supplement.pct}
                min={0}
                max={100}
                step={5}
                stepper
                slider
                onChange={(n) => setSupplement(id, { ...supplement, pct: n })}
              />
            </div>
            {aboveCap && (
              <NumberField
                id={`${prefix}-supp-salary`}
                label="Faktisk månadslön (brutto)"
                value={value.grossMonthlyIncome}
                step={1000}
                slider
                sliderMax={100000}
                onChange={(n) =>
                  setParent(id, { ...value, grossMonthlyIncome: n })
                }
                hint="Behövs för att räkna föräldralön på lönedelar över taket."
              />
            )}
            <p className="text-muted-foreground text-xs">
              Vanligast är att lönen fylls upp till ca 90 % i ungefär 6 månader
              — då kompenseras även lönedelar över taket. Står i
              kollektivavtalet eller anställningsavtalet.
            </p>
          </FlowQuestion>
        )}

        {/* Two substeps: pick the goal, then configure just that goal. */}
        <FlowQuestion
          id={`${prefix}-q-goal`}
          label={`Vad vill ${goalName} uppnå?`}
          value={GOAL_MODES.find((m) => m.value === mode)?.label ?? null}
          hero={!reopened}
          open={activeQ === `${prefix}-q-goal`}
          answered={seen(`${prefix}-q-goal`)}
          visited={seen(`${prefix}-q-goal`)}
          onOpen={() => openQ(`${prefix}-q-goal`, true)}
        >
          <div className="grid gap-2">
            {GOAL_MODES.map((m) => (
              <OptionCard
                key={m.value}
                id={`${prefix}-goal-${m.value}`}
                selected={mode === m.value}
                label={m.label}
                desc={m.desc}
                onSelect={() => {
                  setGoal({ mode: m.value });
                  // "Så länge som möjligt" needs nothing further; a fixed
                  // length gets its own substep. The next id is passed
                  // explicitly — the flow list still reflects the previous
                  // mode here.
                  advanceQ(
                    `${prefix}-q-goal`,
                    m.value === "untilDate"
                      ? `${prefix}-q-goaldetail`
                      : `${prefix}-q-save`,
                  );
                }}
              />
            ))}
          </div>
        </FlowQuestion>

        {mode === "untilDate" && (
          <FlowQuestion
            id={`${prefix}-q-goaldetail`}
            label="Hemma till och med"
            value={
              goalMonths > 0
                ? // A length was chosen, so say the length — the date it
                  // lands on moves with the rest of the plan.
                  goalMonths === 12
                  ? "1 år"
                  : `${goalMonths} månader`
                : dateStr && isValidIsoDate(dateStr)
                  ? formatDate(parseIsoDate(dateStr))
                  : null
            }
            hero={!reopened}
            open={activeQ === `${prefix}-q-goaldetail`}
            answered={goalMonths > 0 || isValidIsoDate(dateStr)}
            visited={seen(`${prefix}-q-goaldetail`)}
            attention={issuesOn(`${prefix}-q-goaldetail`).length > 0}
            onOpen={() => openQ(`${prefix}-q-goaldetail`, true)}
          >
            {showCalendar ? (
              <InlineCalendar
                value={dateStr}
                inputId={`${prefix}-goal-date`}
                yearsBack={0}
                yearsForward={3}
                minDate={ownStart}
                onPick={(iso) => {
                  // Picking a day means that day, not a length.
                  setGoal({ dateStr: iso, months: 0 });
                  advanceQ(`${prefix}-q-goaldetail`);
                }}
              />
            ) : (
              <div className="space-y-3">
                {groups.map((g) => (
                  <div key={g.title} className="space-y-1.5">
                    <p className="text-muted-foreground text-xs font-medium">
                      {g.title}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {g.items.map((p) => (
                        <OptionCard
                          key={p.key}
                          id={`${prefix}-goal-preset-${p.key}`}
                          selected={dateStr === toIsoDate(p.date)}
                          label={p.label}
                          desc={formatDate(p.date)}
                          onSelect={() => {
                            setGoal({
                              dateStr: toIsoDate(p.date),
                              months: p.months ?? 0,
                            });
                            advanceQ(`${prefix}-q-goaldetail`);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <OptionCard
                  id={`${prefix}-goal-date-custom`}
                  selected={false}
                  label="Välj datum"
                  desc="Öppna kalendern och peka ut en dag."
                  onSelect={() =>
                    setCalendarFor((c) => ({
                      ...c,
                      [`${prefix}-q-goaldetail`]: true,
                    }))
                  }
                />
              </div>
            )}
          </FlowQuestion>
        )}

        <FlowQuestion
          id={`${prefix}-q-save`}
          label="Spara dagar?"
          value={saveDays > 0 ? `${saveDays} dagar` : "Inga"}
          hero={!reopened}
          open={activeQ === `${prefix}-q-save`}
          // Non-zero by default, so it only counts as answered once asked.
          answered={seen(`${prefix}-q-save`)}
          visited={seen(`${prefix}-q-save`)}
          attention={issuesOn(`${prefix}-q-save`).length > 0}
          onOpen={() => openQ(`${prefix}-q-save`, true)}
        >
          <NumberField
            id={`${prefix}-save-days`}
            label="Dagar att spara till senare"
            value={saveDays}
            min={0}
            stepper
            slider
            sliderMax={200}
            onChange={(n) =>
              setForm((f) =>
                id === "A" ? { ...f, saveDaysA: n } : { ...f, saveDaysB: n },
              )
            }
            hint={`Till klämdagar, lov och inskolning. ${DEFAULT_SAVE_DAYS} dagar räcker ungefär till inskolning och några lov. Högst 96 dagar totalt får finnas kvar efter 4-årsdagen.`}
          />
        </FlowQuestion>

        {childNumber >= 2 && (
          <FlowQuestion
            id={`${prefix}-q-extra`}
            label="Dagar från tidigare barn"
            value={extraDays > 0 ? `${extraDays} dagar` : "Inga"}
            hero={!reopened}
          open={activeQ === `${prefix}-q-extra`}
            answered={extraDays > 0}
            visited={seen(`${prefix}-q-extra`)}
            onOpen={() => openQ(`${prefix}-q-extra`, true)}
          >
            <NumberField
              id={`${prefix}-extra`}
              label="Sparade dagar kvar från tidigare barn"
              value={extraDays}
              stepper
              slider
              sliderMax={200}
              onChange={(n) =>
                setForm((f) =>
                  id === "A"
                    ? { ...f, extraDaysA: n }
                    : { ...f, extraDaysB: n },
                )
              }
              hint="De följer det äldre barnets tidsgränser — inkomstbaserade tas ut innan det barnet fyller 4 år."
            />
          </FlowQuestion>
        )}
      </div>
    );
  };

  /** Advanced per-caregiver details. The föräldralön terms are asked in the
   *  flow itself, right after saying yes to it. */
  const caregiverAdvanced = (id: ParentId) => {
    const prefix = id.toLowerCase();
    const value = plan.parents[id];
    return (
      <div className="space-y-3">
        <CheckRow
          id={`${prefix}-240`}
          checked={value.meets240DayRule !== false}
          onChange={(b) => setParent(id, { ...value, meets240DayRule: b })}
        >
          <span className="font-normal">
            Har haft inkomst (SGI) i minst 240 dagar före födseln
          </span>
        </CheckRow>
        {value.meets240DayRule === false && (
          <p className="text-muted-foreground -mt-1 text-xs">
            De första 180 dagarna betalas då på grundnivå (250 kr/dag) i stället
            för på sjukpenningnivå.
          </p>
        )}
      </div>
    );
  };

  /** Other benefit programs alongside föräldrapenning: vab and 10-dagar. */
  const otherBenefitsAdvanced = (
    <div className="space-y-4">
      <CheckRow
        id="vab-enabled"
        checked={vabEnabled}
        onChange={(b) => setForm((f) => ({ ...f, vabEnabled: b }))}
      >
        Planera även vab (vård av sjukt barn)
      </CheckRow>
      {vabEnabled && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vab-children">Antal barn (för vab)</Label>
              <Select
                id="vab-children"
                value={vabChildren}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    vabChildren: Number(e.target.value),
                  }))
                }
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} barn
                  </option>
                ))}
              </Select>
            </div>
            <NumberField
              id="vab-used"
              label="Vab-dagar uttagna i år"
              value={vabDaysUsedThisYear}
              stepper
              slider
              sliderMax={240}
              onChange={(n) =>
                setForm((f) => ({ ...f, vabDaysUsedThisYear: n }))
              }
            />
          </div>
          <FkSourceHint what="Uttagna vab-dagar" />
        </>
      )}

      {!soloMode && (
        <>
          <CheckRow
            id="birth-days-enabled"
            checked={birthDaysEnabled}
            onChange={(b) => setForm((f) => ({ ...f, birthDaysEnabled: b }))}
          >
            {birthDaysMax} dagar vid barns födelse (tillfällig föräldrapenning)
          </CheckRow>
          {birthDaysEnabled && (
            <>
              <NumberField
                id="birth-days-count"
                label={`Antal dagar (max ${birthDaysMax})`}
                value={Math.min(birthDaysCount, birthDaysMax)}
                min={0}
                max={birthDaysMax}
                stepper
                slider
                onChange={(n) => setForm((f) => ({ ...f, birthDaysCount: n }))}
              />
              <p className="text-muted-foreground text-xs">
                {sceneName(secondId) || "Den andra vårdnadshavaren"} tar dessa i
                samband med födseln — utöver de 480, och utan att röra
                föräldrapenningdagarna. Tas ut inom 60 dagar efter hemkomsten.
                {plan.childrenInBirth >= 2 &&
                  " Vid flerbarnsfödsel gäller 10 dagar per barn."}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );

  // Step 3's flow is exhausted (or there was never one, in solo mode) — the
  // wizard has reached its end and shows the summary + "Visa plan" instead of
  // another question.
  const reachedEnd =
    current === stepCount &&
    !(activeQ !== "" && flowOf(current).includes(activeQ));

  /** A plain recap of what's been entered, shown once the flow is done —
   *  the advanced settings (a separate page from here on) aren't part of it. */
  const summaryRows: { label: string; value: string }[] = [];
  if (birth) {
    const count = BIRTH_COUNTS.find(
      (c) => c.value === plan.childrenInBirth,
    )?.label;
    summaryRows.push({
      label: plan.childrenInBirth > 1 ? "Barnen" : "Barnet",
      value: [
        plan.childrenInBirth > 1 ? count : null,
        `föds ${formatDate(birth)}`,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  for (const id of visibleIds) {
    const p = plan.parents[id];
    const supp = id === "A" ? supplementA : supplementB;
    const save =
      (id === "A" ? form.saveDaysA : form.saveDaysB) ?? DEFAULT_SAVE_DAYS;
    const income =
      p.grossMonthlyIncome > 0
        ? `${formatSek(p.grossMonthlyIncome)}/mån`
        : p.incomeAboveCap
          ? "över SGI-taket"
          : null;
    summaryRows.push({
      label: p.name?.trim() || (soloMode ? "Du" : `Vårdnadshavare ${id}`),
      value:
        [income, supp.enabled && "föräldralön", save > 0 && `sparar ${save} dagar`]
          .filter(Boolean)
          .join(" · ") || "—",
    });
  }
  /**
   * What's wrong with this step's answers, and how to put it right. Shown
   * under the question in focus so a choice that can't work is caught here
   * rather than on the results page.
   */
  const stepIssues = flowOf(current).flatMap(issuesOn);
  const issueBanner = stepIssues.length > 0 && (
    <div className="space-y-2">
      {stepIssues.map((issue) => (
        <div
          key={issue.questionId + issue.message}
          className="border-warning/60 bg-warning/10 animate-flow-in space-y-2 rounded-xl border p-3"
        >
          <div className="flex gap-2">
            <IconAlertTriangle className="text-warning mt-0.5 size-4 shrink-0" />
            <p className="text-sm leading-snug">{issue.message}</p>
          </div>
          <div className="flex flex-wrap gap-2 pl-6">
            {issue.fix && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={issue.fix.apply}
              >
                {issue.fix.label}
              </Button>
            )}
            {activeQ !== issue.questionId && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => openQ(issue.questionId, true)}
              >
                Ändra själv
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  if (page === "advanced") {
    return (
      <Card className="mx-auto max-w-2xl gap-0 py-0 max-sm:-mx-4 max-sm:flex max-sm:h-full max-sm:min-h-0 max-sm:flex-col max-sm:rounded-none max-sm:border-x-0">
        <form
          className="max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col"
          onSubmit={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          onFocus={(e) => {
            const t = e.target as HTMLElement;
            if (t.matches?.(FIELD_SELECTOR)) revealField(t);
          }}
        >
          <div
            data-wizard-scroll
            style={{ scrollPaddingBottom: kbInset }}
            className="px-4 py-4 max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto sm:px-6 sm:py-5"
          >
            <div className="mb-4 flex items-center gap-2">
              <IconAdjustments className="text-muted-foreground size-5" />
              <h2 className="text-lg font-semibold">
                Avancerade inställningar
              </h2>
            </div>

            <div className="space-y-6">
              <section className="space-y-3">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Barnet
                </h3>
                {birthCountAdvanced}
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Ekonomi
                </h3>
                {taxAdvanced}
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Redan uttagna dagar
                </h3>
                {usedDaysAdvanced}
              </section>

              <Separator />

              <section className="space-y-4">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  SGI-kvalificering
                </h3>
                {visibleIds.map((id) => (
                  <div key={id} className="space-y-2">
                    <p className="text-sm font-medium">
                      {plan.parents[id].name?.trim() ||
                        (soloMode ? "Du" : `Vårdnadshavare ${id}`)}
                    </p>
                    {caregiverAdvanced(id)}
                  </div>
                ))}
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Så tas dagarna ut
                </h3>
                {leaveStrategyAdvanced}
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Andra ersättningar
                </h3>
                {otherBenefitsAdvanced}
              </section>
            </div>
            <div aria-hidden style={{ height: kbInset }} />
          </div>

          <div className="bg-card/95 sticky bottom-0 z-30 flex items-center justify-between gap-2 border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:rounded-b-xl sm:px-6">
            {/* Every field here writes straight to the plan as it's
                changed, so cancelling has to actively put it back — there's
                no pending draft to just walk away from. */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (formOnAdvancedOpen.current) {
                  setForm(formOnAdvancedOpen.current);
                }
                setPage("wizard");
              }}
            >
              <IconX /> Avbryt
            </Button>
            <Button type="button" onClick={() => setPage("wizard")}>
              <IconDeviceFloppy /> Spara
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  // Step 3's flow is exhausted (or there was never one, in solo mode) — show
  // the summary as its own screen, with the two next actions as big buttons,
  // rather than tucking it under the last question.
  if (reachedEnd) {
    const backToEdit = () => {
      const flow = flowOf(stepCount);
      if (flow.length > 0) {
        openQ(flow[flow.length - 1], true);
      } else {
        goTo(stepCount - 1, true);
      }
    };
    return (
      <Card className="mx-auto max-w-2xl gap-0 py-0 max-sm:-mx-4 max-sm:flex max-sm:h-full max-sm:min-h-0 max-sm:flex-col max-sm:rounded-none max-sm:border-x-0">
        <div className="max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col">
          <div
            data-wizard-scroll
            className="px-4 py-4 max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto sm:px-6 sm:py-5"
          >
            <div className="flex items-start gap-3">
              <div className="aspect-[15/22] w-28 shrink-0 sm:w-32">
                <FamilyScene
                  step={stepCount}
                  soloMode={soloMode}
                  babyCount={plan.childrenInBirth}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5 pt-1">
                <h2 className="text-2xl leading-tight font-semibold">
                  Redo!
                </h2>
                <p className="text-muted-foreground text-sm">
                  Så här ser uppgifterna ut hittills.
                </p>
              </div>
            </div>

            <div className="bg-secondary/40 animate-flow-in mt-5 space-y-2 rounded-xl border p-3">
              <p className="text-sm font-medium">Sammanfattning</p>
              <dl className="space-y-1.5 text-sm">
                {summaryRows.map((r) => (
                  <div key={r.label} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground shrink-0">
                      {r.label}
                    </dt>
                    <dd className="text-right font-medium">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="mt-6 space-y-2.5">
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={primaryAction}
              >
                Visa plan <IconArrowRight />
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-full"
                onClick={() => {
                  formOnAdvancedOpen.current = form;
                  setPage("advanced");
                }}
              >
                <IconAdjustments /> Avancerade inställningar
              </Button>
            </div>
          </div>

          <div className="bg-card/95 sticky bottom-0 z-30 flex items-center border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:rounded-b-xl sm:px-6">
            <Button type="button" variant="ghost" onClick={backToEdit}>
              <IconArrowLeft /> Bakåt
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  /** The step's questions, rendered into whichever slot is being drawn. */
  const stepQuestions =
    current === 1
      ? babyFlow
      : current === 2
        ? caregiverFlow(firstId)
        : soloMode
          ? null
          : caregiverFlow(secondId);

  // A step's very first question, on its first pass — nothing about it is
  // known yet, so the portrait gets the big "here's who/what this is" moment
  // instead of sharing the frame with a (currently empty) summary.
  const heroStage =
    !reopened &&
    (activeQ === "q-date" || activeQ === "a-q-name" || activeQ === "b-q-name");

  return (
    <Card className="mx-auto max-w-2xl gap-0 py-0 max-sm:-mx-4 max-sm:flex max-sm:h-full max-sm:min-h-0 max-sm:flex-col max-sm:rounded-none max-sm:border-x-0">
      <form
        className="max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col"
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={onFormKeyDown}
        onFocus={(e) => {
          // Any focused field is kept clear of the keyboard and pinned bars —
          // except right after a step change, where the scene stays in view.
          if (Date.now() < holdSceneUntil) return;
          const t = e.target as HTMLElement;
          if (t.matches?.(FIELD_SELECTOR)) revealField(t);
        }}
      >
        <div
          data-wizard-scroll
          data-wizard-step={current}
          style={{ scrollPaddingBottom: kbInset }}
          className="px-4 py-4 max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto sm:px-6 sm:py-5 [@media(max-height:740px)]:py-2"
        >
          {/* The stage sits beside the answered questions; it persists across
              steps so the camera pans, the zoom-out and the handover animate
              between them. A step's first question gets it big — the
              summary beside it is empty at that point anyway — then it
              shrinks back once there's something to sit beside. */}
          <div className={cn("flex items-start gap-3", heroStage && "justify-center")}>
            <div
              className={cn(
                "relative aspect-[15/22] shrink-0 transition-[width] duration-700 ease-[cubic-bezier(0.32,0.8,0.3,1)] motion-reduce:transition-none",
                heroStage
                  ? "w-[78%] [@media(max-height:740px)]:w-[62%] [@media(max-height:560px)]:w-[50%]"
                  : "w-[45%] [@media(max-height:740px)]:w-[36%] [@media(max-height:560px)]:hidden",
              )}
            >
              <FamilyScene
                step={current}
                soloMode={soloMode}
                babyCount={plan.childrenInBirth}
              />
              {/* A quiet way to say "twins, actually" without a whole
                  question for it — precise control (and a way back down)
                  stays in Avancerade inställningar. */}
              {current === 1 && (
                <button
                  type="button"
                  id="birth-count-plus"
                  onClick={() =>
                    setPlan((p) => ({
                      ...p,
                      childrenInBirth: p.childrenInBirth >= 4 ? 1 : p.childrenInBirth + 1,
                    }))
                  }
                  aria-label="Fler än ett barn i den här förlossningen"
                  title="Fler än ett barn i den här förlossningen"
                  className="bg-background/90 text-foreground hover:bg-background absolute right-1 bottom-1 flex size-6 items-center justify-center rounded-full border shadow-sm active:scale-95"
                >
                  <IconPlus className="size-3.5" />
                </button>
              )}
            </div>
            <div className={cn("min-w-0 flex-1 space-y-1.5", heroStage && "hidden")}>
              <FlowSlot slot="summary">{stepQuestions}</FlowSlot>
            </div>
          </div>

          {/* Right below the flagged summary row, above the question in
              focus — so a choice that can't work is seen, not scrolled past. */}
          {issueBanner}

          <div key={current} className="animate-flow-in mt-4 space-y-5 [@media(max-height:740px)]:mt-2 [@media(max-height:740px)]:space-y-3">
            {current === 1 && (
              <>
                <FlowSlot slot="active">{babyFlow}</FlowSlot>
                {!valid && triedNext && (
                  <p className="text-destructive animate-flow-in text-xs">
                    Välj ett datum i kalendern för att gå vidare.
                  </p>
                )}

              </>
            )}

            {current === 2 && (
              <>
                {/* No lead-in here — stepIntro already says whose step this is. */}
                <FlowSlot slot="active">{caregiverFlow(firstId)}</FlowSlot>
              </>
            )}

            {current === 3 && (
              <>
                {soloMode ? (
                  <p className="text-muted-foreground text-sm">
                    Alla dagar tillhör dig. Planen räknas för en vårdnadshavare.
                  </p>
                ) : (
                  <FlowSlot slot="active">{caregiverFlow(secondId)}</FlowSlot>
                )}

                {/* Naming the other caregiver answers this — the opt-out only
                    stays while there is still nobody to name. */}
                {!plan.parents[secondId].name?.trim() && (
                  <CheckRow
                    id="solo-mode"
                    small
                    checked={soloMode}
                    onChange={(b) =>
                      setForm((f) => ({
                        ...f,
                        soloMode: b,
                        ...(b ? { firstCaregiver: "A" as const } : {}),
                      }))
                    }
                  >
                    Jag planerar ensam — det finns ingen andra vårdnadshavare
                  </CheckRow>
                )}
              </>
            )}
          </div>
          <div aria-hidden style={{ height: kbInset }} />
        </div>

        {/* Nav — pinned to the bottom of the wizard (the keyboard overlays it). */}
        <div className="bg-card/95 sticky bottom-0 z-30 flex items-center justify-between gap-2 border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:rounded-b-xl sm:px-6 [@media(max-height:740px)]:pt-2 [@media(max-height:740px)]:pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <Button
            type="button"
            variant="ghost"
            onClick={current === 1 ? onReset : () => goTo(current - 1)}
          >
            {current === 1 ? (
              <>
                <IconRefresh /> Börja om
              </>
            ) : (
              <>
                <IconArrowLeft /> Bakåt
              </>
            )}
          </Button>

          {/* Flow-aware: while a question is open, Nästa advances THROUGH the
              step's questions (same as Enter); reaching the step's last one
              hands off to the summary screen (reachedEnd, above) instead. */}
          <Button type="button" onClick={primaryAction}>
            Nästa <IconArrowRight />
          </Button>
        </div>
      </form>
    </Card>
  );
}
