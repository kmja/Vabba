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
 * through inputs → optimizer → rendered results without runtime errors.
 */
function next() {
  fireEvent.click(screen.getByRole("button", { name: /Nästa/ }));
}

function fillToResults(
  container: HTMLElement,
  opts: { incomeA?: string; incomeB?: string } = {},
) {
  fireEvent.change(container.querySelector("#birth-date")!, {
    target: { value: "2025-01-15" },
  });
  next(); // → step 2
  fireEvent.change(container.querySelector("#a-income")!, {
    target: { value: opts.incomeA ?? "45000" },
  });
  fireEvent.change(container.querySelector("#b-income")!, {
    target: { value: opts.incomeB ?? "30000" },
  });
  next(); // → step 3
  return container;
}

describe("<Planner /> wizard", () => {
  it("walks the steps and lands on a results page", () => {
    const { container } = render(<Planner />);
    fillToResults(container);
    next(); // step 3 → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));

    expect(screen.getByText(/och hur länge/)).toBeTruthy();
    expect(screen.getByText("Fördelning av dagarna")).toBeTruthy();
    expect(screen.getByText("Tidslinje")).toBeTruthy();
    expect(screen.getByText(/Vem är ledig när/)).toBeTruthy(); // Gantt
    // Household-income default: the lower earner (B) takes the 300 income-based
    // days while the higher earner (A) keeps their 90 reserved and stays at work.
    expect(screen.getAllByText(/300 dagar/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/90 dagar/).length).toBeGreaterThan(0);
  });

  it("marks the handoff between caregivers on the timeline", () => {
    const { container } = render(<Planner />);
    fillToResults(container);
    next(); // step 3 → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    expect(screen.getByText("Byte av vårdnadshavare")).toBeTruthy();
  });

  it("lets you choose which caregiver takes leave first", () => {
    const { container } = render(<Planner />);
    fillToResults(container); // → step 3, two caregivers, A first by default
    fireEvent.change(container.querySelector("#first-caregiver")!, {
      target: { value: "B" },
    });
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    // B now leads, so A is the one who takes over at the handover.
    expect(
      screen.getByText(/tar över efter Vårdnadshavare B/),
    ).toBeTruthy();
  });

  it("adds the 10 birth-days for the other parent", () => {
    const { container } = render(<Planner />);
    fillToResults(container); // → step 3
    next(); // → step 4
    fireEvent.click(container.querySelector("#birth-days-enabled")!);
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    expect(screen.getByText("10 dagar vid barns födelse")).toBeTruthy();
  });

  it("drops the first 180 days to grundnivå when the 240-day rule isn't met", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    next(); // → step 2
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
    fireEvent.click(container.querySelector("#a-240")!); // A no longer qualifies
    next(); // → step 3
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    expect(screen.getAllByText(/grundnivå/).length).toBeGreaterThan(0);
  });

  it("includes employer föräldralön on the results page", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    next(); // → step 2
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
    fireEvent.click(container.querySelector("#a-supplement")!); // A has föräldralön
    next(); // → step 3
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    expect(screen.getByText(/Föräldralön \(arbetsgivaren\)/)).toBeTruthy();
  });

  it("blocks step 1 until a birth date is entered", () => {
    render(<Planner />);
    const nextBtn = screen.getByRole("button", { name: /Nästa/ });
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("can reopen the inputs from the results page", () => {
    const { container } = render(<Planner />);
    fillToResults(container);
    next();
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ändra uppgifter/ }));
    expect(container.querySelector("#birth-date")).not.toBeNull();
  });

  it("includes vab on the results page when enabled", () => {
    const { container } = render(<Planner />);
    fillToResults(container, { incomeA: "40000" });
    next(); // → step 4
    fireEvent.click(container.querySelector("#vab-enabled")!);
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    expect(screen.getByText("Vab – vård av sjukt barn")).toBeTruthy();
  });

  it("auto-computes the pace when both caregivers choose to prolong", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    next();
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
    // Each caregiver picks "förläng" independently.
    fireEvent.click(container.querySelector("#a-pace-prolong")!);
    fireEvent.click(container.querySelector("#b-pace-prolong")!);
    fireEvent.change(container.querySelector("#min-monthly-a")!, {
      target: { value: "15000" },
    });
    fireEvent.change(container.querySelector("#min-monthly-b")!, {
      target: { value: "12000" },
    });
    next(); // → step 3: no manual pace selector when nobody is on full pace
    expect(container.querySelector("#days-per-week")).toBeNull();
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    expect(screen.getByText(/och hur länge/)).toBeTruthy();
  });

  it("lets each caregiver set their own pace goal", () => {
    const { container } = render(<Planner />);
    fillToResults(container, { incomeA: "45000", incomeB: "30000" });
    // Back up to step 2 to set per-caregiver paces (fillToResults left us on 3).
    fireEvent.click(screen.getByRole("button", { name: /Bakåt/ }));
    fireEvent.click(container.querySelector("#a-pace-full")!);
    fireEvent.click(container.querySelector("#b-pace-prolong")!);
    fireEvent.change(container.querySelector("#min-monthly-b")!, {
      target: { value: "12000" },
    });
    next(); // → step 3: A is on full pace, so the schedule selector shows
    expect(container.querySelector("#days-per-week")).not.toBeNull();
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    // Both caregivers' goal labels are shown on the monthly estimate.
    expect(screen.getByText("Full takt")).toBeTruthy();
    expect(screen.getByText("Förläng ledigheten")).toBeTruthy();
  });

  it("surfaces the SGI caveat when the pace drops below 5/week", () => {
    const { container } = render(<Planner />);
    fillToResults(container);
    fireEvent.change(container.querySelector("#days-per-week")!, {
      target: { value: "3" },
    });
    next();
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    expect(screen.getByText(/Tänk på SGI/)).toBeTruthy();
  });

  it("lets you choose a custom split with the slider", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    next();
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "50000" },
    });
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "50000" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /Egen fördelning/ }));
    const slider = container.querySelector("#custom-split");
    expect(slider).not.toBeNull();
    fireEvent.change(slider!, { target: { value: "20" } }); // give B more
    next(); // → step 3
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    expect(screen.getByText("Fördelning av dagarna")).toBeTruthy();
  });

  it("has a live split slider on the results page that updates the numbers", () => {
    const { container } = render(<Planner />);
    fillToResults(container, { incomeA: "50000", incomeB: "50000" });
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    const slider = container.querySelector("#results-split");
    expect(slider).not.toBeNull();
    // Equal (capped) rates → maxPayout splits the 390 income-based days 50/50.
    expect(screen.getAllByText(/195 dagar/).length).toBeGreaterThanOrEqual(2);
    // Drag to give caregiver A 75% of the days → numbers update live.
    fireEvent.change(slider!, { target: { value: "75" } });
    expect(screen.getAllByText(/293 dagar/).length).toBeGreaterThan(0);
  });

  it("stretches one caregiver's leave with the per-person lever", () => {
    const { container } = render(<Planner />);
    fillToResults(container, { incomeA: "45000", incomeB: "30000" });
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    // Both caregivers start on full pace.
    expect(screen.queryByText("Förläng ledigheten")).toBeNull();
    // Maximise caregiver A's months-of-leave lever to stretch their leave.
    fireEvent.click(
      screen.getByRole("button", { name: /Maxa ledighet – Vårdnadshavare A/ }),
    );
    expect(screen.getByText("Förläng ledigheten")).toBeTruthy();
  });

  it("supports a second leave period (switch pace at 1 year)", () => {
    const { container } = render(<Planner />);
    fillToResults(container, { incomeA: "45000", incomeB: "30000" });
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    expect(screen.queryByText(/Efter 1 år:/)).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Byt takt vid 1 år – Vårdnadshavare A/,
      }),
    );
    // The monthly card now shows the post-1-year rate for caregiver A.
    expect(screen.getByText(/Efter 1 år:/)).toBeTruthy();
  });

  it("shows combined household income while one caregiver is on leave", () => {
    const { container } = render(<Planner />);
    fillToResults(container, { incomeA: "45000", incomeB: "30000" });
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    // The card leads with the household income for each leave phase.
    expect(screen.getAllByText(/Medan .* är ledig/).length).toBeGreaterThan(0);
  });

  it("saves the lägstanivå days by default", () => {
    const { container } = render(<Planner />);
    fillToResults(container); // → step 3
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    expect(screen.getByText(/ingår inte i planen/)).toBeTruthy();
  });

  it("includes the lägstanivå days when the schedule toggle is on", () => {
    const { container } = render(<Planner />);
    fillToResults(container); // → step 3
    fireEvent.click(container.querySelector("#include-lagsta")!);
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    // Household default (45k/30k): the lower earner B takes the 300 income-based
    // days plus all 90 flat days = 390 once lägstanivå is included.
    expect(screen.getAllByText(/390 dagar/).length).toBeGreaterThan(0);
  });

  it("folds leftover days from previous children into the lead", () => {
    const { container } = render(<Planner />);
    fillToResults(container); // → step 3
    fireEvent.click(container.querySelector("#has-extra")!);
    fireEvent.change(container.querySelector("#a-extra")!, {
      target: { value: "40" },
    });
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    expect(screen.getByText(/sparade från tidigare barn/)).toBeTruthy();
  });
});
