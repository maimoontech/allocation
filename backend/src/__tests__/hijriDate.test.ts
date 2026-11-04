import { describe, expect, it } from "vitest";
import {
  calculateHijriDate,
  calculateHijriParts,
  currentHijriYear
} from "../utils/hijriDate";
import {
  HIJRI_ADJUSTMENT_VECTORS,
  HIJRI_INVALID_INPUTS,
  HIJRI_VECTORS
} from "./fixtures/hijriVectors";

describe("backend calculateHijriParts", () => {
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

  it("names the month consistently with its index", () => {
    const parts = calculateHijriParts("2026-10-29");
    expect(parts?.month).toBe(5);
    expect(parts?.monthName).toBe("Jammad-il-Ula");
  });

  it("includes the month name and year in the formatted string", () => {
    const parts = calculateHijriParts("1980-07-13");
    expect(parts?.formatted).toContain(parts!.monthName);
    expect(parts?.formatted).toContain(String(parts!.year));
    expect(parts?.formatted.endsWith(" AH")).toBe(true);
  });
});

describe("backend calculateHijriDate", () => {
  it.each(HIJRI_VECTORS)("formats $gregorian as $formatted", ({ gregorian, formatted }) => {
    expect(calculateHijriDate(gregorian)).toBe(formatted);
  });

  // The original implementation returned "" rather than throwing or returning null, and
  // the Miqaat screen relies on that. Changing it would be a silent breaking change.
  it.each(HIJRI_INVALID_INPUTS)('returns "" for invalid input %j', (input) => {
    expect(calculateHijriDate(input)).toBe("");
  });
});

describe("currentHijriYear", () => {
  it("derives the Hijri year from a supplied date", () => {
    expect(currentHijriYear(new Date(Date.UTC(2026, 9, 29)))).toBe(1448);
    expect(currentHijriYear(new Date(Date.UTC(2026, 0, 1)))).toBe(1447);
    expect(currentHijriYear(new Date(Date.UTC(1980, 6, 13)))).toBe(1400);
  });

  it("agrees with calculateHijriParts for the same date", () => {
    const date = new Date(Date.UTC(2024, 1, 29));
    expect(currentHijriYear(date)).toBe(calculateHijriParts("2024-02-29")?.year);
  });

  // The Ashara Mubaraka range in the spec runs 1400 AH to the current Hijri year, so a
  // bound that fell outside this window would make the dropdown wrong rather than merely
  // stale.
  it("returns a plausible year for the real clock", () => {
    const year = currentHijriYear();
    expect(year).toBeGreaterThanOrEqual(1400);
    expect(year).toBeLessThan(1600);
  });
});
