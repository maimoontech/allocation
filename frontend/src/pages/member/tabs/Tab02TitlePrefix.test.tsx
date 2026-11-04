import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Tab02TitlePrefix } from "./Tab02TitlePrefix";
import { Tab08PlacesVisited } from "./Tab08PlacesVisited";
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
    fireEvent.change(screen.getByLabelText(/^Title Year/), { target: { value: "1995" } });
    expect(state.value.titles).toEqual([{ title_id: 12, title_year: 1995 }]);

    fireEvent.click(screen.getByRole("button", { name: /Remove title 1/i }));
    expect(state.value.titles).toEqual([]);
  });

  it("removes the row the member asked for, not the last one", () => {
    const state = renderTab(Tab02TitlePrefix, {
      first_prefix: "Sheikh",
      titles: [
        { title_id: 11, title_year: 1990 },
        { title_id: 12, title_year: 2000 },
        { title_id: 11, title_year: 2010 }
      ]
    });

    fireEvent.click(screen.getByRole("button", { name: /Remove title 2/i }));

    expect(state.value.titles).toEqual([
      { title_id: 11, title_year: 1990 },
      { title_id: 11, title_year: 2010 }
    ]);
  });

  it("marks draft lookup values as needing review (FR-094)", () => {
    renderTab(Tab02TitlePrefix, {
      first_prefix: "Sheikh",
      titles: [{ title_id: 11, title_year: 1990 }]
    });

    expect(screen.getByRole("option", { name: /Sheikh ul Jamea.*DRAFT/ })).toBeInTheDocument();
  });
});

describe("Tab 8 — places visited (FR-071, FR-073)", () => {
  it("warns as soon as the count and the years disagree, and offers the correction", () => {
    const state = renderTab(Tab08PlacesVisited, {
      places_visited: [{ place_id: 41, times_count: 3, years: [2019] }]
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

    fireEvent.change(screen.getByLabelText("Add a year"), { target: { value: "2020" } });
    fireEvent.change(screen.getByLabelText("Add a year"), { target: { value: "2015" } });
    expect(state.value.places_visited[0].years).toEqual([2020, 2015]);

    // Displayed in order even though they were not entered that way.
    const chips = screen.getAllByRole("button", { name: /^Remove year/ });
    expect(chips.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Remove year 2015",
      "Remove year 2020"
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Remove year 2015" }));
    expect(state.value.places_visited[0].years).toEqual([2020]);
  });

  it("does not offer a year already listed against the same place", () => {
    renderTab(Tab08PlacesVisited, {
      places_visited: [{ place_id: 41, times_count: 1, years: [2020] }]
    });

    const adder = screen.getByLabelText("Add a year");
    expect(within(adder).queryByRole("option", { name: "2020" })).not.toBeInTheDocument();
    expect(within(adder).getByRole("option", { name: "2019" })).toBeInTheDocument();
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

describe("Tab 9 — Ashara Mubaraka (FR-075, FR-076)", () => {
  it("offers no year beyond the current Hijri year from the server", () => {
    renderTab(Tab09Ashara, {
      ashara_attendances: [{ attended_with: "With Aamil", hijri_year: 0, moze_id: null, mohallah_id: null }]
    });

    const years = screen.getByLabelText(/^Hijri Year/);
    expect(within(years).getByRole("option", { name: "1448" })).toBeInTheDocument();
    expect(within(years).queryByRole("option", { name: "1449" })).not.toBeInTheDocument();
    expect(within(years).getByRole("option", { name: "1400" })).toBeInTheDocument();
    expect(within(years).queryByRole("option", { name: "1399" })).not.toBeInTheDocument();
  });

  it("keeps each record's Attended With separate", () => {
    // One radio group per record. Sharing a name would make the browser treat all the records
    // as one set, so choosing on the second row would clear the first.
    const state = renderTab(Tab09Ashara, {
      ashara_attendances: [
        { attended_with: "With Aamil", hijri_year: 1440, moze_id: null, mohallah_id: null },
        { attended_with: "", hijri_year: 1441, moze_id: null, mohallah_id: null }
      ]
    });

    const groups = screen.getAllByRole("group", { name: /Attended With/ });
    fireEvent.click(within(groups[1]).getByLabelText("With Aqa Moula TUS"));

    expect(state.value.ashara_attendances[0].attended_with).toBe("With Aamil");
    expect(state.value.ashara_attendances[1].attended_with).toBe("With Aqa Moula TUS");
  });

  it("does not offer a Hijri year another record already holds", () => {
    renderTab(Tab09Ashara, {
      ashara_attendances: [
        { attended_with: "With Aamil", hijri_year: 1440, moze_id: null, mohallah_id: null },
        { attended_with: "With Aamil", hijri_year: 0, moze_id: null, mohallah_id: null }
      ]
    });

    const selects = screen.getAllByLabelText(/^Hijri Year/);
    expect(within(selects[1]).queryByRole("option", { name: "1440" })).not.toBeInTheDocument();
    expect(within(selects[1]).getByRole("option", { name: "1441" })).toBeInTheDocument();
  });
});
