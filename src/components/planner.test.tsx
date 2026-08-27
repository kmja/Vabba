// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { Planner } from "@/components/planner";
import { SiteHeader } from "@/components/site-header";
import { HomeNavProvider } from "@/lib/home-nav";

// jsdom doesn't implement the native <dialog>'s modal behaviour — attribute
// reflection (the `open` property) works, but showModal()/close() are
// missing entirely. The real behaviour is covered by browser verification
// (Playwright) elsewhere; this just lets <dialog>-based components render
// here without crashing, close enough to test what opens inside them.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

// jsdom doesn't implement visualViewport at all. The wizard's
// keyboard-avoidance logic (the useEffect in Wizard) needs it to know when
// an on-screen keyboard has shrunk the visible area — this stand-in lets a
// test drive that directly via a plain "resize" event.
class MockVisualViewport extends EventTarget {
  height = 800;
  width = 390;
  offsetTop = 0;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete (window as { visualViewport?: unknown }).visualViewport;
});

/**
 * Integration smoke test for the wizard → results flow. The pure logic is
 * covered exhaustively in lib/*.test.ts; here we confirm the React layer steps
 * through inputs → solver → rendered results without runtime errors.
 *
 * Wizard: 3 steps (Barnet → Hemma först → Den andra), each a flow of
 * FlowQuestion accordions — answering one collapses it and opens the next.
 */
/**
 * The footer's Nästa is flow-aware: it advances through the step's remaining
 * questions first, then changes step. This helper clicks until the step
 * indicator changes. (Exact name — the calendar has a "Nästa månad" button.)
 */
function next() {
  const stepLabel = () =>
    document
      .querySelector("[data-wizard-step]")
      ?.getAttribute("data-wizard-step");
  const before = stepLabel();
  for (let i = 0; i < 10; i++) {
    fireEvent.click(screen.getByRole("button", { name: "Nästa" }));
    if (stepLabel() !== before) return;
  }
  throw new Error("Nästa never advanced the step");
}

/** Walk the last step's remaining questions until "Visa plan" appears. */
function showPlan() {
  reachSummary();
  fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
}

/**
 * Walk the wizard to its end-of-flow summary — where "Visa plan" and
 * "Avancerade" both appear — without submitting. That's the only place the
 * advanced-settings page is reachable from.
 */
function reachSummary() {
  for (let i = 0; i < 10; i++) {
    if (screen.queryByRole("button", { name: /Visa plan/ })) return;
    fireEvent.click(screen.getByRole("button", { name: "Nästa" }));
  }
  throw new Error("summary screen never appeared");
}

/** Open the advanced-settings page from the end-of-wizard summary. */
function openAdvanced(container: HTMLElement) {
  reachSummary();
  fireEvent.click(screen.getByRole("button", { name: /Avancerade/ }));
  return container;
}

/** Save and close the advanced-settings page, back to the summary. */
function closeAdvanced() {
  fireEvent.click(screen.getByRole("button", { name: /^Spara$/ }));
}

/** Cancel out of the advanced-settings page, discarding its changes. */
function cancelAdvanced() {
  fireEvent.click(screen.getByRole("button", { name: /Avbryt/ }));
}

/**
 * Bring a flow question into focus by its id. Questions are revealed one at
 * a time — an unreached one isn't in the DOM at all — so this advances with
 * Nästa until it appears, then opens it if it collapsed behind us.
 */
function openQ(container: HTMLElement, id: string) {
  for (let i = 0; i < 8; i++) {
    const el = container.querySelector(`#${id}`);
    if (el) {
      if (el.getAttribute("aria-expanded") !== "true") fireEvent.click(el);
      return;
    }
    fireEvent.click(screen.getByRole("button", { name: "Nästa" }));
  }
  throw new Error(`never reached question #${id}`);
}

/** Same, for a caregiver's prefixed question (`a-q-income` …). */
function openQuestion(container: HTMLElement, prefix: string, key: string) {
  openQ(container, `${prefix}-q-${key}`);
}

/**
 * Answer the birth-date question. Step 1 now opens on the number of babies,
 * so the date question (and its hidden date input) has to be reached first.
 */
function pickBirth(container: HTMLElement, iso: string) {
  openQ(container, "q-date");
  fireEvent.change(container.querySelector("#birth-date")!, {
    target: { value: iso },
  });
}

/**
 * Reach a caregiver's income question and fill it. Since the latest flow fix
 * the wizard won't let "Nästa" skip past an empty salary, so any test that
 * wants to get beyond the income question answers it first.
 */
function setIncome(container: HTMLElement, prefix: "a" | "b", value = "45000") {
  openQuestion(container, prefix, "income");
  fireEvent.change(container.querySelector(`#${prefix}-income`)!, {
    target: { value },
  });
}

/** Fill the wizard to the LAST step (both incomes set), without submitting. */
function fillToResults(
  container: HTMLElement,
  opts: {
    incomeA?: string;
    incomeB?: string;
    birth?: string;
    /**
     * A defaults to "as long as possible" (no follow-up). Pass a preset key
     * (e.g. "3man") to give A a fixed, predictable length instead — for
     * tests whose scenario depends on A's own stretch not running on
     * indefinitely.
     */
    goalPresetA?: string;
  } = {},
) {
  pickBirth(container, opts.birth ?? "2025-01-15");
  next(); // → step 2: the caregiver going first (A by default)
  openQuestion(container, "a", "income");
  fireEvent.change(container.querySelector("#a-income")!, {
    target: { value: opts.incomeA ?? "45000" },
  });
  if (opts.goalPresetA) {
    openQuestion(container, "a", "goal");
    fireEvent.click(container.querySelector("#a-goal-untilDate")!);
    fireEvent.click(
      container.querySelector(`#a-goal-preset-${opts.goalPresetA}`)!,
    );
  }
  next(); // → step 3: the other caregiver
  openQuestion(container, "b", "income");
  fireEvent.change(container.querySelector("#b-income")!, {
    target: { value: opts.incomeB ?? "30000" },
  });
  return container;
}

/** The results page lists every leave period as an accordion. */
function periodHeaders(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll("[data-period-header]"));
}

/** An ISO date ~n days into the future (the projection starts "today"). */
function futureIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Clicks the site header's logo — the sole "go home" trigger now. */
function clickLogo() {
  fireEvent.click(screen.getByRole("button", { name: /Föräldradagar/ }));
}

/**
 * Render the app and dismiss the landing page via "Skapa ny plan" — every
 * wizard/results test starts from a blank plan and doesn't care about it.
 *
 * Mirrors the root layout: <SiteHeader> and <Planner> are siblings, both
 * inside the same provider, so the header's logo can reach <Planner>'s
 * "go home" handler exactly as it does in the real app.
 */
function renderPlanner() {
  const rendered = render(
    <HomeNavProvider>
      <SiteHeader />
      <Planner />
    </HomeNavProvider>,
  );
  fireEvent.click(rendered.container.querySelector("#create-plan")!);
  return rendered;
}

describe("<Planner /> wizard", () => {
  it("walks the steps and lands on a results page with period blocks", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();

    expect(screen.getByText("Perioder")).toBeTruthy();
    // The 10-dagar around the birth, then one block per caregiver.
    expect(periodHeaders(container).length).toBe(3);
    // The period card's collapsed header leads with the net monthly figure.
    expect(screen.getAllByText(/\/mån/).length).toBeGreaterThan(0);
  });

  it("expands one period block at a time", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();
    // [0] is the 10-dagar block, then the two caregivers in leave order.
    const headers = () => periodHeaders(container);
    expect(headers()[0].textContent).toContain("vid födseln");
    expect(headers()[1].textContent).toContain("Vårdnadshavare A");
    expect(headers()[2].textContent).toContain("Vårdnadshavare B");
    // The topmost block starts open.
    expect(headers()[0].getAttribute("aria-expanded")).toBe("true");
    expect(headers()[2].getAttribute("aria-expanded")).toBe("false");
    // Opening another shuts the one before it.
    fireEvent.click(headers()[2]);
    expect(headers()[0].getAttribute("aria-expanded")).toBe("false");
    expect(headers()[2].getAttribute("aria-expanded")).toBe("true");
    // Clicking the open one shuts it too.
    fireEvent.click(headers()[2]);
    expect(headers()[2].getAttribute("aria-expanded")).toBe("false");
  });

  it("puts the step-2 caregiver first on the timeline", () => {
    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    next(); // → step 2: whoever is described here goes first
    fireEvent.change(container.querySelector("#a-name")!, {
      target: { value: "Kim" },
    });
    openQuestion(container, "a", "income");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    next(); // → step 3
    openQuestion(container, "b", "income");
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
    showPlan();
    // [0] is the 10-dagar block, [1] the first caregiver's own — Kim's.
    expect(periodHeaders(container)[1].textContent).toContain("Kim");
  });

  it("keeps the family scene mounted across steps (animated stage)", () => {
    const { container } = renderPlanner();
    const scene = () => container.querySelector("[data-family-scene]");
    expect(scene()).not.toBeNull();
    const el = scene();
    pickBirth(container, "2025-01-15");
    next(); // → step 2
    // Same element instance — the camera/handover can animate between steps.
    expect(scene()).toBe(el);
    // Caregiver 1's portrait is now in view.
    expect(el?.innerHTML).toContain("Caregiver1.png");
  });

  it("shows the step intro as the name question's heading, but plain \"Namn\" once reopened", () => {
    const { container } = renderPlanner();
    const heading = () => container.querySelector("#a-q-name")!.textContent;
    pickBirth(container, "2025-01-15");
    next(); // → step 2, opens on a-q-name (hero, first pass)
    expect(heading()).toContain("Vem går på ledighet först");
    fireEvent.change(container.querySelector("#a-name")!, {
      target: { value: "Kim" },
    });
    openQuestion(container, "a", "income"); // advances past name
    // Reopen "Namn" from its now-collapsed summary row.
    fireEvent.click(container.querySelector("#a-q-name")!);
    expect(heading()).toBe("Namn");
  });

  it("keeps the portrait centred and expands the summary beside it", () => {
    const { container } = renderPlanner();
    const sceneBox = () =>
      container.querySelector("[data-family-scene]")!.parentElement!;
    const summary = () => sceneBox().nextElementSibling!;
    pickBirth(container, "2025-01-15");
    next(); // → step 2, opens on a-q-name (hero, first pass)
    expect(sceneBox().className).toContain("w-[55%]");
    // Hero: the summary is collapsed (no width/opacity) while the question is
    // being asked, so the image is centred alone.
    expect(summary().className).toContain("max-w-0");
    expect(summary().className).toContain("opacity-0");
    fireEvent.change(container.querySelector("#a-name")!, {
      target: { value: "Kim" },
    });
    openQuestion(container, "a", "income"); // advances past name
    // Same image width; the summary now expands in beside it (which slides
    // the image left), instead of the image snapping left↔centre.
    expect(sceneBox().className).toContain("w-[55%]");
    expect(summary().className).toContain("max-w-full");
    expect(summary().className).toContain("opacity-100");
  });

  it("scrolls a focused field clear of the keyboard once the visible area shrinks", () => {
    const vv = new MockVisualViewport();
    Object.defineProperty(window, "visualViewport", {
      value: vv,
      configurable: true,
    });

    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    next(); // → step 2, hero name — #a-name is auto-focused

    const field = container.querySelector<HTMLElement>("#a-name")!;
    expect(document.activeElement).toBe(field);
    // jsdom lays nothing out for real — give the field a plausible position
    // low on the page, the way it actually sits under a hero-sized portrait.
    field.getBoundingClientRect = () =>
      ({ bottom: 700, top: 650, left: 0, right: 300, width: 300, height: 50, x: 0, y: 650, toJSON: () => ({}) }) as DOMRect;

    const scroller = container.querySelector<HTMLElement>("[data-wizard-scroll]")!;
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy;

    // Untouched so far: at full height the field already fits (700 < 788).
    expect(scrollBy).not.toHaveBeenCalled();

    // Keyboard opens — the visible area shrinks to 400px, covering the field.
    vv.height = 400;
    vv.dispatchEvent(new Event("resize"));

    expect(scrollBy).toHaveBeenCalled();
    const delta = scrollBy.mock.calls.at(-1)![0].top;
    expect(delta).toBeGreaterThan(0);
  });

  it("keeps checking after focus on its own, not only when the viewport fires a resize", async () => {
    const vv = new MockVisualViewport();
    vv.height = 400; // the keyboard is already open by the time focus lands
    Object.defineProperty(window, "visualViewport", {
      value: vv,
      configurable: true,
    });

    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    next(); // → step 2 — focuses #a-name, firing a native "focusin"

    const field = container.querySelector<HTMLElement>("#a-name")!;
    field.getBoundingClientRect = () =>
      ({ bottom: 700, top: 650, left: 0, right: 300, width: 300, height: 50, x: 0, y: 650, toJSON: () => ({}) }) as DOMRect;

    const scroller = container.querySelector<HTMLElement>("[data-wizard-scroll]")!;
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy;

    // No resize/scroll event dispatched at all — a real keyboard's own open
    // animation doesn't reliably fire a second one once it settles, which is
    // exactly what broke the two previous attempts at this. Only the poll
    // loop that focus itself starts should catch this one.
    await new Promise((r) => setTimeout(r, 250));

    expect(scrollBy).toHaveBeenCalled();
  });

  it("sizes the scene's box to the visible artwork, not the faded-out margins", () => {
    const { container } = renderPlanner();
    const scene = () => container.querySelector("[data-family-scene]")!;
    const sceneBox = () => scene().parentElement!;

    // Step 1's close-up fades out well before its own bottom edge (it's
    // mostly torso down there). The box must be trimmed to just the part
    // that's actually visible, or the invisible remainder pushes whatever
    // follows — the "Födelsedatum" question — far down the page.
    expect(sceneBox().style.aspectRatio).toBe("15 / 12.100");
    expect(scene().getAttribute("style")).toContain("height: 181.818%");

    pickBirth(container, "2025-01-15");
    next(); // → step 2: standing figures, which only fade at the ground line
    expect(sceneBox().style.aspectRatio).toBe("15 / 16.500");
    expect(scene().getAttribute("style")).toContain("height: 133.333%");
  });

  it("reopens an answered question as an accordion, not the hero view", () => {
    const { container } = renderPlanner();
    openQ(container, "q-date");
    // First pass: the active question is the hero — no card chrome.
    const dateBox = () => container.querySelector("#q-date")!.parentElement!;
    expect(dateBox().className).toContain("bg-transparent");
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    // Answered → collapsed summary row, back in a card.
    expect(dateBox().className).toContain("bg-card");
    // Reopening it expands in place, keeping the card (not the hero).
    fireEvent.click(container.querySelector("#q-date")!);
    expect(
      container.querySelector("#q-date")?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(dateBox().className).toContain("bg-card");
    expect(dateBox().className).not.toContain("bg-transparent");
  });

  it("swipes between months in the calendar", () => {
    const { container } = renderPlanner();
    openQ(container, "q-date");
    const grid = container.querySelector("[data-calendar-grid]")!;
    const month = () =>
      container.querySelector("[data-calendar-month]")!.textContent;
    const before = month();
    fireEvent.touchStart(grid, { touches: [{ clientX: 220, clientY: 10 }] });
    fireEvent.touchEnd(grid, {
      changedTouches: [{ clientX: 60, clientY: 12 }],
    });
    expect(month()).not.toBe(before);
  });

  it("collapses an answered question and opens the next one", () => {
    const { container } = renderPlanner();
    // Step 1 opens directly on the birth date now.
    expect(
      container.querySelector("#q-date")?.getAttribute("aria-expanded"),
    ).toBe("true");
    // Picking a date auto-advances to the child-order question.
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    expect(
      container.querySelector("#q-order")?.getAttribute("aria-expanded"),
    ).toBe("true");
    // The date question collapsed to a summary showing the answer alone —
    // the question itself is not repeated beside the scene.
    const dateRow = container.querySelector("#q-date")!;
    expect(dateRow.getAttribute("aria-expanded")).toBe("false");
    expect(dateRow.textContent).toMatch(/15 jan(uari)?\.? 2025/);
    expect(dateRow.textContent).not.toContain("Födelsedatum");
  });

  it("skips a fully-answered step on Nästa after going back, instead of reopening it", () => {
    const { container } = renderPlanner();
    const stepLabel = () =>
      container
        .querySelector("[data-wizard-step]")
        ?.getAttribute("data-wizard-step");
    pickBirth(container, "2025-01-15");
    next(); // → step 2, opens on a-q-name
    fireEvent.change(container.querySelector("#a-name")!, {
      target: { value: "Kim" },
    });
    openQuestion(container, "a", "income");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    next(); // walks A's remaining (defaulted) questions into step 3
    expect(stepLabel()).toBe("3");

    // Back to caregiver A — every one of their questions is now answered.
    fireEvent.click(screen.getByRole("button", { name: /Bakåt/ }));
    expect(stepLabel()).toBe("2");
    // Nothing reopens as the hero question — the whole step sits collapsed.
    expect(
      container.querySelector("#a-q-name")?.getAttribute("aria-expanded"),
    ).toBe("false");
    // So a single Nästa moves straight on to step 3, not back through A's
    // already-answered questions one at a time.
    fireEvent.click(screen.getByRole("button", { name: "Nästa" }));
    expect(stepLabel()).toBe("3");
  });

  it("supports planning alone via the step-3 opt-out", () => {
    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    next(); // → step 2: the one going on leave first
    openQuestion(container, "a", "income");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "40000" },
    });
    next(); // → step 3: the other caregiver — or nobody
    fireEvent.click(container.querySelector("#solo-mode")!);
    // The second caregiver's fields disappear.
    expect(container.querySelector("#b-income")).toBeNull();
    showPlan();
    expect(periodHeaders(container).length).toBe(1);
  });

  it("includes the birth-days for the other parent by default", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();
    // On without being asked, and first in the list — they are the earliest
    // leave there is. They sit on top of the 480 rather than drawing it down.
    const first = periodHeaders(container)[0];
    expect(first.textContent).toContain("vid födseln");
    expect(first.textContent).toContain("10 dagar");
    // They belong to whoever is NOT home first (A goes first by default).
    expect(first.textContent).toContain("Vårdnadshavare B");
  });

  it("gives the birth-days per child, so twins double them", () => {
    const { container } = renderPlanner();
    // The subtle "+" on the baby image is the only in-flow way to say
    // "twins" now — one tap takes it from 1 to 2.
    fireEvent.click(container.querySelector("#birth-count-plus")!);
    fillToResults(container);
    showPlan();
    expect(periodHeaders(container)[0].textContent).toContain("20 dagar");
  });

  it("can turn the birth-days off", () => {
    const { container } = renderPlanner();
    fillToResults(container); // → last step
    openAdvanced(container);
    fireEvent.click(container.querySelector("#birth-days-enabled")!);
    closeAdvanced();
    showPlan();
    // Only the two caregivers' own stretches are left.
    expect(periodHeaders(container).length).toBe(2);
    expect(screen.queryByText("vid födseln")).toBeNull();
  });

  it("drops the first 180 days to grundnivå when the 240-day rule isn't met", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    // The 240-day rule lives on the advanced-settings page (default: qualifies).
    openAdvanced(container);
    fireEvent.click(container.querySelector("#a-240")!); // A no longer qualifies
    closeAdvanced();
    showPlan();
    expect(screen.getAllByText(/grundnivå/).length).toBeGreaterThan(0);
  });

  it("includes employer föräldralön by default and lets you opt out", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();
    // Föräldralön is assumed (most collective agreements have it), and shows
    // as its own column in the period card's breakdown.
    expect(screen.getAllByText("Föräldralön").length).toBeGreaterThan(0);
    // Opt out for both caregivers → it disappears.
    fireEvent.click(screen.getByRole("button", { name: /Ändra uppgifter/ }));
    next(); // → step 2
    openQuestion(container, "a", "supplement");
    fireEvent.click(container.querySelector("#a-supplement-no")!);
    next(); // → step 3
    openQuestion(container, "b", "supplement");
    fireEvent.click(container.querySelector("#b-supplement-no")!);
    showPlan();
    expect(screen.queryByText("Föräldralön")).toBeNull();
  });

  it("advances with the Enter key and moves focus to the next field", () => {
    const { container } = renderPlanner();
    // Pick a date, tap the child order — each answer auto-advances, and the
    // LAST one flows straight into step 2 with the name field focused.
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    fireEvent.click(container.querySelector("#child-number-1")!);
    expect(container.querySelector("#a-q-name")).not.toBeNull();
    expect(document.activeElement?.id).toBe("a-name");
    // Enter in the name field opens the next question, focused.
    fireEvent.keyDown(container.querySelector("#a-name")!, { key: "Enter" });
    expect(document.activeElement?.id).toBe("a-income");
    // Reaching a later question also lands focus in its first field.
    setIncome(container, "a");
    openQ(container, "a-q-save");
    expect(document.activeElement?.id).toBe("a-save-days");
  });

  it("won't advance past an unanswered required question and explains a missing date", () => {
    const { container } = renderPlanner();
    const nextBtn = () => screen.getByRole("button", { name: "Nästa" });
    // Nothing is flagged before the user has tried to move on.
    expect(screen.queryByText(/Välj ett datum/)).toBeNull();
    // Step 1 opens directly on the date question.
    expect(
      container.querySelector("#q-date")?.getAttribute("aria-expanded"),
    ).toBe("true");
    // Nästa can't skip the empty birth-date question — it stays put and says why.
    fireEvent.click(nextBtn());
    expect(screen.getByText(/Välj ett datum/)).toBeTruthy();
    expect(
      container.querySelector("#q-date")?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(container.querySelector("#a-income")).toBeNull();
    // Answering it lets the flow move on to the next question.
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    expect(
      container.querySelector("#q-order")?.getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("asks how much föräldralön right after saying yes", () => {
    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    next(); // → step 2
    setIncome(container, "a");
    openQuestion(container, "a", "supplement");
    // The terms aren't asked until there is a yes to configure.
    expect(container.querySelector("#a-supp-months")).toBeNull();
    fireEvent.click(container.querySelector("#a-supplement-yes")!);
    expect(
      container.querySelector("#a-q-suppdetail")?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(container.querySelector("#a-supp-months")).not.toBeNull();
    expect(container.querySelector("#a-supp-pct")).not.toBeNull();
  });

  it("collapses föräldralön into a single row once the terms are known", () => {
    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    next(); // → step 2
    setIncome(container, "a");
    openQuestion(container, "a", "supplement");
    fireEvent.click(container.querySelector("#a-supplement-yes")!);
    // Answer the terms question (defaults are fine) and move past it.
    fireEvent.click(screen.getByRole("button", { name: "Nästa" }));
    // Its own row is gone — repeating "Ja" and the terms as two separate
    // lines once both are known would just say the same thing twice.
    expect(container.querySelector("#a-q-suppdetail")).toBeNull();
    const suppRow = container.querySelector("#a-q-supplement")!;
    expect(suppRow.textContent).toContain("90 % i 6 mån");
    expect(suppRow.textContent).not.toMatch(/\bJa\b/);
  });

  it("skips the föräldralön terms when there is none", () => {
    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    next(); // → step 2
    setIncome(container, "a");
    openQuestion(container, "a", "supplement");
    fireEvent.click(container.querySelector("#a-supplement-no")!);
    expect(container.querySelector("#a-q-suppdetail")).toBeNull();
    expect(
      container.querySelector("#a-q-goal")?.getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("returns to the waiting question after editing an earlier answer", () => {
    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    next(); // → step 2, the name question in focus
    fireEvent.change(container.querySelector("#a-name")!, {
      target: { value: "Kim" },
    });
    fireEvent.keyDown(container.querySelector("#a-name")!, { key: "Enter" });
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    fireEvent.keyDown(container.querySelector("#a-income")!, { key: "Enter" });
    // Go back to fix the name; submitting it must not walk back through the
    // salary, which is already answered.
    fireEvent.click(container.querySelector("#a-q-name")!);
    fireEvent.keyDown(container.querySelector("#a-name")!, { key: "Enter" });
    expect(
      container.querySelector("#a-q-income")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      container.querySelector("#a-q-supplement")?.getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("can reopen the inputs from the results page", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();
    fireEvent.click(screen.getByRole("button", { name: /Ändra uppgifter/ }));
    expect(container.querySelector("#birth-date")).not.toBeNull();
  });

  it("includes vab on the results page when enabled", () => {
    const { container } = renderPlanner();
    fillToResults(container, { incomeA: "40000" });
    openAdvanced(container);
    fireEvent.click(container.querySelector("#vab-enabled")!);
    closeAdvanced();
    showPlan();
    expect(screen.getByText("Vab – vård av sjukt barn")).toBeTruthy();
  });

  it("asks each caregiver's goal and solves a date goal from the wizard", () => {
    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    next(); // → step 2
    openQuestion(container, "a", "income");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    openQuestion(container, "a", "goal");
    fireEvent.click(container.querySelector("#a-goal-untilDate")!);
    // The shortcuts come first; the calendar is behind "Välj datum".
    fireEvent.click(container.querySelector("#a-goal-date-custom")!);
    fireEvent.change(container.querySelector("#a-goal-date")!, {
      target: { value: futureIso(60) },
    });
    next(); // → step 3
    openQuestion(container, "b", "income");
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
    showPlan();
    // The goal shows up as A's plan ("Hemma till …") in the Justera section.
    expect(screen.getAllByText(/Hemma till/).length).toBeGreaterThan(0);
  });

  it("asks the goal and its settings as separate substeps", () => {
    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    next(); // → step 2
    setIncome(container, "a");
    openQuestion(container, "a", "goal");
    // Substep 1: only the two goal choices — no date input yet.
    expect(container.querySelector("#a-goal-untilDate")).not.toBeNull();
    expect(container.querySelector("#a-goal-budget")).not.toBeNull();
    expect(container.querySelector("[data-calendar-grid]")).toBeNull();
    // Choosing "fixed duration" collapses the choices and opens its own
    // follow-up.
    fireEvent.click(container.querySelector("#a-goal-untilDate")!);
    expect(
      container.querySelector("#a-q-goal")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      container.querySelector("#a-q-goaldetail")?.getAttribute("aria-expanded"),
    ).toBe("true");
    // Substep 2 leads with the date shortcuts — the calendar only opens if
    // none of them fit.
    expect(container.querySelector("#a-goal-preset-6man")).not.toBeNull();
    expect(container.querySelector("[data-calendar-grid]")).toBeNull();
    fireEvent.click(container.querySelector("#a-goal-date-custom")!);
    expect(container.querySelector("[data-calendar-grid]")).not.toBeNull();
    // "Så länge som möjligt" needs no follow-up at all — it is skipped.
    fireEvent.click(container.querySelector("#a-q-goal")!);
    fireEvent.click(container.querySelector("#a-goal-budget")!);
    expect(container.querySelector("#a-q-goaldetail")).toBeNull();
    expect(
      container.querySelector("#a-q-save")?.getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("answers the date goal from a shortcut without opening the calendar", () => {
    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    next(); // → step 2
    setIncome(container, "a");
    openQuestion(container, "a", "goal");
    fireEvent.click(container.querySelector("#a-goal-untilDate")!);
    fireEvent.click(container.querySelector("#a-goal-preset-6man")!);
    // Answered and collapsed, with the saved-days question next up.
    expect(
      container.querySelector("#a-q-goaldetail")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      container.querySelector("#a-q-save")?.getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("says nothing about a goal until the household is known", () => {
    const { container } = renderPlanner();
    pickBirth(container, futureIso(30));
    next(); // → step 2
    openQuestion(container, "a", "income");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    openQuestion(container, "a", "goal");
    fireEvent.click(container.querySelector("#a-goal-untilDate")!);
    fireEvent.click(container.querySelector("#a-goal-preset-2ar")!);
    // The other caregiver has not been asked yet. Their salary counts toward
    // the household and their share decides the days, so any verdict here
    // would be worked out from a salary of zero.
    expect(screen.queryByText(/det fattas ungefär/)).toBeNull();
    expect(screen.queryByText(/går inte att hålla/)).toBeNull();
  });

  it("flags a date goal the days can't reach and offers the reachable one", () => {
    const { container } = renderPlanner();
    fillToResults(container, { birth: futureIso(30) });
    fireEvent.click(screen.getByRole("button", { name: /Bakåt/ })); // → step 2
    openQuestion(container, "a", "goal");
    fireEvent.click(container.querySelector("#a-goal-untilDate")!);
    // Three years is beyond what the whole pool covers, so no reshuffling of
    // the days between them can reach it.
    fireEvent.click(container.querySelector("#a-goal-date-custom")!);
    fireEvent.change(container.querySelector("#a-goal-date")!, {
      target: { value: futureIso(30 + 365 * 3) },
    });
    // Said here, in the wizard — not saved up for the results page.
    expect(screen.getByText(/det fattas ungefär/)).toBeTruthy();
    // ...with the furthest reachable date as a one-tap fix.
    fireEvent.click(screen.getByRole("button", { name: /Flytta till/ }));
    expect(screen.queryByText(/det fattas ungefär/)).toBeNull();
  });

  it("measures the second caregiver's dates from where the first one ends", () => {
    const { container } = renderPlanner();
    pickBirth(container, futureIso(30));
    next(); // → step 2
    openQuestion(container, "a", "income");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    openQuestion(container, "a", "goal");
    fireEvent.click(container.querySelector("#a-goal-untilDate")!);
    const aSix = container.querySelector("#a-goal-preset-6man")!.textContent;
    // Answer A's goal with a DIFFERENT length than the 6 months being compared:
    // a 6-month A leave would push B's own "6 månader" onto the child's 1st
    // birthday landmark, where the goal-detail dedupes it away in favour of
    // "Barnet fyller 1". 3 months keeps both 6-month presets on screen.
    fireEvent.click(container.querySelector("#a-goal-preset-3man")!); // answer it
    next(); // → step 3
    openQuestion(container, "b", "income");
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
    openQuestion(container, "b", "goal");
    fireEvent.click(container.querySelector("#b-goal-untilDate")!);
    const bSix = container.querySelector("#b-goal-preset-6man")!.textContent;
    // B's leave begins where A's ends, so six months of it lands on a
    // different date than six months of A's.
    expect(bSix).not.toBe(aSix);
  });

  it("scales föräldralön to the pace actually being drawn, not the manual lever", () => {
    const { container } = renderPlanner();
    // A goal drives A's pace to a slow crawl (a low budget floor relative to
    // B's high salary) — the manual "Justera planen" pace stays at its
    // default of 7 the whole time, since a goal bypasses it entirely.
    pickBirth(container, futureIso(30));
    next(); // → step 2
    openQuestion(container, "a", "income");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "31000" },
    });
    openQuestion(container, "a", "goal");
    fireEvent.click(container.querySelector("#a-goal-budget")!);
    next(); // → step 3
    openQuestion(container, "b", "income");
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "63000" },
    });
    showPlan();
    const headers = periodHeaders(container);
    fireEvent.click(headers[1]); // A's own block
    // At a slow pace the top-up is a small fraction of a week's worth — not
    // the near-full amount a pace of 7 would imply. Read straight off the
    // block's text: "Föräldralön<netto>kr<brutto>kr".
    const blockText = headers[1].parentElement!.textContent ?? "";
    const suppMatch = blockText.match(
      /Föräldralön([\d\s]+)kr([\d\s]+)kr/,
    );
    expect(suppMatch).not.toBeNull();
    const suppGross = Number(suppMatch![2].replace(/\s/g, ""));
    // A full week's employer top-up on a 31 000 kr salary is on the order of
    // several thousand kronor; at this crawl it should be a small fraction.
    expect(suppGross).toBeGreaterThan(0);
    expect(suppGross).toBeLessThan(1000);
  });

  it("funds a set length even when the split would starve it", () => {
    const { container } = renderPlanner();
    // A earns more, so "maximise household income" hands every transferable
    // day to B and leaves A only their 90 reserved.
    pickBirth(container, futureIso(30));
    next(); // → step 2 (A, the higher earner, home first)
    openQuestion(container, "a", "income");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "63000" },
    });
    openQuestion(container, "a", "goal");
    fireEvent.click(container.querySelector("#a-goal-budget")!); // open-ended
    next(); // → step 3
    openQuestion(container, "b", "income");
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "31000" },
    });
    openQuestion(container, "b", "goal");
    fireEvent.click(container.querySelector("#b-goal-untilDate")!);
    fireEvent.click(container.querySelector("#b-goal-preset-6man")!);
    showPlan();
    // The stated length wins: the days it needs come off the open-ended
    // goal, rather than the plan reporting an impossible six months.
    expect(screen.queryByText(/det fattas ungefär/)).toBeNull();
    expect(screen.getAllByText(/Hemma i 6 månader/).length).toBeGreaterThan(0);
  });

  it("shows net income and duration in a collapsed period row, no dates", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();
    const headers = periodHeaders(container);
    // The birth-days block: a lump sum, not a monthly rate.
    expect(headers[0].textContent).toMatch(/≈ [\d\s]+kr · \d+ dagar/);
    // A caregiver's own stretch: net per month (headline), the length, and
    // the pace — no start/end dates baked into the row itself.
    expect(headers[1].textContent).toMatch(/≈ [\d\s]+kr\s*\/mån/);
    expect(headers[1].textContent).toMatch(/≈ [\d,]+ mån/);
    expect(headers[1].textContent).toMatch(/dagar\/vecka/);
    for (const h of headers) {
      expect(h.textContent).not.toMatch(/\d{4}/); // no year → no date in the row
    }
  });

  it("puts a dated marker between each period instead of inside it", () => {
    const { container } = renderPlanner();
    // A birth still ahead, so the leave starts right on the birth date
    // rather than being pulled forward to "today" by a past one.
    fillToResults(container, { birth: futureIso(14) });
    showPlan();
    const markers = container.querySelectorAll("[data-period-marker]");
    const headers = periodHeaders(container);
    // One marker ahead of every block, none trailing the last.
    expect(markers.length).toBe(headers.length);
    // The birth-days block and A's own leave both start on the birth date —
    // they overlap rather than chain — so no marker claims a waiting gap.
    for (const m of markers) {
      expect(m.querySelector("[data-gap-note]")).toBeNull();
    }
  });

  it("explains a caregiver handoff, and the birth, in the markers between blocks", () => {
    const { container } = renderPlanner();
    fillToResults(container, { birth: futureIso(14) });
    showPlan();
    const reasons = Array.from(
      container.querySelectorAll("[data-marker-reason]"),
    ).map((el) => el.textContent);
    expect(reasons.some((t) => t === "Barnet föds.")).toBe(true);
    // A is home first by default — their stretch ending and B's starting is
    // the one boundary a plain two-caregiver plan always has.
    expect(reasons.some((t) => t?.includes("tar över."))).toBe(true);
  });

  it("merges the birth-days into the first caregiver's overlapping start", () => {
    const { container } = renderPlanner();
    // Both start at the birth by default — the two sit on top of each other
    // for the first 10 days rather than reading as unrelated events. A short,
    // fixed length for A keeps its solved pace predictable.
    fillToResults(container, { birth: futureIso(14), goalPresetA: "3man" });
    showPlan();
    const headers = periodHeaders(container);
    // One combined block for the shared window, not two separate ones.
    expect(headers[0].textContent).toContain("vid födseln");
    expect(headers[0].textContent).toMatch(/10 dagar/);
    // Only one marker for that whole window — at the birth — not a second
    // one immediately after it for a "gap" of zero days.
    const markers = container.querySelectorAll("[data-period-marker]");
    expect(markers.length).toBe(headers.length);

    // The combined figure sums two numbers in the SAME unit — the leave
    // -taker's rate prorated to the 10-day window, not their bare monthly
    // rate added to the other parent's 10-day total (which would silently
    // overstate it several-fold).
    fireEvent.click(headers[0]);
    const sources = Array.from(
      headers[0].parentElement!.querySelectorAll("[data-income-sources] span"),
    )
      .map((el) => el.textContent ?? "")
      .filter((t) => /^\d[\d\s]*kr$/.test(t))
      .map((t) => Number(t.replace(/\D/g, "")));
    const headline = Number(
      (headers[0].parentElement!.textContent!.match(/≈([\d\s]+)kr/)?.[1] ??
        "0"
      ).replace(/\s/g, ""),
    );
    // Every source figure in the combined block is at most the headline —
    // a monthly rate slipping in unscaled would dwarf a 10-day total.
    for (const n of sources) {
      expect(n).toBeLessThanOrEqual(headline);
    }
  });

  it("stretches a caregiver's leave as long as possible from the wizard", () => {
    const { container } = renderPlanner();
    // A birth far enough out that A's own (first) block is unambiguously
    // before the child's 1st birthday — the pace floor is lowest there.
    pickBirth(container, futureIso(30));
    next(); // → step 2
    openQuestion(container, "a", "income");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    openQuestion(container, "a", "goal");
    fireEvent.click(container.querySelector("#a-goal-budget")!);
    // No floor to fill in — it goes straight to the next question.
    expect(container.querySelector("#a-q-goaldetail")).toBeNull();
    expect(
      container.querySelector("#a-q-save")?.getAttribute("aria-expanded"),
    ).toBe("true");
    next(); // → step 3
    openQuestion(container, "b", "income");
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
    showPlan();
    expect(screen.getAllByText(/Så länge som möjligt/).length).toBeGreaterThan(
      0,
    );
    // The solver has no floor to satisfy, so it draws A's days at the
    // slowest pace the rules allow — that's the whole point of the mode.
    fireEvent.click(periodHeaders(container)[1]); // A's own (first) block
    expect(screen.getAllByText(/0,5 dagar\/vecka/).length).toBeGreaterThan(0);
  });

  it("saves the days a caregiver sets aside in the wizard", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    // Second caregiver (B) saves 30 days for later.
    openQuestion(container, "b", "save");
    fireEvent.change(container.querySelector("#b-save-days")!, {
      target: { value: "30" },
    });
    showPlan();
    // Reopen the plan and confirm the saved days stuck (their one-line
    // summary lived in the removed "Justera planen" section, so read the
    // field back instead).
    fireEvent.click(screen.getByRole("button", { name: /Ändra uppgifter/ }));
    for (
      let i = 0;
      i < 25 && !container.querySelector("#b-q-save");
      i++
    ) {
      fireEvent.click(screen.getByRole("button", { name: "Nästa" }));
    }
    expect(
      (container.querySelector("#b-save-days") as HTMLInputElement).value,
    ).toBe("30");
  });

  // The inline end-date edit this test exercised (period-end-N + "Släpp
  // slutdatumet") was removed from the period card — a fixed length is now
  // only ever set as a goal from the wizard's "Bestämd längd" option.

  it("does not offer pace dials on a stretch the solver drives", () => {
    const { container } = renderPlanner();
    fillToResults(container, { birth: futureIso(30) });
    showPlan();
    // Both caregivers default to a goal now — the solver drives the pace for
    // both, so neither offers the manual pace dials. They'd write to
    // settings the solver overrides.
    expect(
      screen.queryByRole("checkbox", {
        name: /Byt takt vid 1 år – Vårdnadshavare B/,
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", {
        name: /Byt takt vid 1 år – Vårdnadshavare A/,
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("slider", { name: /Takt.*Vårdnadshavare/ }),
    ).toBeNull();
  });

  it("shows combined household income while one caregiver is on leave", () => {
    const { container } = renderPlanner();
    fillToResults(container, { incomeA: "45000", incomeB: "30000" });
    showPlan();
    // Each period card breaks the month down by source — the leave-taker's
    // föräldrapenning beside the working partner's salary.
    expect(screen.getAllByText("Föräldrapenning").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Vårdnadshavare [AB]s lön/).length,
    ).toBeGreaterThan(0);
  });

  it("only counts part-time work in household income when opted in", () => {
    const { container } = renderPlanner();
    fillToResults(container, { incomeA: "45000", incomeB: "30000" });
    showPlan();
    // Open A's block to reach its per-person levers.
    fireEvent.click(periodHeaders(container)[1]);
    // A defaults to "as long as possible" — a slow pace that just spreads
    // föräldrapenningen thinner. By default we do NOT assume they work, so
    // no deltidslön shows up.
    expect(screen.queryByText(/deltidslön/i)).toBeNull();
    // Opt in to part-time work → their salary for the worked days shows up.
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Jobbar deltid under ledigheten – Vårdnadshavare A/,
      }),
    );
    expect(screen.getAllByText(/deltidslön/i).length).toBeGreaterThan(0);
  });

  it("saves the lägstanivå days by default", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();
    // No flat days drawn — the 90 lägstanivådagar are held back unless the
    // step-1 toggle asks for them. If they'd been drawn, B's stretch would
    // split into a second, "lägstanivå"-tagged block.
    expect(periodHeaders(container).length).toBe(3);
    expect(screen.queryByText("lägstanivå")).toBeNull();
  });

  it("includes the lägstanivå days when the advanced toggle is on", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    openAdvanced(container);
    fireEvent.click(container.querySelector("#include-lagsta")!);
    closeAdvanced();
    showPlan();
    // The 90 flat days are taken — and since they pay a different rate they
    // are their own block at the end of B's leave.
    const last = periodHeaders(container).at(-1)!;
    expect(last.textContent).toContain("lägstanivå");
  });

  it("shows a combined dubbeldagar block right after the birth block", () => {
    const { container } = renderPlanner();
    fillToResults(container, { birth: futureIso(30) });
    openAdvanced(container);
    fireEvent.change(container.querySelector("#double-days")!, {
      target: { value: "20" },
    });
    closeAdvanced();
    showPlan();

    const headers = periodHeaders(container);
    expect(headers[0].textContent).toContain("vid födseln");
    expect(headers[1].textContent).toContain("dubbeldagar");
    expect(headers[1].textContent).toMatch(/20 dagar/);
    // Both caregivers show up in the combined header — this is the whole
    // point of dubbeldagar, both home at once.
    expect(headers[1].textContent).toContain("Vårdnadshavare A");
    expect(headers[1].textContent).toContain("Vårdnadshavare B");
    // It isn't shown again as a second, oddly-timed standalone block later
    // in the list.
    expect(
      headers.filter((h) => h.textContent?.includes("dubbeldagar")).length,
    ).toBe(1);

    // Contiguous with what comes right after it — not a gap where both are
    // back at work.
    const markers = Array.from(
      container.querySelectorAll("[data-period-marker]"),
    );
    expect(markers[2]!.querySelector("[data-gap-note]")).toBeNull();
  });

  it("adds extra days for twins", () => {
    const { container } = renderPlanner();
    // The "+" on the baby image (step 1's scene) is the in-flow way to say
    // twins now; one tap takes it from 1 to 2.
    fireEvent.click(container.querySelector("#birth-count-plus")!);
    pickBirth(container, "2025-01-15");
    next(); // → step 2
    openQuestion(container, "a", "income");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    next(); // → step 3
    openQuestion(container, "b", "income");
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
    // The extra day math itself is covered at the pure-function level
    // (rules.test.ts) — what the integration needs to prove is that the
    // "+" tap actually reached the plan, round-tripping through to the
    // advanced-settings field that shows the same count.
    openAdvanced(container);
    expect(
      container.querySelector<HTMLInputElement>("#children-in-birth")?.value,
    ).toBe("2");
    closeAdvanced();
    showPlan();
    expect(periodHeaders(container).length).toBe(3);
  });

  it("asks about days from previous children from the second child on", () => {
    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    // First child: the carried-over question is not in the flow.
    next();
    expect(container.querySelector("#a-extra")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Bakåt/ }));
    openQ(container, "q-order");
    // It is the step's last question, so answering it flows into step 2 —
    // where the carried-over-days question is now part of the flow.
    fireEvent.click(container.querySelector("#child-number-2")!);
    openQuestion(container, "a", "income");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    openQuestion(container, "a", "extra");
    fireEvent.change(container.querySelector("#a-extra")!, {
      target: { value: "40" },
    });
    next(); // → step 3
    openQuestion(container, "b", "income");
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
    showPlan();
    // The carried-over figure isn't broken out on the period card any more
    // (it's folded into the caregiver's own day total) — round-trip through
    // "Ändra" instead, confirming the wizard still has what was entered.
    fireEvent.click(screen.getByRole("button", { name: /Ändra uppgifter/ }));
    openQuestion(container, "a", "extra");
    expect(container.querySelector<HTMLInputElement>("#a-extra")?.value).toBe(
      "40",
    );
  });

  it("only offers advanced settings once the wizard reaches its summary", () => {
    const { container } = renderPlanner();
    // Mid-flow: no advanced-settings entry point yet.
    expect(screen.queryByRole("button", { name: /Avancerade/ })).toBeNull();
    fillToResults(container);
    expect(screen.queryByRole("button", { name: /Avancerade/ })).toBeNull();

    reachSummary();
    expect(screen.getByText("Sammanfattning")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Avancerade/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Visa plan/ })).toBeTruthy();
  });

  it("returns from the advanced-settings page to the same summary", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    openAdvanced(container);
    expect(screen.getByText("Avancerade inställningar")).toBeTruthy();
    expect(container.querySelector("#municipal-rate")).toBeTruthy();

    closeAdvanced();
    expect(screen.getByText("Sammanfattning")).toBeTruthy();
    expect(container.querySelector("#municipal-rate")).toBeNull();
  });

  it("saves and closes the advanced-settings page from its Spara button", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    openAdvanced(container);
    fireEvent.click(container.querySelector("#include-lagsta")!);

    fireEvent.click(screen.getByRole("button", { name: /^Spara$/ }));
    // Back on the summary — the change is a plain form field, already
    // written to the plan as it was toggled, so nothing more to commit.
    expect(screen.getByText("Sammanfattning")).toBeTruthy();
    openAdvanced(container);
    expect(
      container.querySelector<HTMLInputElement>("#include-lagsta")?.checked,
    ).toBe(true);
  });

  it("discards changes when cancelling out of advanced settings", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    openAdvanced(container);
    fireEvent.click(container.querySelector("#include-lagsta")!);
    expect(
      container.querySelector<HTMLInputElement>("#include-lagsta")?.checked,
    ).toBe(true);

    cancelAdvanced();
    expect(screen.getByText("Sammanfattning")).toBeTruthy();

    // The plan is back to what it was before the change — Avbryt actively
    // restores it, since every field writes straight to the plan as it's
    // changed rather than to some separate, discardable draft.
    openAdvanced(container);
    expect(
      container.querySelector<HTMLInputElement>("#include-lagsta")?.checked,
    ).toBe(false);
  });
});

describe("<Planner /> caregiver quick-edit dialog", () => {
  /** The two caregivers' icon-only edit buttons (aria-label "Ändra {name}s
   *  uppgifter") — excludes the header's "Ändra uppgifter", which still
   *  goes to the wizard. */
  function editButtons() {
    return screen.getAllByRole("button", { name: /^Ändra .+s uppgifter$/ });
  }

  it("opens a dialog scoped to just the caregiver whose button was clicked", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();

    fireEvent.click(editButtons()[0]);
    const dialog = within(screen.getByRole("dialog"));
    // Both caregivers' cards stay mounted behind the dialog (only covered,
    // not unmounted), so the dialog's own scope is what actually proves it
    // is showing just the one caregiver — not the page as a whole.
    expect(dialog.getByText("Vårdnadshavare A")).toBeTruthy();
    expect(dialog.queryByText("Vårdnadshavare B")).toBeNull();

    fireEvent.click(dialog.getByRole("button", { name: "Spara" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("edits income and a fixed-length goal live, and Spara leaves them on the plan", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();

    fireEvent.click(editButtons()[0]);
    fireEvent.change(
      container.querySelector<HTMLInputElement>('dialog input[type="number"]')!,
      { target: { value: "40000" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Bestämd längd" }));
    fireEvent.change(
      container.querySelector<HTMLInputElement>('dialog input[type="date"]')!,
      { target: { value: futureIso(200) } },
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Spara" }));

    expect(screen.getAllByText(/40 000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Hemma till/).length).toBeGreaterThan(0);
  });

  it("Avbryt discards every change made since the dialog opened", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();

    fireEvent.click(editButtons()[0]);
    fireEvent.change(
      container.querySelector<HTMLInputElement>('dialog input[type="number"]')!,
      { target: { value: "40000" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Bestämd längd" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Avbryt" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    // Neither the income edit nor the goal-mode switch survived.
    expect(screen.queryAllByText(/40 000/).length).toBe(0);
    expect(screen.queryAllByText(/Hemma till/).length).toBe(0);

    fireEvent.click(editButtons()[0]);
    expect(
      container.querySelector<HTMLInputElement>('dialog input[type="number"]')!
        .value,
    ).not.toBe("40000");
  });

  it("keeps the advanced fields collapsed until the chevron is opened", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();

    fireEvent.click(editButtons()[0]);
    expect(screen.queryByText("Jobbar deltid under ledigheten")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Avancerat" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Jobbar deltid under ledigheten")).toBeTruthy();
    fireEvent.click(dialog.getByLabelText("Jobbar deltid under ledigheten"));
    fireEvent.click(dialog.getByRole("button", { name: "Spara" }));

    fireEvent.click(editButtons()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Avancerat" }));
    expect(
      container.querySelector<HTMLInputElement>(`#edit-A-parttime`)?.checked,
    ).toBe(true);
  });
});

describe("<Planner /> landing & saved plans", () => {
  it("launches into a landing page with a create-plan button", () => {
    render(
      <HomeNavProvider>
        <Planner />
      </HomeNavProvider>,
    );
    expect(
      screen.getByRole("button", { name: /Skapa ny plan/ }),
    ).toBeTruthy();
    expect(screen.queryByText("Sparade planer")).toBeNull();
  });

  it("Skapa ny plan reaches the wizard", () => {
    const { container } = render(
      <HomeNavProvider>
        <Planner />
      </HomeNavProvider>,
    );
    fireEvent.click(container.querySelector("#create-plan")!);
    expect(container.querySelector("#birth-date")).toBeTruthy();
  });

  it("saves a plan from results and reopens it from the landing page", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();

    fireEvent.click(screen.getByRole("button", { name: /^Spara$/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.querySelector("#save-plan-name")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Spara$/ }));
    expect(
      screen.getByRole("button", { name: /^Sparad$/ }),
    ).toBeTruthy();

    clickLogo();
    expect(screen.getByText("Sparade planer")).toBeTruthy();
    expect(screen.getByText("Namnlös plan")).toBeTruthy();

    fireEvent.click(screen.getByText("Namnlös plan"));
    expect(screen.getByText("Perioder")).toBeTruthy();
    expect(periodHeaders(container).length).toBe(3);
  });

  it("re-saving an opened plan with the same name updates it instead of duplicating", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();

    fireEvent.click(screen.getByRole("button", { name: /^Spara$/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Spara$/ }));
    clickLogo();
    fireEvent.click(screen.getByText("Namnlös plan"));

    // Change A's income via the quick-edit pencil so save re-enables.
    fireEvent.click(screen.getByRole("button", { name: /Ändra Vårdnadshavare A/ }));
    fireEvent.change(container.querySelector("#edit-A-name")!, {
      target: { value: "Anders" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /^Spara$/ }),
    );
    // Saving with the SAME name updates in place — no second entry.
    fireEvent.click(screen.getByRole("button", { name: /Spara/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Spara$/ }));
    clickLogo();
    expect(screen.getAllByText("Namnlös plan").length).toBe(1);
  });

  it("saving an edited plan under a new name keeps the original", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();

    fireEvent.click(screen.getByRole("button", { name: /^Spara$/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Spara$/ }));
    clickLogo();
    fireEvent.click(screen.getByText("Namnlös plan"));

    // Change the plan, then save under a NEW name.
    fireEvent.click(screen.getByRole("button", { name: /Ändra Vårdnadshavare A/ }));
    fireEvent.change(container.querySelector("#edit-A-name")!, {
      target: { value: "Anders" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /^Spara$/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Spara/ }));
    const nameInput = screen.getByRole("textbox", {
      name: "Namn på planen",
    }) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Reviderad" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Spara$/ }));
    clickLogo();
    // Both the original and the new-named plan are present.
    expect(screen.getByText("Namnlös plan")).toBeTruthy();
    expect(screen.getByText("Reviderad")).toBeTruthy();
  });

  it("deletes a saved plan from the landing page", () => {
    const { container } = renderPlanner();
    fillToResults(container);
    showPlan();
    fireEvent.click(screen.getByRole("button", { name: /^Spara$/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Spara$/ }));
    clickLogo();
    expect(screen.getByText("Namnlös plan")).toBeTruthy();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Ta bort/ }));
    expect(screen.queryByText("Namnlös plan")).toBeNull();
    expect(screen.queryByText("Sparade planer")).toBeNull();
  });

  it("offers to continue an in-progress plan after a reload", () => {
    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    cleanup();

    render(
      <HomeNavProvider>
        <Planner />
      </HomeNavProvider>,
    );
    expect(screen.getByText("Påbörjad, inte klar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Fortsätt/ }));
    expect(
      screen.queryByRole("button", { name: /Skapa ny plan/ }),
    ).toBeNull();
    expect(document.querySelector("[data-wizard-step]")).toBeTruthy();
  });

  it("resumes at the step it was on, not the start, after a reload", () => {
    const { container } = renderPlanner();
    pickBirth(container, "2025-01-15");
    next(); // → step 2
    cleanup();

    render(
      <HomeNavProvider>
        <Planner />
      </HomeNavProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Fortsätt/ }));
    expect(
      document
        .querySelector("[data-wizard-step]")
        ?.getAttribute("data-wizard-step"),
    ).toBe("2");
  });
});
