// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useLocalStorage } from "@/lib/use-local-storage";

afterEach(() => localStorage.clear());

describe("useLocalStorage", () => {
  it("returns the initial value when nothing is stored", () => {
    const { result } = renderHook(() => useLocalStorage("k", { n: 1 }));
    expect(result.current[0]).toEqual({ n: 1 });
  });

  it("persists updates and restores them on remount", () => {
    const first = renderHook(() => useLocalStorage("k", { n: 1 }));
    act(() => first.result.current[1]({ n: 5 }));
    expect(first.result.current[0]).toEqual({ n: 5 });
    first.unmount();

    const second = renderHook(() => useLocalStorage("k", { n: 1 }));
    expect(second.result.current[0]).toEqual({ n: 5 });
  });

  it("supports functional updates", () => {
    const { result } = renderHook(() => useLocalStorage("count", 0));
    act(() => result.current[1]((c) => c + 1));
    act(() => result.current[1]((c) => c + 1));
    expect(result.current[0]).toBe(2);
  });
});
