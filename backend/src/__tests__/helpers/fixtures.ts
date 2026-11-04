import bcrypt from "bcryptjs";
import { pool } from "../../db/pool";

/**
 * Test fixtures for the authentication regression suite.
 *
 * These tests run against a local restore of production, so the fixtures are built to be
 * impossible to confuse with real data and impossible to leave behind:
 *
 *   - every name carries a `__TEST_` marker, and the ITS number is in a 999 range
 *   - nothing existing is ever read for update or modified
 *   - teardown deletes by marker, so it works even if a run is interrupted and repeated
 *   - the test zone cascades to its mohallah, venue and party, so one delete clears most of it
 *
 * Passwords are generated at run time rather than hard-coded as hashes, so the cost factor
 * always matches whatever the application uses.
 */

export const TEST_MARKER = "__TEST_";

export const TEST_CREDENTIALS = {
  admin: { username: "__test_admin__", password: "TestAdmin#2026" },
  zone: { name: "__TEST_ZONE__", password: "TestZone#2026" },
  party: { itsNo: "99900001", name: "__TEST_PARTY__", password: "TestParty#2026" },
  venue: { name: "__TEST_VENUE__", password: "TestVenue#2026" },

  /** Password change still outstanding — for the forced-change path. */
  memberFresh: { itsNo: "99900101", name: "__TEST_MEMBER_FRESH__", password: "TestMember#2026" },
  /** Password already chosen — signs straight in. */
  memberSettled: { itsNo: "99900102", name: "__TEST_MEMBER_SETTLED__", password: "TestMember#2026" },
  /** Deactivated — must be refused, with the same message as a wrong password. */
  memberInactive: { itsNo: "99900103", name: "__TEST_MEMBER_INACTIVE__", password: "TestMember#2026" },
  /** Used by the throttle tests, so their failed attempts do not affect the others. */
  memberThrottle: { itsNo: "99900104", name: "__TEST_MEMBER_THROTTLE__", password: "TestMember#2026" }
} as const;

/** Every test member ITS number starts with this, which teardown matches on. */
export const TEST_MEMBER_ITS_PREFIX = "999001";

const MOHALLAH_NAME = "__TEST_MOHALLAH__";
const MIQAAT_NAME = "__TEST_MIQAAT__";

export type Fixtures = {
  memberFreshId: number;
  memberSettledId: number;
  memberInactiveId: number;
  memberThrottleId: number;
  adminId: number;
  zoneId: number;
  mohallahId: number;
  venueId: number;
  partyId: number;
  miqaatId: number;
  /** A published schedule row for the test party — what the party should be able to see. */
  publishedScheduleId: number;
  /** Unpublished, same party — must be hidden from the party (is_published = 1 filter). */
  unpublishedScheduleId: number;
  /** Published, but belongs to a DIFFERENT party — must be hidden by party scoping. */
  otherPartyScheduleId: number;
  otherPartyId: number;
};

async function scalar<T = number>(sql: string, params?: Record<string, unknown>): Promise<T | null> {
  const [rows] = await pool.query<any[]>(sql, params ?? {});
  if (!rows.length) return null;
  return Object.values(rows[0])[0] as T;
}

/**
 * Creates the fixtures if they are not already present and returns their ids.
 *
 * Idempotent, so every test file can call it in `beforeAll` without coordinating with the
 * others, and an interrupted run leaves nothing that breaks the next one.
 */
/**
 * Clears the member login attempt log for every test ITS number.
 *
 * Needed by any file that makes repeated failed sign-ins: the throttle counts per address as
 * well as per account, and a whole test file's failures come from one address, so without
 * this a later test gets a 429 it did not ask for. Matches `999%`, which covers both the
 * fixture accounts and the deliberately-unknown numbers the tests probe with.
 */
export async function clearMemberLoginAttempts(): Promise<void> {
  await pool.query("DELETE FROM member_login_attempts WHERE its_no LIKE '999%'");
}

export async function ensureFixtures(): Promise<Fixtures> {
  const [adminHash, zoneHash, partyHash, venueHash] = await Promise.all([
    bcrypt.hash(TEST_CREDENTIALS.admin.password, 10),
    bcrypt.hash(TEST_CREDENTIALS.zone.password, 10),
    bcrypt.hash(TEST_CREDENTIALS.party.password, 10),
    bcrypt.hash(TEST_CREDENTIALS.venue.password, 10)
  ]);

  // --- admin ---
  await pool.query(
    `INSERT INTO admins (username, admin_name, password_hash)
     VALUES (:username, :admin_name, :password_hash)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    {
      username: TEST_CREDENTIALS.admin.username,
      admin_name: "Regression Test Admin",
      password_hash: adminHash
    }
  );
  const adminId = (await scalar("SELECT id FROM admins WHERE username = :u", {
    u: TEST_CREDENTIALS.admin.username
  }))!;

  // --- zone (zonal_head identity) ---
  await pool.query(
    `INSERT INTO zones (zone_name, coordinator_name, password_hash)
     VALUES (:zone_name, :coordinator_name, :password_hash)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    {
      zone_name: TEST_CREDENTIALS.zone.name,
      coordinator_name: "Regression Test Zone Coordinator",
      password_hash: zoneHash
    }
  );
  const zoneId = (await scalar("SELECT id FROM zones WHERE zone_name = :n", {
    n: TEST_CREDENTIALS.zone.name
  }))!;

  // --- mohallah, needed only so the venue has a parent ---
  await pool.query(
    `INSERT INTO mohallahs (zone_id, mohallah_name, coordinator_name, password_hash)
     VALUES (:zone_id, :mohallah_name, :coordinator_name, :password_hash)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    {
      zone_id: zoneId,
      mohallah_name: MOHALLAH_NAME,
      coordinator_name: "Regression Test Mohallah Coordinator",
      password_hash: zoneHash
    }
  );
  const mohallahId = (await scalar(
    "SELECT id FROM mohallahs WHERE zone_id = :z AND mohallah_name = :n",
    { z: zoneId, n: MOHALLAH_NAME }
  ))!;

  // --- venue (coordinator identity) ---
  await pool.query(
    `INSERT INTO venues (venue_name, mohallah_id, coordinator_name, password_hash, min_parties, max_parties, is_active)
     VALUES (:venue_name, :mohallah_id, :coordinator_name, :password_hash, 1, 5, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    {
      venue_name: TEST_CREDENTIALS.venue.name,
      mohallah_id: mohallahId,
      coordinator_name: "Regression Test Venue Coordinator",
      password_hash: venueHash
    }
  );
  const venueId = (await scalar(
    "SELECT id FROM venues WHERE mohallah_id = :m AND venue_name = :n",
    { m: mohallahId, n: TEST_CREDENTIALS.venue.name }
  ))!;

  // --- party (party identity, by ITS number) ---
  await pool.query(
    `INSERT INTO parties (its_no, leader_name, party_name, zone_id, category, is_active, password_hash)
     VALUES (:its_no, :leader_name, :party_name, :zone_id, 'A', 1, :password_hash)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    {
      its_no: TEST_CREDENTIALS.party.itsNo,
      leader_name: "Regression Test Party Leader",
      party_name: TEST_CREDENTIALS.party.name,
      zone_id: zoneId,
      password_hash: partyHash
    }
  );
  const partyId = (await scalar("SELECT id FROM parties WHERE its_no = :i", {
    i: TEST_CREDENTIALS.party.itsNo
  }))!;

  // --- miqaat, so schedule rows have a parent that cascades on cleanup ---
  const existingMiqaat = await scalar("SELECT id FROM miqaats WHERE miqaat_name = :n LIMIT 1", {
    n: MIQAAT_NAME
  });
  let miqaatId = existingMiqaat;
  if (!miqaatId) {
    const [res] = await pool.query<any>(
      `INSERT INTO miqaats (miqaat_name, english_date, hijri_date, is_active)
       VALUES (:n, :d, :h, 0)`,
      { n: MIQAAT_NAME, d: "2026-01-15", h: "Regression Test" }
    );
    miqaatId = res.insertId as number;
  }

  // Any pre-existing party, used only to prove that party scoping hides other parties' rows.
  // Read-only: the row itself is never modified.
  const otherPartyId = (await scalar(
    "SELECT id FROM parties WHERE its_no <> :i ORDER BY id LIMIT 1",
    { i: TEST_CREDENTIALS.party.itsNo }
  ))!;

  // --- schedule rows. uq_schedules_miqaat_party means one row per (miqaat, party), so the
  // published and unpublished rows for the test party need different miqaats. A second
  // test miqaat keeps both cases available without touching real scheduling data.
  const secondMiqaatName = `${MIQAAT_NAME}_2`;
  let secondMiqaatId = await scalar("SELECT id FROM miqaats WHERE miqaat_name = :n LIMIT 1", {
    n: secondMiqaatName
  });
  if (!secondMiqaatId) {
    const [res] = await pool.query<any>(
      `INSERT INTO miqaats (miqaat_name, english_date, hijri_date, is_active)
       VALUES (:n, :d, :h, 0)`,
      { n: secondMiqaatName, d: "2026-01-16", h: "Regression Test" }
    );
    secondMiqaatId = res.insertId as number;
  }

  async function ensureSchedule(miqaat: number, party: number, published: 0 | 1) {
    const found = await scalar(
      "SELECT id FROM schedules WHERE miqaat_id = :m AND party_id = :p LIMIT 1",
      { m: miqaat, p: party }
    );
    if (found) return found;
    const [res] = await pool.query<any>(
      `INSERT INTO schedules (miqaat_id, venue_id, party_id, is_manual, is_published, created_by_role, created_by_id)
       VALUES (:m, :v, :p, 0, :pub, 'admin', :admin)`,
      { m: miqaat, v: venueId, p: party, pub: published, admin: adminId }
    );
    return res.insertId as number;
  }

  const publishedScheduleId = await ensureSchedule(miqaatId!, partyId, 1);
  const unpublishedScheduleId = await ensureSchedule(secondMiqaatId!, partyId, 0);
  const otherPartyScheduleId = await ensureSchedule(miqaatId!, otherPartyId, 1);

  // --- member accounts, one per state the module has to handle ---
  const memberHash = await bcrypt.hash(TEST_CREDENTIALS.memberFresh.password, 10);

  async function ensureMember(
    creds: { itsNo: string; name: string },
    mustChange: 0 | 1,
    isActive: 0 | 1,
    changedAt: string | null
  ): Promise<number> {
    await pool.query(
      `INSERT INTO member_accounts
         (its_no, member_name, password_hash, must_change_password, password_changed_at, is_active)
       VALUES (:its_no, :member_name, :password_hash, :must_change, :changed_at, :is_active)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         must_change_password = VALUES(must_change_password),
         password_changed_at = VALUES(password_changed_at),
         is_active = VALUES(is_active)`,
      {
        its_no: creds.itsNo,
        member_name: creds.name,
        password_hash: memberHash,
        must_change: mustChange,
        changed_at: changedAt,
        is_active: isActive
      }
    );
    return (await scalar("SELECT id FROM member_accounts WHERE its_no = :i", { i: creds.itsNo }))!;
  }

  // `password_changed_at` is set well in the past for the settled accounts, so a token issued
  // during a test is always NEWER than it and is not rejected by the staleness check.
  const PAST = "2020-01-01 00:00:00";

  const memberFreshId = await ensureMember(TEST_CREDENTIALS.memberFresh, 1, 1, null);
  const memberSettledId = await ensureMember(TEST_CREDENTIALS.memberSettled, 0, 1, PAST);
  const memberInactiveId = await ensureMember(TEST_CREDENTIALS.memberInactive, 0, 0, PAST);
  const memberThrottleId = await ensureMember(TEST_CREDENTIALS.memberThrottle, 0, 1, PAST);

  // Throttle counters are per ITS number over a rolling window, so a previous run's failures
  // would leak into this one.
  await pool.query("DELETE FROM member_login_attempts WHERE its_no LIKE :p", {
    p: `${TEST_MEMBER_ITS_PREFIX}%`
  });

  return {
    memberFreshId,
    memberSettledId,
    memberInactiveId,
    memberThrottleId,
    adminId,
    zoneId,
    mohallahId,
    venueId,
    partyId,
    miqaatId: miqaatId!,
    publishedScheduleId: publishedScheduleId!,
    unpublishedScheduleId: unpublishedScheduleId!,
    otherPartyScheduleId: otherPartyScheduleId!,
    otherPartyId
  };
}

/**
 * Removes everything `ensureFixtures` created, identified by marker rather than by id so it
 * works after an interrupted run.
 *
 * Order matters: schedules hang off the test miqaats and cascade when those go; the test
 * zone cascades to its mohallah, venue and party. Refresh tokens have no foreign key, so
 * the rows created by logging in during the tests must be deleted explicitly or they
 * accumulate.
 */
export async function destroyFixtures(): Promise<void> {
  // --- member fixtures. member_profiles and member_photos cascade from the account; the
  // refresh tokens and login attempts do not, so they go explicitly.
  const [memberRows] = await pool.query<any[]>(
    "SELECT id FROM member_accounts WHERE its_no LIKE :p",
    { p: `${TEST_MEMBER_ITS_PREFIX}%` }
  );
  for (const row of memberRows) {
    await pool.query(
      "DELETE FROM refresh_tokens WHERE user_role = 'member' AND user_id = :id",
      { id: row.id }
    );
  }
  await pool.query("DELETE FROM member_login_attempts WHERE its_no LIKE :p", {
    p: `${TEST_MEMBER_ITS_PREFIX}%`
  });
  await pool.query("DELETE FROM member_accounts WHERE its_no LIKE :p", {
    p: `${TEST_MEMBER_ITS_PREFIX}%`
  });

  const [adminRows] = await pool.query<any[]>("SELECT id FROM admins WHERE username = :u", {
    u: TEST_CREDENTIALS.admin.username
  });
  const [zoneRows] = await pool.query<any[]>("SELECT id FROM zones WHERE zone_name = :n", {
    n: TEST_CREDENTIALS.zone.name
  });
  const [partyRows] = await pool.query<any[]>("SELECT id FROM parties WHERE its_no = :i", {
    i: TEST_CREDENTIALS.party.itsNo
  });
  const [venueRows] = await pool.query<any[]>(
    "SELECT v.id FROM venues v WHERE v.venue_name = :n",
    { n: TEST_CREDENTIALS.venue.name }
  );

  // Sessions created by the tests. No FK, so these would survive the cascades.
  const deletions: Array<[string, Record<string, unknown>]> = [];
  if (adminRows[0]) deletions.push(["admin", { id: adminRows[0].id }]);
  if (zoneRows[0]) deletions.push(["zonal_head", { id: zoneRows[0].id }]);
  if (partyRows[0]) deletions.push(["party", { id: partyRows[0].id }]);
  if (venueRows[0]) deletions.push(["coordinator", { id: venueRows[0].id }]);
  for (const [role, { id }] of deletions) {
    await pool.query(
      "DELETE FROM refresh_tokens WHERE user_role = :role AND user_id = :id",
      { role, id }
    );
  }

  // The loop above deletes by (role, id), so it misses a token minted under a role string the
  // application does not recognise. `authCoordinatorFallthrough.test.ts` creates exactly that,
  // deliberately: it documents the pre-existing unguarded fallthrough by signing in with
  // `role: "not_a_real_role"` and real venue credentials, which currently succeeds.
  //
  // Those rows were accumulating one per test run against a copy of production — 25 of them
  // had built up before the T119 rehearsal noticed, by which point a `refresh_tokens` count
  // could no longer be compared across runs.
  //
  // Deleting by id alone would be wrong: `user_id` is not unique across roles, so it could
  // take a real user's session. Any role OUTSIDE the five the application issues can only be
  // a test artefact, which makes this both precise and safe.
  await pool.query(
    `DELETE FROM refresh_tokens
     WHERE user_role NOT IN ('admin', 'zonal_head', 'party', 'coordinator', 'member')`
  );

  // Schedules cascade from the test miqaats.
  await pool.query("DELETE FROM miqaats WHERE miqaat_name LIKE :p", { p: `${MIQAAT_NAME}%` });

  // The test party is deleted explicitly as well as by the zone cascade, in case a previous
  // run created it under a different zone.
  await pool.query("DELETE FROM parties WHERE its_no = :i", { i: TEST_CREDENTIALS.party.itsNo });

  // Cascades to mohallahs -> venues, and to any remaining test party.
  await pool.query("DELETE FROM zones WHERE zone_name = :n", { n: TEST_CREDENTIALS.zone.name });

  await pool.query("DELETE FROM admins WHERE username = :u", {
    u: TEST_CREDENTIALS.admin.username
  });
}
