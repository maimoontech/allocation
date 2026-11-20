import { pool } from "../db/pool";
import {
  MEASURED_TABS,
  PRESENCE_FIELDS,
  TAB_LABELS,
  emptyPresence,
  profileCompletion,
  type CompletionRow,
  type PresenceMap
} from "./memberFormCompletion";

/**
 * The administrator's member dashboard: who has got into their account, and how much of the
 * form they have filled in.
 *
 * TWO QUESTIONS, AND THEY ARE NOT THE SAME QUESTION
 *   "Signed in" and "chose their own password" look like one number and are not. Every
 *   account is issued a one-time password and `must_change_password` is set, so a member can
 *   sign in, land on the forced-change screen, and stop there. Reporting only the sign-ins
 *   would count that member as settled; reporting only the password changes would lose the
 *   fact that they got in at all. The gap between the two is the population worth chasing,
 *   so both are counted and the gap is named.
 *
 * NO MEMBER DATA LEAVES THIS SERVICE
 *   The query selects PRESENCE - 1 or 0 per field - rather than values, with seven
 *   exceptions that decide which further questions the form asks. Tab 6 is medical data
 *   under FR-065 and FR-066: no blood group, height or weight is ever read here, only
 *   whether each box has something in it. The response is counts and percentages, and names
 *   no member.
 */

/** Counted as answered only when they hold something other than whitespace. */
const TEXT_PRESENCE_FIELDS = new Set([
  "name",
  "father_name",
  "surname",
  "nationality",
  "residence_address",
  "email",
  "five_kalam_uploaded_when",
  "organisation_name",
  "designation",
  "work_phone_no",
  "work_address",
  "major_subjects",
  "hifz_current_surah",
  "hifz_current_ayyah",
  "tamreen_absence_reason",
  "khidmat_designation",
  "sansta_name",
  "umoor_name"
]);

/**
 * Fields whose presence is NOT a plain column on `member_profiles`.
 *
 *   photo       lives in its own table, so it is a join rather than a column.
 *   contact_no  is one question over five columns: any of them answers it.
 */
const DERIVED_PRESENCE: Record<string, string> = {
  photo: "IF(ph.id IS NULL, 0, 1)",
  contact_no: `IF(COALESCE(
                    NULLIF(TRIM(mp.phone_no), ''),
                    NULLIF(TRIM(mp.mobile_no_1), ''),
                    NULLIF(TRIM(mp.mobile_no_2), ''),
                    NULLIF(TRIM(mp.whatsapp_no_1), ''),
                    NULLIF(TRIM(mp.whatsapp_no_2), '')
                  ) IS NULL, 0, 1)`
};

function presenceExpression(field: string): string {
  const derived = DERIVED_PRESENCE[field];
  if (derived) return `${derived} AS p_${field}`;
  if (TEXT_PRESENCE_FIELDS.has(field)) {
    return `IF(NULLIF(TRIM(mp.${field}), '') IS NULL, 0, 1) AS p_${field}`;
  }
  return `IF(mp.${field} IS NULL, 0, 1) AS p_${field}`;
}

/**
 * The discriminants, read as values because the questions a member is ASKED depend on them.
 * Nothing else is read as a value.
 */
const DISCRIMINANT_COLUMNS = [
  "first_prefix",
  "hizb_participation",
  "occupation_type",
  "has_hifz_sanad",
  "is_regular_donor",
  "attends_karachi_tamreen",
  "khidmat_type"
] as const;

export type AccessStats = {
  total: number;
  active: number;
  inactive: number;
  signed_in: number;
  never_signed_in: number;
  changed_password: number;
  signed_in_not_changed: number;
  signed_in_percent: number;
  changed_password_percent: number;
};

export type FormStats = {
  measured: number;
  average_percent: number;
  fully_answered: number;
  partly_answered: number;
  not_started: number;
  fully_answered_percent: number;
  questions_asked: number;
  questions_answered: number;
  tabs: Array<{ tab: number; label: string; asked: number; answered: number; percent: number }>;
};

/**
 * Which members to count.
 *
 * `"none"` is not a missing filter - it is a filter FOR the members who have not answered
 * that question. It exists because the two populations a plain zone filter hides are the two
 * worth finding: a member with no profile row at all, and a member who has filled in Tab 1
 * but never reached Tab 3. Without it they would be visible only in the unfiltered total,
 * where nobody would think to look for them.
 *
 * Zone and Mohallah are INDEPENDENT. Zone is the member's Hizb, from Tab 3; Mohallah is
 * where they live, from Tab 1. A member may well do Zikr in one zone and live in a Mohallah
 * belonging to another, so the two filters are combined with AND and neither constrains the
 * other's choices.
 */
export type DashboardFilter = {
  zone_id?: number | "none";
  mohallah_id?: number | "none";
};

export type MemberDashboard = {
  access: AccessStats;
  form: FormStats;
  /** Echoed back, so the page can state what it counted rather than assume. */
  filter: { zone_id: number | "none" | null; mohallah_id: number | "none" | null };
  generated_at: string;
};

/** Whole-number percent of `part` in `whole`; 0 rather than NaN when there is no whole. */
function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function toTriState(value: unknown): 0 | 1 | null {
  if (value === null || value === undefined) return null;
  return Number(value) === 1 ? 1 : 0;
}

/**
 * The query, without its WHERE clause, built once at module load and exported so it can be
 * read on its own.
 *
 * One pass over the accounts. LEFT JOINs throughout, because an account with no profile row
 * yet is exactly the case this dashboard exists to count: it is 0% complete, not absent.
 * `member_photos` has a UNIQUE key on `member_account_id`, so that join cannot fan a member
 * out into several rows and double-count them.
 */
export const DASHBOARD_QUERY = `SELECT ma.is_active,
       IF(ma.last_login_at IS NULL, 0, 1) AS has_signed_in,
       ma.must_change_password,
       ${DISCRIMINANT_COLUMNS.map((c) => `mp.${c}`).join(",\n       ")},
       ${PRESENCE_FIELDS.map(presenceExpression).join(",\n       ")}
FROM member_accounts ma
LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
LEFT JOIN member_photos ph ON ph.member_account_id = ma.id`;

/**
 * Turns one filter into a condition and its parameter.
 *
 * `"none"` becomes `IS NULL`, which on a LEFT JOINed profile also matches an account with no
 * profile row at all - which is the honest answer to "who has not chosen a zone".
 */
function filterCondition(
  column: "zone_id" | "mohallah_id",
  value: number | "none" | undefined,
  // `any` to match `pool.query`'s own parameter type, as every other route in this codebase
  // does. Only integers are ever put in it, two lines below.
  params: any
): string | null {
  if (value === undefined) return null;
  if (value === "none") return `mp.${column} IS NULL`;
  params[`f_${column}`] = value;
  return `mp.${column} = :f_${column}`;
}

export async function readMemberDashboard(
  filter: DashboardFilter = {}
): Promise<MemberDashboard> {
  const params: any = {};
  const conditions = [
    filterCondition("zone_id", filter.zone_id, params),
    filterCondition("mohallah_id", filter.mohallah_id, params)
  ].filter((c): c is string => c !== null);

  const where = conditions.length ? `\nWHERE ${conditions.join("\n  AND ")}` : "";

  const [rows] = await pool.query<any[]>(`${DASHBOARD_QUERY}${where}`, params);

  const access: AccessStats = {
    total: rows.length,
    active: 0,
    inactive: 0,
    signed_in: 0,
    never_signed_in: 0,
    changed_password: 0,
    signed_in_not_changed: 0,
    signed_in_percent: 0,
    changed_password_percent: 0
  };

  const tabTotals = new Map<number, { asked: number; answered: number }>();
  for (const tab of MEASURED_TABS) tabTotals.set(tab, { asked: 0, answered: 0 });

  let measured = 0;
  let percentSum = 0;
  let fullyAnswered = 0;
  let notStarted = 0;
  let questionsAsked = 0;
  let questionsAnswered = 0;

  for (const row of rows) {
    const isActive = Number(row.is_active) === 1;
    const hasSignedIn = Number(row.has_signed_in) === 1;
    // `must_change_password` is the authority, not `password_changed_at`: an administrator's
    // reset stamps the timestamp AND sets this flag back to 1, because the administrator now
    // knows that password. Reading the timestamp alone would count a reset as the member's
    // own choice.
    const choseOwnPassword = Number(row.must_change_password) === 0;

    if (isActive) access.active += 1;
    else access.inactive += 1;

    if (hasSignedIn) access.signed_in += 1;
    else access.never_signed_in += 1;

    if (choseOwnPassword) access.changed_password += 1;
    if (hasSignedIn && !choseOwnPassword) access.signed_in_not_changed += 1;

    // Completion is measured over ACTIVE accounts only. A withdrawn member keeps their data
    // (FR-007) and will never fill in the rest of it, so leaving them in would drag the
    // figure down for work nobody intends to do.
    if (!isActive) continue;

    const present: PresenceMap = emptyPresence();
    for (const field of PRESENCE_FIELDS) {
      present[field] = Number(row[`p_${field}`]) === 1 ? 1 : 0;
    }

    const completionRow: CompletionRow = {
      present,
      first_prefix: row.first_prefix ?? null,
      hizb_participation: row.hizb_participation ?? null,
      occupation_type: row.occupation_type ?? null,
      has_hifz_sanad: toTriState(row.has_hifz_sanad),
      is_regular_donor: toTriState(row.is_regular_donor),
      attends_karachi_tamreen: toTriState(row.attends_karachi_tamreen),
      khidmat_type: row.khidmat_type ?? null
    };

    const completion = profileCompletion(completionRow);

    measured += 1;
    percentSum += completion.percent;
    questionsAsked += completion.asked;
    questionsAnswered += completion.answered;

    if (completion.answered === 0) notStarted += 1;
    else if (completion.answered === completion.asked) fullyAnswered += 1;

    for (const tab of completion.tabs) {
      const totals = tabTotals.get(tab.tab)!;
      totals.asked += tab.asked;
      totals.answered += tab.answered;
    }
  }

  access.signed_in_percent = percent(access.signed_in, access.total);
  access.changed_password_percent = percent(access.changed_password, access.total);

  const form: FormStats = {
    measured,
    // The average of each member's own percentage, NOT total answers over total questions.
    // The two differ whenever members are asked different numbers of questions, and this one
    // is the answer to "how far along is a typical member" - every member counts once,
    // whether the form asked them forty questions or forty-six.
    average_percent: measured === 0 ? 0 : Math.round(percentSum / measured),
    fully_answered: fullyAnswered,
    partly_answered: measured - fullyAnswered - notStarted,
    not_started: notStarted,
    fully_answered_percent: percent(fullyAnswered, measured),
    questions_asked: questionsAsked,
    questions_answered: questionsAnswered,
    tabs: MEASURED_TABS.map((tab) => {
      const totals = tabTotals.get(tab)!;
      return {
        tab,
        label: TAB_LABELS[tab] ?? `Tab ${tab}`,
        asked: totals.asked,
        answered: totals.answered,
        percent: percent(totals.answered, totals.asked)
      };
    })
  };

  return {
    access,
    form,
    filter: {
      zone_id: filter.zone_id ?? null,
      mohallah_id: filter.mohallah_id ?? null
    },
    generated_at: new Date().toISOString()
  };
}
