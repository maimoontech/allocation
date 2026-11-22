import { describe, expect, it } from "vitest";
import { buildMembersExportTable, membersExportMetaLines } from "./membersExport";
import { buildExcelTableHtml } from "../../utils/excelExport";
import type { MemberAccount } from "../../features/member/memberAdminApi";

/**
 * What the Members export actually contains (FR-006c).
 *
 * These are the tests that can state a privacy rule as a rule: the file carries the grid's
 * columns and nothing from the twelve tabs, and the one figure derived from them carries no
 * answer. Asserted here rather than through the page because the decision is made here —
 * a DOM test would prove only that today's component passed today's rows through.
 *
 * The Excel-specific details are the other half. A long ITS number read as a NUMBER loses
 * precision, and a percentage written as "76%" cannot be averaged by the spreadsheet it was
 * exported for. Both are the kind of thing that looks right until somebody relies on it.
 */

function member(overrides: Partial<MemberAccount> = {}): MemberAccount {
  return {
    id: 11,
    its_no: "40480241",
    member_name: "Husain",
    must_change_password: false,
    is_active: true,
    has_profile: true,
    has_photo: true,
    first_prefix: "Mulla",
    name: "Husain",
    father_prefix: "Sheikh",
    father_name: "Ali",
    surname: "Kaukawala",
    zone_name: "Zone 1",
    party_name: "Burhani Party",
    whatsapp_no_1: "03001234567",
    whatsapp_no_2: null,
    mobile_no_1: null,
    mobile_no_2: "03007654321",
    last_login_at: "2026-11-01T10:15:00.000Z",
    created_at: "2026-10-30T13:00:53.000Z",
    completion_percent: 76,
    completion_answered: 32,
    completion_asked: 42,
    ...overrides
  };
}

/** The value in a named column, for a one-member table. */
function cell(row: MemberAccount, header: string): string {
  const table = buildMembersExportTable([row]);
  const index = table.columns.findIndex((c) => c.header === header);
  expect(index, `no column named ${header}`).toBeGreaterThanOrEqual(0);
  return table.rows[0][index];
}

describe("buildMembersExportTable", () => {
  it("gives every row a value for every column", () => {
    const table = buildMembersExportTable([member(), member({ id: 12 })]);

    expect(table.rows).toHaveLength(2);
    for (const row of table.rows) {
      expect(row).toHaveLength(table.columns.length);
    }
  });

  it("writes the full name the one way the rest of the application composes it", () => {
    // FR-034a. Prefix, name, father prefix, father name, surname.
    expect(cell(member(), "Name")).toBe("Mulla Husain Sheikh Ali Kaukawala");
  });

  it("falls back to the roster name when the member has filled in nothing", () => {
    const blank = member({
      first_prefix: null,
      name: null,
      father_prefix: null,
      father_name: null,
      surname: null,
      member_name: "Fatema"
    });

    expect(cell(blank, "Name")).toBe("Fatema");
  });

  it("writes a dash for a Zone or Party the member has not chosen", () => {
    const unposted = member({ zone_name: null, party_name: null });

    expect(cell(unposted, "Zone")).toBe("—");
    expect(cell(unposted, "Party")).toBe("—");
  });

  it("prefers the first contact number and falls back to the second", () => {
    expect(cell(member(), "WhatsApp No.")).toBe("03001234567");
    // No mobile_no_1, so the second box answers it — the same rule the grid uses.
    expect(cell(member(), "Mobile No.")).toBe("03007654321");
    expect(cell(member({ mobile_no_1: null, mobile_no_2: null }), "Mobile No.")).toBe("—");
  });

  /**
   * The percentage goes in as a NUMBER. "76%" is text to a spreadsheet, and a column of text
   * cannot be averaged, sorted numerically or filtered with "greater than" — which is most of
   * the reason to want this in Excel at all.
   */
  it("writes the percentage as a bare number, with the unit in the heading", () => {
    expect(cell(member(), "Profile %")).toBe("76");

    const table = buildMembersExportTable([member()]);
    expect(table.columns.some((c) => c.header === "Profile %")).toBe(true);
  });

  it("spells out the fraction, because the denominator is per member", () => {
    expect(cell(member(), "Questions answered")).toBe("32 of 42");
    expect(
      cell(member({ completion_percent: 0, completion_answered: 0, completion_asked: 40 }), "Questions answered")
    ).toBe("0 of 40");
  });

  it("reads the account state in words rather than as a flag", () => {
    expect(cell(member(), "Status")).toBe("Active");
    expect(cell(member({ is_active: false }), "Status")).toBe("Inactive");
  });

  /**
   * `must_change_password` is the authority, not a timestamp: an administrator's reset stamps
   * the timestamp AND sets this flag back, because the administrator now knows that password.
   */
  it("reports whether the member has set a password of their own", () => {
    expect(cell(member({ must_change_password: false }), "Own password set")).toBe("Yes");
    expect(cell(member({ must_change_password: true }), "Own password set")).toBe("No");
  });

  it("says Never rather than a dash for an account nobody has signed into", () => {
    expect(cell(member({ last_login_at: null }), "Last signed in")).toBe("Never");
    expect(cell(member(), "Last signed in")).toMatch(/^\d{2}\/\w{3}\/\d{2}$/);
  });

  /**
   * FR-101, FR-112b. The file holds the grid's columns and the derived percentage. No
   * twelve-tab answer, no health value and no photograph — and the server does not put them
   * in this payload, so there would be nothing to write even by mistake.
   */
  it("has no column for a profile answer, a health value or a photograph", () => {
    const headers = buildMembersExportTable([member()]).columns.map((c) => c.header.toLowerCase());

    for (const forbidden of [
      "blood",
      "height",
      "weight",
      "bmi",
      "donor",
      "donation",
      "photo",
      "picture",
      "email",
      "address",
      "sanad",
      "hifz",
      "education",
      "occupation",
      "khidmat"
    ]) {
      expect(headers.some((h) => h.includes(forbidden)), forbidden).toBe(false);
    }
  });
});

describe("the ITS number and the phone numbers survive Excel", () => {
  /**
   * An ITS number is 6 to 20 DIGITS and is an identifier, not a quantity. Past 15 significant
   * figures Excel rounds a number, so a 20-digit ITS number would arrive subtly wrong and an
   * operator pasting it back into a search would find nobody. Phone numbers lose their
   * leading zero the same way.
   */
  it("marks the identifier and phone columns as text", () => {
    const table = buildMembersExportTable([member()]);
    const textColumns = table.columns.filter((c) => c.text).map((c) => c.header);

    expect(textColumns).toEqual(["ITS No", "WhatsApp No.", "Mobile No."]);
  });

  it("emits the Excel text format on those cells and not on the others", () => {
    const html = buildExcelTableHtml(buildMembersExportTable([member({ its_no: "12345678901234567890" })]));

    expect(html).toContain("mso-number-format");
    // The 20-digit identifier is in a text cell, so Excel keeps all twenty digits.
    expect(html).toMatch(/mso-number-format[^>]*>12345678901234567890</);
    // The percentage must NOT be text, or it cannot be averaged.
    expect(html).toMatch(/<td>76</);
  });

  it("escapes a name that contains markup rather than emitting it", () => {
    const html = buildExcelTableHtml(
      buildMembersExportTable([member({ name: "<script>alert(1)</script>", surname: null, father_name: null, first_prefix: null, father_prefix: null })])
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("membersExportMetaLines", () => {
  const base = {
    exported: 120,
    total: 120,
    search: "",
    status: "All accounts",
    sort: "its_no" as const,
    isZonalHead: false,
    generatedAt: new Date("2026-11-22T09:00:00.000Z")
  };

  it("says how many rows the file holds, out of how many matched", () => {
    expect(membersExportMetaLines(base).join("\n")).toContain("Exported 120 of 120 matching accounts");
  });

  it("names the filter and the order the file is in", () => {
    const lines = membersExportMetaLines({ ...base, search: "Burhani", sort: "party" }).join("\n");

    expect(lines).toContain("Search: Burhani");
    expect(lines).toContain("Status filter: All accounts");
    expect(lines).toContain("Order: Party (A-Z)");
  });

  it("says so when there was no search, rather than leaving the line out", () => {
    // A missing line reads as a complete export to whoever opens the file later.
    expect(membersExportMetaLines(base).join("\n")).toContain("Search: none");
  });

  it("states the scope, which is not the same for the two roles", () => {
    expect(membersExportMetaLines(base).join("\n")).toContain("Scope: all member accounts");
    expect(membersExportMetaLines({ ...base, isZonalHead: true }).join("\n")).toContain(
      "Scope: members posted to your zone"
    );
  });

  /** A truncated export that does not say so is the one outcome worth ruling out. */
  it("warns in the file itself when the export was cut short", () => {
    const lines = membersExportMetaLines({ ...base, exported: 5000, total: 7400 }).join("\n");

    expect(lines).toContain("cut short at 5000 rows");
    expect(lines).toMatch(/Narrow the search/i);
  });

  it("says nothing about being cut short when it was not", () => {
    expect(membersExportMetaLines(base).join("\n")).not.toMatch(/cut short/i);
  });

  it("explains what Profile % counts, and what the file leaves out", () => {
    const lines = membersExportMetaLines(base).join("\n");

    expect(lines).toMatch(/only the questions that member was asked/i);
    expect(lines).toMatch(/health values/i);
    expect(lines).toMatch(/photograph/i);
  });
});
