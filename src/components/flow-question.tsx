import { createContext, useContext, type ReactNode } from "react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * Which half of the layout is being rendered. The wizard renders its question
 * flow twice — once beside the family scene (the answered summaries) and once
 * below it (the question in focus) — and each question draws itself into
 * exactly one of them. This keeps the flows written as a single linear list.
 */
type Slot = "summary" | "active" | "all";
const SlotContext = createContext<Slot>("all");

export function FlowSlot({
  slot,
  children,
}: {
  slot: Slot;
  children: ReactNode;
}) {
  return <SlotContext value={slot}>{children}</SlotContext>;
}

/**
 * One question in the wizard's flow, with three states:
 *
 * - **Hero** (open while being answered the first time): no card chrome at
 *   all — a large heading with its input as the content of the screen.
 * - **Accordion** (an answered question reopened to edit): keeps its card and
 *   compact header, expanding the input inside the box.
 * - **Collapsed**: the summary row — check badge and the answer alone. The
 *   question itself isn't repeated: "15 jan 2025" says "Födelsedatum" well
 *   enough, and the summaries live in a narrow column beside the scene.
 *
 * A question the user hasn't reached yet isn't rendered at all.
 */
export function FlowQuestion({
  id,
  label,
  value,
  open,
  hero,
  answered,
  visited,
  onOpen,
  children,
}: {
  id: string;
  label: string;
  /** The chosen value, shown in the header while collapsed. */
  value?: string | null;
  open: boolean;
  /** Open as the full-screen question (first pass) rather than an edit. */
  hero?: boolean;
  /** Has a real value — shows the check badge and the value when collapsed. */
  answered: boolean;
  /** The user has passed this question, so it stays reachable even if empty. */
  visited?: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  // Which half of the layout is being drawn (summaries beside the scene, or
  // the question in focus below it).
  const slot = useContext(SlotContext);

  // A question the user hasn't got to is out of the flow entirely. One that
  // was passed over stays listed (without a check) so it can be returned to.
  if (!open && !answered && !visited) return null;
  if (slot === "summary" && open) return null;
  if (slot === "active" && !open) return null;

  const bare = open && hero;
  // Collapsed rows lead with the answer. A question that was passed over
  // without one falls back to its label, so it stays identifiable.
  const summary = answered && value ? value : label;

  return (
    <div
      className={cn(
        "transition-[background-color,border-color,box-shadow,margin] duration-300",
        bare
          ? "animate-flow-in border-transparent bg-transparent py-1 shadow-none"
          : cn("bg-card border shadow-sm", open ? "rounded-xl" : "rounded-lg"),
        open && !bare && "border-primary/50",
      )}
      style={{ borderWidth: 1, borderStyle: "solid" }}
    >
      <button
        type="button"
        id={id}
        onClick={onOpen}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center text-left transition-[padding,column-gap] duration-300",
          bare
            ? "gap-0 px-0 pt-1 pb-0"
            : open
              ? "active:bg-secondary/50 min-h-13 gap-2.5 rounded-xl px-4 py-3"
              : "active:bg-secondary/50 gap-2 rounded-lg px-2.5 py-2",
        )}
      >
        {/* Badge only exists outside the hero state */}
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full transition-all duration-300",
            bare
              ? "size-0 opacity-0"
              : cn(
                  "opacity-100",
                  open ? "size-6" : "size-5",
                  answered
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                ),
          )}
        >
          {answered && !open ? (
            <IconCheck className={open ? "size-4" : "size-3.5"} />
          ) : (
            <IconChevronDown
              className={cn(
                "transition-transform duration-300",
                open ? "size-4 rotate-180" : "size-3.5",
              )}
            />
          )}
        </span>

        <span
          className={cn(
            "min-w-0 flex-1 transition-all duration-300",
            bare
              ? "text-foreground text-2xl leading-tight font-semibold"
              : open
                ? "text-foreground text-sm font-medium"
                : cn(
                    "truncate text-sm font-medium tabular-nums",
                    answered ? "text-foreground" : "text-muted-foreground",
                  ),
          )}
        >
          {open ? label : summary}
        </span>
      </button>

      {/* Animated height: 0fr ↔ 1fr. Content stays mounted; `inert` keeps the
          collapsed panel out of focus order and hit testing. */}
      <div
        inert={!open}
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            id={`${id}-panel`}
            className={cn(
              "space-y-3 transition-[padding] duration-300",
              bare ? "px-0 pt-4 pb-2" : "px-4 pt-1 pb-4",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
