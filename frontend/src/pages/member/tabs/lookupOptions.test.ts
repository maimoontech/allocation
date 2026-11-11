import { describe, expect, it } from "vitest";
import { byName, lookupOptions } from "./shared";

/**
 * Every dropdown of names is A-Z (FR-093a).
 *
 * `lookupOptions` is the shared helper behind ten of them — Titles, Sharaf, Halqas, Mozes,
 * Maqamaat, Hifz Sanads, Marital Statuses, the two Tamreen lists and Zones — so sorting here
 * is what makes the rule hold across the form rather than tab by tab.
 *
 * Two things it must sort by and one it must not: the raw NAME, case-insensitively, and
 * never the rendered label. A "(DRAFT — NEEDS REVIEW)" suffix is part of the label, and
 * sorting on that would file every unreviewed value under whatever letter the suffix starts
 * with instead of its own.
 */
describe("lookupOptions", () => {
  const list = [
    { id: 3, name: "Zanzibar", is_draft: false },
    { id: 1, name: "ahmedabad", is_draft: false },
    { id: 2, name: "Burhanpur", is_draft: false }
  ];

  const labels = (opts: { label: string }[]) => opts.slice(1).map((o) => o.label);

  it("sorts names A-Z regardless of the order supplied", () => {
    expect(labels(lookupOptions(list))).toEqual(["ahmedabad", "Burhanpur", "Zanzibar"]);
  });

  it("ignores case, so a lowercase name is not exiled to the end", () => {
    const opts = lookupOptions([
      { id: 1, name: "banana", is_draft: false },
      { id: 2, name: "Apple", is_draft: false }
    ]);
    expect(labels(opts)).toEqual(["Apple", "banana"]);
  });

  /** The ordering must not depend on whether a value has been reviewed. */
  it("sorts a draft value by its name, not by its suffix", () => {
    const opts = lookupOptions([
      { id: 1, name: "Zanzibar", is_draft: false },
      { id: 2, name: "Ahmedabad", is_draft: true }
    ]);

    expect(labels(opts)[0]).toMatch(/^Ahmedabad/);
    expect(labels(opts)[0]).toMatch(/DRAFT/);
    expect(labels(opts)[1]).toBe("Zanzibar");
  });

  it("keeps the placeholder first", () => {
    expect(lookupOptions(list, "Pick one...")[0]).toEqual({ value: "", label: "Pick one..." });
  });

  it("says so when there is nothing to pick", () => {
    expect(lookupOptions([])[0].label).toBe("No options available");
  });

  /** Sorting a copy, so a caller's own array is not reordered under it. */
  it("does not reorder the list it was given", () => {
    const original = [...list];
    lookupOptions(list);
    expect(list).toEqual(original);
  });
});

describe("byName", () => {
  it("orders two names A-Z, case-insensitively", () => {
    expect(byName({ name: "alpha" }, { name: "Beta" })).toBeLessThan(0);
    expect(byName({ name: "Beta" }, { name: "alpha" })).toBeGreaterThan(0);
    expect(byName({ name: "Same" }, { name: "same" })).toBe(0);
  });
});

/**
 * FR-093b — Titles, Hifz Sanads and Halqas follow the administrator's own order.
 *
 * These three carry a sequence the alphabet does not know: titles and sanads rank, and
 * halqas run in the organisation's order. The server sends them by `display_order`, and
 * "display" means "leave that alone".
 *
 * The fixture is supplied in an order that alphabetising would CHANGE, so these fail if the
 * default ever creeps back.
 */
describe("lookupOptions ordered by display_order", () => {
  const ranked = [
    { id: 1, name: "Zulu Rank One", is_draft: false },
    { id: 2, name: "Alpha Rank Two", is_draft: false },
    { id: 3, name: "Mike Rank Three", is_draft: false }
  ];

  const labels = (opts: { label: string }[]) => opts.slice(1).map((o) => o.label);

  it("keeps the order the server sent", () => {
    expect(labels(lookupOptions(ranked, "Select...", "display"))).toEqual([
      "Zulu Rank One",
      "Alpha Rank Two",
      "Mike Rank Three"
    ]);
  });

  it("alphabetises the very same list when asked for name order", () => {
    expect(labels(lookupOptions(ranked, "Select...", "name"))).toEqual([
      "Alpha Rank Two",
      "Mike Rank Three",
      "Zulu Rank One"
    ]);
  });

  it("still defaults to A-Z when no order is given", () => {
    expect(labels(lookupOptions(ranked))[0]).toBe("Alpha Rank Two");
  });

  it("still keeps the placeholder first", () => {
    expect(lookupOptions(ranked, "Pick...", "display")[0]).toEqual({
      value: "",
      label: "Pick..."
    });
  });
});
