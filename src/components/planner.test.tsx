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
 * Wizard flow: Barnet → Hemma först (first caregiver) → Den andra (second).
 */
function next() {
  fireEvent.click(screen.getByRole("button", { name: /Nästa/ }));
}

function showPlan() {
  fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
}

/** Open a caregiver step's accordion section (checkout-style substeps). */
function openSection(container: HTMLElement, prefix: string, key: string) {
  fireEvent.click(container.querySelector(`#${prefix}-section-${key}`)!);
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
  openSection(container, "a", "economy");
  fireEvent.change(container.querySelector("#a-income")!, {
    target: { value: opts.incomeA ?? "45000" },
  });
  next(); // → step 3: the other caregiver
  openSection(container, "b", "economy");
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
    openSection(container, "a", "economy");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    next(); // → step 3
    openSection(container, "b", "economy");
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
    showPlan();
    expect(screen.getByText(/Kim är hemma/)).toBeTruthy();
  });

  it("supports planning alone via the step-3 opt-out", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    next(); // → step 2: the one going on leave first
    openSection(container, "a", "economy");
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
    openSection(container, "a", "economy");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    // The 240-day rule lives under the advanced settings (default: qualifies).
    fireEvent.click(container.querySelector("#advanced-options")!);
    fireEvent.click(container.querySelector("#a-240")!); // A no longer qualifies
    next(); // → step 3
    openSection(container, "b", "economy");
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
    openSection(container, "a", "economy");
    fireEvent.click(container.querySelector("#a-no-supplement")!);
    next(); // → step 3
    openSection(container, "b", "economy");
    fireEvent.click(container.querySelector("#b-no-supplement")!);
    showPlan();
    expect(screen.queryByText(/Föräldralön \(arbetsgivaren\)/)).toBeNull();
  });

  it("blocks step 1 until a birth date is entered", () => {
    render(<Planner />);
    const nextBtn = screen.getByRole("button", { name: /Nästa/ });
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
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
    openSection(container, "a", "economy");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    openSection(container, "a", "goals");
    fireEvent.click(container.querySelector("#a-goal-untilDate")!);
    fireEvent.change(container.querySelector("#a-goal-date")!, {
      target: { value: futureIso(60) },
    });
    next(); // → step 3
    openSection(container, "b", "economy");
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
    openSection(container, "a", "economy");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    next(); // → step 3
    openSection(container, "b", "economy");
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
    openSection(container, "b", "goals");
    fireEvent.click(container.querySelector("#b-goal-budget")!);
    showPlan();
    expect(screen.getAllByText(/Inom budget/).length).toBeGreaterThan(0);
  });

  it("saves the days a caregiver sets aside in the wizard", () => {
    const { container } = render(<Planner />);
    fillToResults(container);
    // Second caregiver (B) saves 30 days for later.
    openSection(container, "b", "goals");
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
    openSection(container, "a", "economy");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    next(); // → step 3
    openSection(container, "b", "economy");
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
    fireEvent.click(container.querySelector("#twins")!);
    next(); // → step 2
    openSection(container, "a", "economy");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    next(); // → step 3
    openSection(container, "b", "economy");
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
    // First child: the carried-over field is not asked.
    next();
    openSection(container, "a", "goals");
    expect(container.querySelector("#a-extra")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Bakåt/ }));
    fireEvent.click(container.querySelector("#child-number-2")!);
    next(); // → step 2 — now it is.
    openSection(container, "a", "economy");
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    openSection(container, "a", "goals");
    fireEvent.change(container.querySelector("#a-extra")!, {
      target: { value: "40" },
    });
    next(); // → step 3
    openSection(container, "b", "economy");
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
    showPlan();
    expect(
      screen.getAllByText(/sparade från tidigare barn/).length,
    ).toBeGreaterThan(0);
  });
});
