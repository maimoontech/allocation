import { describe, expect, it } from "vitest";
import { cmToFeetInches, computeBmi, feetInchesToCm } from "./shared";

/**
 * The live BMI preview on Tab 6, guarded to match the generated column (FR-064).
 *
 * This exists because of the outage of 2026-11-07. A member typed their height in METRES —
 * 1.75 rather than 175 — and nothing anywhere said no: the preview happily showed a BMI of
 * 228,571, the server stored the height, and `bmi` being a VIRTUAL column meant the derived
 * value was never evaluated at write time. It surfaced months later, when an unrelated
 * ALTER rebuilt the table, materialised every virtual column and stopped the server booting.
 *
 * The preview is the first of three places that now refuse it, and the cheapest to test.
 */
describe("computeBmi", () => {
  it("computes a BMI for plausible measurements", () => {
    expect(computeBmi(174, 72.5)).toBeCloseTo(23.95, 2);
    expect(computeBmi(175, 70)).toBeCloseTo(22.86, 2);
  });

  /** The exact value behind the outage. */
  it("returns null for a height typed in metres", () => {
    expect(computeBmi(1.75, 70)).toBeNull();
  });

  it("returns null outside what is plausible for a person", () => {
    expect(computeBmi(49, 70)).toBeNull();
    expect(computeBmi(301, 70)).toBeNull();
    expect(computeBmi(175, 1)).toBeNull();
    expect(computeBmi(175, 501)).toBeNull();
  });

  it("accepts the extremes that are plausible", () => {
    expect(computeBmi(50, 2)).not.toBeNull();
    expect(computeBmi(300, 500)).not.toBeNull();
  });

  /**
   * The widest value the guard permits. DECIMAL(6,2) holds up to 9999.99, so this is the
   * number proving the column is wide enough rather than merely wider than before.
   */
  it("never exceeds what the column can hold", () => {
    expect(computeBmi(50, 500)).toBe(2000);
  });

  it("returns null when either measurement is absent", () => {
    expect(computeBmi(null, 70)).toBeNull();
    expect(computeBmi(175, null)).toBeNull();
    expect(computeBmi(null, null)).toBeNull();
  });
});

/**
 * Feet and inches to centimetres and back (FR-063b).
 *
 * The round trip is what matters. Height is asked in feet and inches but stored in
 * centimetres, so every member who opens Tab 6 converts one way and every save converts the
 * other. A lossy pair would walk a stored height a little further each time nobody touched
 * it.
 */
describe("height conversion", () => {
  it("converts feet and inches to centimetres", () => {
    expect(feetInchesToCm(5, 9)).toBeCloseTo(175.26, 2);
    expect(feetInchesToCm(6, 0)).toBeCloseTo(182.88, 2);
    expect(feetInchesToCm(5, 0)).toBeCloseTo(152.4, 2);
  });

  it("treats a missing part as zero, but two missing parts as no height", () => {
    expect(feetInchesToCm(6, null)).toBeCloseTo(182.88, 2);
    expect(feetInchesToCm(null, 10)).toBeCloseTo(25.4, 2);
    expect(feetInchesToCm(null, null)).toBeNull();
    expect(feetInchesToCm(0, 0)).toBeNull();
  });

  it("converts centimetres back to feet and inches", () => {
    expect(cmToFeetInches(175.26)).toEqual({ feet: 5, inches: 9 });
    expect(cmToFeetInches(152.4)).toEqual({ feet: 5, inches: 0 });
  });

  /** Without the carry this renders as "5 ft 12 in", which is not a height anyone writes. */
  it("carries 12 inches into the next foot", () => {
    expect(cmToFeetInches(182.8)).toEqual({ feet: 6, inches: 0 });
  });

  it("keeps a half inch rather than rounding a stored height away", () => {
    expect(cmToFeetInches(174)).toEqual({ feet: 5, inches: 8.5 });
  });

  it("round-trips within a rounding error, not a whole inch", () => {
    for (const cm of [152.4, 165, 174, 175.26, 182.88, 190.5]) {
      const { feet, inches } = cmToFeetInches(cm);
      const back = feetInchesToCm(feet, inches) ?? 0;
      expect(Math.abs(back - cm), `${cm} cm`).toBeLessThan(0.1);
    }
  });

  it("gives nothing back for an absent or impossible height", () => {
    expect(cmToFeetInches(null)).toEqual({ feet: null, inches: null });
    expect(cmToFeetInches(0)).toEqual({ feet: null, inches: null });
  });
});
