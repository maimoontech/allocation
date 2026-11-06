import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Tab02TitlePrefix } from "./Tab02TitlePrefix";
import { Tab07Sharaf } from "./Tab07Sharaf";
import { Tab08PlacesVisited } from "./Tab08PlacesVisited";
import { Tab12Khidmat } from "./Tab12Khidmat";
import { Tab09Ashara } from "./Tab09Ashara";
import type { TabProps } from "./shared";
import type { MemberLookups, MemberProfile } from "../../../features/member/memberApi";

/**
 * The repeatable tabs: the Tab 2 prefix rule, and the row editor's add / edit / remove.
 *
 * FR-043 is the rule under test on Tab 2, and it is a cross-tab one: the Prefix shown here is
 * whatever was chosen on Tab 1, displayed only when it is not None. It is not editable here,
 * so the test checks that it renders as text and that no prefix control exists — an
 * implementation that offered a second dropdown would let the two tabs disagree.
 *
 * The row tests use the same controlled harness as `conditionalTabs.test.tsx`: the row editor
 * holds no state of its own, so the only way to see an add or a remove is through the array it
 * sends out.
 */

const BASE = {
  its_no: "99900101",
  has_photo: false,
  updated_at: null,
  first_prefix: "None",
  name: null,
  father_prefix: "None",
  father_name: null,
  surname: null,
  dob_gregorian: null,
  dob_hijri_day: null,
  dob_hijri_month: null,
  dob_hijri_year: null,
  dob_hijri_text: null,
  marital_status_id: null,
  residence_address: null,
  phone_no: null,
  mobile_no_1: null,
  mobile_no_2: null,
  whatsapp_no_1: null,
  whatsapp_no_2: null,
  email: null,
  prefix_year: null,
  zone_id: null,
  party_id: null,
  hizb_role: null,
  zikr_e_hussain_since_year: null,
  occupation_type: null,
  organisation_name: null,
  designation: null,
  occupation_since_year: null,
  work_address: null,
  work_phone_no: null,
  education_level: null,
  major_subjects: null,
  education_status: null,
  has_hifz_sanad: null,
  sanad_id: null,
  hifz_current_surah: null,
  hifz_current_ayyah: null,
  hifz_last_update: null,
  blood_group: null,
  is_regular_donor: null,
  last_donation_date: null,
  height_cm: null,
  weight_kg: null,
  bmi: null,
  asbaq_level: null,
  halqa_id: null,
  asbaq_ustad: null,
  attends_karachi_tamreen: null,
  tamreen_absence_reason: null,
  party_tamreen_frequency_id: null,
  solo_tamreen_frequency_id: null,
  tamreen_method_id: null,
  takes_ustad_assistance: null,
  uses_idaratuz_zakereen_books: null,
  khidmat_type: null,
  sansta_name: null,
  umoor_name: null,
  khidmat_designation: null,
  khidmat_since_year: null,
  titles: [],
  sharafs: [],
  skill_ids: [],
  places_visited: [],
  ashara_attendances: []
} satisfies MemberProfile;

const LOOKUPS: MemberLookups = {
  titles: [
    { id: 11, name: "Sheikh ul Jamea", is_draft: true },
    { id: 12, name: "Rasul Hadiyah", is_draft: true }
  ],
  sharafs: [{ id: 21, name: "Khidmat Sharaf", is_draft: true }],
  halqas: [],
  mozes: [{ id: 31, name: "Karachi", is_draft: true }],
  aqa_moula_asharas: [{ id: 61, name: "Colombo", is_draft: true, hijri_year: 1446 }],
  places: [
    { id: 41, name: "Nairobi", is_draft: true },
    { id: 42, name: "Colombo", is_draft: true }
  ],
  sanads: [],
  marital_statuses: [],
  skills: [],
  tamreen_frequencies: [],
  tamreen_methods: [],
  zones: [],
  parties: [],
  mohallahs: [{ id: 51, name: "A Mohallah", zone_id: 1, is_draft: false }],
  venues: [
    { id: 71, name: "Active Venue", mohallah_id: 51, is_active: true },
    { id: 72, name: "Closed Venue", mohallah_id: 51, is_active: false }
  ],
  current_hijri_year: 1448
};

function renderTab(Tab: (props: TabProps) => React.ReactElement, initial: Partial<MemberProfile>) {
  const seen = { value: { ...BASE, ...initial } as MemberProfile };

  function Harness() {
    const [value, setValue] = useState<MemberProfile>(seen.value);

    function onChange(field: string, next: unknown) {
      setValue((current) => {
        const updated =
          field === "__fields__"
            ? { ...current, ...(next as Partial<MemberProfile>) }
            : { ...current, [field]: next };
        seen.value = updated;
        return updated;
      });
    }

    return <Tab value={value} lookups={LOOKUPS} errorFor={() => undefined} onChange={onChange} />;
  }

  render(<Harness />);
  return seen;
}

describe("Tab 2 — the prefix rule (FR-043)", () => {
  it("hides the Prefix and its year when Tab 1's First Prefix is None", () => {
    renderTab(Tab02TitlePrefix, { first_prefix: "None" });

    expect(screen.queryByText("Sheikh")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Prefix Year/)).not.toBeInTheDocument();
    // And it says why, rather than simply showing nothing.
    expect(screen.getByText(/have not chosen a First Prefix/i)).toBeInTheDocument();
  });

  it.each(["Sheikh", "Mulla"])("shows the Prefix and its year when it is %s", (prefix) => {
    renderTab(Tab02TitlePrefix, { first_prefix: prefix });

    expect(screen.getByText(prefix)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Prefix Year/)).toBeInTheDocument();
  });

  it("does not let the Prefix be edited here — Tab 1 owns it", () => {
    renderTab(Tab02TitlePrefix, { first_prefix: "Sheikh" });

    // Exactly one control on the tab's prefix section, and it is the year.
    expect(screen.getByLabelText(/^Prefix Year/)).toBeInTheDocument();
    expect(screen.getByText(/Chosen on the Personal tab/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /^Prefix$/ })).not.toBeInTheDocument();
  });

  it("treats a null First Prefix the same as None", () => {
    renderTab(Tab02TitlePrefix, { first_prefix: null });
    expect(screen.queryByLabelText(/^Prefix Year/)).not.toBeInTheDocument();
  });
});

describe("the repeatable row editor (FR-046)", () => {
  it("adds a row, edits it, and removes it", () => {
    const state = renderTab(Tab02TitlePrefix, { first_prefix: "Sheikh" });

    expect(screen.getByText(/No titles added yet/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Add title/i }));
    expect(state.value.titles).toEqual([{ title_id: 0, title_year: 0 }]);

    fireEvent.change(screen.getByLabelText(/^Title$/), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/^Title Year/), { target: { value: "1425" } });
    expect(state.value.titles).toEqual([{ title_id: 12, title_year: 1425 }]);

    fireEvent.click(screen.getByRole("button", { name: /Remove title 1/i }));
    expect(state.value.titles).toEqual([]);
  });

  it("removes the row the member asked for, not the last one", () => {
    const state = renderTab(Tab02TitlePrefix, {
      first_prefix: "Sheikh",
      titles: [
        { title_id: 11, title_year: 1420 },
        { title_id: 12, title_year: 1430 },
        { title_id: 11, title_year: 1440 }
      ]
    });

    fireEvent.click(screen.getByRole("button", { name: /Remove title 2/i }));

    expect(state.value.titles).toEqual([
      { title_id: 11, title_year: 1420 },
      { title_id: 11, title_year: 1440 }
    ]);
  });

  it("marks draft lookup values as needing review (FR-094)", () => {
    renderTab(Tab02TitlePrefix, {
      first_prefix: "Sheikh",
      titles: [{ title_id: 11, title_year: 1420 }]
    });

    expect(screen.getByRole("option", { name: /Sheikh ul Jamea.*DRAFT/ })).toBeInTheDocument();
  });
});

describe("Tab 8 — places visited (FR-071, FR-073)", () => {
  it("warns as soon as the count and the years disagree, and offers the correction", () => {
    const state = renderTab(Tab08PlacesVisited, {
      places_visited: [{ place_id: 41, times_count: 3, years: [1439] }]
    });

    expect(screen.getByText(/Number of Times is 3 but 1 year is listed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Set to 1/ }));

    expect(state.value.places_visited[0].times_count).toBe(1);
    expect(screen.queryByText(/must match/i)).not.toBeInTheDocument();
  });

  it("adds and removes a year, keeping them sorted", () => {
    const state = renderTab(Tab08PlacesVisited, {
      places_visited: [{ place_id: 41, times_count: 0, years: [] }]
    });

    fireEvent.change(screen.getByLabelText("Add a year"), { target: { value: "1440" } });
    fireEvent.change(screen.getByLabelText("Add a year"), { target: { value: "1435" } });
    expect(state.value.places_visited[0].years).toEqual([1440, 1435]);

    // Displayed in order even though they were not entered that way.
    const chips = screen.getAllByRole("button", { name: /^Remove year/ });
    expect(chips.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Remove year 1435",
      "Remove year 1440"
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Remove year 1435" }));
    expect(state.value.places_visited[0].years).toEqual([1440]);
  });

  it("does not offer a year already listed against the same place", () => {
    renderTab(Tab08PlacesVisited, {
      places_visited: [{ place_id: 41, times_count: 1, years: [1440] }]
    });

    const adder = screen.getByLabelText("Add a year");
    expect(within(adder).queryByRole("option", { name: "1440" })).not.toBeInTheDocument();
    expect(within(adder).getByRole("option", { name: "1439" })).toBeInTheDocument();
  });

  it("does not offer a place already used by another row (FR-071)", () => {
    renderTab(Tab08PlacesVisited, {
      places_visited: [
        { place_id: 41, times_count: 0, years: [] },
        { place_id: 0, times_count: 0, years: [] }
      ]
    });

    const selects = screen.getAllByLabelText(/^Place$/);
    // The second row cannot pick Nairobi, which the first row holds.
    expect(within(selects[1]).queryByRole("option", { name: /Nairobi/ })).not.toBeInTheDocument();
    expect(within(selects[1]).getByRole("option", { name: /Colombo/ })).toBeInTheDocument();
    // The first row still shows its own selection.
    expect(within(selects[0]).getByRole("option", { name: /Nairobi/ })).toBeInTheDocument();
  });
});

/**
 * Tab 9 is one row per Hijri year, current year down to 1405 AH (FR-076b). "Not attended" is
 * the absence of a record, so the saved array keeps its old shape: one entry per attended year.
 */
describe("Tab 9 — Ashara Mubaraka year grid (FR-075, FR-076, FR-076b)", () => {
  const yearRow = (year: number) => screen.getByRole("group", { name: `Ashara ${year} AH` });

  it("lists every year from the server's current Hijri year down to 1404, newest first", () => {
    renderTab(Tab09Ashara, {});

    const rows = screen.getAllByRole("group", { name: /^Ashara \d+ AH$/ });
    expect(rows).toHaveLength(1448 - 1404 + 1);
    expect(rows[0]).toHaveAccessibleName("Ashara 1448 AH");
    expect(rows[rows.length - 1]).toHaveAccessibleName("Ashara 1404 AH");
    expect(screen.queryByRole("group", { name: "Ashara 1449 AH" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Ashara 1403 AH" })).not.toBeInTheDocument();
  });

  it("still shows a record saved for a year before 1405, so it can be seen and changed", () => {
    renderTab(Tab09Ashara, {
      ashara_attendances: [
        { attended_with: "With Aamil", hijri_year: 1402, moze_id: null, mohallah_id: null, venue_id: null, aqa_moula_ashara_id: null }
      ]
    });

    expect(within(yearRow(1402)).getByLabelText("With Aamil")).toBeChecked();
  });

  it("adds one record when a year is marked attended, and removes it on Not attended", () => {
    const state = renderTab(Tab09Ashara, {});

    fireEvent.click(within(yearRow(1440)).getByLabelText("With Aamil"));
    expect(state.value.ashara_attendances).toHaveLength(1);
    expect(state.value.ashara_attendances[0]).toMatchObject({
      attended_with: "With Aamil",
      hijri_year: 1440
    });

    fireEvent.click(within(yearRow(1440)).getByLabelText("Not attended"));
    expect(state.value.ashara_attendances).toEqual([]);
  });

  it("keeps each year's answer separate", () => {
    // One radio group per year. Sharing a name would make the browser treat every year as one
    // set, so answering 1441 would clear 1440.
    const state = renderTab(Tab09Ashara, {});

    fireEvent.click(within(yearRow(1440)).getByLabelText("With Aamil"));
    fireEvent.click(within(yearRow(1441)).getByLabelText("With Aqa Moula TUS"));

    const byYear = Object.fromEntries(
      state.value.ashara_attendances.map((r) => [r.hijri_year, r.attended_with])
    );
    expect(byYear).toEqual({ 1440: "With Aamil", 1441: "With Aqa Moula TUS" });
    expect(within(yearRow(1440)).getByLabelText("With Aamil")).toBeChecked();
  });
});

/**
 * The five year dropdowns are HIJRI, 1401 AH to the current Hijri year.
 *
 * They used to offer Gregorian 1950-2026, which is the kind of mistake nothing catches: a
 * Hijri year sits inside that range as comfortably as a Gregorian one, so the wrong calendar
 * saved without complaint and only looked wrong years later, to somebody reading a report.
 *
 * Each case asserts the ceiling, the floor and the ABSENCE of a Gregorian year. The last of
 * those is the one that fails loudly if a tab is missed in a future edit — a range check
 * alone would still pass if someone restored 1950-2026 and the member picked 2020.
 */
describe("the Hijri year dropdowns", () => {
  const CURRENT = 1448; // LOOKUPS.current_hijri_year — the server's value, not the browser's.

  function optionsOf(select: HTMLElement) {
    return within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
  }

  const cases: Array<[string, () => HTMLElement]> = [
    [
      "Prefix Year",
      () => {
        renderTab(Tab02TitlePrefix, { first_prefix: "Sheikh" });
        return screen.getByLabelText(/^Prefix Year/);
      }
    ],
    [
      "Title Year",
      () => {
        renderTab(Tab02TitlePrefix, {
          first_prefix: "Sheikh",
          titles: [{ title_id: 11, title_year: 1420 }]
        });
        return screen.getByLabelText(/^Title Year/);
      }
    ],
    [
      "Sharaf Year",
      () => {
        renderTab(Tab07Sharaf, { sharafs: [{ sharaf_id: 21, sharaf_year: 1420 }] });
        return screen.getByLabelText(/^Year \(AH\)/);
      }
    ],
    [
      "Place Visited Year",
      () => {
        renderTab(Tab08PlacesVisited, {
          places_visited: [{ place_id: 41, times_count: 0, years: [] }]
        });
        return screen.getByLabelText("Add a year");
      }
    ],
    [
      "Other Sansta Since Year",
      () => {
        renderTab(Tab12Khidmat, { khidmat_type: "Sansta" });
        return screen.getByLabelText(/^Since/);
      }
    ]
  ];

  it.each(cases)("%s runs from the current Hijri year down to 1401", (_label, open) => {
    const labels = optionsOf(open());

    // [0] is the placeholder; the years descend, newest first.
    expect(labels[1]).toBe(String(CURRENT));
    expect(labels[labels.length - 1]).toBe("1401");
    expect(labels).toHaveLength(CURRENT - 1401 + 2);
  });

  it.each(cases)("%s offers no Gregorian year", (_label, open) => {
    const labels = optionsOf(open());

    for (const gregorian of ["1950", "2000", "2020", "2026"]) {
      expect(labels).not.toContain(gregorian);
    }
  });

  /**
   * The ceiling must come from the lookups response. A browser with a wrong clock would
   * otherwise offer years the server refuses, and the member would have no way to tell why.
   */
  it("takes its ceiling from the server, not the browser clock", () => {
    renderTab(Tab02TitlePrefix, { first_prefix: "Sheikh" });
    const labels = optionsOf(screen.getByLabelText(/^Prefix Year/));

    expect(labels).toContain(String(CURRENT));
    expect(labels).not.toContain(String(CURRENT + 1));
  });
});

/**
 * FR-077a / FR-077b — where the member attended follows who they attended with.
 *
 * "With Aqa Moula TUS" needs nothing more: Aqa Moula holds Ashara in one place a year, so the
 * place is the one an administrator gave that year, shown rather than chosen. "With Aamil"
 * asks for the member's own Moze and optional Venue.
 *
 * The clearing tests are the ones that matter. A value left behind by a changed answer would
 * be saved against a record whose form never showed it, and nobody looking at the form could
 * tell it was there.
 */
describe("Tab 9 — where the member attended (FR-077a, FR-077b)", () => {
  const yearRow = (year: number) => screen.getByRole("group", { name: `Ashara ${year} AH` });
  const AAMIL = (over = {}) => ({
    attended_with: "With Aamil",
    hijri_year: 1446,
    moze_id: null,
    mohallah_id: null,
    venue_id: null,
    aqa_moula_ashara_id: null,
    ...over
  });

  it("shows Moze and Venue for With Aamil, and no Aqa Moula place", () => {
    renderTab(Tab09Ashara, { ashara_attendances: [AAMIL()] });

    expect(screen.getByLabelText("Moze for 1446 AH")).toBeInTheDocument();
    expect(screen.getByLabelText("Venue for 1446 AH (optional)")).toBeInTheDocument();
    // Mohallah was replaced by Venue, not hidden alongside it (FR-077c).
    expect(screen.queryByLabelText(/^Mohallah for/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("aqa-moula-place-1446")).not.toBeInTheDocument();
  });

  it("fills in that year's Aqa Moula place, marked draft until reviewed, with no Moze", () => {
    const state = renderTab(Tab09Ashara, {});

    fireEvent.click(within(yearRow(1446)).getByLabelText("With Aqa Moula TUS"));

    expect(screen.getByTestId("aqa-moula-place-1446")).toHaveTextContent(/Colombo.*DRAFT/);
    expect(screen.queryByLabelText("Moze for 1446 AH")).not.toBeInTheDocument();
    expect(state.value.ashara_attendances[0].aqa_moula_ashara_id).toBe(61);
  });

  it("says so when a year has no Aqa Moula place yet, and saves it without one", () => {
    const state = renderTab(Tab09Ashara, {});

    fireEvent.click(within(yearRow(1440)).getByLabelText("With Aqa Moula TUS"));

    expect(within(yearRow(1440)).getByText(/place for 1440 AH has not been added/)).toBeInTheDocument();
    expect(state.value.ashara_attendances[0].aqa_moula_ashara_id).toBeNull();
  });

  it("clears Moze and Venue when the answer changes to With Aqa Moula TUS", () => {
    const state = renderTab(Tab09Ashara, {
      ashara_attendances: [AAMIL({ moze_id: 31, venue_id: 71 })]
    });

    fireEvent.click(within(yearRow(1446)).getByLabelText("With Aqa Moula TUS"));

    const row = state.value.ashara_attendances[0];
    expect(row.attended_with).toBe("With Aqa Moula TUS");
    expect(row.moze_id).toBeNull();
    expect(row.venue_id).toBeNull();
  });

  it("clears the Aqa Moula place when the answer changes to With Aamil", () => {
    const state = renderTab(Tab09Ashara, {
      ashara_attendances: [
        AAMIL({ attended_with: "With Aqa Moula TUS", aqa_moula_ashara_id: 61 })
      ]
    });

    fireEvent.click(within(yearRow(1446)).getByLabelText("With Aamil"));

    const row = state.value.ashara_attendances[0];
    expect(row.attended_with).toBe("With Aamil");
    expect(row.aqa_moula_ashara_id).toBeNull();
  });

  it("records the chosen Moze and Venue for that year", () => {
    const state = renderTab(Tab09Ashara, { ashara_attendances: [AAMIL()] });

    fireEvent.change(screen.getByLabelText("Moze for 1446 AH"), { target: { value: "31" } });
    fireEvent.change(screen.getByLabelText("Venue for 1446 AH (optional)"), {
      target: { value: "71" }
    });

    expect(state.value.ashara_attendances[0]).toMatchObject({ moze_id: 31, venue_id: 71 });
  });

  /**
   * FR-077c. Inactive venues are offered and marked.
   *
   * An Ashara recorded for a year long past may well have been held somewhere that has since
   * closed. Filtering those out would leave the member unable to answer truthfully, and
   * leaving them unmarked would make a retired venue read as an ordinary choice.
   */
  it("offers inactive venues too, marked and sorted after the active ones", () => {
    renderTab(Tab09Ashara, { ashara_attendances: [AAMIL()] });

    const select = screen.getByLabelText("Venue for 1446 AH (optional)") as HTMLSelectElement;
    const options = Array.from(select.options);

    const byValue = (v: string) => options.find((o) => o.value === v)?.textContent ?? "";
    expect(byValue("72")).toMatch(/INACTIVE/);
    expect(byValue("71")).toBe("Active Venue");

    // [0] is the placeholder; active before inactive.
    expect(options.slice(1).map((o) => o.value)).toEqual(["71", "72"]);
  });
});

/**
 * FR-076c — the Ashara grid starts at the Tab 3 Zikr e Hussain year.
 *
 * A member cannot have attended Ashara Mubaraka before they began doing Zikr e Hussain, so
 * listing those years asks a question with only one possible answer. 1404 AH is the floor
 * under that: an earlier Zikr year, or none, falls back to it rather than producing a grid
 * of forty-odd rows nobody will fill.
 *
 * This is a cross-tab rule, like Tab 2 taking its prefix from Tab 1, and it reads the merged
 * draft — so changing the year on Tab 3 and returning here shows the new range before
 * anything is saved.
 */
describe("Tab 9 — the grid starts at the Zikr e Hussain year (FR-076c)", () => {
  const rows = () =>
    screen
      .getAllByRole("group", { name: /^Ashara \d+ AH$/ })
      .map((r) => Number(/Ashara (\d+) AH/.exec(r.getAttribute("aria-label") ?? "")?.[1]));

  it("starts at the Zikr year when it is later than 1404", () => {
    renderTab(Tab09Ashara, { zikr_e_hussain_since_year: 1430 });

    const years = rows();
    expect(years[0]).toBe(1448);
    expect(years[years.length - 1]).toBe(1430);
    expect(years).toHaveLength(1448 - 1430 + 1);
    expect(years).not.toContain(1429);
  });

  it("falls back to 1404 when the Zikr year is earlier than that", () => {
    renderTab(Tab09Ashara, { zikr_e_hussain_since_year: 1390 });

    const years = rows();
    expect(years[years.length - 1]).toBe(1404);
    expect(years).not.toContain(1403);
  });

  it("falls back to 1404 when no Zikr year has been given", () => {
    renderTab(Tab09Ashara, { zikr_e_hussain_since_year: null });

    expect(rows()[rows().length - 1]).toBe(1404);
  });

  it("shows exactly one year when the member began this Hijri year", () => {
    renderTab(Tab09Ashara, { zikr_e_hussain_since_year: 1448 });

    expect(rows()).toEqual([1448]);
  });

  it("names the starting year in the instruction", () => {
    renderTab(Tab09Ashara, { zikr_e_hussain_since_year: 1435 });

    expect(screen.getByText(/back to\s*1435\s*AH/)).toBeInTheDocument();
  });

  /**
   * The member shortened their own Zikr year after answering an earlier Ashara. The record
   * must stay visible and correctable — hiding it would leave a saved value they can see
   * nowhere and change never.
   */
  it("still shows a record from before the grid starts, marked as earlier", () => {
    renderTab(Tab09Ashara, {
      zikr_e_hussain_since_year: 1440,
      ashara_attendances: [
        {
          attended_with: "With Aamil",
          hijri_year: 1432,
          moze_id: null,
          mohallah_id: null,
          venue_id: null,
          aqa_moula_ashara_id: null
        }
      ]
    });

    const years = rows();
    expect(years).toContain(1432);
    expect(years[years.length - 1]).toBe(1432);

    const row = screen.getByRole("group", { name: "Ashara 1432 AH" });
    expect(within(row).getByText("(earlier)")).toBeInTheDocument();
  });
});
