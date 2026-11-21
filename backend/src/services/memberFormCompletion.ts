/**
 * How much of the twelve-tab profile a member has answered.
 *
 * WHY THIS FILE EXISTS AT ALL
 *   The profile has no mandatory fields. That is deliberate - FR-095 and the Hizb tab's own
 *   note both promise that a partly filled profile still saves - so "has this member
 *   completed the form?" cannot be answered by re-running the save validation. It has to be
 *   defined, and this is where it is defined: once, in one place, as a pure function that can
 *   be read and argued with.
 *
 * THE DEFINITION
 *   Completion is questions ANSWERED divided by questions ASKED, where a question counts as
 *   asked only when the form actually puts it in front of that member. A business owner is
 *   never shown Designation, so Designation is not in their denominator; a member who is not
 *   a regular donor is never asked their last donation date. Conditional display and this
 *   count follow the same rules, which is the only way the number can mean what it says.
 *
 * WHAT IS DELIBERATELY NOT COUNTED
 *   - Tabs 7, 8 and 9 (Sharaf, Maqamaat Muqaddasah, Ashara Mubaraka), the Titles on Tab 2,
 *     the Skills on Tab 4 and the Tamreen methods on Tab 11. Every one of these is a LIST,
 *     and an empty list cannot be told apart from an unanswered one: a member with no Sharaf
 *     has nothing to enter and is not incomplete. Counting them would cap the figure
 *     permanently for members who have answered everything they were asked.
 *   - The five telephone and WhatsApp boxes on Tab 1, which collapse into ONE question. The
 *     form offers five; it plainly does not expect five. Any one of them answers "how do we
 *     reach this member".
 *   - `asbaq_ustad`. The field is commented out of Tab 10, so the member is never shown it.
 *     Counting a question nobody is asked is how a measure quietly becomes a lie.
 *   - `bmi`, which is derived rather than answered.
 *
 * NO PROFILE VALUE REACHES THIS FUNCTION
 *   The caller passes `present`: a map of field name to 1 or 0, built in SQL. Tab 6 is
 *   medical data under FR-065 and FR-066, so its values are never selected, never held in
 *   memory and never aggregated - only whether each box has something in it. The seven
 *   discriminants below are the exception, and they are read because the questions a member
 *   is ASKED depend on them. Only one of them, `is_regular_donor`, is a health value, and it
 *   decides exactly one thing: whether the donation-date question applies.
 */

/** A field name mapped to 1 when it holds a value and 0 when it does not. */
export type PresenceMap = Record<string, 0 | 1>;

export type CompletionRow = {
  present: PresenceMap;
  /** The handful of answers that decide which FURTHER questions the form asks. */
  first_prefix: string | null;
  hizb_participation: string | null;
  occupation_type: string | null;
  has_hifz_sanad: 0 | 1 | null;
  is_regular_donor: 0 | 1 | null;
  attends_karachi_tamreen: 0 | 1 | null;
  khidmat_type: string | null;
};

export type TabTotals = { tab: number; label: string; asked: number; answered: number };

export type CompletionResult = {
  asked: number;
  answered: number;
  /** 0-100, rounded. 100 only when every question this member was asked was answered. */
  percent: number;
  tabs: TabTotals[];
};

type Question = {
  /** The profile column, or a name of our own where several columns answer one question. */
  key: string;
  tab: number;
  /** Omitted means the form asks every member this. */
  asked?: (row: CompletionRow) => boolean;
  /** Omitted means `present[key] === 1`. */
  answered?: (row: CompletionRow) => boolean;
};

/** Matches ALL_TABS in the member form, so the two cannot drift apart in wording. */
export const TAB_LABELS: Record<number, string> = {
  1: "Personal",
  2: "Title & Prefix",
  3: "Hizb",
  4: "Occupation",
  5: "Education / Hifz",
  6: "Health & Fitness",
  10: "Asbaq",
  11: "Tamreen",
  12: "Other Sansta Khidmat"
};

const yes = (v: 0 | 1 | null) => v === 1;

/**
 * FR-050a. The employment questions on Tab 4, which a Student is not asked.
 *
 * Note that an UNANSWERED occupation type still counts as asked. The fields are on screen
 * and enabled until the member chooses Student, so they are being asked at that moment, and
 * treating "not yet answered" as "exempt" would flatter every untouched profile.
 */
const notStudent = (r: CompletionRow) => r.occupation_type !== "Student";

/**
 * Every question the form asks, in tab order.
 *
 * Adding a field to a tab means adding it here too. A question missing from this list makes
 * the dashboard read HIGH, and a dashboard that flatters the data is worse than none.
 */
export const QUESTIONS: Question[] = [
  // ---- Tab 1, Personal. Every one of these is shown to every member. ----
  { key: "name", tab: 1 },
  { key: "father_name", tab: 1 },
  { key: "surname", tab: 1 },
  { key: "dob_gregorian", tab: 1 },
  { key: "nationality", tab: 1 },
  { key: "marital_status_id", tab: 1 },
  { key: "residence_address", tab: 1 },
  { key: "mohallah_id", tab: 1 },
  // One question, five boxes. See the note at the top of this file.
  { key: "contact_no", tab: 1 },
  { key: "email", tab: 1 },
  { key: "photo", tab: 1 },

  // ---- Tab 2. The Titles themselves are a list and are not counted. ----
  // Asked only when Tab 1 says there IS a prefix; the tab says exactly that in its own words.
  {
    key: "prefix_year",
    tab: 2,
    asked: (r) => r.first_prefix === "Sheikh" || r.first_prefix === "Mulla"
  },

  // ---- Tab 3, Hizb ----
  { key: "zone_id", tab: 3 },
  // Party-or-Solo appears only once a Zone is chosen.
  { key: "hizb_participation", tab: 3, asked: (r) => r.present.zone_id === 1 },
  // Locked, and not applicable, for a Solo member.
  { key: "party_id", tab: 3, asked: (r) => r.hizb_participation === "Party" },
  // Shown to everyone; Solo fills it in automatically as Leader.
  { key: "hizb_role", tab: 3 },
  { key: "zikr_e_hussain_since_year", tab: 3 },
  { key: "registered_with_idaratuz_zakereen", tab: 3 },
  { key: "five_kalam_uploaded_when", tab: 3 },

  // ---- Tab 4, Occupation. Skills are a list and are not counted. ----
  //
  // FR-050a. A Student is asked for Skills and nothing else on this tab, and Skills is a
  // list. So a Student's Tab 4 is ONE question: the type itself. Leaving the employment
  // fields in their denominator would hold an employer and a work address against someone
  // the form never asks for either, and put 100% out of their reach for good.
  { key: "occupation_type", tab: 4 },
  { key: "organisation_name", tab: 4, asked: notStudent },
  { key: "designation", tab: 4, asked: (r) => r.occupation_type === "Job" },
  { key: "occupation_since_year", tab: 4, asked: notStudent },
  { key: "work_phone_no", tab: 4, asked: notStudent },
  { key: "work_address", tab: 4, asked: notStudent },

  // ---- Tab 5, Education / Hifz ----
  { key: "education_level", tab: 5 },
  { key: "major_subjects", tab: 5 },
  { key: "education_status", tab: 5 },
  { key: "has_hifz_sanad", tab: 5 },
  { key: "sanad_id", tab: 5, asked: (r) => yes(r.has_hifz_sanad) },
  { key: "hifz_current_surah", tab: 5 },
  { key: "hifz_current_ayyah", tab: 5 },
  { key: "hifz_last_update", tab: 5 },

  // ---- Tab 6, Health & Fitness. Presence only; no value is ever read. ----
  { key: "blood_group", tab: 6 },
  { key: "is_regular_donor", tab: 6 },
  { key: "last_donation_date", tab: 6, asked: (r) => yes(r.is_regular_donor) },
  { key: "height_cm", tab: 6 },
  { key: "weight_kg", tab: 6 },

  // ---- Tab 10, Asbaq. `asbaq_ustad` is commented out of the tab, so it is not asked. ----
  { key: "asbaq_level", tab: 10 },
  { key: "halqa_id", tab: 10 },

  // ---- Tab 11, Tamreen. The method list is a list and is not counted. ----
  { key: "attends_karachi_tamreen", tab: 11 },
  // FR-081: the reason exists only on No, and only No requires it. Unanswered must not.
  { key: "tamreen_absence_reason", tab: 11, asked: (r) => r.attends_karachi_tamreen === 0 },
  { key: "party_tamreen_frequency_id", tab: 11 },
  { key: "solo_tamreen_frequency_id", tab: 11 },
  { key: "takes_ustad_assistance", tab: 11 },
  { key: "uses_idaratuz_zakereen_books", tab: 11 },

  // ---- Tab 12, Other Sansta Khidmat ----
  { key: "khidmat_type", tab: 12 },
  // FR-086a. The free text a member gave before these lists existed is still their answer,
  // so it counts: the question WAS answered, even though the id is yet to be chosen.
  {
    key: "sansta",
    tab: 12,
    asked: (r) => r.khidmat_type === "Sansta" || r.khidmat_type === "Both",
    answered: (r) => r.present.sansta_id === 1 || r.present.sansta_name === 1
  },
  {
    key: "umoor",
    tab: 12,
    asked: (r) => r.khidmat_type === "Umoor" || r.khidmat_type === "Both",
    answered: (r) => r.present.umoor_id === 1 || r.present.umoor_name === 1
  },
  { key: "khidmat_designation", tab: 12 },
  { key: "khidmat_since_year", tab: 12 }
];

/** The tabs this measure covers, in form order. 7, 8 and 9 are absent by design. */
export const MEASURED_TABS: number[] = [...new Set(QUESTIONS.map((q) => q.tab))].sort(
  (a, b) => a - b
);

/** The presence columns the SQL must supply, so the query and this list cannot drift apart. */
export const PRESENCE_FIELDS: string[] = [
  ...new Set(
    QUESTIONS.flatMap((q) => {
      if (q.key === "sansta") return ["sansta_id", "sansta_name"];
      if (q.key === "umoor") return ["umoor_id", "umoor_name"];
      return [q.key];
    })
  )
];

/** Every field absent: what a member account with no profile row at all looks like. */
export function emptyPresence(): PresenceMap {
  const present: PresenceMap = {};
  for (const field of PRESENCE_FIELDS) present[field] = 0;
  return present;
}

/**
 * One member's completion.
 *
 * `asked` is never zero: Tab 1 alone contributes eleven unconditional questions, so a member
 * with no profile row still has a denominator and scores 0% - the truthful answer, rather
 * than a division by zero.
 */
export function profileCompletion(row: CompletionRow): CompletionResult {
  const byTab = new Map<number, TabTotals>();
  for (const tab of MEASURED_TABS) {
    byTab.set(tab, { tab, label: TAB_LABELS[tab] ?? `Tab ${tab}`, asked: 0, answered: 0 });
  }

  let asked = 0;
  let answered = 0;

  for (const question of QUESTIONS) {
    if (question.asked && !question.asked(row)) continue;

    const totals = byTab.get(question.tab)!;
    totals.asked += 1;
    asked += 1;

    const isAnswered = question.answered
      ? question.answered(row)
      : row.present[question.key] === 1;

    if (isAnswered) {
      totals.answered += 1;
      answered += 1;
    }
  }

  return {
    asked,
    answered,
    percent: asked === 0 ? 0 : Math.round((answered / asked) * 100),
    tabs: MEASURED_TABS.map((tab) => byTab.get(tab)!)
  };
}
