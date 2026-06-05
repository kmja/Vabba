// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { VabCalculator } from "@/components/vab-calculator";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("<VabCalculator />", () => {
  it("shows the default annual allowance and reflects used days", () => {
    const { container } = render(<VabCalculator />);
    expect(screen.getByText("Vab-dagar kvar i år")).toBeTruthy();
    expect(screen.getByText(/av 120 kvar/)).toBeTruthy();

    fireEvent.change(container.querySelector("#vab-used")!, {
      target: { value: "20" },
    });
    expect(screen.getByText(/20 dagar använda/)).toBeTruthy();
  });

  it("doubles capacity for sole custody and scales with children", () => {
    const { container } = render(<VabCalculator />);
    fireEvent.change(container.querySelector("#vab-custody")!, {
      target: { value: "single" },
    });
    fireEvent.change(container.querySelector("#vab-children")!, {
      target: { value: "2" },
    });
    // 2 children × 240 (sole custody) = 480
    expect(screen.getByText(/av 480 kvar/)).toBeTruthy();
  });
});
