// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Planner } from "@/components/planner";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/**
 * Integration smoke test for the interactive (client) path. The pure logic is
 * covered exhaustively in lib/*.test.ts; here we only confirm the React layer
 * wires inputs → optimizer → rendered output without runtime errors.
 */
describe("<Planner />", () => {
  function fillBaseInputs(container: HTMLElement) {
    const birth = container.querySelector<HTMLInputElement>("#birth-date")!;
    fireEvent.change(birth, { target: { value: "2025-01-15" } });
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "45000" },
    });
    fireEvent.change(container.querySelector("#b-income")!, {
      target: { value: "30000" },
    });
  }

  it("turns inputs into a suggested split, payout and timeline", () => {
    const { container } = render(<Planner />);
    fillBaseInputs(container);

    // Results sections appear.
    expect(screen.getByText("Dagar kvar att fördela")).toBeTruthy();
    expect(screen.getByText("Förslag på fördelning")).toBeTruthy();
    expect(screen.getByText("Total uppskattad ersättning")).toBeTruthy();
    expect(screen.getByText("Tidslinje")).toBeTruthy();

    // Max-payout default: higher earner (A) takes the bulk; B keeps reserved.
    expect(screen.getByText("300 dagar")).toBeTruthy();
    expect(screen.getByText("180 dagar")).toBeTruthy();
  });

  it("rebalances to an even split when the objective changes", () => {
    const { container } = render(<Planner />);
    fillBaseInputs(container);

    fireEvent.click(screen.getByRole("tab", { name: /Jämn fördelning/ }));

    // Both parents now land on 240 days each.
    expect(screen.getAllByText("240 dagar")).toHaveLength(2);
  });

  it("shows the empty state before a birth date is entered", () => {
    const { container } = render(<Planner />);
    const birth = container.querySelector<HTMLInputElement>("#birth-date")!;
    fireEvent.change(birth, { target: { value: "" } });
    expect(screen.getByText(/Fyll i barnets födelsedatum/)).toBeTruthy();
  });

  it("hides the used-day fields until toggled on", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    expect(container.querySelector("#a-used")).toBeNull();
    fireEvent.click(container.querySelector("#has-used")!);
    expect(container.querySelector("#a-used")).not.toBeNull();
  });

  it("lets a parent choose 'over the cap' instead of typing a salary", () => {
    const { container } = render(<Planner />);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "30000" },
    });
    // Switch parent A to the over-the-cap shortcut (first such toggle is A's).
    fireEvent.click(screen.getAllByRole("tab", { name: "Över taket" })[0]);
    // The free-text salary field is replaced by the max-amount note.
    expect(container.querySelector("#a-income")).toBeNull();
    expect(screen.getByText(/Räknar med högsta beloppet/)).toBeTruthy();
  });

  it("solo mode hides parent B and gives the single parent every day", () => {
    const { container } = render(<Planner />);
    fireEvent.click(container.querySelector("#solo-mode")!);
    fireEvent.change(container.querySelector("#birth-date")!, {
      target: { value: "2025-01-15" },
    });
    fireEvent.change(container.querySelector("#a-income")!, {
      target: { value: "40000" },
    });
    expect(container.querySelector("#b-income")).toBeNull();
    expect(screen.getByText("Din plan")).toBeTruthy();
    expect(screen.getByText("480 dagar")).toBeTruthy();
  });
});
