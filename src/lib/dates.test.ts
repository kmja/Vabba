import { describe, it, expect } from "vitest";
import {
  isValidIsoDate,
  parseIsoDate,
  toIsoDate,
  addDays,
  addMonths,
  addYears,
  monthsBetween,
  birthdayAtAge,
  differenceInDays,
} from "@/lib/dates";

describe("isValidIsoDate", () => {
  it("accepts real dates in strict format", () => {
    expect(isValidIsoDate("2024-06-15")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true); // leap year
  });

  it("rejects malformed or impossible dates", () => {
    expect(isValidIsoDate("2025-02-29")).toBe(false); // not a leap year
    expect(isValidIsoDate("2025-13-01")).toBe(false);
    expect(isValidIsoDate("2025-00-10")).toBe(false);
    expect(isValidIsoDate("2025-1-1")).toBe(false); // not zero-padded
    expect(isValidIsoDate("not-a-date")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});

describe("parse / format round-trip", () => {
  it("parses and re-serializes losslessly", () => {
    expect(toIsoDate(parseIsoDate("2028-06-15"))).toBe("2028-06-15");
  });

  it("throws on invalid input", () => {
    expect(() => parseIsoDate("2025-02-31")).toThrow();
  });
});

describe("arithmetic", () => {
  it("addDays", () => {
    expect(toIsoDate(addDays(parseIsoDate("2024-06-15"), 10))).toBe(
      "2024-06-25",
    );
  });

  it("addMonths handles year rollover", () => {
    expect(toIsoDate(addMonths(parseIsoDate("2024-06-15"), 15))).toBe(
      "2025-09-15",
    );
  });

  it("addYears finds the same calendar day N years later", () => {
    expect(toIsoDate(addYears(parseIsoDate("2024-06-15"), 4))).toBe(
      "2028-06-15",
    );
  });

  it("birthdayAtAge is the Nth birthday", () => {
    expect(toIsoDate(birthdayAtAge(parseIsoDate("2024-06-15"), 12))).toBe(
      "2036-06-15",
    );
  });
});

describe("monthsBetween", () => {
  it("counts whole months", () => {
    expect(
      monthsBetween(parseIsoDate("2024-01-01"), parseIsoDate("2024-03-01")),
    ).toBe(2);
  });

  it("floors partial months", () => {
    expect(
      monthsBetween(parseIsoDate("2024-01-15"), parseIsoDate("2024-03-10")),
    ).toBe(1);
  });

  it("is negative when the second date is earlier", () => {
    expect(
      monthsBetween(parseIsoDate("2024-03-01"), parseIsoDate("2024-01-01")),
    ).toBe(-2);
  });
});

describe("differenceInDays", () => {
  it("counts whole days", () => {
    expect(
      differenceInDays(parseIsoDate("2028-03-15"), parseIsoDate("2028-06-15")),
    ).toBe(92);
  });

  it("is negative when the target is in the past", () => {
    expect(
      differenceInDays(parseIsoDate("2028-06-15"), parseIsoDate("2028-03-15")),
    ).toBe(-92);
  });
});
