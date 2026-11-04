import { describe, expect, it } from "vitest";
import { calculateHijriDate, calculateHijriParts } from "./hijriDate";
// Deliberately imports the backend's fixture rather than keeping a second copy here.
// If the two implementations of the algorithm ever diverge, one of these suites fails.
import {
  HIJRI_ADJUSTMENT_VECTORS,
  HIJRI_INVALID_INPUTS,
  HIJRI_VECTORS
} from "../../../backend/src/__tests__/fixtures/hijriVectors";

describe("frontend calculateHijriParts", () => {
  it.each(HIJRI_VECTORS)(
    "converts $gregorian to $formatted",
    ({ gregorian, day, month, year, formatted }) => {
      const parts = calculateHijriParts(gregorian);
      expect(parts).not.toBeNull();
      expect(parts).toMatchObject({ day, month, year, formatted });
    }
  );

  it.each(HIJRI_INVALID_INPUTS)("returns null for invalid input %j", (input) => {
    expect(calculateHijriParts(input)).toBeNull();
  });

  it.each(HIJRI_ADJUSTMENT_VECTORS)(
    "applies an adjustment of $adjustment to $gregorian",
    ({ gregorian, adjustment, formatted }) => {
      expect(calculateHijriParts(gregorian, adjustment)?.formatted).toBe(formatted);
    }
  );
});

// These are the golden-master assertions. Every expected value was captured from the
// implementation as it stood BEFORE calculateHijriParts was extracted, so this suite is
// what proves the refactor changed nothing observable for the Miqaat screen - the only
// existing caller of calculateHijriDate.
describe("frontend calculateHijriDate is unchanged by the refactor", () => {
  it.each(HIJRI_VECTORS)("formats $gregorian as $formatted", ({ gregorian, formatted }) => {
    expect(calculateHijriDate(gregorian)).toBe(formatted);
  });

  it.each(HIJRI_INVALID_INPUTS)('returns "" for invalid input %j', (input) => {
    expect(calculateHijriDate(input)).toBe("");
  });

  it.each(HIJRI_ADJUSTMENT_VECTORS)(
    "still honours the $adjustment day adjustment",
    ({ gregorian, adjustment, formatted }) => {
      expect(calculateHijriDate(gregorian, adjustment)).toBe(formatted);
    }
  );

  it("returns a string, never null, so existing callers need no change", () => {
    expect(typeof calculateHijriDate("2026-10-29")).toBe("string");
    expect(typeof calculateHijriDate("nonsense")).toBe("string");
  });
});
