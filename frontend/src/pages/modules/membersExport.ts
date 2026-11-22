import { composeFullName } from "../../features/member/fullName";
import { formatDateDdMmmYy } from "../../utils/formatDate";
import type { ExcelTable } from "../../utils/excelExport";
import type { MemberAccount, MemberSort } from "../../features/member/memberAdminApi";

/**
 * The Members grid as a spreadsheet (FR-006c).
 *
 * PURE ON PURPOSE
 *   Everything here is a function from rows to rows. The fetching, the button and the
 *   browser download live in the page; the decisions about what the file CONTAINS live here,
 *   where they can be read and tested without a DOM, a store or a network.
 *
 * WHAT THE FILE CONTAINS, AND THE ONE DECISION THAT NEEDED AUTHORISING
 *   The grid's own columns, plus the account facts that are already in the same payload and
 *   that nobody can act on from a screen of twenty-five rows: whether the account is active,
 *   whether the member has replaced the password they were issued, and when they last signed
 *   in. The WhatsApp and Mobile numbers are included, which FR-101 requires to be separately
 *   authorised and which FR-101b now authorises: they are on screen already for both roles,
 *   and a roster export without them cannot be used for the thing a roster is used for.
 *
 *   Still absent, and not negotiable here: every twelve-tab answer, the Tab 6 health values
 *   and the photograph. The server does not put them in this payload, so this file could not
 *   add them if it wanted to. `Profile %` is the exception that is not one — it is derived
 *   from presence, never from a value (FR-112b).
 *
 * WHY THE PERCENTAGE IS WRITTEN AS A BARE NUMBER
 *   "76%" is text to a spreadsheet in several locales, and a column of text cannot be
 *   averaged, sorted numerically or filtered with "greater than". The heading carries the
 *   unit and the cell carries the number, so AVERAGE and a filter both work — which is most
 *   of the reason to want this in Excel rather than on screen.
 */

/** Matches the Sort by control, so the file states the order it is actually in. */
const SORT_LABELS: Record<MemberSort, string> = {
  its_no: "ITS No",
  name: "Name (A-Z)",
  party: "Party (A-Z)",
  zone: "Zone (A-Z)",
  recent_login: "Recently signed in",
  newest: "Newest account first"
};

const DASH = "—";

function contactNumber(primary: string | null, secondary: string | null): string {
  return primary || secondary || DASH;
}

export function buildMembersExportTable(members: MemberAccount[]): ExcelTable {
  return {
    columns: [
      // An identifier, not a quantity: 20 digits would lose precision as a number.
      { header: "ITS No", text: true },
      { header: "Name" },
      { header: "Zone" },
      { header: "Party" },
      // Phone numbers keep leading zeros only as text — "03001234567" becomes 3001234567.
      { header: "WhatsApp No.", text: true },
      { header: "Mobile No.", text: true },
      { header: "Profile %" },
      { header: "Questions answered" },
      { header: "Status" },
      { header: "Own password set" },
      { header: "Last signed in" },
      { header: "Account created" }
    ],
    rows: members.map((member) => [
      member.its_no,
      composeFullName(member) || member.member_name || DASH,
      member.zone_name || DASH,
      member.party_name || DASH,
      contactNumber(member.whatsapp_no_1, member.whatsapp_no_2),
      contactNumber(member.mobile_no_1, member.mobile_no_2),
      String(member.completion_percent),
      // The denominator differs between members by design — it counts only the questions
      // that member was asked — so the fraction is spelled out rather than left implied.
      `${member.completion_answered} of ${member.completion_asked}`,
      member.is_active ? "Active" : "Inactive",
      // `must_change_password` is the authority, not a timestamp: an administrator's reset
      // sets this flag back, because the administrator now knows that password.
      member.must_change_password ? "No" : "Yes",
      member.last_login_at ? formatDateDdMmmYy(member.last_login_at) : "Never",
      formatDateDdMmmYy(member.created_at)
    ])
  };
}

/**
 * The lines above the table.
 *
 * They exist because a spreadsheet outlives the screen it came from. A file of 300 rows with
 * no heading cannot answer "is this everybody, or everybody matching a search I have
 * forgotten?" — and somebody will ask that question of a file somebody else sent them.
 */
export function membersExportMetaLines(args: {
  exported: number;
  total: number;
  search: string;
  status: string;
  sort: MemberSort;
  isZonalHead: boolean;
  generatedAt?: Date;
}): string[] {
  const lines: string[] = [
    `Exported ${args.exported} of ${args.total} matching account${args.total === 1 ? "" : "s"}`,
    `Generated ${formatDateDdMmmYy(args.generatedAt ?? new Date())}`,
    args.isZonalHead
      ? "Scope: members posted to your zone"
      : "Scope: all member accounts"
  ];

  lines.push(args.search ? `Search: ${args.search}` : "Search: none");
  lines.push(`Status filter: ${args.status}`);
  lines.push(`Order: ${SORT_LABELS[args.sort] ?? args.sort}`);

  // Said in the file, not only in a banner the operator saw once and closed. A truncated
  // export that does not say so is the kind of thing a decision gets made on.
  if (args.exported < args.total) {
    lines.push(
      `This file was cut short at ${args.exported} rows. Narrow the search or the status ` +
        `filter to export the rest.`
    );
  }

  lines.push(
    "Profile % is how much of the member's own twelve-tab form they have answered, counting " +
      "only the questions that member was asked. It carries no profile answer: health values, " +
      "the rest of the twelve tabs and the photograph are not in this file."
  );

  return lines;
}
