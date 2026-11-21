import { describe, expect, it } from "vitest";
import {
  QUESTIONS,
  emptyPresence,
  profileCompletion,
  type CompletionRow
} from "../services/memberFormCompletion";

/**
 * The completion measure behind the administrator's member dashboard (FR-112).
 *
 * The profile has no mandatory fields, so "completed" had to be DEFINED rather than derived.
 * These tests are where that definition is pinned down, and the one that matters most is
 * "100% is reachable": a measure that counts questions a member is never asked can never be
 * satisfied, and a figure nobody can reach is a figure nobody will trust. Each shape of
 * member - Job or Business, Sanad or none, Party or Solo - is checked separately, because
 * each is asked a different set of questions.
 *
 * No database: `profileCompletion` is pure, and that is why it was written as a separate
 * module from the query that feeds it.
 */

function blank(): CompletionRow {
  return {
    present: emptyPresence(),
    first_prefix: null,
    hizb_participation: null,
    occupation_type: null,
    has_hifz_sanad: null,
    is_regular_donor: null,
    attends_karachi_tamreen: null,
    khidmat_type: null
  };
}

/** Answers every question THIS member is actually asked, and nothing else. */
function answerEverythingAsked(row: CompletionRow): CompletionRow {
  for (const question of QUESTIONS) {
    if (question.asked && !question.asked(row)) continue;
    if (question.key === "sansta") row.present.sansta_id = 1;
    else if (question.key === "umoor") row.present.umoor_id = 1;
    else row.present[question.key] = 1;
  }
  return row;
}

describe("profileCompletion", () => {
  it("scores an untouched account at 0% without dividing by zero", () => {
    const result = profileCompletion(blank());

    expect(result.percent).toBe(0);
    expect(result.answered).toBe(0);
    // Tab 1 alone asks eleven unconditional questions, so there is always a denominator.
    expect(result.asked).toBeGreaterThan(10);
  });

  it("counts only the tabs the measure covers", () => {
    // 7, 8 and 9 are lists. An empty list cannot be told apart from an unanswered one.
    expect(profileCompletion(blank()).tabs.map((t) => t.tab)).toEqual([
      1, 2, 3, 4, 5, 6, 10, 11, 12
    ]);
  });

  describe("a question is in the denominator only when the form asks it", () => {
    const baseline = profileCompletion(blank()).asked;

    function askedWith(change: Partial<CompletionRow>) {
      return profileCompletion({ ...blank(), ...change }).asked;
    }

    it("asks a Job for a Designation and a Business for none", () => {
      expect(askedWith({ occupation_type: "Job" })).toBe(
        askedWith({ occupation_type: "Business" }) + 1
      );
    });

    /**
     * FR-050a. A Student is asked for Skills and nothing else on Tab 4, and Skills is a list
     * and so is not counted. Their Tab 4 is therefore ONE question: the type itself.
     *
     * Getting this wrong would be invisible and permanent — an employer and a work address
     * held against someone the form never asks for either, putting 100% out of their reach
     * for good.
     */
    it("asks a Student for nothing on Tab 4 beyond the type itself", () => {
      const student = profileCompletion({ ...blank(), occupation_type: "Student" });
      const tab4 = student.tabs.find((t) => t.tab === 4)!;

      expect(tab4.asked).toBe(1);
    });

    it("asks everyone else the employment questions", () => {
      for (const type of ["Job", "Business", null]) {
        const row = profileCompletion({ ...blank(), occupation_type: type });
        const tab4 = row.tabs.find((t) => t.tab === 4)!;

        // Five at least: the type, the organisation, the year, the work phone and address.
        expect(tab4.asked).toBeGreaterThanOrEqual(5);
      }
    });

    /** Unanswered is not exempt: the fields are on screen and enabled until Student is picked. */
    it("does not exempt a member who has simply not answered yet", () => {
      expect(askedWith({ occupation_type: null })).toBeGreaterThan(
        askedWith({ occupation_type: "Student" })
      );
    });

    it("asks a regular donor for a donation date", () => {
      expect(askedWith({ is_regular_donor: 1 })).toBe(askedWith({ is_regular_donor: 0 }) + 1);
    });

    /** FR-081. Unanswered must not demand a reason; only an explicit No does. */
    it("asks for a Tamreen reason on No, and not on Yes or unanswered", () => {
      expect(askedWith({ attends_karachi_tamreen: 0 })).toBe(baseline + 1);
      expect(askedWith({ attends_karachi_tamreen: 1 })).toBe(baseline);
      expect(baseline).toBe(askedWith({}));
    });

    it("asks for a Prefix Year only when there is a prefix", () => {
      expect(askedWith({ first_prefix: "Sheikh" })).toBe(baseline + 1);
      expect(askedWith({ first_prefix: "Mulla" })).toBe(baseline + 1);
      expect(askedWith({ first_prefix: "None" })).toBe(baseline);
    });

    it("asks a Party member which Party, and a Solo member not at all", () => {
      expect(askedWith({ hizb_participation: "Party" })).toBe(
        askedWith({ hizb_participation: "Solo" }) + 1
      );
    });

    it("asks Party-or-Solo only once a Zone is chosen", () => {
      const zoned = blank();
      zoned.present.zone_id = 1;
      expect(profileCompletion(zoned).asked).toBe(baseline + 1);
    });

    it("asks for a Sanad only when the member says they hold one", () => {
      expect(askedWith({ has_hifz_sanad: 1 })).toBe(askedWith({ has_hifz_sanad: 0 }) + 1);
    });

    it("asks for the Sansta, the Umoor, or both, according to the Khidmat type", () => {
      expect(askedWith({ khidmat_type: "Sansta" })).toBe(baseline + 1);
      expect(askedWith({ khidmat_type: "Umoor" })).toBe(baseline + 1);
      expect(askedWith({ khidmat_type: "Both" })).toBe(baseline + 2);
    });
  });

  /**
   * The test this whole file exists for. A percentage nobody can reach is not a measure of
   * anything, so every shape of member must be able to finish.
   */
  describe("100% is reachable", () => {
    it("for a member who answers the plain path", () => {
      expect(profileCompletion(answerEverythingAsked(blank())).percent).toBe(100);
    });

    it("for a Sheikh in a Party, in a Job, with a Sanad, donating, absent from Tamreen, serving both", () => {
      const row = blank();
      row.first_prefix = "Sheikh";
      row.present.zone_id = 1;
      row.hizb_participation = "Party";
      row.occupation_type = "Job";
      row.has_hifz_sanad = 1;
      row.is_regular_donor = 1;
      row.attends_karachi_tamreen = 0;
      row.khidmat_type = "Both";

      const result = profileCompletion(answerEverythingAsked(row));
      expect(result.percent).toBe(100);
      // Every conditional applies, so this member is asked the most the form can ask.
      expect(result.asked).toBeGreaterThan(profileCompletion(blank()).asked);
    });

    /** FR-050a. If a Student cannot reach 100%, the exemption above is not working. */
    it("for a Student, who is asked for Skills and nothing else on Tab 4", () => {
      const row = blank();
      row.present.zone_id = 1;
      row.hizb_participation = "Solo";
      row.occupation_type = "Student";
      row.has_hifz_sanad = 0;
      row.is_regular_donor = 0;
      row.attends_karachi_tamreen = 1;
      row.khidmat_type = "Sansta";

      const result = profileCompletion(answerEverythingAsked(row));
      expect(result.percent).toBe(100);
    });

    it("for a Solo member in business, no Sanad, no donations, attending, Umoor only", () => {
      const row = blank();
      row.first_prefix = "None";
      row.present.zone_id = 1;
      row.hizb_participation = "Solo";
      row.occupation_type = "Business";
      row.has_hifz_sanad = 0;
      row.is_regular_donor = 0;
      row.attends_karachi_tamreen = 1;
      row.khidmat_type = "Umoor";

      expect(profileCompletion(answerEverythingAsked(row)).percent).toBe(100);
    });
  });

  /**
   * FR-086a. The free text a member gave before the Sansta and Umoor lists existed is still
   * their answer. Counting them as unanswered would report work as outstanding that is done.
   */
  it("accepts an older typed Sansta or Umoor name as an answer", () => {
    const typed = blank();
    typed.khidmat_type = "Both";
    typed.present.sansta_name = 1;
    typed.present.umoor_name = 1;

    const result = profileCompletion(typed);
    expect(result.answered).toBe(2);
  });

  it("counts the five phone boxes on Tab 1 as one question", () => {
    const one = blank();
    one.present.contact_no = 1;

    const tab1 = profileCompletion(one).tabs[0];
    expect(tab1).toEqual({ tab: 1, label: "Personal", asked: 11, answered: 1 });
  });

  it("reports per-tab totals that add up to the whole", () => {
    const row = answerEverythingAsked(blank());
    const result = profileCompletion(row);

    expect(result.tabs.reduce((n, t) => n + t.asked, 0)).toBe(result.asked);
    expect(result.tabs.reduce((n, t) => n + t.answered, 0)).toBe(result.answered);
  });

  it("rounds the percentage to a whole number", () => {
    const row = blank();
    row.present.name = 1;
    row.present.father_name = 1;
    row.present.surname = 1;

    const result = profileCompletion(row);
    expect(result.answered).toBe(3);
    expect(result.percent).toBe(Math.round((3 / result.asked) * 100));
  });
});
