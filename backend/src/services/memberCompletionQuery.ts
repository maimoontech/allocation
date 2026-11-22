import {
  PRESENCE_FIELDS,
  emptyPresence,
  profileCompletion,
  type CompletionRow,
  type CompletionResult,
  type PresenceMap
} from "./memberFormCompletion";

/**
 * The SQL half of the completion measure: how a member's answers are turned into the
 * presence map `profileCompletion` expects.
 *
 * WHY THIS IS ITS OWN MODULE
 *   Two places now report completion - the administrator's dashboard (FR-112) and the
 *   per-member figure in the account list (FR-112b) - and they MUST NOT be able to disagree.
 *   A member shown 76% in their row and counted as something else in the average would be a
 *   bug nobody could see, because each number looks reasonable on its own. Sharing the select
 *   list and the row mapping means the only way they can differ is if one of them stops
 *   calling this file.
 *
 * NO PROFILE VALUE IS READ
 *   Every field comes back as 1 or 0 - whether the box holds something, never what. The seven
 *   discriminants are the single exception, and they are read because the questions a member
 *   is ASKED depend on them. Tab 6 is medical data under FR-065 and FR-066, so no blood
 *   group, height or weight is selected here, held in memory, or returned to anybody. The
 *   presence flags themselves do not leave the server: callers return the computed
 *   percentage, not the map it was computed from.
 *
 * THE ALIAS CONTRACT
 *   `COMPLETION_SELECT` names two aliases and cannot know how the caller joined them:
 *     mp  member_profiles, LEFT JOINed    - an account with no profile row is 0%, not absent
 *     ph  member_photos,   LEFT JOINed    - UNIQUE on member_account_id, so it cannot fan a
 *                                           member out into duplicate rows
 *   A caller using different aliases, or an INNER JOIN, gets wrong answers rather than an
 *   error, so the contract is stated here and asserted in the tests.
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
export const DISCRIMINANT_COLUMNS = [
  "first_prefix",
  "hizb_participation",
  "occupation_type",
  "has_hifz_sanad",
  "is_regular_donor",
  "attends_karachi_tamreen",
  "khidmat_type"
] as const;

/**
 * The select list a query needs in order to compute completion, built once at module load.
 *
 * No leading or trailing comma: the caller places it, because a fragment that assumes its own
 * punctuation breaks differently depending on where it is dropped in.
 */
export const COMPLETION_SELECT = [
  ...DISCRIMINANT_COLUMNS.map((c) => `mp.${c}`),
  ...PRESENCE_FIELDS.map(presenceExpression)
].join(",\n       ");

/** MySQL hands back 1/0 for a TINYINT(1) and null for an unanswered one. */
export function toTriState(value: unknown): 0 | 1 | null {
  if (value === null || value === undefined) return null;
  return Number(value) === 1 ? 1 : 0;
}

/**
 * One result row, as the pure measure wants it.
 *
 * A row with no profile at all arrives as all-null, which `emptyPresence` plus these nulls
 * describe exactly: every question unanswered, no discriminant chosen. That member scores 0%,
 * which is the truthful answer rather than an absence.
 */
export function completionRowFrom(row: Record<string, unknown>): CompletionRow {
  const present: PresenceMap = emptyPresence();
  for (const field of PRESENCE_FIELDS) {
    present[field] = Number(row[`p_${field}`]) === 1 ? 1 : 0;
  }

  return {
    present,
    first_prefix: (row.first_prefix as string | null) ?? null,
    hizb_participation: (row.hizb_participation as string | null) ?? null,
    occupation_type: (row.occupation_type as string | null) ?? null,
    has_hifz_sanad: toTriState(row.has_hifz_sanad),
    is_regular_donor: toTriState(row.is_regular_donor),
    attends_karachi_tamreen: toTriState(row.attends_karachi_tamreen),
    khidmat_type: (row.khidmat_type as string | null) ?? null
  };
}

/** The whole measure for one result row, in one call. */
export function completionFor(row: Record<string, unknown>): CompletionResult {
  return profileCompletion(completionRowFrom(row));
}
