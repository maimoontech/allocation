import type { PoolConnection } from "mysql2/promise";
import { pool } from "../db/pool";
import { calculateHijriParts, currentHijriYear } from "../utils/hijriDate";

/**
 * Reading and saving a member's own profile.
 *
 * Three properties hold throughout:
 *
 *   - The member comes from the caller's token. No function here takes a member identifier
 *     from a request body, so one member cannot address another's data (FR-034, FR-098).
 *   - A save is all-or-nothing across every section (FR-030). One transaction, and the
 *     validation runs before any write.
 *   - The server decides what is valid. Nothing is trusted because the browser checked it
 *     (FR-028), and every error names its field and its tab so the UI can focus it (FR-029).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidationError = { tab: number; field: string; message: string };

export type TitleEntry = { title_id: number; title_year: number };
export type SharafEntry = { sharaf_id: number; sharaf_year: number };
export type PlaceVisitEntry = { place_id: number; times_count: number; years: number[] };
export type AsharaEntry = {
  attended_with: string;
  hijri_year: number;
  /** With Aamil only. Cleared when the member attended with Aqa Moula TUS. */
  moze_id?: number | null;
  /** With Aamil only. Cleared when the member attended with Aqa Moula TUS. */
  mohallah_id?: number | null;
  /** With Aamil only. Replaced mohallah_id on 2026-11-06 (FR-077c). */
  venue_id?: number | null;
  /** With Aqa Moula TUS only. Cleared when the member attended with their Aamil. */
  aqa_moula_ashara_id?: number | null;
};

export type SaveResult =
  | { ok: true }
  | { ok: false; kind: "validation"; errors: ValidationError[] }
  | { ok: false; kind: "conflict" };

// ---------------------------------------------------------------------------
// Column metadata
//
// Declared once and used by both the read and the save, so a column cannot be saved but not
// returned, or vice versa. `bmi` and the derived Hijri columns are absent on purpose: they
// are computed, never accepted (FR-039, FR-064).
// ---------------------------------------------------------------------------

const TEXT_COLUMNS = [
  "name",
  "nationality",
  "five_kalam_uploaded_when",
  "father_name",
  "surname",
  "residence_address",
  "phone_no",
  "mobile_no_1",
  "mobile_no_2",
  "whatsapp_no_1",
  "whatsapp_no_2",
  "email",
  "organisation_name",
  "designation",
  "work_address",
  "work_phone_no",
  "major_subjects",
  "hifz_current_surah",
  "hifz_current_ayyah",
  "asbaq_ustad",
  "tamreen_absence_reason",
  "sansta_name",
  "umoor_name",
  "khidmat_designation"
] as const;

const DATE_COLUMNS = ["dob_gregorian", "hifz_last_update", "last_donation_date"] as const;

const YEAR_COLUMNS = [
  "prefix_year",
  "occupation_since_year",
  "khidmat_since_year",
  "zikr_e_hussain_since_year"
] as const;

const BOOLEAN_COLUMNS = [
  "has_hifz_sanad",
  "is_regular_donor",
  "attends_karachi_tamreen",
  "takes_ustad_assistance",
  "uses_idaratuz_zakereen_books",
  "registered_with_idaratuz_zakereen"
] as const;

const DECIMAL_COLUMNS = ["height_cm", "weight_kg"] as const;

/**
 * The storage width of every text column, so a too-long value is a field error rather than a
 * database failure.
 *
 * Taken from `information_schema` on the real schema, not from the migration file, so the two
 * cannot drift apart silently. Without these the only thing stopping an over-long value was
 * MySQL, which answers with ER_DATA_TOO_LONG — caught by the route and returned as
 * "Failed to save profile", a 500 that names no field. The member would see the whole save
 * fail with nothing to correct.
 */
const MAX_LENGTHS: Record<string, number> = {
  name: 100,
  nationality: 100,
  five_kalam_uploaded_when: 150,
  father_name: 100,
  surname: 100,
  residence_address: 65535,
  phone_no: 25,
  mobile_no_1: 25,
  mobile_no_2: 25,
  whatsapp_no_1: 25,
  whatsapp_no_2: 25,
  email: 190,
  organisation_name: 150,
  designation: 150,
  work_address: 65535,
  work_phone_no: 25,
  major_subjects: 255,
  hifz_current_surah: 100,
  hifz_current_ayyah: 50,
  asbaq_ustad: 150,
  tamreen_absence_reason: 65535,
  sansta_name: 150,
  umoor_name: 150,
  khidmat_designation: 150
};

/**
 * height_cm and weight_kg are DECIMAL(5,2), so 999.99 is the largest value that fits.
 *
 * The lower bounds are the same "must be positive" rule as before, stated as a range so the
 * message can name both ends. A height of 5000cm is not a typo worth storing.
 */

/**
 * Plausible ranges for a person, not merely what the column can hold.
 *
 * 0.01 to 999.99 was "whatever DECIMAL(5,2) accepts", which let a member type their height
 * in METRES. 1.75 stored happily — `bmi` is a VIRTUAL column, so nothing evaluated it at
 * write time — and the derived BMI of 228,571 only surfaced months later when an unrelated
 * ALTER rebuilt the table and the server stopped booting.
 *
 * These bounds are what make that unrepresentable rather than merely unlikely: the widest
 * BMI they allow is 500 / 0.5^2 = 2000.00, which fits the column with room to spare.
 */
const PLAUSIBLE_RANGES: Record<string, { min: number; max: number; unit: string }> = {
  height_cm: { min: 50, max: 300, unit: "cm" },
  weight_kg: { min: 2, max: 500, unit: "kg" }
};

/** Closed sets fixed by the requirement, stored as inline ENUMs. */
const ENUM_COLUMNS: Record<string, readonly string[]> = {
  first_prefix: ["None", "Sheikh", "Mulla"],
  father_prefix: ["None", "Sheikh", "Mulla"],
  hizb_role: ["Leader", "Side Lead", "Member"],
  occupation_type: ["Job", "Business"],
  education_level: ["Primary", "Middle", "Secondary", "Intermediate", "Bachelors", "Masters", "PhD"],
  education_status: ["Complete", "Ongoing"],
  blood_group: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
  asbaq_level: ["Zaher", "Taweel", "Haqiqat"],
  khidmat_type: ["Sansta", "Umoor", "Both"]
};

/** Lookup foreign keys: column -> table it must exist in. */
const LOOKUP_FKS: Record<string, { table: string; tab: number }> = {
  marital_status_id: { table: "marital_statuses", tab: 1 },
  // FR-040b. `mohallahs` is pre-existing master data rather than one of this module's ten
  // lists, but the handling is identical — parsed, persisted, read back and checked to still
  // exist — so it belongs here rather than in a special case of its own.
  mohallah_id: { table: "mohallahs", tab: 1 },
  sanad_id: { table: "sanads", tab: 5 },
  halqa_id: { table: "halqas", tab: 10 },
  party_tamreen_frequency_id: { table: "tamreen_frequencies", tab: 11 },
  solo_tamreen_frequency_id: { table: "tamreen_frequencies", tab: 11 },
  tamreen_method_id: { table: "tamreen_methods", tab: 11 }
};

/** Which tab each column belongs to, so an error can point at it (FR-029). */
const COLUMN_TAB: Record<string, number> = {
  first_prefix: 1, name: 1, father_prefix: 1, father_name: 1, surname: 1,
  dob_gregorian: 1, nationality: 1, marital_status_id: 1, residence_address: 1,
  mohallah_id: 1, phone_no: 1,
  mobile_no_1: 1, mobile_no_2: 1, whatsapp_no_1: 1, whatsapp_no_2: 1, email: 1,
  prefix_year: 2,
  zone_id: 3, party_id: 3, hizb_role: 3, zikr_e_hussain_since_year: 3,
  registered_with_idaratuz_zakereen: 3, five_kalam_uploaded_when: 3,
  occupation_type: 4, organisation_name: 4, designation: 4, occupation_since_year: 4,
  work_address: 4, work_phone_no: 4,
  education_level: 5, major_subjects: 5, education_status: 5, has_hifz_sanad: 5,
  sanad_id: 5, hifz_current_surah: 5, hifz_current_ayyah: 5, hifz_last_update: 5,
  blood_group: 6, is_regular_donor: 6, last_donation_date: 6, height_cm: 6, weight_kg: 6,
  asbaq_level: 10, halqa_id: 10, asbaq_ustad: 10,
  attends_karachi_tamreen: 11, tamreen_absence_reason: 11,
  party_tamreen_frequency_id: 11, solo_tamreen_frequency_id: 11, tamreen_method_id: 11,
  takes_ustad_assistance: 11, uses_idaratuz_zakereen_books: 11,
  khidmat_type: 12, sansta_name: 12, umoor_name: 12, khidmat_designation: 12,
  khidmat_since_year: 12
};

/**
 * The Hijri window for the five profile years the member picks from a dropdown: Prefix Year,
 * Title Year, Sharaf Year, Place Visited Year and the Other Sansta "Since" year.
 *
 * These were Gregorian 1950-2026. A Hijri year fell inside that range as readily as a
 * Gregorian one, so the wrong calendar was stored without a word of complaint.
 *
 * The ceiling is NOT a constant. `currentHijriYear()` is evaluated per request, so the window
 * rolls over on its own at each Hijri new year and the server never trails the dropdown.
 *
 * Tab 9's Ashara year keeps its own floor of 1400 AH, which FR-076 names explicitly.
 */
const PROFILE_HIJRI_YEAR_MIN = 1401;
const HIJRI_YEAR_MIN = 1400;

/**
 * Tab 3's Zikr e Hussain year reaches further back than the other profile years (FR-049a).
 * A member may have been doing Zikr since long before they held a title or a sharaf, so this
 * floor is 1375 AH rather than 1401. The ceiling is the same rolling current Hijri year.
 */
const ZIKR_HIJRI_YEAR_MIN = 1375;

/** The one message these fields share, so they cannot drift apart. */
function hijriYearError(value: unknown, min: number = PROFILE_HIJRI_YEAR_MIN): string | null {
  const max = currentHijriYear();
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    return `Year must be between ${min} and ${max} AH.`;
  }
  return null;
}
const EARLIEST_BIRTH_YEAR = 1900;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Permissive on purpose: Pakistani national and international forms, digits dominant. */
const PHONE_RE = /^\+?[0-9][0-9\s\-()]{6,24}$/;

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function readMemberProfile(memberAccountId: number) {
  // its_no is joined from the account rather than duplicated on the profile, so the
  // read-only value shown on Tab 1 has one source of truth (FR-034).
  const [profileRows] = await pool.query<any[]>(
    `SELECT mp.*, ma.its_no, IF(ph.id IS NULL, 0, 1) AS has_photo
     FROM member_accounts ma
     LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
     LEFT JOIN member_photos ph ON ph.member_account_id = ma.id
     WHERE ma.id = :id
     LIMIT 1`,
    { id: memberAccountId }
  );

  const row = profileRows[0];
  if (!row) return null;

  const [titles] = await pool.query<any[]>(
    `SELECT title_id, title_year FROM member_titles
     WHERE member_account_id = :id ORDER BY title_year, title_id`,
    { id: memberAccountId }
  );
  const [sharafs] = await pool.query<any[]>(
    `SELECT sharaf_id, sharaf_year FROM member_sharafs
     WHERE member_account_id = :id ORDER BY sharaf_year, sharaf_id`,
    { id: memberAccountId }
  );
  const [skills] = await pool.query<any[]>(
    "SELECT skill_id FROM member_skills WHERE member_account_id = :id ORDER BY skill_id",
    { id: memberAccountId }
  );
  const [visits] = await pool.query<any[]>(
    `SELECT v.id, v.place_id, v.times_count,
            GROUP_CONCAT(y.visited_year ORDER BY y.visited_year) AS years
     FROM member_place_visits v
     LEFT JOIN member_place_visit_years y ON y.member_place_visit_id = v.id
     WHERE v.member_account_id = :id
     GROUP BY v.id, v.place_id, v.times_count
     ORDER BY v.place_id`,
    { id: memberAccountId }
  );
  const [ashara] = await pool.query<any[]>(
    `SELECT attended_with, hijri_year, moze_id, mohallah_id, venue_id, aqa_moula_ashara_id
     FROM member_ashara_attendances
     WHERE member_account_id = :id ORDER BY hijri_year`,
    { id: memberAccountId }
  );

  // A member with no profile row yet still gets a complete, empty shape rather than nulls,
  // so the form has nothing to special-case on first open.
  const profile: Record<string, unknown> = {
    its_no: row.its_no,
    has_photo: Boolean(row.has_photo),
    updated_at: row.updated_at ?? null
  };

  const scalarColumns = [
    ...TEXT_COLUMNS,
    ...DATE_COLUMNS,
    ...YEAR_COLUMNS,
    ...BOOLEAN_COLUMNS,
    ...DECIMAL_COLUMNS,
    ...Object.keys(ENUM_COLUMNS),
    ...Object.keys(LOOKUP_FKS),
    "zone_id",
    "party_id"
  ];

  for (const column of scalarColumns) {
    const value = row[column];
    if (value === undefined) {
      profile[column] = null;
      continue;
    }
    if ((BOOLEAN_COLUMNS as readonly string[]).includes(column)) {
      profile[column] = value === null ? null : Boolean(value);
    } else if ((DATE_COLUMNS as readonly string[]).includes(column)) {
      profile[column] = value === null ? null : formatDate(value);
    } else if ((DECIMAL_COLUMNS as readonly string[]).includes(column)) {
      profile[column] = value === null ? null : Number(value);
    } else {
      profile[column] = value ?? null;
    }
  }

  // Derived, and read-only (FR-039, FR-064).
  profile.dob_hijri_day = row.dob_hijri_day ?? null;
  profile.dob_hijri_month = row.dob_hijri_month ?? null;
  profile.dob_hijri_year = row.dob_hijri_year ?? null;
  profile.dob_hijri_text = row.dob_hijri_text ?? null;
  profile.bmi = row.bmi === null || row.bmi === undefined ? null : Number(row.bmi);

  profile.titles = titles.map((t) => ({
    title_id: Number(t.title_id),
    title_year: Number(t.title_year)
  }));
  profile.sharafs = sharafs.map((s) => ({
    sharaf_id: Number(s.sharaf_id),
    sharaf_year: Number(s.sharaf_year)
  }));
  profile.skill_ids = skills.map((s) => Number(s.skill_id));
  profile.places_visited = visits.map((v) => ({
    place_id: Number(v.place_id),
    times_count: Number(v.times_count),
    years: v.years ? String(v.years).split(",").map(Number) : []
  }));
  profile.ashara_attendances = ashara.map((a) => ({
    attended_with: a.attended_with,
    hijri_year: Number(a.hijri_year),
    moze_id: a.moze_id === null ? null : Number(a.moze_id),
    mohallah_id: a.mohallah_id === null ? null : Number(a.mohallah_id),
    venue_id: a.venue_id === null ? null : Number(a.venue_id),
    aqa_moula_ashara_id:
      a.aqa_moula_ashara_id === null ? null : Number(a.aqa_moula_ashara_id)
  }));

  return profile;
}

function formatDate(value: unknown): string | null {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") return value.slice(0, 10);
  return null;
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export async function saveMemberProfile(
  memberAccountId: number,
  payload: Record<string, unknown>
): Promise<SaveResult> {
  const errors: ValidationError[] = [];
  const add = (field: string, message: string, tab?: number) =>
    errors.push({ tab: tab ?? COLUMN_TAB[field] ?? 1, field, message });

  const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);
  const raw = (key: string) => payload[key];

  // -------------------------------------------------------------------------
  // Scalars
  // -------------------------------------------------------------------------
  const values: Record<string, unknown> = {};

  for (const column of TEXT_COLUMNS) {
    if (!has(column)) continue;
    const value = raw(column);
    if (value === null || value === "") {
      values[column] = null;
      continue;
    }
    if (typeof value !== "string") {
      add(column, "Must be text.");
      continue;
    }
    const trimmed = value.trim();
    const limit = MAX_LENGTHS[column];
    if (limit !== undefined && trimmed.length > limit) {
      add(column, `Must be ${limit} characters or fewer.`);
      continue;
    }
    values[column] = trimmed;
  }

  if (values.email) {
    if (!EMAIL_RE.test(String(values.email))) add("email", "Enter a valid email address.");
  }

  for (const phoneField of [
    "phone_no",
    "mobile_no_1",
    "mobile_no_2",
    "whatsapp_no_1",
    "whatsapp_no_2",
    "work_phone_no"
  ]) {
    const value = values[phoneField];
    if (value && !PHONE_RE.test(String(value))) {
      add(phoneField, "Enter a valid phone number.");
    }
  }

  for (const column of Object.keys(ENUM_COLUMNS)) {
    if (!has(column)) continue;
    const value = raw(column);
    if (value === null || value === "") {
      // first_prefix and father_prefix are NOT NULL with a 'None' default.
      values[column] = column.endsWith("_prefix") ? "None" : null;
      continue;
    }
    if (!ENUM_COLUMNS[column].includes(String(value))) {
      add(column, `Must be one of: ${ENUM_COLUMNS[column].join(", ")}.`);
      continue;
    }
    values[column] = String(value);
  }

  for (const column of BOOLEAN_COLUMNS) {
    if (!has(column)) continue;
    const value = raw(column);
    if (value === null || value === "") {
      values[column] = null;
      continue;
    }
    if (typeof value !== "boolean") {
      add(column, "Must be true or false.");
      continue;
    }
    values[column] = value ? 1 : 0;
  }

  for (const column of DATE_COLUMNS) {
    if (!has(column)) continue;
    const value = raw(column);
    if (value === null || value === "") {
      values[column] = null;
      continue;
    }
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      add(column, "Must be a date in YYYY-MM-DD form.");
      continue;
    }
    const parsed = calculateHijriParts(value);
    if (!parsed) {
      add(column, "Not a real date.");
      continue;
    }
    values[column] = value;
  }

  for (const column of YEAR_COLUMNS) {
    if (!has(column)) continue;
    const value = raw(column);
    if (value === null || value === "") {
      values[column] = null;
      continue;
    }
    const year = Number(value);
    if (!Number.isInteger(year)) {
      add(column, "Must be a year.");
      continue;
    }
    values[column] = year;
  }

  for (const column of DECIMAL_COLUMNS) {
    if (!has(column)) continue;
    const value = raw(column);
    if (value === null || value === "") {
      values[column] = null;
      continue;
    }
    const num = Number(value);
    // FR-063, FR-064. The range is what is plausible for a PERSON, not what the column can
    // hold. The old bound was the latter, and it accepted a height of 1.75 — metres instead
    // of centimetres — which is how a BMI of 228,571 came to exist. The unit is named in the
    // message because that mistake is the one worth catching, and "invalid" would not say so.
    const range = PLAUSIBLE_RANGES[column];
    if (!Number.isFinite(num) || num < range.min || num > range.max) {
      add(column, `Must be between ${range.min} and ${range.max} ${range.unit}.`);
      continue;
    }
    values[column] = num;
  }

  for (const column of [...Object.keys(LOOKUP_FKS), "zone_id", "party_id"]) {
    if (!has(column)) continue;
    const value = raw(column);
    if (value === null || value === "") {
      values[column] = null;
      continue;
    }
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      add(column, "Invalid selection.");
      continue;
    }
    values[column] = id;
  }

  // Anything the client should not be sending is ignored rather than rejected, so an
  // unchanged round trip of a read response still saves (FR-034, FR-039, FR-064).
  for (const ignored of [
    "its_no",
    "bmi",
    "dob_hijri_day",
    "dob_hijri_month",
    "dob_hijri_year",
    "dob_hijri_text"
  ]) {
    delete values[ignored];
  }

  // -------------------------------------------------------------------------
  // Dates relative to now, and to each other
  // -------------------------------------------------------------------------
  const today = new Date();
  const todayIso = formatDate(today)!;
  const thisYear = today.getFullYear();

  if (values.dob_gregorian) {
    const dob = String(values.dob_gregorian);
    if (dob > todayIso) add("dob_gregorian", "Date of birth cannot be in the future.");
    const birthYear = Number(dob.slice(0, 4));
    if (birthYear < EARLIEST_BIRTH_YEAR) {
      add("dob_gregorian", `Date of birth cannot be before ${EARLIEST_BIRTH_YEAR}.`);
    }
  }

  if (values.last_donation_date && String(values.last_donation_date) > todayIso) {
    add("last_donation_date", "Last donation date cannot be in the future.");
  }
  if (values.hifz_last_update && String(values.hifz_last_update) > todayIso) {
    add("hifz_last_update", "Last update cannot be in the future.");
  }

  // The year a job or a khidmat began cannot precede the member's birth, which is the kind
  // of mistake a per-field range check alone would let through.
  const birthYear = values.dob_gregorian
    ? Number(String(values.dob_gregorian).slice(0, 4))
    : null;

  // Only occupation_since_year is Gregorian now. khidmat_since_year became Hijri and MUST
  // NOT be compared against a Gregorian birth year here: 1447 AH is less than a 2006 CE
  // birth year, so this check would reject every valid value.
  if (values.occupation_since_year != null) {
    const n = Number(values.occupation_since_year);
    if (n > thisYear) add("occupation_since_year", "Year cannot be in the future.");
    if (birthYear !== null && n < birthYear) {
      add("occupation_since_year", "Year cannot be before your year of birth.");
    }
  }

  for (const field of ["prefix_year", "khidmat_since_year"] as const) {
    if (values[field] == null) continue;
    const message = hijriYearError(values[field]);
    if (message) add(field, message);
  }

  // FR-049a. Hijri like the four above, but reaching back to 1375 AH: a member may have been
  // doing Zikr e Hussain since long before they held a title or a sharaf.
  if (values.zikr_e_hussain_since_year != null) {
    const message = hijriYearError(values.zikr_e_hussain_since_year, ZIKR_HIJRI_YEAR_MIN);
    if (message) add("zikr_e_hussain_since_year", message);
  }

  // -------------------------------------------------------------------------
  // Conditional rules. Each clears the fields its answer makes meaningless, so a hidden
  // field cannot keep a contradictory value (story 5 scenario 6).
  // -------------------------------------------------------------------------

  // FR-052: Designation belongs to a Job.
  if (values.occupation_type === "Business") values.designation = null;

  // FR-059: a Sanad is required when the member claims one.
  if (values.has_hifz_sanad === 1 && !values.sanad_id) {
    add("sanad_id", "Select the Sanad you hold.", 5);
  }
  if (values.has_hifz_sanad === 0) values.sanad_id = null;

  // FR-081: a reason is required when the member does not attend.
  if (values.attends_karachi_tamreen === 0) {
    if (!values.tamreen_absence_reason) {
      add("tamreen_absence_reason", "Please give a reason.", 11);
    }
  } else if (values.attends_karachi_tamreen === 1) {
    values.tamreen_absence_reason = null;
  }

  // FR-086: which name fields apply follows the Khidmat type.
  if (values.khidmat_type === "Sansta") {
    if (!values.sansta_name) add("sansta_name", "Enter the Sansta name.", 12);
    values.umoor_name = null;
  } else if (values.khidmat_type === "Umoor") {
    if (!values.umoor_name) add("umoor_name", "Enter the Umoor name.", 12);
    values.sansta_name = null;
  } else if (values.khidmat_type === "Both") {
    if (!values.sansta_name) add("sansta_name", "Enter the Sansta name.", 12);
    if (!values.umoor_name) add("umoor_name", "Enter the Umoor name.", 12);
  }

  // -------------------------------------------------------------------------
  // Repeatable sections. Replace-in-full: an omitted array leaves its section alone, an
  // empty array clears it.
  // -------------------------------------------------------------------------
  const titles = has("titles") ? parseTitles(raw("titles"), add) : undefined;
  const sharafs = has("sharafs") ? parseSharafs(raw("sharafs"), add) : undefined;
  const skillIds = has("skill_ids") ? parseSkillIds(raw("skill_ids"), add) : undefined;
  const visits = has("places_visited") ? parseVisits(raw("places_visited"), add) : undefined;
  const ashara = has("ashara_attendances")
    ? parseAshara(raw("ashara_attendances"), add)
    : undefined;

  // FR-073, before the referential checks because it reports regardless of other failures.
  if (visits?.length) {
    await checkVisitCounts(visits, add);
  }

  // FR-077b, before the referential checks so the id they verify is the one that is saved.
  if (ashara?.length) {
    await resolveAqaMoulaPlaces(ashara);
  }

  // -------------------------------------------------------------------------
  // Referential checks. Batched, so a profile with many selections costs a handful of
  // queries rather than one per field.
  // -------------------------------------------------------------------------
  if (errors.length === 0) {
    await checkReferences({ values, titles, sharafs, skillIds, visits, ashara }, add);
  }

  if (errors.length > 0) return { ok: false, kind: "validation", errors };

  // -------------------------------------------------------------------------
  // Derived values, computed here and never accepted from the client (FR-028, FR-039).
  // -------------------------------------------------------------------------
  if (has("dob_gregorian")) {
    if (values.dob_gregorian) {
      const parts = calculateHijriParts(String(values.dob_gregorian));
      values.dob_hijri_day = parts?.day ?? null;
      values.dob_hijri_month = parts?.month ?? null;
      values.dob_hijri_year = parts?.year ?? null;
      values.dob_hijri_text = parts?.formatted ?? null;
    } else {
      values.dob_hijri_day = null;
      values.dob_hijri_month = null;
      values.dob_hijri_year = null;
      values.dob_hijri_text = null;
    }
  }

  // -------------------------------------------------------------------------
  // Write. One transaction for every section (FR-030).
  // -------------------------------------------------------------------------
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.query<any[]>(
      `SELECT id, updated_at FROM member_profiles
       WHERE member_account_id = :id FOR UPDATE`,
      { id: memberAccountId }
    );

    // Optimistic concurrency. If the caller read the profile and someone else saved in
    // between, tell them rather than silently discarding the other change.
    const ifUnmodifiedSince = payload.if_unmodified_since;
    if (existing[0] && typeof ifUnmodifiedSince === "string" && ifUnmodifiedSince) {
      const current = new Date(existing[0].updated_at).getTime();
      const claimed = new Date(ifUnmodifiedSince).getTime();
      if (Number.isFinite(current) && Number.isFinite(claimed) && current > claimed) {
        await connection.rollback();
        return { ok: false, kind: "conflict" };
      }
    }

    let profileId: number;
    if (existing[0]) {
      profileId = Number(existing[0].id);
      if (Object.keys(values).length > 0) {
        const assignments = Object.keys(values)
          .map((column) => `${column} = :${column}`)
          .join(", ");
        await connection.query(
          `UPDATE member_profiles SET ${assignments} WHERE id = :profile_id`,
          { ...values, profile_id: profileId }
        );
      }
    } else {
      const columns = Object.keys(values);
      const [result] = await connection.query<any>(
        `INSERT INTO member_profiles (member_account_id${columns.length ? ", " + columns.join(", ") : ""})
         VALUES (:member_account_id${columns.length ? ", " + columns.map((c) => `:${c}`).join(", ") : ""})`,
        { member_account_id: memberAccountId, ...values }
      );
      profileId = Number(result.insertId);
    }

    if (titles !== undefined) {
      await replaceRows(connection, "member_titles", memberAccountId, titles, (t) => ({
        title_id: t.title_id,
        title_year: t.title_year
      }));
    }
    if (sharafs !== undefined) {
      await replaceRows(connection, "member_sharafs", memberAccountId, sharafs, (s) => ({
        sharaf_id: s.sharaf_id,
        sharaf_year: s.sharaf_year
      }));
    }
    if (skillIds !== undefined) {
      await replaceRows(connection, "member_skills", memberAccountId, skillIds, (id) => ({
        skill_id: id
      }));
    }
    if (ashara !== undefined) {
      await replaceRows(
        connection,
        "member_ashara_attendances",
        memberAccountId,
        ashara,
        (a) => ({
          attended_with: a.attended_with,
          hijri_year: a.hijri_year,
          moze_id: a.moze_id ?? null,
          mohallah_id: a.mohallah_id ?? null,
          venue_id: a.venue_id ?? null,
          aqa_moula_ashara_id: a.aqa_moula_ashara_id ?? null
        })
      );
    }

    if (visits !== undefined) {
      // The year rows cascade from the visit rows, so deleting the parents is enough.
      await connection.query(
        "DELETE FROM member_place_visits WHERE member_account_id = :id",
        { id: memberAccountId }
      );
      for (const visit of visits) {
        const [result] = await connection.query<any>(
          `INSERT INTO member_place_visits (member_account_id, place_id, times_count)
           VALUES (:member_account_id, :place_id, :times_count)`,
          {
            member_account_id: memberAccountId,
            place_id: visit.place_id,
            times_count: visit.times_count
          }
        );
        const visitId = Number(result.insertId);
        for (const year of visit.years) {
          await connection.query(
            `INSERT INTO member_place_visit_years (member_place_visit_id, visited_year)
             VALUES (:visit_id, :year)`,
            { visit_id: visitId, year }
          );
        }
      }
    }

    // Touch updated_at even when only a repeatable section changed, so the concurrency
    // check above sees it.
    await connection.query(
      "UPDATE member_profiles SET updated_at = NOW() WHERE id = :id",
      { id: profileId }
    );

    await connection.commit();
    return { ok: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function replaceRows<T>(
  connection: PoolConnection,
  table: string,
  memberAccountId: number,
  rows: T[],
  toColumns: (row: T) => Record<string, unknown>
) {
  await connection.query(`DELETE FROM ${table} WHERE member_account_id = :id`, {
    id: memberAccountId
  });
  for (const row of rows) {
    const columns = toColumns(row);
    const names = Object.keys(columns);
    await connection.query(
      `INSERT INTO ${table} (member_account_id, ${names.join(", ")})
       VALUES (:member_account_id, ${names.map((n) => `:${n}`).join(", ")})`,
      { member_account_id: memberAccountId, ...columns }
    );
  }
}

// ---------------------------------------------------------------------------
// Repeatable section parsing
// ---------------------------------------------------------------------------

type Add = (field: string, message: string, tab?: number) => void;

function asArray(value: unknown, field: string, tab: number, add: Add): unknown[] | null {
  if (!Array.isArray(value)) {
    add(field, "Expected a list.", tab);
    return null;
  }
  return value;
}

function parseTitles(value: unknown, add: Add): TitleEntry[] | undefined {
  const list = asArray(value, "titles", 2, add);
  if (!list) return undefined;

  const seen = new Set<string>();
  const out: TitleEntry[] = [];
  list.forEach((entry: any, index) => {
    const title_id = Number(entry?.title_id);
    const title_year = Number(entry?.title_year);
    if (!Number.isInteger(title_id) || title_id <= 0) {
      add(`titles[${index}].title_id`, "Select a title.", 2);
      return;
    }
    const yearMessage = hijriYearError(title_year);
    if (yearMessage) {
      add(`titles[${index}].title_year`, yearMessage, 2);
      return;
    }
    // The same title in different years is legitimate; the same title in the same year is
    // the duplicate the unique key would reject anyway.
    const key = `${title_id}:${title_year}`;
    if (seen.has(key)) {
      add(`titles[${index}]`, "This title and year are already listed.", 2);
      return;
    }
    seen.add(key);
    out.push({ title_id, title_year });
  });
  return out;
}

function parseSharafs(value: unknown, add: Add): SharafEntry[] | undefined {
  const list = asArray(value, "sharafs", 7, add);
  if (!list) return undefined;

  const seen = new Set<string>();
  const out: SharafEntry[] = [];
  list.forEach((entry: any, index) => {
    const sharaf_id = Number(entry?.sharaf_id);
    const sharaf_year = Number(entry?.sharaf_year);
    if (!Number.isInteger(sharaf_id) || sharaf_id <= 0) {
      add(`sharafs[${index}].sharaf_id`, "Select a Sharaf.", 7);
      return;
    }
    const yearMessage = hijriYearError(sharaf_year);
    if (yearMessage) {
      add(`sharafs[${index}].sharaf_year`, yearMessage, 7);
      return;
    }
    const key = `${sharaf_id}:${sharaf_year}`;
    if (seen.has(key)) {
      add(`sharafs[${index}]`, "This Sharaf and year are already listed.", 7);
      return;
    }
    seen.add(key);
    out.push({ sharaf_id, sharaf_year });
  });
  return out;
}

function parseSkillIds(value: unknown, add: Add): number[] | undefined {
  const list = asArray(value, "skill_ids", 4, add);
  if (!list) return undefined;

  const out: number[] = [];
  list.forEach((entry, index) => {
    const id = Number(entry);
    if (!Number.isInteger(id) || id <= 0) {
      add(`skill_ids[${index}]`, "Invalid skill.", 4);
      return;
    }
    if (!out.includes(id)) out.push(id);
  });
  return out;
}

function parseVisits(value: unknown, add: Add): PlaceVisitEntry[] | undefined {
  const list = asArray(value, "places_visited", 8, add);
  if (!list) return undefined;

  const seenPlaces = new Set<number>();
  const out: PlaceVisitEntry[] = [];

  list.forEach((entry: any, index) => {
    const place_id = Number(entry?.place_id);
    const times_count = Number(entry?.times_count);

    if (!Number.isInteger(place_id) || place_id <= 0) {
      add(`places_visited[${index}].place_id`, "Select a place.", 8);
      return;
    }
    // FR-071: one row per place, so its count and years stay one coherent record.
    if (seenPlaces.has(place_id)) {
      add(`places_visited[${index}].place_id`, "This place is already listed.", 8);
      return;
    }
    seenPlaces.add(place_id);

    if (!Number.isInteger(times_count) || times_count < 0) {
      add(`places_visited[${index}].times_count`, "Enter how many times.", 8);
      return;
    }

    const yearsRaw = Array.isArray(entry?.years) ? entry.years : [];
    const years: number[] = [];
    for (const y of yearsRaw) {
      const year = Number(y);
      const yearMessage = hijriYearError(year);
      if (yearMessage) {
        add(`places_visited[${index}].years`, yearMessage, 8);
        return;
      }
      if (years.includes(year)) {
        add(`places_visited[${index}].years`, `${year} is listed twice.`, 8);
        return;
      }
      years.push(year);
    }

    // The FR-073 count check is NOT here: its message must name the place, which needs a
    // query. See checkVisitCounts.
    out.push({ place_id, times_count, years });
  });

  return out;
}

function parseAshara(value: unknown, add: Add): AsharaEntry[] | undefined {
  const list = asArray(value, "ashara_attendances", 9, add);
  if (!list) return undefined;

  const attendedWith = ["With Aqa Moula TUS", "With Aamil"];
  const maxHijriYear = currentHijriYear();
  const seenYears = new Set<number>();
  const out: AsharaEntry[] = [];

  list.forEach((entry: any, index) => {
    const hijri_year = Number(entry?.hijri_year);
    const with_ = String(entry?.attended_with ?? "");

    if (!attendedWith.includes(with_)) {
      add(
        `ashara_attendances[${index}].attended_with`,
        `Must be one of: ${attendedWith.join(", ")}.`,
        9
      );
      return;
    }
    // FR-076. The upper bound comes from the server's clock, not the client's.
    if (!Number.isInteger(hijri_year) || hijri_year < HIJRI_YEAR_MIN || hijri_year > maxHijriYear) {
      add(
        `ashara_attendances[${index}].hijri_year`,
        `Year must be between ${HIJRI_YEAR_MIN} and ${maxHijriYear} AH.`,
        9
      );
      return;
    }
    // One Ashara Mubaraka per Hijri year, which the unique key also enforces.
    if (seenYears.has(hijri_year)) {
      add(`ashara_attendances[${index}].hijri_year`, `${hijri_year} AH is already listed.`, 9);
      return;
    }
    seenYears.add(hijri_year);

    const moze_id = entry?.moze_id == null || entry.moze_id === "" ? null : Number(entry.moze_id);
    const mohallah_id =
      entry?.mohallah_id == null || entry.mohallah_id === "" ? null : Number(entry.mohallah_id);

    if (moze_id !== null && (!Number.isInteger(moze_id) || moze_id <= 0)) {
      add(`ashara_attendances[${index}].moze_id`, "Invalid place.", 9);
      return;
    }
    if (mohallah_id !== null && (!Number.isInteger(mohallah_id) || mohallah_id <= 0)) {
      add(`ashara_attendances[${index}].mohallah_id`, "Invalid Mohallah.", 9);
      return;
    }

    const venue_id =
      entry?.venue_id == null || entry.venue_id === "" ? null : Number(entry.venue_id);
    if (venue_id !== null && (!Number.isInteger(venue_id) || venue_id <= 0)) {
      add(`ashara_attendances[${index}].venue_id`, "Invalid Venue.", 9);
      return;
    }

    const aqa_moula_ashara_id =
      entry?.aqa_moula_ashara_id == null || entry.aqa_moula_ashara_id === ""
        ? null
        : Number(entry.aqa_moula_ashara_id);

    if (
      aqa_moula_ashara_id !== null &&
      (!Number.isInteger(aqa_moula_ashara_id) || aqa_moula_ashara_id <= 0)
    ) {
      add(`ashara_attendances[${index}].aqa_moula_ashara_id`, "Invalid place.", 9);
      return;
    }

    // FR-077a. The two answers ask different questions, so each CLEARS the other's
    // fields rather than rejecting them. Same treatment as the conditional rules on
    // Tabs 4, 11 and 12: a member who picks one answer, fills it in, then changes their
    // mind must not leave a contradictory value behind in a field nobody can see.
    const withAqaMoula = with_ === "With Aqa Moula TUS";

    out.push({
      attended_with: with_,
      hijri_year,
      moze_id: withAqaMoula ? null : moze_id,
      mohallah_id: withAqaMoula ? null : mohallah_id,
      venue_id: withAqaMoula ? null : venue_id,
      aqa_moula_ashara_id: withAqaMoula ? aqa_moula_ashara_id : null
    });
  });

  return out;
}

/**
 * FR-077b. Where Aqa Moula TUS held Ashara is fixed by the year, so for a "With Aqa Moula TUS"
 * record the place is looked up from the year and replaces whatever the client sent. The form
 * no longer asks for it; trusting a client value here would let a stale build save a place
 * that contradicts the year.
 *
 * A year with no place entered yet keeps the client's value (normally null), so records saved
 * before an administrator filled the list are not blanked by the next save.
 */
async function resolveAqaMoulaPlaces(ashara: AsharaEntry[]) {
  const years = [
    ...new Set(ashara.filter((a) => a.attended_with === "With Aqa Moula TUS").map((a) => a.hijri_year))
  ];
  if (years.length === 0) return;

  const [rows] = await pool.query<any[]>(
    `SELECT id, hijri_year FROM aqa_moula_asharas
     WHERE is_active = 1 AND hijri_year IN (${years.map(() => "?").join(",")})`,
    years
  );
  const placeByYear = new Map(rows.map((r) => [Number(r.hijri_year), Number(r.id)]));

  for (const a of ashara) {
    if (a.attended_with !== "With Aqa Moula TUS") continue;
    const placeId = placeByYear.get(a.hijri_year);
    if (placeId !== undefined) a.aqa_moula_ashara_id = placeId;
  }
}

// ---------------------------------------------------------------------------
// Referential integrity
// ---------------------------------------------------------------------------

async function existingIds(table: string, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  return new Set(rows.map((r) => Number(r.id)));
}

/**
 * FR-073: the Number of Times must equal the number of years listed for that place, and the
 * refusal must NAME the place as well as both counts.
 *
 * That naming is why this is a separate async step rather than part of `parseVisits` — the
 * place name is not in the payload, only its id, so the message cannot be built without a
 * query.
 *
 * It runs whether or not other fields failed validation, unlike `checkReferences`. A member
 * who has a count mismatch AND an unrelated typo should be told both at once, rather than
 * fixing the typo, saving, and only then discovering the mismatch.
 */
async function checkVisitCounts(visits: PlaceVisitEntry[], add: Add) {
  const mismatched = visits
    .map((visit, index) => ({ visit, index }))
    .filter(({ visit }) => visit.times_count !== visit.years.length);

  if (mismatched.length === 0) return;

  const ids = mismatched.map(({ visit }) => visit.place_id);
  const [rows] = await pool.query<any[]>(
    `SELECT id, place_name FROM places WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  const nameById = new Map<number, string>(rows.map((r) => [Number(r.id), String(r.place_name)]));

  for (const { visit, index } of mismatched) {
    // An unknown id is reported as a bad selection by checkReferences; this message still has
    // to say something sensible if both are wrong at once.
    const place = nameById.get(visit.place_id) ?? "the selected place";
    add(
      `places_visited[${index}]`,
      `${place}: Number of times (${visit.times_count}) does not match the ` +
        `${visit.years.length} year(s) listed.`,
      8
    );
  }
}

async function checkReferences(
  input: {
    values: Record<string, unknown>;
    titles?: TitleEntry[];
    sharafs?: SharafEntry[];
    skillIds?: number[];
    visits?: PlaceVisitEntry[];
    ashara?: AsharaEntry[];
  },
  add: Add
) {
  const { values, titles, sharafs, skillIds, visits, ashara } = input;

  for (const [column, meta] of Object.entries(LOOKUP_FKS)) {
    const id = values[column];
    if (id == null) continue;
    const found = await existingIds(meta.table, [Number(id)]);
    if (!found.has(Number(id))) add(column, "Selection is no longer available.", meta.tab);
  }

  // FR-048: a Party must belong to the selected Zone. No foreign key can express that, so
  // it is checked here — and it is the rule most likely to be hit, because changing the
  // Zone without clearing the Party is an easy mistake.
  if (values.party_id != null) {
    const [rows] = await pool.query<any[]>(
      "SELECT zone_id FROM parties WHERE id = :id LIMIT 1",
      { id: Number(values.party_id) }
    );
    if (!rows[0]) {
      add("party_id", "Selection is no longer available.", 3);
    } else if (values.zone_id != null && Number(rows[0].zone_id) !== Number(values.zone_id)) {
      add("party_id", "That Party does not belong to the selected Zone.", 3);
    }
  }

  if (values.zone_id != null) {
    const found = await existingIds("zones", [Number(values.zone_id)]);
    if (!found.has(Number(values.zone_id))) {
      add("zone_id", "Selection is no longer available.", 3);
    }
  }

  if (titles?.length) {
    const found = await existingIds("titles", titles.map((t) => t.title_id));
    titles.forEach((t, i) => {
      if (!found.has(t.title_id)) {
        add(`titles[${i}].title_id`, "Selection is no longer available.", 2);
      }
    });
  }

  if (sharafs?.length) {
    const found = await existingIds("sharafs", sharafs.map((s) => s.sharaf_id));
    sharafs.forEach((s, i) => {
      if (!found.has(s.sharaf_id)) {
        add(`sharafs[${i}].sharaf_id`, "Selection is no longer available.", 7);
      }
    });
  }

  if (skillIds?.length) {
    const found = await existingIds("skills", skillIds);
    skillIds.forEach((id, i) => {
      if (!found.has(id)) add(`skill_ids[${i}]`, "Selection is no longer available.", 4);
    });
  }

  if (visits?.length) {
    const found = await existingIds("places", visits.map((v) => v.place_id));
    visits.forEach((v, i) => {
      if (!found.has(v.place_id)) {
        add(`places_visited[${i}].place_id`, "Selection is no longer available.", 8);
      }
    });
  }

  if (ashara?.length) {
    const mozeIds = ashara.map((a) => a.moze_id).filter((id): id is number => id != null);
    const aqaMoulaIds = ashara
      .map((a) => a.aqa_moula_ashara_id)
      .filter((id): id is number => id != null);
    const mohallahIds = ashara
      .map((a) => a.mohallah_id)
      .filter((id): id is number => id != null);
    const venueIds = ashara.map((a) => a.venue_id).filter((id): id is number => id != null);

    const foundMoze = await existingIds("mozes", mozeIds);
    const foundMohallah = await existingIds("mohallahs", mohallahIds);
    const foundAqaMoula = await existingIds("aqa_moula_asharas", aqaMoulaIds);
    // Existence only, NOT is_active: Tab 9 offers inactive venues deliberately (FR-077c), so
    // checking the flag here would refuse exactly the values the form invites.
    const foundVenue = await existingIds("venues", venueIds);

    ashara.forEach((a, i) => {
      if (a.moze_id != null && !foundMoze.has(a.moze_id)) {
        add(`ashara_attendances[${i}].moze_id`, "Selection is no longer available.", 9);
      }
      if (a.aqa_moula_ashara_id != null && !foundAqaMoula.has(a.aqa_moula_ashara_id)) {
        add(
          `ashara_attendances[${i}].aqa_moula_ashara_id`,
          "Selection is no longer available.",
          9
        );
      }
      if (a.venue_id != null && !foundVenue.has(a.venue_id)) {
        add(`ashara_attendances[${i}].venue_id`, "Selection is no longer available.", 9);
      }
      if (a.mohallah_id != null && !foundMohallah.has(a.mohallah_id)) {
        add(`ashara_attendances[${i}].mohallah_id`, "Selection is no longer available.", 9);
      }
    });
  }
}
