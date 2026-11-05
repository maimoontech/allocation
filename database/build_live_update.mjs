#!/usr/bin/env node
/**
 * Builds database/MEMBERSHIP_LIVE_INSTALL.sql from the two approved source scripts.
 *
 * WHY GENERATE IT RATHER THAN HAND-WRITE IT.
 *
 * A live migration is best handed over as ONE self-contained file: it can be run from any
 * directory, pasted into any client, or emailed to whoever has production access, with no
 * chance of running two files in the wrong order or forgetting the second one. (`SOURCE` would
 * avoid duplication, but it is a mysql-client command resolved against the client's working
 * directory, which is one more thing to get wrong during a live run.)
 *
 * But a hand-maintained copy of 800 lines of DDL is a second source of truth that drifts
 * silently the first time someone edits the schema and forgets the copy. So the combined file
 * is generated, and carries the SHA-256 of each source. `--check` re-derives it and fails if
 * the output no longer matches its sources, which is what makes the drift loud instead of
 * silent.
 *
 *   node database/build_live_update.mjs            # write the file
 *   node database/build_live_update.mjs --check    # verify it is current (exit 1 if not)
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// The output sits at the top of database/ under a deliberately shouty name, and the sources it
// is built from sit in database/sources/. The folder previously held membership_live_update.sql
// next to membership_schema.sql, membership_seed.sql and membership_rollback.sql — four files
// whose names differ by one word, only one of which should ever be run against production. That
// is a mistake waiting to happen, and it very nearly was one.
const OUTPUT = join(here, "MEMBERSHIP_LIVE_INSTALL.sql");
const SOURCE_DIR = join(here, "sources");

const SOURCES = [
  { name: "membership_schema.sql", title: "PART 1 OF 2 — SCHEMA (20 new tables)" },
  { name: "membership_seed.sql", title: "PART 2 OF 2 — SEED (lookup values)" }
];

const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

function banner(line) {
  return [
    "-- " + "=".repeat(74),
    "-- " + line,
    "-- " + "=".repeat(74)
  ].join("\n");
}

/**
 * Runs before anything is created, and stops the script if the target looks wrong.
 *
 * MySQL has no `IF ... THEN RAISE` outside a routine, so the guard is a SIGNAL inside a
 * prepared block. The check is for `parties` — a table that exists in this application and
 * would not exist in an unrelated database. Pointing a migration at the wrong schema is the
 * mistake with the worst consequences and the one nobody expects to make.
 */
const PREFLIGHT = `
${banner("PRE-FLIGHT — refuses to run against the wrong database")}

SELECT DATABASE() AS target_database, VERSION() AS mysql_version, NOW() AS started_at;

-- Aborts unless this looks like the MPSS database. 'parties' is a table this application
-- owns and an unrelated schema would not have.
DROP PROCEDURE IF EXISTS _membership_preflight;
DELIMITER //
CREATE PROCEDURE _membership_preflight()
BEGIN
  DECLARE v_parties INT DEFAULT 0;
  DECLARE v_zones INT DEFAULT 0;

  SELECT COUNT(*) INTO v_parties
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parties';

  SELECT COUNT(*) INTO v_zones
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'zones';

  IF v_parties = 0 OR v_zones = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'ABORTED: this does not look like the MPSS database (no parties/zones table). Check which database you are connected to.';
  END IF;
END //
DELIMITER ;
CALL _membership_preflight();
DROP PROCEDURE _membership_preflight;

-- BEFORE state. Every one of these numbers must be identical in the AFTER block at the
-- end of this script: the migration is additive and touches no existing table (FR-106).
SELECT 'BEFORE' AS phase, 'admins' AS table_name, COUNT(*) AS rows_now FROM admins
UNION ALL SELECT 'BEFORE', 'zones',               COUNT(*) FROM zones
UNION ALL SELECT 'BEFORE', 'mohallahs',           COUNT(*) FROM mohallahs
UNION ALL SELECT 'BEFORE', 'parties',             COUNT(*) FROM parties
UNION ALL SELECT 'BEFORE', 'venues',              COUNT(*) FROM venues
UNION ALL SELECT 'BEFORE', 'miqaats',             COUNT(*) FROM miqaats
UNION ALL SELECT 'BEFORE', 'schedules',           COUNT(*) FROM schedules
UNION ALL SELECT 'BEFORE', 'schedule_edits',      COUNT(*) FROM schedule_edits
UNION ALL SELECT 'BEFORE', 'ratings',             COUNT(*) FROM ratings
UNION ALL SELECT 'BEFORE', 'performance_ratings', COUNT(*) FROM performance_ratings
UNION ALL SELECT 'BEFORE', 'party_venue_history', COUNT(*) FROM party_venue_history
UNION ALL SELECT 'BEFORE', 'refresh_tokens',      COUNT(*) FROM refresh_tokens
UNION ALL SELECT 'BEFORE', 'members_dormant',     COUNT(*) FROM members;

-- Already installed? 0 on a clean install, 20 on a re-run. Anything in between means an
-- earlier attempt stopped part way, which is fine: this script is idempotent, so running
-- it again finishes the job.
--
-- Counted from the explicit list rather than a LIKE pattern, because 10 of the 20 tables
-- are lookup lists (titles, sharafs, places...) whose names do not begin with "member".
-- A pattern match reported 10 on a fully-installed database, which read as a half-done
-- migration.
SELECT COUNT(*) AS module_tables_already_present
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'member_accounts','member_login_attempts','member_profiles','member_photos',
    'member_titles','member_sharafs','member_skills','member_place_visits',
    'member_place_visit_years','member_ashara_attendances',
    'titles','sharafs','halqas','mozes','places','sanads',
    'marital_statuses','skills','tamreen_frequencies','tamreen_methods'
  );
`;

const VERIFY = `
${banner("AFTER — compare these numbers with the BEFORE block above")}

-- All 20 module tables present.
SELECT COUNT(*) AS module_tables_present
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'member_accounts','member_login_attempts','member_profiles','member_photos',
    'member_titles','member_sharafs','member_skills','member_place_visits',
    'member_place_visit_years','member_ashara_attendances',
    'titles','sharafs','halqas','mozes','places','sanads',
    'marital_statuses','skills','tamreen_frequencies','tamreen_methods'
  );
-- Expected: 20

-- Every module table must be utf8mb4_general_ci. Anything listed here inherited the
-- database default instead, and an its_no comparison against an existing table will
-- fail with error 1267. Expected: no rows.
SELECT TABLE_NAME, TABLE_COLLATION AS wrong_collation
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_COLLATION <> 'utf8mb4_general_ci'
  AND TABLE_NAME IN (
    'member_accounts','member_login_attempts','member_profiles','member_photos',
    'member_titles','member_sharafs','member_skills','member_place_visits',
    'member_place_visit_years','member_ashara_attendances',
    'titles','sharafs','halqas','mozes','places','sanads',
    'marital_statuses','skills','tamreen_frequencies','tamreen_methods'
  );

-- BMI must be a VIRTUAL generated column: the application never writes it.
SELECT COLUMN_NAME, EXTRA
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_profiles' AND COLUMN_NAME = 'bmi';
-- Expected: VIRTUAL GENERATED

-- The five photo approval columns must be present. CREATE TABLE IF NOT EXISTS skips an
-- existing table entirely, columns and all, so on a database that ran an earlier version
-- of this script they arrive through the backfill instead. Either way: 5 and 2.
SELECT COUNT(*) AS approval_columns_present
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_photos'
  AND COLUMN_NAME IN ('approval_status','approved_by','approved_by_role',
                      'approved_at','rejection_reason');
-- Expected: 5

SELECT COUNT(DISTINCT INDEX_NAME) AS approval_indexes_present
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_photos'
  AND INDEX_NAME IN ('idx_member_photos_approval','idx_member_photos_approved_by');
-- Expected: 2

-- All ten lookup lists, with the values this module has actually been used with.
-- An admin can edit any of them afterwards under "Member Lists" in the admin panel.
--
-- still_draft must be 0 everywhere: every value shipped here has been reviewed.
-- tamreen_methods reads 4 rows / 4 active on a first run; on a database that received
-- the earlier seed it reads 10 rows / 4 active, the six rejected proposals having been
-- deactivated rather than deleted.
SELECT 'titles' AS lookup_list, COUNT(*) AS rows_now,
       SUM(is_active) AS active_now, SUM(is_draft) AS still_draft FROM titles
UNION ALL SELECT 'sharafs',             COUNT(*), SUM(is_active), SUM(is_draft) FROM sharafs
UNION ALL SELECT 'halqas',              COUNT(*), SUM(is_active), SUM(is_draft) FROM halqas
UNION ALL SELECT 'mozes',               COUNT(*), SUM(is_active), SUM(is_draft) FROM mozes
UNION ALL SELECT 'places',              COUNT(*), SUM(is_active), SUM(is_draft) FROM places
UNION ALL SELECT 'sanads',              COUNT(*), SUM(is_active), SUM(is_draft) FROM sanads
UNION ALL SELECT 'marital_statuses',    COUNT(*), SUM(is_active), SUM(is_draft) FROM marital_statuses
UNION ALL SELECT 'skills',              COUNT(*), SUM(is_active), SUM(is_draft) FROM skills
UNION ALL SELECT 'tamreen_frequencies', COUNT(*), SUM(is_active), SUM(is_draft) FROM tamreen_frequencies
UNION ALL SELECT 'tamreen_methods',     COUNT(*), SUM(is_active), SUM(is_draft) FROM tamreen_methods;
-- Expected: titles 2, sharafs 3, halqas 2, mozes 5, places 5, sanads 10,
--           marital_statuses 4, skills 45, tamreen_frequencies 6, tamreen_methods 4
--           — all active, none draft.

-- AFTER state. Compare line by line with BEFORE. Any difference means something other
-- than this script ran, because nothing here touches an existing table.
SELECT 'AFTER' AS phase, 'admins' AS table_name, COUNT(*) AS rows_now FROM admins
UNION ALL SELECT 'AFTER', 'zones',               COUNT(*) FROM zones
UNION ALL SELECT 'AFTER', 'mohallahs',           COUNT(*) FROM mohallahs
UNION ALL SELECT 'AFTER', 'parties',             COUNT(*) FROM parties
UNION ALL SELECT 'AFTER', 'venues',              COUNT(*) FROM venues
UNION ALL SELECT 'AFTER', 'miqaats',             COUNT(*) FROM miqaats
UNION ALL SELECT 'AFTER', 'schedules',           COUNT(*) FROM schedules
UNION ALL SELECT 'AFTER', 'schedule_edits',      COUNT(*) FROM schedule_edits
UNION ALL SELECT 'AFTER', 'ratings',             COUNT(*) FROM ratings
UNION ALL SELECT 'AFTER', 'performance_ratings', COUNT(*) FROM performance_ratings
UNION ALL SELECT 'AFTER', 'party_venue_history', COUNT(*) FROM party_venue_history
UNION ALL SELECT 'AFTER', 'refresh_tokens',      COUNT(*) FROM refresh_tokens
UNION ALL SELECT 'AFTER', 'members_dormant',     COUNT(*) FROM members;

SELECT 'Membership module applied.' AS result, NOW() AS finished_at;
`;

function build() {
  const parts = SOURCES.map((s) => ({
    ...s,
    text: readFileSync(join(SOURCE_DIR, s.name), "utf8")
  }));

  const header = [
    "-- " + "=".repeat(74),
    "-- MEMBERSHIP MODULE — LIVE DATABASE UPDATE",
    "-- " + "=".repeat(74),
    "--",
    "-- GENERATED FILE. Do not edit by hand.",
    "--   Sources : " + parts.map((p) => `${p.name} (sha256 ${sha(p.text)})`).join("\n--             "),
    "--   Rebuild : node database/build_live_update.mjs",
    "--   Verify  : node database/build_live_update.mjs --check",
    "--",
    "-- WHAT THIS DOES",
    "--   Creates 21 new tables and seeds 10 of the 11 lookup lists with reviewed values.",
    "--   The eleventh, aqa_moula_asharas, ships EMPTY on purpose — an administrator enters",
    "--   its values through the Dropdown Lists panel.",
    "--",
    "--   It does not touch any of the 13 PRE-EXISTING tables: no ALTER, no DROP, no",
    "--   UPDATE and no DELETE against one. That is why rollback is simply dropping the",
    "--   new tables, and why every existing row count printed at the start reappears",
    "--   unchanged at the end — compare them.",
    "--",
    "--   It DOES alter and update tables of its own where an older run left them",
    "--   incomplete: the member_photos approval backfill, and deactivating six",
    "--   tamreen_methods values that were proposed and then rejected. Both match",
    "--   nothing on a database that has never run this script, so on production they",
    "--   do nothing at all.",
    "--",
    "-- IT IS SAFE TO RE-RUN",
    "--   CREATE TABLE IF NOT EXISTS throughout, the seed uses ON DUPLICATE KEY, and the",
    "--   backfill adds each column and index only if absent. An interrupted run can",
    "--   simply be repeated.",
    "--",
    "-- IT REFUSES TO RUN AGAINST THE WRONG DATABASE",
    "--   The pre-flight aborts with SQLSTATE 45000 unless `parties` and `zones` exist.",
    "--",
    "-- THIS IS THE ONLY FILE YOU RUN AGAINST THE LIVE DATABASE",
    "--   It is self-contained: the schema and the seed are both inside it, in the right",
    "--   order, with the verification built in. Nothing else in database/ needs running.",
    "--   The other files are its two sources (database/sources/), changes already applied",
    "--   to live long ago (database/already-applied/), the original schema baseline",
    "--   (mpss_mysql.sql — never run that against live, it resets the admin password), and",
    "--   the rollback. See database/README.md.",
    "--",
    "-- HOW TO RUN IT",
    "--   Through the mysql CLI, NOT a driver: this file contains DELIMITER, which is a",
    "--   client command that drivers do not parse.",
    "--",
    "--     mysql -h <host> -u <user> -p <database> < MEMBERSHIP_LIVE_INSTALL.sql > run.log 2>&1",
    "--",
    "--   Keep run.log. It contains the BEFORE and AFTER tables you need to compare.",
    "--",
    "-- BEFORE YOU RUN IT",
    "--   1. Take a backup AND VERIFY IT RESTORES. An unverified backup is not a backup.",
    "--   2. Run it against a restored copy first. This was rehearsed that way on",
    "--      2026-10-30, including a full rollback and re-apply.",
    "--   3. Rebuild and commit backend/dist — `npm start` runs node dist/server.js, so a",
    "--      deploy without it ships a backend that has none of this module.",
    "--",
    "-- AFTERWARDS",
    "--   Compare BEFORE and AFTER line by line. Every number must match.",
    "--   Rollback, if needed: database/membership_rollback.sql (destructive — read its",
    "--   header first, and roll the frontend back before or with it).",
    "--",
    "-- " + "=".repeat(74),
    ""
  ].join("\n");

  const body = parts
    .map((p) => [banner(p.title), "", p.text.trimEnd(), ""].join("\n"))
    .join("\n");

  return [header, PREFLIGHT, body, VERIFY].join("\n");
}

const generated = build();

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUTPUT, "utf8");
  } catch {
    console.error("MEMBERSHIP_LIVE_INSTALL.sql is missing. Run: node database/build_live_update.mjs");
    process.exit(1);
  }
  if (current !== generated) {
    console.error(
      "MEMBERSHIP_LIVE_INSTALL.sql is out of date with its sources.\n" +
        "Run: node database/build_live_update.mjs"
    );
    process.exit(1);
  }
  console.log("MEMBERSHIP_LIVE_INSTALL.sql is current.");
  process.exit(0);
}

writeFileSync(OUTPUT, generated, "utf8");
console.log(
  `Wrote MEMBERSHIP_LIVE_INSTALL.sql (${generated.split("\n").length} lines) from ${SOURCES.length} sources.`
);
