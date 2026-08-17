// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Planner } from "@/components/planner";

afterEach(() => {
  cleanup();
  localStorage.clear();
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
  const stepLabel = () => screen.getByText(/Steg \d av \d/).textContent;
  const before = stepLabel();
  for (let i = 0; i < 10; i++) {
    fireEvent.click(screen.getByRole("button", { name: "Nästa" }));
    if (stepLabel() !== before) return;
  }
  throw new Error("Nästa never advanced the step");
}

/** Walk the last step's remaining questions until "Visa plan" appears. */
function showPlan() {
  for (let i = 0; i < 10; i++) {
    const visa = screen.queryByRole("button", { name: /Visa plan/ });
    if (visa) {
      fireEvent.click(visa);
      return;
    }
    fireEvent.click(screen.getByRole("button", { name: "Nästa" }));
  }
  throw new Error("Visa plan never appeared");
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

/** Fill the wizard to the LAST step (both incomes set), without submitting. */
function fillToResults(
  container: HTMLElement,
  opts: { incomeA?: string; incomeB?: string } = {},
) {
  fireEvent.change(container.querySelector("#birth-date")!, {
    target: { value: "2025-01-15" },
  });
  next(); // → step 2: the caregiver going first (A by default)
  openQuestion(container, "a", "income");
  fireEvent.change(container.querySelector("#a-income")!, {
    target: { value: opts.incomeA ?? "45000" },
  });
  next(); // → step 3: the other caregiver
  openQuestion(container, "b", "income");
  fireEvent.change(container.querySelector("#b-income")!, {
    target: { value: opts.incomeB ?? "30000" },
  });
  return container;
}

/** An ISO date ~n days into the future (the projection starts "today"). */
function futureIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("<Planner /> wizard", () => {
  it("walks the steps and lands on a results page with period blocks", () => {
    const { container } = render(<Planner />);
    fillToResults(container);
    showPlan();

    expect(screen.getByText("Justera planen")).toBeTruthy();
    expect(screen.getByText("Perioder")).toBeTruthy();
    // Two caregivers → two period blocks to flip through.
    expect(screen.getByText(/1 av 2/)).toBeTruthy();
    // The period card leads with the household income.
    expect(screen.getAllByText(/Hushåll/).length).toBeGreaterThan(0);
    // Household-income default: the lower earner (B) takes the 300 income-based
    // days while the higher earner (A) keeps their 90 reserved and stays at work.
    expect(screen.getAllByText(/90 dagar/).length).toBeGreaterThan(0);
  });

  it("flips between the period blocks", () => {
    const { container } = render(<Planner />);
    fillToResults(container);
    showPlan();
    expect(screen.getByText(/Vårdnadshavare A är hemma/)).toBeTruthy();
    // The next-button is labelled with the next caregiver's name (exact match
    // to avoid the overview chip, whose label is "Period 2: …").
    fireEvent.click(screen.getByRole("button", { name: "Vårdnadshavare B" }));
    expect(screen.getByText(/Vårdnadshavare B är hemma/)).toBeTruthy();
  });

  it("puts the step-2 caregiver first on the timeline", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
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
    expect(screen.getByText(/Kim är hemma/)).toBeTruthy();
  });

  it("keeps the family scene mounted across steps (animated stage)", () => {
    const { container } = render(<Planner />);
    const scene = () => container.querySelector("[data-family-scene]");
    expect(scene()).not.toBeNull();
    const el = scene();
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    next(); // → step 2
    // Same element instance — the camera/handover can animate between steps.
    expect(scene()).toBe(el);
    // The first caregiver's name tag appears in the scene from step 2 on.
    fireEvent.change(container.querySelector("#a-name")!, {
      target: { value: "Kim Andersson" },
    });
    expect(el?.textContent).toContain("Kim");
  });

  it("swipes between months in the calendar", () => {
    const { container } = render(<Planner />);
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
    const { container } = render(<Planner />);
    // Picking a date auto-advances to the child-order question.
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    expect(
      container.querySelector("#q-order")?.getAttribute("aria-expanded"),
    ).toBe("true");
    // The date question collapsed to a summary with the value in the header.
    expect(
      container.querySelector("#q-date")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.getAllByText(/15 jan(uari)?\.? 2025/).length).toBeGreaterThan(
      0,
    );
    // Choosing the child order advances to the birth-count question.
    fireEvent.click(container.querySelector("#child-number-1")!);
    expect(
      container.querySelector("#q-count")?.getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("supports planning alone via the step-3 opt-out", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
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
    expect(screen.getByText("Justera planen")).toBeTruthy();
    expect(screen.getByText(/1 av 1/)).toBeTruthy();
  });

  it("adds the 10 birth-days for the other parent", () => {
    const { container } = render(<Planner />);
    fillToResults(container); // → last step
    fireEvent.click(container.querySelector("#advanced-options")!);
    fireEvent.click(container.querySelector("#birth-days-enabled")!);
    showPlan();
    expect(screen.getByText("10 dagar vid barns födelse")).toBeTruthy();
  });

  it("drops the first 180 days to grundnivå when the 240-day rule isn't met", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    next(); // → step 2 (caregiver A)
    openQuestion(container, "a", "income");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    // The 240-day rule lives under the advanced settings (default: qualifies).
    fireEvent.click(container.querySelector("#advanced-options")!);
    fireEvent.click(container.querySelector("#a-240")!); // A no longer qualifies
    next(); // → step 3
    openQuestion(container, "b", "income");
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
    showPlan();
    expect(screen.getAllByText(/grundnivå/).length).toBeGreaterThan(0);
  });

  it("includes employer föräldralön by default and lets you opt out", () => {
    const { container } = render(<Planner />);
    fillToResults(container);
    showPlan();
    // Föräldralön is assumed (most collective agreements have it).
    expect(
      screen.getAllByText(/Föräldralön \(arbetsgivaren\)/).length,
    ).toBeGreaterThan(0);
    // Opt out for both caregivers → it disappears.
    fireEvent.click(screen.getByRole("button", { name: /Ändra uppgifter/ }));
    next(); // → step 2
    openQuestion(container, "a", "supplement");
    fireEvent.click(container.querySelector("#a-supplement-no")!);
    next(); // → step 3
    openQuestion(container, "b", "supplement");
    fireEvent.click(container.querySelector("#b-supplement-no")!);
    showPlan();
    expect(screen.queryByText(/Föräldralön \(arbetsgivaren\)/)).toBeNull();
  });

  it("advances with the Enter key and moves focus to the next field", () => {
    const { container } = render(<Planner />);
    const birth = container.querySelector("#birth-date")!;
    fireEvent.change(birth, { target: { value: "2025-01-15" } });
    // The date pick auto-advanced; answer the two choice questions by tap —
    // the LAST answer flows straight into step 2 with the name field focused.
    fireEvent.click(container.querySelector("#child-number-1")!);
    fireEvent.click(container.querySelector("#birth-count-1")!);
    expect(container.querySelector("#a-q-name")).not.toBeNull();
    expect(document.activeElement?.id).toBe("a-name");
    // Enter in the name field opens the next question, focused.
    fireEvent.keyDown(container.querySelector("#a-name")!, { key: "Enter" });
    expect(document.activeElement?.id).toBe("a-income");
    // Reaching a later question also lands focus in its first field.
    openQ(container, "a-q-save");
    expect(document.activeElement?.id).toBe("a-save-days");
  });

  it("walks the questions with Nästa and explains a missing date", () => {
    const { container } = render(<Planner />);
    const nextBtn = () => screen.getByRole("button", { name: "Nästa" });
    // Nothing is flagged before the user has tried to move on.
    expect(screen.queryByText(/Välj ett datum/)).toBeNull();
    // While questions remain, Nästa advances through them (not the step).
    fireEvent.click(nextBtn()); // date → order (no date picked)
    expect(
      container.querySelector("#q-order")?.getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.click(nextBtn()); // order → count
    fireEvent.click(nextBtn()); // count → flow done
    fireEvent.click(nextBtn()); // tries the step → blocked, and says why
    expect(screen.getByText(/Välj ett datum/)).toBeTruthy();
    // It also takes the user back to the question that needs answering.
    expect(
      container.querySelector("#q-date")?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(container.querySelector("#a-income")).toBeNull();
  });

  it("can reopen the inputs from the results page", () => {
    const { container } = render(<Planner />);
    fillToResults(container);
    showPlan();
    fireEvent.click(screen.getByRole("button", { name: /Ändra uppgifter/ }));
    expect(container.querySelector("#birth-date")).not.toBeNull();
  });

  it("includes vab on the results page when enabled", () => {
    const { container } = render(<Planner />);
    fillToResults(container, { incomeA: "40000" });
    fireEvent.click(container.querySelector("#advanced-options")!);
    fireEvent.click(container.querySelector("#vab-enabled")!);
    showPlan();
    expect(screen.getByText("Vab – vård av sjukt barn")).toBeTruthy();
  });

  it("asks each caregiver's goal and solves a date goal from the wizard", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    next(); // → step 2
    openQuestion(container, "a", "income");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    openQuestion(container, "a", "goal");
    fireEvent.click(container.querySelector("#a-goal-untilDate")!);
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

  it("solves the longest leave within a household budget from the wizard", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
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
    openQuestion(container, "b", "goal");
    fireEvent.click(container.querySelector("#b-goal-budget")!);
    expect(container.querySelector("#b-goal-budget-floor")).not.toBeNull();
    showPlan();
    expect(screen.getAllByText(/Inom budget/).length).toBeGreaterThan(0);
  });

  it("saves the days a caregiver sets aside in the wizard", () => {
    const { container } = render(<Planner />);
    fillToResults(container);
    // Second caregiver (B) saves 30 days for later.
    openQuestion(container, "b", "save");
    fireEvent.change(container.querySelector("#b-save-days")!, {
      target: { value: "30" },
    });
    showPlan();
    expect(screen.getAllByText(/till senare/).length).toBeGreaterThan(0);
  });

  it("editing a period's end date flips that caregiver to a date goal", () => {
    const { container } = render(<Planner />);
    fillToResults(container);
    showPlan();
    fireEvent.change(container.querySelector("#period-end-0")!, {
      target: { value: futureIso(45) },
    });
    // The edit becomes a "hemma till" goal, with an undo affordance.
    expect(screen.getByText(/Släpp slutdatumet/)).toBeTruthy();
    expect(screen.getAllByText(/Hemma till/).length).toBeGreaterThan(0);
  });

  it("has a live split slider on the results page that updates the numbers", () => {
    const { container } = render(<Planner />);
    fillToResults(container, { incomeA: "50000", incomeB: "50000" });
    showPlan();
    // The day-split slider lives in the expanded "Justera" controls.
    fireEvent.click(screen.getByRole("button", { name: /Fler inställningar/ }));
    const slider = container.querySelector("#results-split");
    expect(slider).not.toBeNull();
    // Equal (capped) rates → maxPayout splits the 390 income-based days 50/50.
    expect(screen.getAllByText(/195 dagar/).length).toBeGreaterThanOrEqual(1);
    // Drag to give caregiver A 75% of the days → numbers update live.
    fireEvent.change(slider!, { target: { value: "75" } });
    expect(screen.getAllByText(/293 dagar/).length).toBeGreaterThan(0);
  });

  it("stretches one caregiver's leave with the per-person lever", () => {
    const { container } = render(<Planner />);
    fillToResults(container, { incomeA: "45000", incomeB: "30000" });
    showPlan();
    // Both caregivers start on full pace.
    expect(screen.queryByText("Förläng ledigheten")).toBeNull();
    // Open the collapsible "Justera" controls to reach the per-person levers.
    fireEvent.click(screen.getByRole("button", { name: /Fler inställningar/ }));
    // Use caregiver A's "Längst" lever button to stretch their leave.
    fireEvent.click(
      screen.getByRole("button", { name: /Längst ledighet – Vårdnadshavare A/ }),
    );
    expect(screen.getAllByText("Förläng ledigheten").length).toBeGreaterThan(0);
  });

  it("supports a second leave period (switch pace at 1 year)", () => {
    const { container } = render(<Planner />);
    fillToResults(container, { incomeA: "45000", incomeB: "30000" });
    showPlan();
    expect(screen.queryByText(/Efter 1 år:/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Fler inställningar/ }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Byt takt vid 1 år – Vårdnadshavare A/,
      }),
    );
    // The period card now shows the post-1-year rate for caregiver A.
    expect(screen.getAllByText(/Efter 1 år:/).length).toBeGreaterThan(0);
  });

  it("shows combined household income while one caregiver is on leave", () => {
    const { container } = render(<Planner />);
    fillToResults(container, { incomeA: "45000", incomeB: "30000" });
    showPlan();
    // Each period card combines both incomes — the leave-taker's
    // föräldrapenning plus the working partner's salary.
    expect(screen.getAllByText(/s lön ≈/).length).toBeGreaterThan(0);
  });

  it("only counts part-time work in household income when opted in", () => {
    const { container } = render(<Planner />);
    fillToResults(container, { incomeA: "45000", incomeB: "30000" });
    showPlan();
    // Open the collapsible "Justera" controls to reach the per-person levers.
    fireEvent.click(screen.getByRole("button", { name: /Fler inställningar/ }));
    // Extend caregiver A's leave. By default we do NOT assume they work, so the
    // longer leave just spreads föräldrapenningen thinner — no deltidslön.
    fireEvent.click(
      screen.getByRole("button", { name: /Längst ledighet – Vårdnadshavare A/ }),
    );
    expect(screen.queryByText(/deltidslön/)).toBeNull();
    // Opt in to part-time work → their salary for the worked days shows up.
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Jobbar deltid under ledigheten – Vårdnadshavare A/,
      }),
    );
    expect(screen.getAllByText(/deltidslön/).length).toBeGreaterThan(0);
  });

  it("saves the lägstanivå days by default", () => {
    const { container } = render(<Planner />);
    fillToResults(container);
    showPlan();
    expect(screen.getByText(/ingår inte i planen/)).toBeTruthy();
  });

  it("includes the lägstanivå days when the step-1 toggle is on", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    // The lägstanivå toggle lives under step 1's advanced settings.
    fireEvent.click(container.querySelector("#advanced-options")!);
    fireEvent.click(container.querySelector("#include-lagsta")!);
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
    showPlan();
    // Household default (45k/30k): the lower earner B takes the 300 income-based
    // days plus all 90 flat days = 390 once lägstanivå is included. B's card
    // sits on the second period block.
    fireEvent.click(screen.getByRole("button", { name: "Vårdnadshavare B" }));
    expect(screen.getAllByText(/390 dagar/).length).toBeGreaterThan(0);
  });

  it("adds extra days for twins", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    // Twins now live in the birth-count question (icon targets). It's the
    // step's last question, so answering it flows straight into step 2.
    openQ(container, "q-count");
    fireEvent.click(container.querySelector("#birth-count-2")!);
    expect(container.querySelector("#a-q-name")).not.toBeNull();
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
    // Twins add 90 income-based days: B now carries 300 + 90 = 390.
    fireEvent.click(screen.getByRole("button", { name: "Vårdnadshavare B" }));
    expect(screen.getAllByText(/390 dagar/).length).toBeGreaterThan(0);
  });

  it("asks about days from previous children from the second child on", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    // First child: the carried-over question is not in the flow.
    next();
    expect(container.querySelector("#a-extra")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Bakåt/ }));
    openQ(container, "q-order");
    fireEvent.click(container.querySelector("#child-number-2")!);
    next(); // → step 2 — now it is.
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
    expect(
      screen.getAllByText(/sparade från tidigare barn/).length,
    ).toBeGreaterThan(0);
  });
});
