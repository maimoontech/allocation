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
  UNIQUE KEY uq_aqa_moula_asharas_name (aqa_moula_ashara_name),
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
  marital_status_id INT UNSIGNED NULL,
  residence_address TEXT NULL,
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
  bmi DECIMAL(5,2) AS (
    IF(height_cm > 0 AND weight_kg > 0,
       ROUND(weight_kg / POW(height_cm / 100, 2), 2),
       NULL)
  ) VIRTUAL COMMENT 'FR-064. Generated, so MySQL rejects any write: no API or UI bug can overwrite it and it cannot drift from its inputs. NULL whenever either input is absent or non-positive',

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
  mohallah_id INT UNSIGNED NULL COMMENT 'FR-077: optional. Only for With Aamil.',
  aqa_moula_ashara_id INT UNSIGNED NULL COMMENT 'FR-077a: where Aqa Moula TUS held Ashara that year. Only for With Aqa Moula TUS.',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_ashara (member_account_id, hijri_year),
  KEY idx_member_ashara_moze (moze_id),
  KEY idx_member_ashara_mohallah (mohallah_id),
  KEY idx_member_ashara_aqa_moula (aqa_moula_ashara_id),
  CONSTRAINT fk_member_ashara_attendances_member_account_id
    FOREIGN KEY (member_account_id) REFERENCES member_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_ashara_attendances_moze_id
    FOREIGN KEY (moze_id) REFERENCES mozes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_member_ashara_attendances_mohallah_id
    FOREIGN KEY (mohallah_id) REFERENCES mohallahs(id) ON DELETE SET NULL,
  -- RESTRICT, matching moze_id: an attendance record naming a place that was deleted
  -- out from under it is worse than refusing the delete.
  CONSTRAINT fk_member_ashara_attendances_aqa_moula_ashara_id
    FOREIGN KEY (aqa_moula_ashara_id) REFERENCES aqa_moula_asharas(id) ON DELETE RESTRICT
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
END$$
DELIMITER ;

CALL mm_backfill_aqa_moula_ashara();
DROP PROCEDURE mm_backfill_aqa_moula_ashara;


-- ----------------------------------------------------------------------------
-- 5. Post-run verification
--
--    Expect 21 new tables, and every existing count unchanged.
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
    'aqa_moula_asharas'
  );
-- Expected: 21

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
