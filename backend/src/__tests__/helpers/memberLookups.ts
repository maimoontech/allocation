import { pool } from "../../db/pool";
import { ensureFixtures } from "./fixtures";

/**
 * Seeded lookup rows and member-owned-row cleanup, shared by the profile suites.
 *
 * Five of the module's lookups ship intentionally empty — titles, sharafs, halqas, mozes and
 * places — because nobody has supplied the authoritative values yet. Several requirements can
 * only be exercised against a non-empty list, so these tests seed their own clearly-marked
 * rows and remove them afterwards, leaving production's empty state untouched.
 *
 * Extracted from `memberProfile.test.ts` when `memberRepeatables.test.ts` needed the same
 * rows. Duplicating it would have meant two files seeding the same marker into the same
 * tables, where one file's teardown could remove what the other still needed.
 */

export const LOOKUP_MARKER = "__TEST_LOOKUP__";

/** The second zone and party, so the Tab 3 cross-zone rule can be tested for real. */
const OTHER_ZONE_NAME = "__TEST_ZONE_OTHER__";
const OTHER_PARTY_ITS = "99900009";

export type SeededLookups = {
  titleId: number;
  sharafId: number;
  halqaId: number;
  mozeId: number;
  aqaMoulaAsharaId: number;
  placeA: number;
  placeB: number;
  maritalId: number;
  sanadId: number;
  freqId: number;
  methodId: number;
  skillId: number;
  zoneId: number;
  partyId: number;
  otherZoneId: number;
  otherPartyId: number;
  mohallahId: number;
};

/** Every lookup table these suites seed, with its name column. */
const LOOKUP_TABLES = [
  ["titles", "title_name"],
  ["sharafs", "sharaf_name"],
  ["halqas", "halqa_name"],
  ["mozes", "moze_name"],
  ["places", "place_name"],
  ["marital_statuses", "marital_status_name"],
  ["skills", "skill_name"],
  ["tamreen_frequencies", "tamreen_frequency_name"],
  ["tamreen_methods", "tamreen_method_name"],
  ["sanads", "sanad_name"],
  ["aqa_moula_asharas", "aqa_moula_ashara_name"]
] as const;

export async function seedLookup(
  table: string,
  nameColumn: string,
  label: string
): Promise<number> {
  await pool.query(
    `INSERT INTO ${table} (${nameColumn}, display_order, is_active, is_draft)
     VALUES (:name, 1, 1, 1)
     ON DUPLICATE KEY UPDATE is_active = 1`,
    { name: label }
  );
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM ${table} WHERE ${nameColumn} = :name LIMIT 1`,
    { name: label }
  );
  return Number(rows[0].id);
}

export async function seedAllLookups(): Promise<SeededLookups> {
  const fixtures = await ensureFixtures();

  await pool.query(
    `INSERT INTO zones (zone_name, coordinator_name, password_hash)
     VALUES (:n, 'Other Zone Coordinator', 'x')
     ON DUPLICATE KEY UPDATE coordinator_name = VALUES(coordinator_name)`,
    { n: OTHER_ZONE_NAME }
  );
  const [otherZoneRows] = await pool.query<any[]>(
    "SELECT id FROM zones WHERE zone_name = :n",
    { n: OTHER_ZONE_NAME }
  );
  const otherZoneId = Number(otherZoneRows[0].id);

  await pool.query(
    `INSERT INTO parties (its_no, leader_name, party_name, zone_id, category, is_active, password_hash)
     VALUES (:i, 'Other Leader', '__TEST_PARTY_OTHER__', :z, 'A', 1, 'x')
     ON DUPLICATE KEY UPDATE zone_id = VALUES(zone_id)`,
    { i: OTHER_PARTY_ITS, z: otherZoneId }
  );
  const [otherPartyRows] = await pool.query<any[]>(
    "SELECT id FROM parties WHERE its_no = :i",
    { i: OTHER_PARTY_ITS }
  );

  return {
    titleId: await seedLookup("titles", "title_name", `${LOOKUP_MARKER} Title`),
    sharafId: await seedLookup("sharafs", "sharaf_name", `${LOOKUP_MARKER} Sharaf`),
    halqaId: await seedLookup("halqas", "halqa_name", `${LOOKUP_MARKER} Halqa`),
    mozeId: await seedLookup("mozes", "moze_name", `${LOOKUP_MARKER} Moze`),
    aqaMoulaAsharaId: await seedLookup(
      "aqa_moula_asharas",
      "aqa_moula_ashara_name",
      `${LOOKUP_MARKER} Aqa Moula Ashara`
    ),
    placeA: await seedLookup("places", "place_name", `${LOOKUP_MARKER} Place A`),
    placeB: await seedLookup("places", "place_name", `${LOOKUP_MARKER} Place B`),
    maritalId: await seedLookup(
      "marital_statuses",
      "marital_status_name",
      `${LOOKUP_MARKER} Married`
    ),
    sanadId: await seedLookup("sanads", "sanad_name", `${LOOKUP_MARKER} Sanad`),
    freqId: await seedLookup(
      "tamreen_frequencies",
      "tamreen_frequency_name",
      `${LOOKUP_MARKER} Weekly`
    ),
    methodId: await seedLookup("tamreen_methods", "tamreen_method_name", `${LOOKUP_MARKER} Self`),
    skillId: await seedLookup("skills", "skill_name", `${LOOKUP_MARKER} Skill`),
    zoneId: fixtures.zoneId,
    partyId: fixtures.partyId,
    mohallahId: fixtures.mohallahId,
    otherZoneId,
    otherPartyId: Number(otherPartyRows[0].id)
  };
}

export async function removeSeededLookups() {
  for (const [table, col] of LOOKUP_TABLES) {
    await pool.query(`DELETE FROM ${table} WHERE ${col} LIKE :p`, { p: `${LOOKUP_MARKER}%` });
  }
  await pool.query("DELETE FROM parties WHERE its_no = :i", { i: OTHER_PARTY_ITS });
  await pool.query("DELETE FROM zones WHERE zone_name = :n", { n: OTHER_ZONE_NAME });
}

/**
 * Clears every row a member owns.
 *
 * The repeatable tables hang off `member_accounts`, NOT off `member_profiles` (see
 * data-model.md section 6), so deleting the profile row does not remove titles, sharafs,
 * skills, visits or attendances. Those rows reference the seeded lookups with
 * ON DELETE RESTRICT, so leaving them behind makes the lookup cleanup fail — which is
 * exactly what happened the first time these suites ran.
 */
export async function clearMemberData(itsNo: string) {
  const [rows] = await pool.query<any[]>(
    "SELECT id FROM member_accounts WHERE its_no = :i",
    { i: itsNo }
  );
  if (!rows[0]) return;
  const id = Number(rows[0].id);

  // member_place_visit_years cascades from member_place_visits.
  for (const table of [
    "member_place_visits",
    "member_ashara_attendances",
    "member_skills",
    "member_sharafs",
    "member_titles",
    "member_photos",
    "member_profiles"
  ]) {
    await pool.query(`DELETE FROM ${table} WHERE member_account_id = :id`, { id });
  }
}
