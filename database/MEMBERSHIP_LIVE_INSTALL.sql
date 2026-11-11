-- ==========================================================================
-- MEMBERSHIP MODULE — LIVE DATABASE UPDATE
-- ==========================================================================
--
-- GENERATED FILE. Do not edit by hand.
--   Sources : membership_schema.sql (sha256 cde87bda3d68cfec)
--             membership_seed.sql (sha256 5f21b37792e7ad7c)
--   Rebuild : node database/build_live_update.mjs
--   Verify  : node database/build_live_update.mjs --check
--
-- WHAT THIS DOES
--   Creates 24 new tables and seeds 10 of the 11 lookup lists with reviewed values.
--   The eleventh, aqa_moula_asharas, ships EMPTY on purpose — an administrator enters
--   its values through the Dropdown Lists panel.
--
--   It does not touch any of the 13 PRE-EXISTING tables: no ALTER, no DROP, no
--   UPDATE and no DELETE against one. That is why rollback is simply dropping the
--   new tables, and why every existing row count printed at the start reappears
--   unchanged at the end — compare them.
--
--   It DOES alter and update tables of its own where an older run left them
--   incomplete: the member_photos approval backfill, and deactivating six
--   tamreen_methods values that were proposed and then rejected. Both match
--   nothing on a database that has never run this script, so on production they
--   do nothing at all.
--
-- IT IS SAFE TO RE-RUN
--   CREATE TABLE IF NOT EXISTS throughout, the seed uses ON DUPLICATE KEY, and the
--   backfill adds each column and index only if absent. An interrupted run can
--   simply be repeated.
--
-- IT REFUSES TO RUN AGAINST THE WRONG DATABASE
--   The pre-flight aborts with SQLSTATE 45000 unless `parties` and `zones` exist.
--
-- THIS IS THE ONLY FILE YOU RUN AGAINST THE LIVE DATABASE
--   It is self-contained: the schema and the seed are both inside it, in the right
--   order, with the verification built in. Nothing else in database/ needs running.
--   The other files are its two sources (database/sources/), changes already applied
--   to live long ago (database/already-applied/), the original schema baseline
--   (mpss_mysql.sql — never run that against live, it resets the admin password), and
--   the rollback. See database/README.md.
--
-- HOW TO RUN IT
--   Through the mysql CLI, NOT a driver: this file contains DELIMITER, which is a
--   client command that drivers do not parse.
--
--     mysql -h <host> -u <user> -p <database> < MEMBERSHIP_LIVE_INSTALL.sql > run.log 2>&1
--
--   Keep run.log. It contains the BEFORE and AFTER tables you need to compare.
--
-- BEFORE YOU RUN IT
--   1. Take a backup AND VERIFY IT RESTORES. An unverified backup is not a backup.
--   2. Run it against a restored copy first. This was rehearsed that way on
--      2026-10-30, including a full rollback and re-apply.
--   3. Rebuild and commit backend/dist — `npm start` runs node dist/server.js, so a
--      deploy without it ships a backend that has none of this module.
--
-- AFTERWARDS
--   Compare BEFORE and AFTER line by line. Every number must match.
--   Rollback, if needed: database/membership_rollback.sql (destructive — read its
--   header first, and roll the frontend back before or with it).
--
-- ==========================================================================


-- ==========================================================================
-- PRE-FLIGHT — refuses to run against the wrong database
-- ==========================================================================

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

-- ==========================================================================
-- PART 1 OF 2 — SCHEMA (20 new tables)
-- ==========================================================================

-- ============================================================================
-- Membership Module — schema migration
-- Feature : 001-membership-module
-- Date    : 2026-10-29
-- Engine  : MySQL / InnoDB / utf8mb4_unicode_ci
--
-- STATUS: APPROVED AND REHEARSED. Not yet applied to production.
--
--   Rehearsed end to end on a restored copy of production on 2026-10-30: applied,
--   rolled back with membership_rollback.sql, and re-applied. All 13 pre-existing
--   tables were identical by exact COUNT(*) and by CHECKSUM TABLE across the whole
--   cycle. See quickstart.md §8 for the full result.
--
-- FOR A LIVE RUN, PREFER database/membership_live_update.sql — one self-contained
-- script that runs this file and the seed together with before/after verification.
-- This file remains the source of truth for the schema itself.
--
-- PROPERTIES
--   Additive only  : no ALTER, no DROP, no UPDATE or DELETE against any existing
--                    table. This is how FR-106 is satisfied by construction, and it
--                    is what makes rollback a matter of dropping new tables.
--   Idempotent     : CREATE TABLE IF NOT EXISTS throughout, so a partial run can be
--                    repeated safely. (Contrast database/add_*.sql, which are not.)
--   Not in boot    : do NOT add any of this to backend/src/db/ensureSchema.ts. That
--                    runs before app.listen and a failed ALTER blocks startup.
--                    See DATABASE.md:98-102 and research.md R9.
--
-- BEFORE RUNNING
--   1. GET /api/v1/import-export/database-backup  (admin) — it iterates SHOW TABLES,
--      so it captures the current state in full.
--   2. Record the row counts in quickstart.md §1, for the SC-013 comparison.
--   3. Run against a restored copy of production first, not production.
--
-- DELIMITER below is a mysql-client command. Run this file through the mysql CLI,
-- not through a driver that does not understand it.
--
-- COLLATION — DO NOT "SIMPLIFY" THIS
--   Every table below declares COLLATE=utf8mb4_general_ci explicitly. That is not
--   redundant, and removing it breaks things.
--
--   Verified against a local restore of production on 2026-10-29:
--     - all 13 existing tables are utf8mb4_general_ci
--     - the DATABASE default is utf8mb4_0900_ai_ci  (the MySQL 8 default)
--
--   So a table created with only "DEFAULT CHARSET=utf8mb4" inherits 0900_ai_ci and
--   does NOT match the existing tables. Any comparison between a new VARCHAR column
--   and an existing one — most obviously member_accounts.its_no against
--   parties.its_no — then fails with error 1267, "Illegal mix of collations".
--
--   Note this also means database/mpss_mysql.sql is wrong: it declares the database
--   as utf8mb4_unicode_ci, but the real database is not. Trust the live schema.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Guard: the generated bmi column in section 3 needs MySQL 5.7 or later.
--    Fails loudly and early rather than halfway through. research.md R6 has the
--    fallback if this aborts.
-- ----------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS mm_assert_mysql_version;

DELIMITER $$
CREATE PROCEDURE mm_assert_mysql_version()
BEGIN
  DECLARE v_major INT;
  DECLARE v_minor INT;
  SET v_major = CAST(SUBSTRING_INDEX(VERSION(), '.', 1) AS UNSIGNED);
  SET v_minor = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(VERSION(), '.', 2), '.', -1) AS UNSIGNED);
  IF (v_major * 100 + v_minor) < 507 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Membership migration aborted: generated columns require MySQL 5.7+. See specs/001-membership-module/research.md R6 for the fallback.';
  END IF;
END$$
DELIMITER ;

CALL mm_assert_mysql_version();
DROP PROCEDURE mm_assert_mysql_version;


-- ----------------------------------------------------------------------------
-- 1. Lookup tables (FR-093)
--
--    Created first, because sections 3 and 4 reference them.
--
--    All ten share one shape:
--      display_order  control order without relying on insertion order
--      is_active      retire a value without breaking rows that reference it
--      is_draft       FR-094 — 1 until reviewed; the UI renders these as
--                     "DRAFT - NEEDS REVIEW". Clearing it is a data edit, not a
--                     code change.
--
--    No new Zone, Party or Mohallah table: those exist and are used directly (FR-092).
--    places is new and separate from the existing miqaats table, which holds
--    dated scheduling occurrences rather than repeatable types. See data-model.md §5.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS titles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title_name VARCHAR(150) NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_draft TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_titles_name (title_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS sharafs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sharaf_name VARCHAR(150) NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_draft TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sharafs_name (sharaf_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS halqas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  halqa_name VARCHAR(150) NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_draft TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_halqas_name (halqa_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS mozes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  moze_name VARCHAR(150) NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_draft TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mozes_name (moze_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- The place Ashara Mubaraka was held with Aqa Moula TUS in a given year. Deliberately
-- separate from `mozes`: a Moze is where a member's own Jamaat is, which is the right
-- answer when they attended with their Aamil. Where Aqa Moula held Ashara that year is a
-- different question with a different, much shorter list of answers.
--
-- Ships EMPTY, like the other five domain lookups. Filling it would mean inventing or
-- mis-stating a religious calendar; an administrator enters the values.
--
-- `hijri_year` ties each entry to the one year it answers (FR-077b). Aqa Moula TUS holds
-- Ashara in one place a year, so the year alone determines the place and Tab 9 shows it
-- rather than asking for it. UNIQUE, because two places for one year would leave the form
-- unable to say which. NULL is allowed so an entry made before the column existed stays
-- valid until an administrator gives it a year; MySQL lets several NULLs share a unique key.
--
-- The NAME is deliberately NOT unique (FR-077c): Aqa Moula TUS has held Ashara in the same
-- place in more than one year, and each of those years needs its own entry. The year is what
-- identifies an entry, not the place.
CREATE TABLE IF NOT EXISTS aqa_moula_asharas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  aqa_moula_ashara_name VARCHAR(150) NOT NULL,
  hijri_year SMALLINT UNSIGNED NULL COMMENT 'FR-077b: the Hijri year Aqa Moula TUS held Ashara here. One place per year.',
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_draft TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_aqa_moula_asharas_year (hijri_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS places (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  place_name VARCHAR(150) NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_draft TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_places_name (place_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS sanads (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sanad_name VARCHAR(150) NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_draft TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sanads_name (sanad_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS marital_statuses (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  marital_status_name VARCHAR(150) NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_draft TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_marital_statuses_name (marital_status_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS skills (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  skill_name VARCHAR(150) NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_draft TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_skills_name (skill_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS tamreen_frequencies (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tamreen_frequency_name VARCHAR(150) NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_draft TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tamreen_frequencies_name (tamreen_frequency_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS tamreen_methods (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tamreen_method_name VARCHAR(150) NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_draft TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tamreen_methods_name (tamreen_method_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------------------------------------------------------
-- 2. Authentication
--
--    member_accounts is a NEW table. The dormant `members` table is not touched:
--    it has party_id NOT NULL (contradicting spec assumption 16), no auth columns,
--    and contents that cannot be verified from the repo. See research.md R1.
--
--    its_no is a plain UNIQUE column, NOT a foreign key to parties.its_no. A given
--    ITS Number may identify a member, a party, both or neither; an FK would require
--    every member to be a party leader and would couple the two credential sets that
--    FR-011 and FR-012 require to stay separate.
--
--    Spelled its_no to match parties.its_no, not its_number as the dormant table
--    spells it — one spelling across the schema beats consistency with a dead table.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS member_accounts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  its_no VARCHAR(20) NOT NULL,
  member_name VARCHAR(150) NULL COMMENT 'From the provisioning roster, so an admin list is readable before Tab 1 is filled',
  password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt cost 10, matching every existing role',
  must_change_password TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'FR-004, FR-017, FR-018',
  password_changed_at DATETIME NULL COMMENT 'NULL until the member sets their own. Drives FR-005 (do not reset) and FR-022 (reject tokens issued before it)',
  is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'FR-006, FR-007',
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_accounts_its_no (its_no),
  KEY idx_member_accounts_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Login throttling (FR-014). The system has none today: /auth/login is unthrottled
-- while running bcrypt cost 10 per attempt.
--
-- Deliberately NO foreign key on its_no: attempts against ITS Numbers that have no
-- account must also be throttled, and an FK would make recording those impossible.
--
-- The client address is stored as a salted SHA-256 hash, never raw. Equality is all
-- the throttle needs, and the raw address is personal data the feature does not require.
-- Database-backed rather than in-memory because the backend may run more than one
-- instance, and a per-process counter would simply be load-balanced past.

CREATE TABLE IF NOT EXISTS member_login_attempts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  its_no VARCHAR(20) NOT NULL COMMENT 'As submitted. No FK by design',
  ip_hash CHAR(64) NULL COMMENT 'Salted SHA-256 of the client address. Never the raw address',
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  succeeded TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_member_login_attempts_its (its_no, attempted_at),
  KEY idx_member_login_attempts_ip (ip_hash, attempted_at),
  KEY idx_member_login_attempts_at (attempted_at) COMMENT 'Supports pruning old rows on write'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- NOTE: refresh_tokens needs no change. It is polymorphic by user_role string with
-- no FK, so it already accepts user_role = 'member'.


-- ----------------------------------------------------------------------------
-- 3. Profile
--
--    Almost every column is nullable by design: FR-033 requires a member to save a
--    partially completed profile and return to it. Only the conditional rules in
--    data-model.md §7 can refuse a save, and they are enforced in the application
--    where they can name the offending field and tab (FR-029).
--
--    its_no is NOT duplicated here. It lives on member_accounts and is read through
--    the join, so FR-034's read-only guarantee has one source of truth.
--
--    zone_id and party_id use ON DELETE SET NULL, not CASCADE — the one place this
--    design departs from the schema's blanket CASCADE habit, and it must. Cascading
--    would delete a member's entire profile because their Zone or Party was removed.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS member_profiles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,

  -- Tab 1: Personal Information
  first_prefix ENUM('None','Sheikh','Mulla') NOT NULL DEFAULT 'None' COMMENT 'FR-035; also gates the Tab 2 prefix display, FR-043',
  name VARCHAR(100) NULL,
  father_prefix ENUM('None','Sheikh','Mulla') NOT NULL DEFAULT 'None',
  father_name VARCHAR(100) NULL,
  surname VARCHAR(100) NULL,
  dob_gregorian DATE NULL COMMENT 'FR-038',
  dob_hijri_day TINYINT UNSIGNED NULL COMMENT 'FR-039, derived server-side',
  dob_hijri_month TINYINT UNSIGNED NULL,
  dob_hijri_year SMALLINT UNSIGNED NULL,
  dob_hijri_text VARCHAR(50) NULL COMMENT 'Exactly what the member was shown, so display can never disagree with the record',
  nationality VARCHAR(100) NULL COMMENT 'FR-040a: free text. The brief asked for a field, not a managed list.',
  marital_status_id INT UNSIGNED NULL,
  residence_address TEXT NULL,
  mohallah_id INT UNSIGNED NULL COMMENT 'FR-040b: the member's own Mohallah, from the existing master list.',
  phone_no VARCHAR(25) NULL,
  mobile_no_1 VARCHAR(25) NULL,
  mobile_no_2 VARCHAR(25) NULL,
  whatsapp_no_1 VARCHAR(25) NULL,
  whatsapp_no_2 VARCHAR(25) NULL,
  email VARCHAR(190) NULL COMMENT '190 keeps it indexable under utf8mb4 if ever wanted',

  -- Tab 2: one per member; the Titles themselves repeat, in member_titles
  prefix_year SMALLINT UNSIGNED NULL COMMENT 'FR-044, range 1950-2026 checked in the application',

  -- Tab 3: Hizb
  zone_id INT UNSIGNED NULL COMMENT 'FR-047',
  party_id INT UNSIGNED NULL COMMENT 'FR-048; must belong to zone_id, checked in the application',
  hizb_role ENUM('Leader','Side Lead','Member') NULL COMMENT 'FR-049',
  zikr_e_hussain_since_year SMALLINT UNSIGNED NULL COMMENT 'FR-049a: Hijri year, 1375 AH to the current Hijri year. Floor is lower than the other profile years on purpose - this one reaches back further than a title or a sharaf.',
  registered_with_idaratuz_zakereen TINYINT(1) NULL COMMENT 'FR-049b: Yes/No. NULLABLE, so "not answered yet" is distinct from "no" - a checkbox would collapse the two.',
  five_kalam_uploaded_when VARCHAR(150) NULL COMMENT 'FR-049c: free text. The question asks WHEN, but the answer is whatever the member can recall, which is not reliably a date.',

  -- Tab 4: Occupation
  occupation_type ENUM('Job','Business') NULL,
  organisation_name VARCHAR(150) NULL COMMENT 'FR-051: one column; the label changes with the type, not the storage',
  designation VARCHAR(150) NULL COMMENT 'FR-052: only meaningful when occupation_type = Job',
  occupation_since_year SMALLINT UNSIGNED NULL,
  work_address TEXT NULL,
  work_phone_no VARCHAR(25) NULL,

  -- Tab 5: Education and Hifz
  education_level ENUM('Primary','Middle','Secondary','Intermediate','Bachelors','Masters','PhD') NULL,
  major_subjects VARCHAR(255) NULL,
  education_status ENUM('Complete','Ongoing') NULL,
  has_hifz_sanad TINYINT(1) NULL,
  sanad_id INT UNSIGNED NULL COMMENT 'FR-059: required when has_hifz_sanad = 1',
  hifz_current_surah VARCHAR(100) NULL,
  hifz_current_ayyah VARCHAR(50) NULL COMMENT 'Text, not numeric: members may write a range',
  hifz_last_update DATE NULL,

  -- Tab 6: Health and Fitness (sensitive: FR-065, FR-066)
  blood_group ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NULL COMMENT 'FR-061: a fixed medical standard, so an inline ENUM is right',
  is_regular_donor TINYINT(1) NULL,
  last_donation_date DATE NULL,
  height_cm DECIMAL(5,2) NULL COMMENT 'Centimetres, spec assumption 10. DECIMAL not FLOAT so 72.5 stores as 72.5',
  weight_kg DECIMAL(5,2) NULL COMMENT 'Kilograms',
  -- DECIMAL(6,2) and a GUARDED expression, both deliberate. `> 0` accepted a height typed
  -- in metres (1.75), which is a BMI of 228,571 -- and because this column is VIRTUAL that
  -- stayed invisible until an ALTER rebuilt the table and the server stopped booting.
  -- Within the bounds below the largest possible value is 500 / 0.5^2 = 2000.00, so the
  -- width is sufficient rather than merely larger.
  bmi DECIMAL(6,2) AS (
    IF(height_cm BETWEEN 50 AND 300 AND weight_kg BETWEEN 2 AND 500,
       ROUND(weight_kg / POW(height_cm / 100, 2), 2),
       NULL)
  ) VIRTUAL COMMENT 'FR-064. Generated, so MySQL rejects any write: no API or UI bug can overwrite it and it cannot drift from its inputs. NULL unless both inputs are plausible for a person',

  -- Tab 10: Asbaq
  asbaq_level ENUM('Zaher','Taweel','Haqiqat') NULL,
  halqa_id INT UNSIGNED NULL,
  asbaq_ustad VARCHAR(150) NULL COMMENT 'Free text: no Ustad lookup exists',

  -- Tab 11: Tamreen
  attends_karachi_tamreen TINYINT(1) NULL,
  tamreen_absence_reason TEXT NULL COMMENT 'FR-081: required when attends_karachi_tamreen = 0',
  party_tamreen_frequency_id INT UNSIGNED NULL,
  solo_tamreen_frequency_id INT UNSIGNED NULL COMMENT 'Same lookup as party frequency: one list, two questions',
  tamreen_method_id INT UNSIGNED NULL,
  takes_ustad_assistance TINYINT(1) NULL,
  uses_idaratuz_zakereen_books TINYINT(1) NULL,

  -- Tab 12: Other Sansta Khidmat
  khidmat_type ENUM('Sansta','Umoor','Both') NULL,
  sansta_name VARCHAR(150) NULL COMMENT 'FR-086: required when khidmat_type is Sansta or Both',
  umoor_name VARCHAR(150) NULL COMMENT 'FR-086: required when khidmat_type is Umoor or Both',
  khidmat_designation VARCHAR(150) NULL,
  khidmat_since_year SMALLINT UNSIGNED NULL COMMENT 'A year, spec assumption 8',

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_member_profiles_account (member_account_id) COMMENT 'Exactly one profile per member',
  KEY idx_member_profiles_zone (zone_id),
  KEY idx_member_profiles_party (party_id),

  CONSTRAINT fk_member_profiles_member_account_id
    FOREIGN KEY (member_account_id) REFERENCES member_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_profiles_zone_id
    FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE SET NULL,
  CONSTRAINT fk_member_profiles_party_id
    FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL,
  CONSTRAINT fk_member_profiles_marital_status_id
    FOREIGN KEY (marital_status_id) REFERENCES marital_statuses(id) ON DELETE SET NULL,
  -- RESTRICT, not SET NULL. `mohallahs` is pre-existing master data an administrator can
  -- delete from another panel entirely; SET NULL would silently erase the member's own
  -- answer without anyone being told. This is a foreign key FROM a module table TO a
  -- pre-existing one — no ALTER on mohallahs, so FR-106 holds.
  CONSTRAINT fk_member_profiles_mohallah_id
    FOREIGN KEY (mohallah_id) REFERENCES mohallahs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_member_profiles_sanad_id
    FOREIGN KEY (sanad_id) REFERENCES sanads(id) ON DELETE SET NULL,
  CONSTRAINT fk_member_profiles_halqa_id
    FOREIGN KEY (halqa_id) REFERENCES halqas(id) ON DELETE SET NULL,
  CONSTRAINT fk_member_profiles_party_tamreen_frequency_id
    FOREIGN KEY (party_tamreen_frequency_id) REFERENCES tamreen_frequencies(id) ON DELETE SET NULL,
  CONSTRAINT fk_member_profiles_solo_tamreen_frequency_id
    FOREIGN KEY (solo_tamreen_frequency_id) REFERENCES tamreen_frequencies(id) ON DELETE SET NULL,
  CONSTRAINT fk_member_profiles_tamreen_method_id
    FOREIGN KEY (tamreen_method_id) REFERENCES tamreen_methods(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- Photographs live in their own table, NOT as a column on member_profiles.
-- Profile reads happen on every form load; sharing the row would drag megabytes into
-- each one. Keeping the blob apart means profile queries stay cheap, and the UNIQUE
-- key makes FR-091 ("no previously stored image retrievable") a plain UPDATE of one
-- row — there is nowhere for an old image to survive.
--
-- MEDIUMBLOB holds 16MB against a 2MB application cap. LONGBLOB would only invite
-- larger uploads.

CREATE TABLE IF NOT EXISTS member_photos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,
  content_type VARCHAR(50) NOT NULL COMMENT 'image/jpeg, image/png or image/webp. Verified from magic bytes, not the declared value (FR-089)',
  byte_size INT UNSIGNED NOT NULL COMMENT 'Recorded so the 2MB cap can be audited after the fact',
  width SMALLINT UNSIGNED NULL,
  height SMALLINT UNSIGNED NULL,
  sha256 CHAR(64) NOT NULL COMMENT 'Lets an unchanged re-upload be detected without comparing blobs; also the ETag',
  image_data MEDIUMBLOB NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Approval workflow. An uploaded photograph is not visible to anyone but its owner
  -- until an admin or the member's own Zonal Head approves it, so a member cannot
  -- publish an arbitrary image to the roster by uploading it.
  --
  -- These five columns sit AFTER created_at/updated_at rather than beside the other
  -- image columns on purpose: that is where they land in an environment that already
  -- ran the earlier CREATE and picked them up through the backfill in section 3b
  -- below. Keeping one column order everywhere is what lets a schema diff between
  -- environments come back empty.
  --
  -- approved_by is deliberately NOT a foreign key. The approver may be a row in
  -- `admins` or a Zonal Head, which are different tables, so the pair
  -- (approved_by, approved_by_role) identifies them and no single FK can.
  approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT 'Photo approval status',
  approved_by INT UNSIGNED NULL COMMENT 'User ID who approved/rejected',
  approved_by_role ENUM('admin','zonal_head') NULL COMMENT 'Role of approver',
  approved_at DATETIME NULL COMMENT 'When approved/rejected',
  rejection_reason TEXT NULL COMMENT 'Reason for rejection',

  PRIMARY KEY (id),
  UNIQUE KEY uq_member_photos_account (member_account_id) COMMENT 'One photo per member',
  KEY idx_member_photos_approval (approval_status),
  KEY idx_member_photos_approved_by (approved_by, approved_by_role),
  CONSTRAINT fk_member_photos_member_account_id
    FOREIGN KEY (member_account_id) REFERENCES member_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------------------------------------------------------
-- 3b. Backfill: member_photos approval columns
--
--     WHY THIS EXISTS AND WHY IT IS NOT DEAD CODE
--       The CREATE TABLE above declares the five approval columns, so on a database
--       that has never run this script — production — this section finds them
--       present and does nothing.
--
--       It matters for a database that ran an EARLIER version of this script, when
--       member_photos had no approval columns. CREATE TABLE IF NOT EXISTS sees the
--       table already there and skips it ENTIRELY, columns and all. Without the
--       backfill below, re-running would silently leave such a database missing five
--       columns the application needs, while reporting success — the script claims
--       to be safe to re-run, and this is what makes that claim true rather than
--       merely plausible.
--
--     THIS IS NOT A VIOLATION OF THE ADDITIVE-ONLY RULE (FR-106)
--       member_photos is a table this module creates. FR-106 forbids altering the
--       13 PRE-EXISTING tables, and nothing here touches one.
--
--     Each column and index is added only if absent, so this is idempotent and can
--     be interrupted and repeated.
-- ----------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS mm_backfill_photo_approval;

DELIMITER $$
CREATE PROCEDURE mm_backfill_photo_approval()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_photos'
                   AND COLUMN_NAME = 'approval_status') THEN
    ALTER TABLE member_photos
      ADD COLUMN approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT 'Photo approval status';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_photos'
                   AND COLUMN_NAME = 'approved_by') THEN
    ALTER TABLE member_photos
      ADD COLUMN approved_by INT UNSIGNED NULL COMMENT 'User ID who approved/rejected';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_photos'
                   AND COLUMN_NAME = 'approved_by_role') THEN
    ALTER TABLE member_photos
      ADD COLUMN approved_by_role ENUM('admin','zonal_head') NULL COMMENT 'Role of approver';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_photos'
                   AND COLUMN_NAME = 'approved_at') THEN
    ALTER TABLE member_photos
      ADD COLUMN approved_at DATETIME NULL COMMENT 'When approved/rejected';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_photos'
                   AND COLUMN_NAME = 'rejection_reason') THEN
    ALTER TABLE member_photos
      ADD COLUMN rejection_reason TEXT NULL COMMENT 'Reason for rejection';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_photos'
                   AND INDEX_NAME = 'idx_member_photos_approval') THEN
    ALTER TABLE member_photos ADD INDEX idx_member_photos_approval (approval_status);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_photos'
                   AND INDEX_NAME = 'idx_member_photos_approved_by') THEN
    ALTER TABLE member_photos ADD INDEX idx_member_photos_approved_by (approved_by, approved_by_role);
  END IF;
END$$
DELIMITER ;

CALL mm_backfill_photo_approval();
DROP PROCEDURE mm_backfill_photo_approval;


-- ----------------------------------------------------------------------------
-- 4. Repeatable records
--
--    Each hangs off member_accounts with ON DELETE CASCADE, so withdrawing an account
--    removes its records cleanly.
--
--    Each references its lookup with ON DELETE RESTRICT, so a value still in use
--    cannot be deleted out from under a member's profile. (Retiring a value is
--    is_active = 0, which is a different action from deleting it.)
-- ----------------------------------------------------------------------------

-- FR-046. The unique key allows the same title in different years, which is
-- legitimate, while preventing the same title in the same year twice.
CREATE TABLE IF NOT EXISTS member_titles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,
  title_id INT UNSIGNED NOT NULL,
  title_year SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_titles (member_account_id, title_id, title_year),
  KEY idx_member_titles_title (title_id),
  CONSTRAINT fk_member_titles_member_account_id
    FOREIGN KEY (member_account_id) REFERENCES member_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_titles_title_id
    FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- FR-068
CREATE TABLE IF NOT EXISTS member_sharafs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,
  sharaf_id INT UNSIGNED NOT NULL,
  sharaf_year SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_sharafs (member_account_id, sharaf_id, sharaf_year),
  KEY idx_member_sharafs_sharaf (sharaf_id),
  CONSTRAINT fk_member_sharafs_member_account_id
    FOREIGN KEY (member_account_id) REFERENCES member_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_sharafs_sharaf_id
    FOREIGN KEY (sharaf_id) REFERENCES sharafs(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- FR-055. A pure junction: a skill is either claimed or not.
CREATE TABLE IF NOT EXISTS member_skills (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,
  skill_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_skills (member_account_id, skill_id),
  KEY idx_member_skills_skill (skill_id),
  CONSTRAINT fk_member_skills_member_account_id
    FOREIGN KEY (member_account_id) REFERENCES member_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_skills_skill_id
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- FR-084a. Several Tamreen methods per member, not one.
--
-- `member_profiles.tamreen_method_id` is kept so existing answers are not destroyed, and
-- is no longer written. A member who had one method before this table existed is
-- backfilled into it by the migration, so nobody has to re-enter what they already said.
CREATE TABLE IF NOT EXISTS member_tamreen_methods (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,
  tamreen_method_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_tamreen_methods (member_account_id, tamreen_method_id),
  KEY idx_member_tamreen_methods_method (tamreen_method_id),
  CONSTRAINT fk_member_tamreen_methods_member_account_id
    FOREIGN KEY (member_account_id) REFERENCES member_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_tamreen_methods_method_id
    FOREIGN KEY (tamreen_method_id) REFERENCES tamreen_methods(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- FR-070 to FR-073. Two tables, because the request requires several years PER
-- place.
--
-- One row per place per member is what makes "how many times, in which years" a
-- single coherent record.
CREATE TABLE IF NOT EXISTS member_place_visits (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,
  place_id INT UNSIGNED NOT NULL,
  times_count SMALLINT UNSIGNED NOT NULL COMMENT 'FR-073: must equal the number of member_place_visit_years rows. Enforced in the save transaction, because MySQL CHECK cannot subquery',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_place_visits (member_account_id, place_id),
  KEY idx_member_place_visits_place (place_id),
  CONSTRAINT fk_member_place_visits_member_account_id
    FOREIGN KEY (member_account_id) REFERENCES member_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_place_visits_place_id
    FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- The unique key prevents the same year twice against one place — exactly the
-- duplicate that would let FR-073's count check pass while the data is wrong.
CREATE TABLE IF NOT EXISTS member_place_visit_years (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_place_visit_id INT UNSIGNED NOT NULL,
  visited_year SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_place_visit_years (member_place_visit_id, visited_year),
  CONSTRAINT fk_member_place_visit_years_member_place_visit_id
    FOREIGN KEY (member_place_visit_id) REFERENCES member_place_visits(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- FR-074 to FR-077.
--
-- One Ashara Mubaraka is observed once a year, so the unique key is
-- (member, hijri_year) — which catches an accidental double entry at the engine level.
--
-- mohallah_id is SET NULL rather than RESTRICT because mohallahs belongs to another
-- module that may legitimately remove a row; the attendance should survive with the
-- place unknown.
CREATE TABLE IF NOT EXISTS member_ashara_attendances (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,
  attended_with ENUM('With Aqa Moula TUS','With Aamil') NOT NULL COMMENT 'FR-075',
  hijri_year SMALLINT UNSIGNED NOT NULL COMMENT 'FR-076: 1400 to the current Hijri year, upper bound checked in the application because it moves with the calendar',
  moze_id INT UNSIGNED NULL COMMENT 'FR-077: the member own Moze. Only for With Aamil.',
  mohallah_id INT UNSIGNED NULL COMMENT 'FR-077: superseded by venue_id on 2026-11-06. Kept so existing rows are not destroyed; no longer collected by the form.',
  venue_id INT UNSIGNED NULL COMMENT 'FR-077c: replaces Mohallah. A venue already names its Mohallah, so this is the more specific answer. Only for With Aamil.',
  aqa_moula_ashara_id INT UNSIGNED NULL COMMENT 'FR-077a: where Aqa Moula TUS held Ashara that year. Only for With Aqa Moula TUS.',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_ashara (member_account_id, hijri_year),
  KEY idx_member_ashara_moze (moze_id),
  KEY idx_member_ashara_mohallah (mohallah_id),
  KEY idx_member_ashara_aqa_moula (aqa_moula_ashara_id),
  KEY idx_member_ashara_venue (venue_id),
  CONSTRAINT fk_member_ashara_attendances_member_account_id
    FOREIGN KEY (member_account_id) REFERENCES member_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_ashara_attendances_moze_id
    FOREIGN KEY (moze_id) REFERENCES mozes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_member_ashara_attendances_mohallah_id
    FOREIGN KEY (mohallah_id) REFERENCES mohallahs(id) ON DELETE SET NULL,
  -- RESTRICT, matching moze_id: an attendance record naming a place that was deleted
  -- out from under it is worse than refusing the delete.
  CONSTRAINT fk_member_ashara_attendances_aqa_moula_ashara_id
    FOREIGN KEY (aqa_moula_ashara_id) REFERENCES aqa_moula_asharas(id) ON DELETE RESTRICT,
  -- RESTRICT, matching moze_id. `venues` is one of the 13 PRE-EXISTING tables, and this is a
  -- foreign key FROM a module table TO it: no ALTER on venues, so FR-106 holds.
  CONSTRAINT fk_member_ashara_attendances_venue_id
    FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- FR-005a. Who reset a member's password, for whom, and when.
--
-- No password material, obviously, and none is needed: the question an audit of
-- this has to answer is "who gave someone else access to this account", and the
-- admin id and the timestamp answer it. A reset is rarer and more serious than a
-- profile edit, which is why it is its own table rather than a row type in the
-- other one.
CREATE TABLE IF NOT EXISTS member_password_resets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,
  reset_by_admin_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_member_password_resets_member (member_account_id, created_at),
  CONSTRAINT fk_member_password_resets_member_account_id
    FOREIGN KEY (member_account_id) REFERENCES member_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- FR-047a. Who changed a member's profile, when, and WHICH fields.
--
-- Field NAMES only. The old and new VALUES are deliberately not stored: Tab 6 holds
-- medical data and FR-066 says health values must appear in no log line. An audit
-- row saying "an administrator changed blood_group on this date" gives the
-- provenance a disputed value needs without copying the value into a second place
-- that then has to be protected just as carefully.
--
-- A member editing their own profile writes NO row here. This table exists to answer
-- "who else touched this", so filling it with the member's own saves would bury the
-- rare event under the common one.
CREATE TABLE IF NOT EXISTS member_profile_edits (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,
  edited_by_admin_id INT UNSIGNED NOT NULL,
  edited_by_role ENUM('admin') NOT NULL COMMENT 'Only administrators may edit; a Zonal Head is read-only (FR-047a).',
  changed_fields TEXT NOT NULL COMMENT 'JSON array of column names. NEVER the values.',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_member_profile_edits_member (member_account_id, created_at),
  CONSTRAINT fk_member_profile_edits_member_account_id
    FOREIGN KEY (member_account_id) REFERENCES member_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------------------------------------------------------
-- 4b. Backfill: member_ashara_attendances.aqa_moula_ashara_id
--
--     Same reason as section 3b, and the same failure it guards against. Production
--     already HAS member_ashara_attendances, from the run on 2026-11-04. CREATE TABLE
--     IF NOT EXISTS therefore skips it entirely — column, index and foreign key — and
--     without this the script would report success while leaving the database missing
--     the column the application now reads and writes.
--
--     The foreign key is added last and only once the column exists, because adding a
--     constraint to a column that is not there fails the whole script.
--
--     Additive only, and against a table this module owns: no pre-existing table is
--     touched, so FR-106 holds.
-- ----------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS mm_backfill_aqa_moula_ashara;

DELIMITER $$
CREATE PROCEDURE mm_backfill_aqa_moula_ashara()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'member_ashara_attendances'
                   AND COLUMN_NAME = 'aqa_moula_ashara_id') THEN
    ALTER TABLE member_ashara_attendances
      ADD COLUMN aqa_moula_ashara_id INT UNSIGNED NULL
        COMMENT 'FR-077a: where Aqa Moula TUS held Ashara that year. Only for With Aqa Moula TUS.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'member_ashara_attendances'
                   AND INDEX_NAME = 'idx_member_ashara_aqa_moula') THEN
    ALTER TABLE member_ashara_attendances
      ADD INDEX idx_member_ashara_aqa_moula (aqa_moula_ashara_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'member_ashara_attendances'
                   AND CONSTRAINT_NAME = 'fk_member_ashara_attendances_aqa_moula_ashara_id') THEN
    ALTER TABLE member_ashara_attendances
      ADD CONSTRAINT fk_member_ashara_attendances_aqa_moula_ashara_id
        FOREIGN KEY (aqa_moula_ashara_id) REFERENCES aqa_moula_asharas(id) ON DELETE RESTRICT;
  END IF;

  -- FR-077b. aqa_moula_asharas itself predates its year column on production, so the
  -- CREATE above skipped it for the same reason. Column first, then its unique key.
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'aqa_moula_asharas'
                   AND COLUMN_NAME = 'hijri_year') THEN
    ALTER TABLE aqa_moula_asharas
      ADD COLUMN hijri_year SMALLINT UNSIGNED NULL
        COMMENT 'FR-077b: the Hijri year Aqa Moula TUS held Ashara here. One place per year.'
        AFTER aqa_moula_ashara_name;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'aqa_moula_asharas'
                   AND INDEX_NAME = 'uq_aqa_moula_asharas_year') THEN
    ALTER TABLE aqa_moula_asharas
      ADD UNIQUE KEY uq_aqa_moula_asharas_year (hijri_year);
  END IF;

  -- FR-077c. Production was created with the name UNIQUE; the same place may now be entered
  -- for more than one year. Dropping an index removes no data.
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'aqa_moula_asharas'
               AND INDEX_NAME = 'uq_aqa_moula_asharas_name') THEN
    ALTER TABLE aqa_moula_asharas DROP INDEX uq_aqa_moula_asharas_name;
  END IF;
END$$
DELIMITER ;

CALL mm_backfill_aqa_moula_ashara();
DROP PROCEDURE mm_backfill_aqa_moula_ashara;


-- ----------------------------------------------------------------------------
-- 4b2. Repair: widen and guard the generated bmi column
--
--     MUST COME BEFORE EVERY OTHER ALTER ON member_profiles. An ALTER rebuilds the
--     table, and a rebuild materialises every VIRTUAL column for every row. A member
--     who typed their height in metres (1.75 rather than 175) produced a bmi of
--     228,571 against a DECIMAL(5,2) ceiling of 999.99 -- invisible while nothing
--     evaluated it, fatal the moment something did. On 2026-11-07 that was section
--     4d, and the server would not boot.
--
--     Widening alone would not close it: the old `> 0` test still permitted a height
--     of 0.01cm, where bmi reaches 1e11. The guard is the fix; the width merely has
--     to fit what the guard allows, which tops out at 500 / 0.5^2 = 2000.00.
--
--     Idempotent on the precision: once bmi is DECIMAL(6,2) this does nothing.
-- ----------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS mm_repair_bmi_column;

DELIMITER $$
CREATE PROCEDURE mm_repair_bmi_column()
BEGIN
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_profiles'
               AND COLUMN_NAME = 'bmi' AND NUMERIC_PRECISION <> 6) THEN
    ALTER TABLE member_profiles
      MODIFY COLUMN bmi DECIMAL(6,2) AS (
        IF(height_cm BETWEEN 50 AND 300 AND weight_kg BETWEEN 2 AND 500,
           ROUND(weight_kg / POW(height_cm / 100, 2), 2),
           NULL)
      ) VIRTUAL COMMENT 'FR-064. Generated, so no write can reach it. NULL unless both inputs are plausible for a person';
  END IF;
END$$
DELIMITER ;

CALL mm_repair_bmi_column();
DROP PROCEDURE mm_repair_bmi_column;


-- ----------------------------------------------------------------------------
-- 4c. Backfill: the two columns added on 2026-11-06
--
--     Same reason as 3b and 4b. Production already has member_profiles and
--     member_ashara_attendances, so CREATE TABLE IF NOT EXISTS skips both entirely
--     and neither new column would arrive. Without this the script reports success
--     and the application then fails on save against a column that is not there.
--
--     Kept as two procedures rather than folded into 4b so each stays readable and
--     the existing checks on 4b keep their meaning.
-- ----------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS mm_backfill_zikr_e_hussain;

DELIMITER $$
CREATE PROCEDURE mm_backfill_zikr_e_hussain()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_profiles'
                   AND COLUMN_NAME = 'zikr_e_hussain_since_year') THEN
    ALTER TABLE member_profiles
      ADD COLUMN zikr_e_hussain_since_year SMALLINT UNSIGNED NULL AFTER hizb_role;
  END IF;
END$$
DELIMITER ;

CALL mm_backfill_zikr_e_hussain();
DROP PROCEDURE mm_backfill_zikr_e_hussain;


DROP PROCEDURE IF EXISTS mm_backfill_ashara_venue;

DELIMITER $$
CREATE PROCEDURE mm_backfill_ashara_venue()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'member_ashara_attendances'
                   AND COLUMN_NAME = 'venue_id') THEN
    ALTER TABLE member_ashara_attendances
      ADD COLUMN venue_id INT UNSIGNED NULL AFTER mohallah_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'member_ashara_attendances'
                   AND INDEX_NAME = 'idx_member_ashara_venue') THEN
    ALTER TABLE member_ashara_attendances ADD INDEX idx_member_ashara_venue (venue_id);
  END IF;

  -- A foreign key FROM a module table TO the pre-existing `venues`. No ALTER on venues
  -- itself, so FR-106 holds. Added last, once the column is certain to exist.
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'member_ashara_attendances'
                   AND CONSTRAINT_NAME = 'fk_member_ashara_attendances_venue_id') THEN
    ALTER TABLE member_ashara_attendances
      ADD CONSTRAINT fk_member_ashara_attendances_venue_id
        FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT;
  END IF;
END$$
DELIMITER ;

CALL mm_backfill_ashara_venue();
DROP PROCEDURE mm_backfill_ashara_venue;


-- ----------------------------------------------------------------------------
-- 4d. Backfill: the two Tab 1 columns added on 2026-11-07
--
--     Same reason as 3b, 4b and 4c: production already has member_profiles, so
--     CREATE TABLE IF NOT EXISTS skips it and neither column would arrive.
-- ----------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS mm_backfill_personal_2026_11_07;

DELIMITER $$
CREATE PROCEDURE mm_backfill_personal_2026_11_07()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_profiles'
                   AND COLUMN_NAME = 'nationality') THEN
    ALTER TABLE member_profiles ADD COLUMN nationality VARCHAR(100) NULL AFTER marital_status_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_profiles'
                   AND COLUMN_NAME = 'mohallah_id') THEN
    ALTER TABLE member_profiles ADD COLUMN mohallah_id INT UNSIGNED NULL AFTER residence_address;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_profiles'
                   AND CONSTRAINT_NAME = 'fk_member_profiles_mohallah_id') THEN
    ALTER TABLE member_profiles
      ADD CONSTRAINT fk_member_profiles_mohallah_id
        FOREIGN KEY (mohallah_id) REFERENCES mohallahs(id) ON DELETE RESTRICT;
  END IF;
END$$
DELIMITER ;

CALL mm_backfill_personal_2026_11_07();
DROP PROCEDURE mm_backfill_personal_2026_11_07;


-- ----------------------------------------------------------------------------
-- 4e. Backfill: the two Hizb columns added on 2026-11-08
--
--     Same reason as 3b, 4b, 4c and 4d. Production already has member_profiles,
--     so CREATE TABLE IF NOT EXISTS skips it and neither column would arrive.
--     Runs after 4b2, which is what makes any ALTER on this table safe at all.
-- ----------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS mm_backfill_hizb_2026_11_08;

DELIMITER $$
CREATE PROCEDURE mm_backfill_hizb_2026_11_08()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_profiles'
                   AND COLUMN_NAME = 'registered_with_idaratuz_zakereen') THEN
    ALTER TABLE member_profiles
      ADD COLUMN registered_with_idaratuz_zakereen TINYINT(1) NULL AFTER zikr_e_hussain_since_year;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_profiles'
                   AND COLUMN_NAME = 'five_kalam_uploaded_when') THEN
    ALTER TABLE member_profiles
      ADD COLUMN five_kalam_uploaded_when VARCHAR(150) NULL AFTER registered_with_idaratuz_zakereen;
  END IF;
END$$
DELIMITER ;

CALL mm_backfill_hizb_2026_11_08();
DROP PROCEDURE mm_backfill_hizb_2026_11_08;


-- ----------------------------------------------------------------------------
-- 4f. Backfill: carry the single Tamreen method into the new table
--
--     Runs once in effect: the INSERT IGNORE finds nothing to add on a second run
--     because the unique key already holds the row. A member who answered before
--     2026-11-12 keeps their answer without re-entering it.
-- ----------------------------------------------------------------------------

INSERT IGNORE INTO member_tamreen_methods (member_account_id, tamreen_method_id)
SELECT member_account_id, tamreen_method_id
FROM member_profiles
WHERE tamreen_method_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 5. Post-run verification
--
--    Expect 24 new tables, and every existing count unchanged.
-- ----------------------------------------------------------------------------

SELECT COUNT(*) AS new_tables_created
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'member_accounts','member_login_attempts','member_profiles','member_photos',
    'member_titles','member_sharafs','member_skills','member_place_visits',
    'member_place_visit_years','member_ashara_attendances',
    'titles','sharafs','halqas','mozes','places','sanads',
    'marital_statuses','skills','tamreen_frequencies','tamreen_methods',
    'aqa_moula_asharas','member_profile_edits','member_password_resets',
    'member_tamreen_methods'
  );
-- Expected: 24

-- Confirms the generated column exists and is VIRTUAL.
SELECT COLUMN_NAME, EXTRA, GENERATION_EXPRESSION
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'member_profiles'
  AND COLUMN_NAME = 'bmi';
-- Expected: EXTRA = 'VIRTUAL GENERATED'

-- Confirms the five photo approval columns and their two indexes are present —
-- whether they arrived via the CREATE TABLE in section 3 or the backfill in 3b.
-- This is the check that catches the one failure mode CREATE TABLE IF NOT EXISTS
-- cannot: a member_photos left over from an earlier run, skipped silently.
SELECT COUNT(*) AS approval_columns_present
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'member_photos'
  AND COLUMN_NAME IN ('approval_status','approved_by','approved_by_role',
                      'approved_at','rejection_reason');
-- Expected: 5

SELECT COUNT(DISTINCT INDEX_NAME) AS approval_indexes_present
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'member_photos'
  AND INDEX_NAME IN ('idx_member_photos_approval','idx_member_photos_approved_by');
-- Expected: 2

-- Existing tables must be untouched (FR-106). Compare against the counts recorded
-- in quickstart.md §1 before the run.
SELECT 'zones' AS t, COUNT(*) AS n FROM zones
UNION ALL SELECT 'mohallahs', COUNT(*) FROM mohallahs
UNION ALL SELECT 'parties', COUNT(*) FROM parties
UNION ALL SELECT 'venues', COUNT(*) FROM venues
UNION ALL SELECT 'miqaats', COUNT(*) FROM miqaats
UNION ALL SELECT 'schedules', COUNT(*) FROM schedules
UNION ALL SELECT 'members_dormant', COUNT(*) FROM members;

-- ==========================================================================
-- PART 2 OF 2 — SEED (lookup values)
-- ==========================================================================

-- ============================================================================
-- Membership Module — lookup seed data
-- Feature : 001-membership-module
-- Date    : 2026-10-29
--
-- STATUS: APPROVED AND REHEARSED. Not yet applied to production.
-- For a live run, prefer database/membership_live_update.sql, which runs the schema
-- and this seed together with before/after verification.
--
-- Run after membership_schema.sql.
--
-- Idempotent: every statement is INSERT ... ON DUPLICATE KEY UPDATE keyed on the
-- unique name, so re-running updates ordering and flags instead of duplicating rows.
--
-- ALL TEN LISTS ARE NOW SUPPLIED AND REVIEWED (is_draft = 0)
--   Every value below was read back out of the working development database on
--   2026-11-04, where all ten lists carry is_draft = 0 — that is, a human has been
--   through them and accepted them. They are reproduced here verbatim so that live
--   gets the same lists the module has actually been used with, rather than a set of
--   proposals nobody chose.
--
--   This replaces the earlier arrangement, kept in git history, in which five lists
--   were left empty and four were seeded as drafts for review. That was the correct
--   thing to ship when the names were unknown. They are known now, so shipping the
--   drafts instead would push already-rejected guesses onto production and leave the
--   five domain lists empty — which FR-095 tolerates but no one wants.
--
--   THE DRAFT MECHANISM ITSELF IS UNCHANGED. is_draft still exists, the UI still
--   renders a flagged value as "DRAFT - NEEDS REVIEW", and FR-094 still governs any
--   value added LATER by an admin. What changed is only that these particular values
--   have already been through that review, so re-flagging them would be false.
--
--   TWO LISTS DIFFER FROM THE EARLIER DRAFTS IN SUBSTANCE, NOT JUST IN FLAG:
--     tamreen_methods  the seven proposed values ('Self Study', 'With a Group',
--                      'Audio Recording', 'Video Recording', 'Written Notes',
--                      'Other', ...) were not adopted. The four real ones are
--                      'Self', 'With Party', 'With an Ustad' and 'SatulIman'.
--                      Seeding the old seven would offer members options the
--                      organisation does not use, and the unique key is on the NAME,
--                      so those seven would survive as extra rows alongside the four.
--     the five domain  titles, sharafs, halqas, mozes and places now carry the real
--     lists           values. These are the lists the earlier header marked
--                      ">>> YOU NEED TO SUPPLY <<<". They have been supplied.
--
--   IDs ARE NOT PRESERVED, AND DO NOT NEED TO BE. Production creates these tables
--   empty, so AUTO_INCREMENT assigns 1..n here, whereas development reached higher
--   ids through earlier insert and delete churn. Nothing references a lookup id
--   across environments: no member rows are being migrated, and every reference is
--   resolved by join within one database.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. sanads — AUTHORITATIVE (is_draft = 0)
--
--    FR-059. All ten values are named verbatim in the request, in this order.
-- ----------------------------------------------------------------------------

INSERT INTO sanads (sanad_name, display_order, is_active, is_draft) VALUES
  ('Surah Balad',                         1, 1, 0),
  ('Surah Inshiqaq',                      2, 1, 0),
  ('Marhala Ula',                         3, 1, 0),
  ('Marhala Sania',                       4, 1, 0),
  ('Marhala Salesa',                      5, 1, 0),
  ('Marhala Rabea',                       6, 1, 0),
  ('Marhala Khamesa',                     7, 1, 0),
  ('Marhala Sadesa',                      8, 1, 0),
  ('Marhala Sabea',                       9, 1, 0),
  ('Shahadat Hifz al-Quran al-Kareem',   10, 1, 0)
ON DUPLICATE KEY UPDATE
  display_order = VALUES(display_order),
  is_active     = VALUES(is_active),
  is_draft      = VALUES(is_draft);

-- ON is_draft BEING UPDATED HERE, WHICH IT ONCE DELIBERATELY WAS NOT
--   Every ON DUPLICATE KEY UPDATE in this file now writes is_draft, and that reverses
--   an earlier decision worth explaining rather than silently flipping.
--
--   The old rule was: do not touch is_draft, because a reviewer may already have
--   cleared the flag and a re-run must not put it back. That was right WHILE this
--   file shipped values as is_draft = 1 — updating the flag could then only ever
--   re-flag something a human had approved, destroying their work.
--
--   Every value in this file now ships as is_draft = 0. So writing the flag can only
--   ever CLEAR it, never set it. The hazard the old rule guarded against cannot
--   happen, and the rule now causes the bug it was meant to prevent: on a database
--   that received the earlier draft seed, a value present in both lists — such as
--   'With an Ustad' in tamreen_methods — would keep is_draft = 1 forever and go on
--   showing "DRAFT - NEEDS REVIEW" for a value this file asserts is reviewed.
--
--   A value an admin adds later still defaults to is_draft = 1 and still needs
--   review, exactly as FR-094 requires. Nothing about that changed.


-- ----------------------------------------------------------------------------
-- 2. marital_statuses — REVIEWED (is_draft = 0)
--
--    FR-040. Proposed as drafts originally; accepted unchanged in development.
-- ----------------------------------------------------------------------------

INSERT INTO marital_statuses (marital_status_name, display_order, is_active, is_draft) VALUES
  ('Single',   1, 1, 0),
  ('Married',  2, 1, 0),
  ('Widowed',  3, 1, 0),
  ('Divorced', 4, 1, 0)
ON DUPLICATE KEY UPDATE
  display_order = VALUES(display_order),
  is_active     = VALUES(is_active),
  is_draft      = VALUES(is_draft);


-- ----------------------------------------------------------------------------
-- 3. tamreen_frequencies — REVIEWED (is_draft = 0)
--
--    FR-082. Proposed for approval originally; all six accepted unchanged.
--    Serves both the Party and the Solo frequency questions: one list, two
--    foreign keys.
-- ----------------------------------------------------------------------------

INSERT INTO tamreen_frequencies (tamreen_frequency_name, display_order, is_active, is_draft) VALUES
  ('Daily',        1, 1, 0),
  ('Weekly',       2, 1, 0),
  ('Fortnightly',  3, 1, 0),
  ('Monthly',      4, 1, 0),
  ('Occasionally', 5, 1, 0),
  ('Never',        6, 1, 0)
ON DUPLICATE KEY UPDATE
  display_order = VALUES(display_order),
  is_active     = VALUES(is_active),
  is_draft      = VALUES(is_draft);


-- ----------------------------------------------------------------------------
-- 4. tamreen_methods — REVIEWED (is_draft = 0)
--
--    FR-083. These FOUR are the real methods, and they are not the seven this file
--    once proposed. 'Self Study', 'With a Group', 'Audio Recording',
--    'Video Recording', 'Written Notes' and 'Other' were all rejected; 'With an
--    Ustad' is the only proposal that survived review.
--
--    'SatulIman' is a specific named method, not a generic category — which is a
--    good illustration of why the original seven were guesses and had to go.
--
--    If you are applying this to a database that received the old seven, those rows
--    are still there: the unique key is on the name, so an insert of these four
--    cannot displace them. Section 4b below retires the six rejected names.
-- ----------------------------------------------------------------------------

INSERT INTO tamreen_methods (tamreen_method_name, display_order, is_active, is_draft) VALUES
  ('Self',          1, 1, 0),
  ('With Party',    2, 1, 0),
  ('With an Ustad', 3, 1, 0),
  ('SatulIman',     4, 1, 0)
ON DUPLICATE KEY UPDATE
  display_order = VALUES(display_order),
  is_active     = VALUES(is_active),
  is_draft      = VALUES(is_draft);


-- ----------------------------------------------------------------------------
-- 4b. Retire the six rejected tamreen_methods proposals
--
--     Only relevant to a database that ran the earlier seed. Production has never
--     run it, so this matches nothing there and is a no-op.
--
--     DEACTIVATED, NOT DELETED. is_active = 0 removes a value from the pickers while
--     leaving any member row that already references it intact and readable. A DELETE
--     would be refused anyway — member_profiles.tamreen_method_id is ON DELETE SET
--     NULL, but a referencing row would silently lose its answer, and that is a data
--     loss no one asked for. Deactivating is reversible; deleting is not.
--
--     'With an Ustad' is deliberately absent from this list: it was adopted.
-- ----------------------------------------------------------------------------

UPDATE tamreen_methods
   SET is_active = 0
 WHERE tamreen_method_name IN (
         'Self Study', 'With a Group', 'Audio Recording',
         'Video Recording', 'Written Notes', 'Other'
       );


-- ----------------------------------------------------------------------------
-- 5. skills — REVIEWED (is_draft = 0)
--
--    FR-055, and FR-096 in particular. The request allowed "reputable publicly
--    available skill categories if research access is available; otherwise provide
--    a clearly marked initial seed list for review" and said not to invent a
--    claimed external source.
--
--    NO EXTERNAL SOURCE IS CLAIMED FOR THIS LIST. These are generic occupational
--    categories, not drawn from ESCO, O*NET or any other taxonomy. They were
--    proposed as a starting point for review, and all 45 were accepted unchanged.
-- ----------------------------------------------------------------------------

INSERT INTO skills (skill_name, display_order, is_active, is_draft) VALUES
  ('Accounting and Finance',          1, 1, 0),
  ('Administration',                  2, 1, 0),
  ('Architecture',                    3, 1, 0),
  ('Audio and Sound Engineering',     4, 1, 0),
  ('Automotive and Mechanical',       5, 1, 0),
  ('Banking',                         6, 1, 0),
  ('Carpentry',                       7, 1, 0),
  ('Catering and Food Service',       8, 1, 0),
  ('Civil Engineering',               9, 1, 0),
  ('Construction',                   10, 1, 0),
  ('Customer Service',               11, 1, 0),
  ('Data Entry',                     12, 1, 0),
  ('Dentistry',                      13, 1, 0),
  ('Design and Graphics',            14, 1, 0),
  ('Electrical',                     15, 1, 0),
  ('Electronics',                    16, 1, 0),
  ('Event Management',               17, 1, 0),
  ('First Aid and Paramedical',      18, 1, 0),
  ('Hardware Repair',                19, 1, 0),
  ('Human Resources',                20, 1, 0),
  ('Information Technology',         21, 1, 0),
  ('Insurance',                      22, 1, 0),
  ('Legal',                          23, 1, 0),
  ('Logistics and Transport',        24, 1, 0),
  ('Manufacturing',                  25, 1, 0),
  ('Marketing',                      26, 1, 0),
  ('Medicine',                       27, 1, 0),
  ('Networking and Infrastructure',  28, 1, 0),
  ('Nursing',                        29, 1, 0),
  ('Pharmacy',                       30, 1, 0),
  ('Photography and Videography',    31, 1, 0),
  ('Plumbing',                       32, 1, 0),
  ('Printing',                       33, 1, 0),
  ('Project Management',             34, 1, 0),
  ('Public Speaking',                35, 1, 0),
  ('Real Estate',                    36, 1, 0),
  ('Retail and Sales',               37, 1, 0),
  ('Security',                       38, 1, 0),
  ('Software Development',           39, 1, 0),
  ('Tailoring and Textiles',         40, 1, 0),
  ('Teaching and Training',          41, 1, 0),
  ('Telecommunications',             42, 1, 0),
  ('Translation and Languages',      43, 1, 0),
  ('Travel and Tourism',             44, 1, 0),
  ('Welding and Fabrication',        45, 1, 0)
ON DUPLICATE KEY UPDATE
  display_order = VALUES(display_order),
  is_active     = VALUES(is_active),
  is_draft      = VALUES(is_draft);


-- ----------------------------------------------------------------------------
-- 6. places — SUPPLIED AND REVIEWED (is_draft = 0)
--
--    FR-070. Tab 8 records the PLACES a member has visited, with how many times
--    and in which years.
--
--    These five come from the working development database, not from this file's
--    imagination. An earlier version left the list empty and asked you to fill it
--    in; it is filled in, so it is recorded here.
--
--    A mistake worth keeping on the record, so it is not repeated: an early draft
--    seeded this list from `SELECT DISTINCT miqaat_name FROM miqaats`. The existing
--    `miqaats` table is the SCHEDULING calendar — its rows are individual majlis
--    sessions of a single Hijri year, like "2nd Day | 3ji Raat Majlis" or
--    "16mi Raat - Safar-ul-Muzaffar 1448H", with the year inside the name. Those are
--    occasions on a calendar, not places anyone travels to, so the derivation was
--    wrong in KIND, not merely too granular. The real list below bears that out:
--    none of these five is a majlis.
--
--    STILL OPEN, and not decided by this script: Tab 9 (Ashara Mubaraka) has its own
--    `Moze` field, which is also a place, and section 10 below shows the two lists
--    genuinely differ — mozes holds cities (Karachi, Mumbai, London) while places
--    holds ziyarat destinations and journeys (Hajj, Umra, Karbala). They are kept as
--    two lookups because they answer two different questions. Nothing needs to change
--    unless you decide otherwise.
-- ----------------------------------------------------------------------------

INSERT INTO places (place_name, display_order, is_active, is_draft) VALUES
  ('Hajj',    1, 1, 0),
  ('Umra',    2, 1, 0),
  ('Karbala', 3, 1, 0),
  ('Sham',    4, 1, 0),
  ('India',   5, 1, 0)
ON DUPLICATE KEY UPDATE
  display_order = VALUES(display_order),
  is_active     = VALUES(is_active),
  is_draft      = VALUES(is_draft);


-- ----------------------------------------------------------------------------
-- 7. titles — SUPPLIED AND REVIEWED (is_draft = 0)
--
--    FR-045, FR-046. Tab 2 records the Titles a member holds and the year each was
--    conferred, so the same title may legitimately recur in different years.
--
--    Taken from the working development database. This file previously declined to
--    seed the list, on the grounds that inventing Dawoodi Bohra honorifics would be
--    worse than an empty list. That reasoning was right and these are not inventions.
-- ----------------------------------------------------------------------------

INSERT INTO titles (title_name, display_order, is_active, is_draft) VALUES
  ('NKD', 1, 1, 0),
  ('MKD', 2, 1, 0)
ON DUPLICATE KEY UPDATE
  display_order = VALUES(display_order),
  is_active     = VALUES(is_active),
  is_draft      = VALUES(is_draft);


-- ----------------------------------------------------------------------------
-- 8. sharafs — SUPPLIED AND REVIEWED (is_draft = 0)
--
--    FR-068. Tab 7, recorded per year like Titles.
-- ----------------------------------------------------------------------------

INSERT INTO sharafs (sharaf_name, display_order, is_active, is_draft) VALUES
  ('Talaqi',         1, 1, 0),
  ('Ziyafat Sharaf', 2, 1, 0),
  ('Qadambosi',      3, 1, 0)
ON DUPLICATE KEY UPDATE
  display_order = VALUES(display_order),
  is_active     = VALUES(is_active),
  is_draft      = VALUES(is_draft);


-- ----------------------------------------------------------------------------
-- 9. halqas — SUPPLIED AND REVIEWED (is_draft = 0)
--
--    Tab 10 (Asbaq). Two nisab levels.
-- ----------------------------------------------------------------------------

INSERT INTO halqas (halqa_name, display_order, is_active, is_draft) VALUES
  ('Nisab Awwal', 1, 1, 0),
  ('Nisab Sani',  2, 1, 0)
ON DUPLICATE KEY UPDATE
  display_order = VALUES(display_order),
  is_active     = VALUES(is_active),
  is_draft      = VALUES(is_draft);


-- ----------------------------------------------------------------------------
-- 10. mozes — SUPPLIED AND REVIEWED (is_draft = 0)
--
--     FR-077. Tab 9 (Ashara Mubaraka): the city where the member attended.
--
--     Distinct from `places` in section 6 — see the note there.
-- ----------------------------------------------------------------------------

INSERT INTO mozes (moze_name, display_order, is_active, is_draft) VALUES
  ('Karachi', 1, 1, 0),
  ('Mumbai',  2, 1, 0),
  ('Surat',   3, 1, 0),
  ('Colombo', 4, 1, 0),
  ('London',  5, 1, 0)
ON DUPLICATE KEY UPDATE
  display_order = VALUES(display_order),
  is_active     = VALUES(is_active),
  is_draft      = VALUES(is_draft);


-- ----------------------------------------------------------------------------
-- 11. Verification
--
--     active_rows is counted separately from rows because of section 4b: on a
--     database that received the earlier seed, tamreen_methods keeps 10 rows of
--     which only 4 are active. On production it is 4 and 4.
-- ----------------------------------------------------------------------------

SELECT 'sanads' AS lookup_table, COUNT(*) AS rows_seeded,
       SUM(is_active) AS active_rows, SUM(is_draft) AS still_draft FROM sanads
UNION ALL SELECT 'marital_statuses',    COUNT(*), SUM(is_active), SUM(is_draft) FROM marital_statuses
UNION ALL SELECT 'tamreen_frequencies', COUNT(*), SUM(is_active), SUM(is_draft) FROM tamreen_frequencies
UNION ALL SELECT 'tamreen_methods',     COUNT(*), SUM(is_active), SUM(is_draft) FROM tamreen_methods
UNION ALL SELECT 'skills',              COUNT(*), SUM(is_active), SUM(is_draft) FROM skills
UNION ALL SELECT 'places',              COUNT(*), SUM(is_active), SUM(is_draft) FROM places
UNION ALL SELECT 'titles',              COUNT(*), SUM(is_active), SUM(is_draft) FROM titles
UNION ALL SELECT 'sharafs',             COUNT(*), SUM(is_active), SUM(is_draft) FROM sharafs
UNION ALL SELECT 'halqas',              COUNT(*), SUM(is_active), SUM(is_draft) FROM halqas
UNION ALL SELECT 'mozes',               COUNT(*), SUM(is_active), SUM(is_draft) FROM mozes
-- Seeded with nothing on purpose. Reported anyway, so "empty" is a value you can see
-- in the log rather than a line that is simply missing from it.
UNION ALL SELECT 'aqa_moula_asharas',   COUNT(*), SUM(is_active), SUM(is_draft) FROM aqa_moula_asharas;

-- Expected on a FIRST run (production — no earlier seed applied):
--   lookup_table          rows  active  draft
--   sanads                  10      10      0
--   marital_statuses         4       4      0
--   tamreen_frequencies      6       6      0
--   tamreen_methods          4       4      0
--   skills                  45      45      0
--   places                   5       5      0
--   titles                   2       2      0
--   sharafs                  3       3      0
--   halqas                   2       2      0
--   mozes                    5       5      0
--   aqa_moula_asharas        0    NULL   NULL
--
-- EVERY still_draft MUST BE 0. A non-zero value means a row was added outside this
-- file and has not been reviewed; it is not an error, but the UI will render it as
-- "DRAFT - NEEDS REVIEW" until someone clears the flag.
--
-- On a database that ran the EARLIER seed, tamreen_methods reads 10 rows / 4 active
-- instead, the six rejected proposals having been deactivated by section 4b. Every
-- other line is identical.

-- The existing miqaats table is never touched by this script - it belongs to the
-- scheduling module and has nothing to do with Tab 8. Confirming it anyway.
SELECT COUNT(*) AS miqaats_rows_unchanged FROM miqaats;


-- ==========================================================================
-- AFTER — compare these numbers with the BEFORE block above
-- ==========================================================================

-- All 21 module tables present.
SELECT COUNT(*) AS module_tables_present
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'member_accounts','member_login_attempts','member_profiles','member_photos',
    'member_titles','member_sharafs','member_skills','member_place_visits',
    'member_place_visit_years','member_ashara_attendances',
    'titles','sharafs','halqas','mozes','places','sanads',
    'marital_statuses','skills','tamreen_frequencies','tamreen_methods',
    'aqa_moula_asharas','member_profile_edits','member_password_resets',
    'member_tamreen_methods'
  );
-- Expected: 24

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
