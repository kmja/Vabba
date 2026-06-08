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

    expect(screen.getByText("Så mycket per månad – och hur länge")).toBeTruthy();
    expect(screen.getByText("Förslag på fördelning")).toBeTruthy();
    expect(screen.getByText("Tidslinje")).toBeTruthy();
    // Max-payout default: higher earner (A) takes the bulk; B keeps reserved.
    expect(screen.getByText("300 dagar")).toBeTruthy();
    expect(screen.getByText("180 dagar")).toBeTruthy();
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

  it("auto-computes the pace for the 'förläng ledigheten' goal", () => {
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
    fireEvent.click(
      screen.getByRole("radio", { name: /Förläng ledigheten/ }),
    );
    fireEvent.change(container.querySelector("#min-monthly")!, {
      target: { value: "15000" },
    });
    next(); // → step 3: no manual pace selector for this goal
    expect(container.querySelector("#days-per-week")).toBeNull();
    next(); // → step 4
    fireEvent.click(screen.getByRole("button", { name: /Visa plan/ }));
    expect(screen.getByText("Så mycket per månad – och hur länge")).toBeTruthy();
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
});
