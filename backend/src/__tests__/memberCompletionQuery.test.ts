import { describe, expect, it } from "vitest";
import {
  COMPLETION_SELECT,
  DISCRIMINANT_COLUMNS,
  completionFor,
  completionRowFrom,
  toTriState
} from "../services/memberCompletionQuery";
import { PRESENCE_FIELDS, profileCompletion } from "../services/memberFormCompletion";

/**
 * The SQL half of the completion measure (FR-112, FR-112b).
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM memberFormCompletion.test.ts
 *   That file pins the DEFINITION — which questions are asked of whom. This one pins the
 *   bridge between that definition and the database, and the bridge has its own ways of
 *   failing silently. A presence column missing from the select list does not raise an error:
 *   the field simply reads as unanswered for every member, and the figure comes out low
 *   forever with nothing to notice.
 *
 * No database: this module is pure, which is why it can be verified even when the suite's
 * live-database guard refuses to run anything else.
 */

describe("COMPLETION_SELECT", () => {
  /** A missing column reads as "nobody answered this", quietly and permanently. */
  it("aliases every presence field the measure asks for", () => {
    for (const field of PRESENCE_FIELDS) {
      expect(COMPLETION_SELECT, field).toContain(`AS p_${field}`);
    }
  });

  it("selects every discriminant the conditional rules depend on", () => {
    for (const column of DISCRIMINANT_COLUMNS) {
      expect(COMPLETION_SELECT, column).toContain(`mp.${column}`);
    }
  });

  /**
   * The alias contract. The fragment is dropped into queries written elsewhere, so it can
   * only ever refer to `mp` (member_profiles) and `ph` (member_photos). A reference to
   * anything else would be an error at the caller, not here.
   */
  it("refers to no table alias other than mp and ph", () => {
    const aliases = new Set(
      [...COMPLETION_SELECT.matchAll(/\b([a-z_]+)\.[a-z_]+/g)].map((m) => m[1])
    );

    expect([...aliases].sort()).toEqual(["mp", "ph"]);
  });

  /**
   * Both callers embed this in a template literal. A backtick in here — in a comment, or
   * quoting an identifier the MySQL way — would end the string and break the build in a
   * place that has nothing to do with this file.
   */
  it("contains no backtick", () => {
    expect(COMPLETION_SELECT).not.toContain("`");
  });

  it("neither begins nor ends with a comma, so the caller places its own", () => {
    expect(COMPLETION_SELECT.trim().startsWith(",")).toBe(false);
    expect(COMPLETION_SELECT.trim().endsWith(",")).toBe(false);
  });

  /** Tab 6 is medical data (FR-065, FR-066): presence only, never the value. */
  it("reads the health columns as presence and never as values", () => {
    for (const column of ["blood_group", "height_cm", "weight_kg", "last_donation_date"]) {
      expect(COMPLETION_SELECT).toContain(`AS p_${column}`);
      // The bare column, unaliased, would be the value itself.
      expect(COMPLETION_SELECT).not.toMatch(new RegExp(`mp\\.${column}\\s*,`));
    }

    // `is_regular_donor` IS read as a value, and is the only health answer that is. It
    // decides one thing: whether the donation-date question applies at all.
    expect(DISCRIMINANT_COLUMNS).toContain("is_regular_donor");
  });

  it("counts the five phone boxes as the one contact question", () => {
    for (const column of ["phone_no", "mobile_no_1", "mobile_no_2", "whatsapp_no_1", "whatsapp_no_2"]) {
      expect(COMPLETION_SELECT, column).toContain(`mp.${column}`);
    }
    expect(COMPLETION_SELECT).toContain("AS p_contact_no");
  });

  it("reads the photograph from its own table rather than a profile column", () => {
    expect(COMPLETION_SELECT).toContain("ph.id");
    expect(COMPLETION_SELECT).toContain("AS p_photo");
  });
});

describe("toTriState", () => {
  it("keeps unanswered distinct from No", () => {
    expect(toTriState(null)).toBeNull();
    expect(toTriState(undefined)).toBeNull();
    expect(toTriState(0)).toBe(0);
    expect(toTriState(1)).toBe(1);
  });

  /** MySQL hands a TINYINT(1) back as a number, but a driver or a view may stringify it. */
  it("reads a stringified flag the same way", () => {
    expect(toTriState("1")).toBe(1);
    expect(toTriState("0")).toBe(0);
  });
});

describe("completionRowFrom", () => {
  it("treats a row with no profile at all as every question unanswered", () => {
    const row = completionRowFrom({});

    for (const field of PRESENCE_FIELDS) {
      expect(row.present[field], field).toBe(0);
    }
    expect(row.first_prefix).toBeNull();
    expect(row.occupation_type).toBeNull();
    expect(row.has_hifz_sanad).toBeNull();

    const result = profileCompletion(row);
    expect(result.percent).toBe(0);
    expect(result.asked).toBeGreaterThan(10);
  });

  it("reads 1 as answered and anything else as not", () => {
    const row = completionRowFrom({ p_name: 1, p_surname: 0, p_email: null });

    expect(row.present.name).toBe(1);
    expect(row.present.surname).toBe(0);
    expect(row.present.email).toBe(0);
  });

  it("carries the discriminants through as the values they are", () => {
    const row = completionRowFrom({
      first_prefix: "Sheikh",
      hizb_participation: "Solo",
      occupation_type: "Student",
      has_hifz_sanad: 1,
      is_regular_donor: 0,
      attends_karachi_tamreen: null,
      khidmat_type: "Both"
    });

    expect(row.first_prefix).toBe("Sheikh");
    expect(row.hizb_participation).toBe("Solo");
    expect(row.occupation_type).toBe("Student");
    expect(row.has_hifz_sanad).toBe(1);
    expect(row.is_regular_donor).toBe(0);
    expect(row.attends_karachi_tamreen).toBeNull();
    expect(row.khidmat_type).toBe("Both");
  });

  /** FR-050a, through the whole bridge: a Student's Tab 4 is one question. */
  it("applies the conditional rules to a row that came from SQL", () => {
    const student = completionFor({ occupation_type: "Student", p_occupation_type: 1 });
    const other = completionFor({ occupation_type: "Job", p_occupation_type: 1 });

    expect(student.tabs.find((t) => t.tab === 4)!.asked).toBe(1);
    expect(other.tabs.find((t) => t.tab === 4)!.asked).toBeGreaterThan(1);
    expect(student.asked).toBeLessThan(other.asked);
  });

  it("agrees with the pure measure called directly", () => {
    const row = { p_name: 1, p_surname: 1, occupation_type: "Business" };

    expect(completionFor(row)).toEqual(profileCompletion(completionRowFrom(row)));
  });
});
