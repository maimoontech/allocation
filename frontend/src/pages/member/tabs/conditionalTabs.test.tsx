import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Tab04Occupation } from "./Tab04Occupation";
import { Tab05EducationHifz } from "./Tab05EducationHifz";
import { Tab06Health } from "./Tab06Health";
import { Tab11Tamreen } from "./Tab11Tamreen";
import { Tab12Khidmat } from "./Tab12Khidmat";
import type { TabProps } from "./shared";
import type { MemberLookups, MemberProfile } from "../../../features/member/memberApi";

/**
 * The conditional rules on the six single-entry tabs.
 *
 * What makes these worth testing is not that a field hides — it is that the value goes with
 * it. A designation left behind when the member switches to Business, or a Tamreen reason
 * left behind when they switch to Yes, would be invisible on screen and still be sent on the
 * next save. Each test therefore asserts both halves: the field disappears AND the stored
 * value is now null.
 *
 * The harness is a small controlled wrapper, because a tab cannot clear its own state — it
 * calls `onChange` and the page owns the draft. "__fields__" is the page's convention for
 * applying several changes in one update, which is what keeps hide-and-clear atomic.
 */

const BASE: MemberProfile = {
  its_no: "99900101",
  has_photo: false,
  updated_at: null,
  first_prefix: null,
  name: null,
  father_prefix: null,
  father_name: null,
  surname: null,
  dob_gregorian: null,
  dob_hijri_day: null,
  dob_hijri_month: null,
  dob_hijri_year: null,
  dob_hijri_text: null,
  nationality: null,
  marital_status_id: null,
  residence_address: null,
  mohallah_id: null,
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
  registered_with_idaratuz_zakereen: null,
  five_kalam_uploaded_when: null,
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
};

const LOOKUPS: MemberLookups = {
  titles: [],
  sharafs: [],
  halqas: [],
  mozes: [],
  aqa_moula_asharas: [],
  places: [],
  sanads: [{ id: 3, name: "Marhala Ula", is_draft: false }],
  marital_statuses: [],
  skills: [{ id: 7, name: "Teaching", is_draft: true }],
  tamreen_frequencies: [{ id: 2, name: "Weekly", is_draft: true }],
  tamreen_methods: [{ id: 5, name: "Self study", is_draft: true }],
  zones: [],
  parties: [],
  mohallahs: [],
  venues: [],
  current_hijri_year: 1448
};

/** Mirrors how MemberProfilePage applies a tab's changes, including "__fields__". */
function renderTab(Tab: (props: TabProps) => React.ReactElement, initial: Partial<MemberProfile>) {
  const seen = { value: { ...BASE, ...initial } };

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

function answer(groupLabel: RegExp, choice: "Yes" | "No") {
  const group = screen.getByRole("group", { name: groupLabel });
  fireEvent.click(within(group).getByLabelText(choice));
}

describe("Tab 4 — Occupation", () => {
  // FR-052.
  it("shows Designation only for a Job, and clears it on switching to Business", () => {
    const state = renderTab(Tab04Occupation, { occupation_type: "Job", designation: "Manager" });

    const designation = screen.getByLabelText(/^Designation/) as HTMLInputElement;
    expect(designation.value).toBe("Manager");

    fireEvent.click(screen.getByLabelText("Business"));

    expect(screen.queryByLabelText(/^Designation/)).not.toBeInTheDocument();
    expect(state.value.designation).toBeNull();
    expect(state.value.occupation_type).toBe("Business");
  });

  // The label is the only thing telling the member which name is wanted.
  it("labels the name field to match the occupation type", () => {
    renderTab(Tab04Occupation, { occupation_type: "Business" });
    expect(screen.getByLabelText(/^Business Name/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Job"));
    expect(screen.getByLabelText(/^Company Name/)).toBeInTheDocument();
  });
});

describe("Tab 5 — Education / Hifz", () => {
  // FR-059.
  it("shows Sanad only on Yes, and clears it on switching to No", () => {
    const state = renderTab(Tab05EducationHifz, { has_hifz_sanad: true, sanad_id: 3 });

    expect(screen.getByLabelText(/^Sanad/)).toBeInTheDocument();

    answer(/Hifz Sanad/, "No");

    expect(screen.queryByLabelText(/^Sanad/)).not.toBeInTheDocument();
    expect(state.value.sanad_id).toBeNull();
    expect(state.value.has_hifz_sanad).toBe(false);
  });

  it("leaves Sanad hidden while the question is unanswered", () => {
    renderTab(Tab05EducationHifz, {});
    expect(screen.queryByLabelText(/^Sanad/)).not.toBeInTheDocument();
  });
});

describe("Tab 6 — Health & Fitness", () => {
  it("shows the donation date only for a donor, and clears it on No", () => {
    const state = renderTab(Tab06Health, {
      is_regular_donor: true,
      last_donation_date: "2026-01-15"
    });

    expect(screen.getByLabelText(/^Last Donation Date/)).toBeInTheDocument();

    answer(/Regular Donor/, "No");

    expect(screen.queryByLabelText(/^Last Donation Date/)).not.toBeInTheDocument();
    expect(state.value.last_donation_date).toBeNull();
  });

  // FR-064: read-only, and shown from the typed values before any save.
  it("derives BMI from height and weight, and keeps it read-only", () => {
    renderTab(Tab06Health, {});

    const bmi = screen.getByLabelText(/^BMI/) as HTMLInputElement;
    expect(bmi.value).toBe("");
    expect(bmi).toHaveAttribute("readonly");

    // Height is asked in feet and inches now (FR-063b). 5 ft 7 in = 170.18 cm.
    fireEvent.change(screen.getByLabelText("Height in feet"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Height in inches"), { target: { value: "7" } });
    expect((screen.getByLabelText(/^BMI/) as HTMLInputElement).value).toBe("");

    fireEvent.change(screen.getByLabelText(/^Weight \(kg\)/), { target: { value: "70" } });
    // 70 / 1.7018^2 = 24.17
    expect((screen.getByLabelText(/^BMI/) as HTMLInputElement).value).toBe("24.17");
  });

  /**
   * FR-063b — height is asked in feet and inches and stored in centimetres.
   *
   * The unit confusion is the whole reason: a single "Height (cm)" box let a member type
   * 1.75, their height in metres, which stored happily and overflowed the generated BMI
   * months later. 5 and 9 cannot be mistaken for anything else.
   */
  describe("height in feet and inches", () => {
    it("stores centimetres from the two boxes", () => {
      const state = renderTab(Tab06Health, {});

      fireEvent.change(screen.getByLabelText("Height in feet"), { target: { value: "5" } });
      fireEvent.change(screen.getByLabelText("Height in inches"), { target: { value: "9" } });

      // (5*12 + 9) * 2.54 = 175.26
      expect(state.value.height_cm).toBeCloseTo(175.26, 2);
    });

    it("shows an existing centimetre height back as feet and inches", () => {
      renderTab(Tab06Health, { height_cm: 175.26 });

      expect((screen.getByLabelText("Height in feet") as HTMLInputElement).value).toBe("5");
      expect((screen.getByLabelText("Height in inches") as HTMLInputElement).value).toBe("9");
    });

    /** 174 cm is 5 ft 8.5 in. Rounding it to 5 ft 9 would move a stored height by 1.26 cm. */
    it("keeps the half inch rather than rounding a stored height", () => {
      renderTab(Tab06Health, { height_cm: 174 });

      expect((screen.getByLabelText("Height in inches") as HTMLInputElement).value).toBe("8.5");
    });

    it("says what will be saved, in centimetres", () => {
      renderTab(Tab06Health, { height_cm: 175.26 });

      expect(screen.getByText(/Saved as 175.26 cm/)).toBeInTheDocument();
    });

    it("lets feet be entered before inches without losing either", () => {
      const state = renderTab(Tab06Health, {});

      fireEvent.change(screen.getByLabelText("Height in feet"), { target: { value: "6" } });
      // 6 ft alone is already a height.
      expect(state.value.height_cm).toBeCloseTo(182.88, 2);
      expect((screen.getByLabelText("Height in feet") as HTMLInputElement).value).toBe("6");

      fireEvent.change(screen.getByLabelText("Height in inches"), { target: { value: "2" } });
      expect(state.value.height_cm).toBeCloseTo(187.96, 2);
      // The feet box must still read 6 — deriving it from the new centimetres would be the
      // bug this local state exists to prevent.
      expect((screen.getByLabelText("Height in feet") as HTMLInputElement).value).toBe("6");
    });

    it("clears the height when both boxes are emptied", () => {
      const state = renderTab(Tab06Health, { height_cm: 175.26 });

      fireEvent.change(screen.getByLabelText("Height in feet"), { target: { value: "" } });
      fireEvent.change(screen.getByLabelText("Height in inches"), { target: { value: "" } });

      expect(state.value.height_cm).toBeNull();
    });
  });
});

describe("Tab 11 — Tamreen", () => {
  // FR-081.
  it("asks for a reason only on No, and clears it on Yes", () => {
    const state = renderTab(Tab11Tamreen, {
      attends_karachi_tamreen: false,
      tamreen_absence_reason: "Live out of town"
    });

    expect(screen.getByLabelText(/^Reason/)).toBeInTheDocument();

    answer(/Attend Karachi Zakireen Tamreen Session/, "Yes");

    expect(screen.queryByLabelText(/^Reason/)).not.toBeInTheDocument();
    expect(state.value.tamreen_absence_reason).toBeNull();
    expect(state.value.attends_karachi_tamreen).toBe(true);
  });

  // An unanswered question must not demand a justification.
  it("does not ask for a reason before the question is answered", () => {
    renderTab(Tab11Tamreen, {});
    expect(screen.queryByLabelText(/^Reason/)).not.toBeInTheDocument();
  });
});

describe("Tab 12 — Other Sansta Khidmat", () => {
  // FR-086.
  it("follows the Khidmat type and clears the name that no longer applies", () => {
    const state = renderTab(Tab12Khidmat, {
      khidmat_type: "Both",
      sansta_name: "A Sansta",
      umoor_name: "An Umoor"
    });

    expect(screen.getByLabelText(/^Sansta Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Umoor Name/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Khidmat Type/), { target: { value: "Umoor" } });

    expect(screen.queryByLabelText(/^Sansta Name/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Umoor Name/)).toBeInTheDocument();
    expect(state.value.sansta_name).toBeNull();
    expect(state.value.umoor_name).toBe("An Umoor");
  });

  it("shows neither name field until a type is chosen", () => {
    renderTab(Tab12Khidmat, {});
    expect(screen.queryByLabelText(/^Sansta Name/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Umoor Name/)).not.toBeInTheDocument();
  });
});
