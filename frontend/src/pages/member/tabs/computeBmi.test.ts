import { describe, expect, it } from "vitest";
import { computeBmi } from "./shared";

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
