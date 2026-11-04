-- ============================================================================
-- MPSS / Zakereen Allocation — LOCAL DEVELOPMENT DATABASE
--
-- One script: full schema (existing + Membership Module) plus sample data, so a
-- local environment can be stood up without a copy of production.
--
--   mysql -h 127.0.0.1 -u root -p < local_dev_setup.sql
--
-- ############################################################################
-- #  LOCAL DEVELOPMENT ONLY. NEVER RUN THIS AGAINST PRODUCTION.              #
-- #                                                                          #
-- #  It DROPS AND RECREATES the database, and it seeds accounts with known,   #
-- #  weak, published passwords. Running it on a real server would destroy     #
-- #  live data and hand out working credentials.                             #
-- ############################################################################
--
-- The database is named `mpss_local`, deliberately NOT `masjid_scheduling`, so it
-- cannot collide with a restored production copy on the same MySQL instance.
--
-- Sections:
--   0. Guards and database creation
--   1. Existing schema      — matches database/mpss_mysql.sql exactly
--   2. Membership schema    — the 20 new tables
--   3. Sample master data   — admin, zones, mohallahs, parties, venues, miqaats
--   4. Membership lookups
--   5. Sample member accounts and profiles
--   6. Verification and the credential list
--
-- Sections 1 and 2 are structurally identical to the production schema and the
-- draft migration, so anything that works here works there. Only sections 3 to 5
-- are local-only.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Guards and database creation
-- ----------------------------------------------------------------------------

-- The generated `bmi` column in section 2 requires MySQL 5.7 or later. Fail early
-- and clearly rather than part-way through.
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
      SET MESSAGE_TEXT = 'Aborted: MySQL 5.7 or later is required for the generated bmi column.';
  END IF;
END$$
DELIMITER ;
CALL mm_assert_mysql_version();
DROP PROCEDURE mm_assert_mysql_version;

DROP DATABASE IF EXISTS mpss_local;
CREATE DATABASE mpss_local
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;
USE mpss_local;


-- ----------------------------------------------------------------------------
-- 1. Existing schema
--    Structurally identical to database/mpss_mysql.sql, which already includes
--    every column the four database/add_*.sql files and ensureSchema.ts add.
-- ----------------------------------------------------------------------------

CREATE TABLE admins (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(100) NOT NULL,
  admin_name VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE zones (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  zone_name VARCHAR(100) NOT NULL,
  coordinator_name VARCHAR(100) NOT NULL,
  contact_number VARCHAR(20) NULL,
  whatsapp_number VARCHAR(20) NULL,
  password_hash VARCHAR(255) NOT NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_zones_zone_name (zone_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE mohallahs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  zone_id INT UNSIGNED NOT NULL,
  mohallah_name VARCHAR(100) NOT NULL,
  coordinator_name VARCHAR(100) NOT NULL,
  contact_number VARCHAR(20) NULL,
  whatsapp_number VARCHAR(20) NULL,
  password_hash VARCHAR(255) NOT NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mohallahs_zone_name (zone_id, mohallah_name),
  KEY idx_mohallahs_zone_id (zone_id),
  CONSTRAINT fk_mohallahs_zone_id FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE parties (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  its_no VARCHAR(20) NOT NULL,
  leader_name VARCHAR(150) NOT NULL,
  contact_number VARCHAR(20) NULL,
  whatsapp_number VARCHAR(20) NULL,
  party_name VARCHAR(150) NOT NULL,
  zone_id INT UNSIGNED NOT NULL,
  category ENUM('A','B','C','H') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  password_hash VARCHAR(255) NOT NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_parties_its_no (its_no),
  UNIQUE KEY uq_parties_zone_name (zone_id, party_name),
  KEY idx_parties_zone_id (zone_id),
  KEY idx_parties_category (category),
  CONSTRAINT fk_parties_zone_id FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Present in the production schema but referenced by NO application code. Recreated
-- here so local matches production exactly; the Membership Module does not use it.
CREATE TABLE members (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  party_id INT UNSIGNED NOT NULL,
  member_name VARCHAR(100) NOT NULL,
  its_number VARCHAR(20) NULL,
  member_type ENUM('Leader','Co-Leader','Member') NOT NULL DEFAULT 'Member',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_members_its_number (its_number),
  KEY idx_members_party_id (party_id),
  CONSTRAINT fk_members_party_id FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE venues (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  venue_name VARCHAR(150) NOT NULL,
  mohallah_id INT UNSIGNED NOT NULL,
  coordinator_name VARCHAR(150) NULL,
  contact_number VARCHAR(20) NULL,
  whatsapp_number VARCHAR(20) NULL,
  address VARCHAR(255) NULL,
  google_map_link VARCHAR(500) NULL,
  password_hash VARCHAR(255) NOT NULL,
  last_login_at DATETIME NULL,
  min_parties TINYINT UNSIGNED NOT NULL DEFAULT 1,
  max_parties TINYINT UNSIGNED NOT NULL DEFAULT 5,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_venues_mohallah_name (mohallah_id, venue_name),
  KEY idx_venues_mohallah_id (mohallah_id),
  CONSTRAINT fk_venues_mohallah_id FOREIGN KEY (mohallah_id) REFERENCES mohallahs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE miqaats (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  miqaat_name VARCHAR(150) NOT NULL,
  english_date DATE NOT NULL,
  hijri_date VARCHAR(50) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_miqaats_date (english_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE schedules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  miqaat_id INT UNSIGNED NOT NULL,
  venue_id INT UNSIGNED NOT NULL,
  party_id INT UNSIGNED NOT NULL,
  is_manual TINYINT(1) NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_by_role VARCHAR(20) NOT NULL,
  created_by_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schedules_miqaat_party (miqaat_id, party_id),
  KEY idx_schedules_miqaat_venue (miqaat_id, venue_id),
  KEY idx_schedules_party_id (party_id),
  CONSTRAINT fk_schedules_miqaat_id FOREIGN KEY (miqaat_id) REFERENCES miqaats(id) ON DELETE CASCADE,
  CONSTRAINT fk_schedules_venue_id FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  CONSTRAINT fk_schedules_party_id FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE schedule_edits (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id INT UNSIGNED NOT NULL,
  old_venue_id INT UNSIGNED NOT NULL,
  old_party_id INT UNSIGNED NOT NULL,
  new_venue_id INT UNSIGNED NOT NULL,
  new_party_id INT UNSIGNED NOT NULL,
  edited_by_role VARCHAR(20) NOT NULL,
  edited_by_id INT UNSIGNED NOT NULL,
  edited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_schedule_edits_schedule_id (schedule_id),
  CONSTRAINT fk_schedule_edits_schedule_id FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE ratings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id INT UNSIGNED NOT NULL,
  rater_role ENUM('party','coordinator') NOT NULL,
  rater_id INT UNSIGNED NOT NULL,
  rating_score TINYINT UNSIGNED NOT NULL,
  comments TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ratings_unique (schedule_id, rater_role, rater_id),
  KEY idx_ratings_schedule_id (schedule_id),
  CONSTRAINT fk_ratings_schedule_id FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE performance_ratings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id INT UNSIGNED NOT NULL,
  coordinator_id INT UNSIGNED NOT NULL,
  attended_properly TINYINT(1) NOT NULL DEFAULT 0,
  recitation_score TINYINT UNSIGNED NOT NULL,
  discipline_score TINYINT UNSIGNED NOT NULL,
  attendance_score TINYINT UNSIGNED NOT NULL,
  overall_score TINYINT UNSIGNED NOT NULL,
  comments TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_perf_unique (schedule_id, coordinator_id),
  KEY idx_perf_schedule_id (schedule_id),
  CONSTRAINT fk_perf_schedule_id FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE party_venue_history (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  party_id INT UNSIGNED NOT NULL,
  venue_id INT UNSIGNED NOT NULL,
  visit_count INT UNSIGNED NOT NULL DEFAULT 1,
  first_visited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_visited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_party_venue (party_id, venue_id),
  KEY idx_history_party_id (party_id),
  KEY idx_history_venue_id (venue_id),
  CONSTRAINT fk_history_party_id FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_venue_id FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE refresh_tokens (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_hash CHAR(64) NOT NULL,
  user_role VARCHAR(20) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_tokens_hash (token_hash),
  KEY idx_refresh_tokens_user (user_role, user_id),
  KEY idx_refresh_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------------------------------------------------------
-- 2. Membership Module schema — the 20 new tables
--    Identical to database/membership_schema.sql.
--    Lookups first, because sections below reference them.
-- ----------------------------------------------------------------------------

CREATE TABLE titles (
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

CREATE TABLE sharafs (
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

CREATE TABLE halqas (
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

CREATE TABLE mozes (
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

CREATE TABLE places (
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

CREATE TABLE sanads (
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

CREATE TABLE marital_statuses (
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

CREATE TABLE skills (
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

CREATE TABLE tamreen_frequencies (
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

CREATE TABLE tamreen_methods (
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

CREATE TABLE member_accounts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  its_no VARCHAR(20) NOT NULL,
  member_name VARCHAR(150) NULL,
  password_hash VARCHAR(255) NOT NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  password_changed_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_accounts_its_no (its_no),
  KEY idx_member_accounts_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE member_login_attempts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  its_no VARCHAR(20) NOT NULL,
  ip_hash CHAR(64) NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  succeeded TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_member_login_attempts_its (its_no, attempted_at),
  KEY idx_member_login_attempts_ip (ip_hash, attempted_at),
  KEY idx_member_login_attempts_at (attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE member_profiles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,

  first_prefix ENUM('None','Sheikh','Mulla') NOT NULL DEFAULT 'None',
  name VARCHAR(100) NULL,
  father_prefix ENUM('None','Sheikh','Mulla') NOT NULL DEFAULT 'None',
  father_name VARCHAR(100) NULL,
  surname VARCHAR(100) NULL,
  dob_gregorian DATE NULL,
  dob_hijri_day TINYINT UNSIGNED NULL,
  dob_hijri_month TINYINT UNSIGNED NULL,
  dob_hijri_year SMALLINT UNSIGNED NULL,
  dob_hijri_text VARCHAR(50) NULL,
  marital_status_id INT UNSIGNED NULL,
  residence_address TEXT NULL,
  phone_no VARCHAR(25) NULL,
  mobile_no_1 VARCHAR(25) NULL,
  mobile_no_2 VARCHAR(25) NULL,
  whatsapp_no_1 VARCHAR(25) NULL,
  whatsapp_no_2 VARCHAR(25) NULL,
  email VARCHAR(190) NULL,

  prefix_year SMALLINT UNSIGNED NULL,

  zone_id INT UNSIGNED NULL,
  party_id INT UNSIGNED NULL,
  hizb_role ENUM('Leader','Side Lead','Member') NULL,

  occupation_type ENUM('Job','Business') NULL,
  organisation_name VARCHAR(150) NULL,
  designation VARCHAR(150) NULL,
  occupation_since_year SMALLINT UNSIGNED NULL,
  work_address TEXT NULL,
  work_phone_no VARCHAR(25) NULL,

  education_level ENUM('Primary','Middle','Secondary','Intermediate','Bachelors','Masters','PhD') NULL,
  major_subjects VARCHAR(255) NULL,
  education_status ENUM('Complete','Ongoing') NULL,
  has_hifz_sanad TINYINT(1) NULL,
  sanad_id INT UNSIGNED NULL,
  hifz_current_surah VARCHAR(100) NULL,
  hifz_current_ayyah VARCHAR(50) NULL,
  hifz_last_update DATE NULL,

  blood_group ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NULL,
  is_regular_donor TINYINT(1) NULL,
  last_donation_date DATE NULL,
  height_cm DECIMAL(5,2) NULL,
  weight_kg DECIMAL(5,2) NULL,
  bmi DECIMAL(5,2) AS (
    IF(height_cm > 0 AND weight_kg > 0,
       ROUND(weight_kg / POW(height_cm / 100, 2), 2),
       NULL)
  ) VIRTUAL,

  asbaq_level ENUM('Zaher','Taweel','Haqiqat') NULL,
  halqa_id INT UNSIGNED NULL,
  asbaq_ustad VARCHAR(150) NULL,

  attends_karachi_tamreen TINYINT(1) NULL,
  tamreen_absence_reason TEXT NULL,
  party_tamreen_frequency_id INT UNSIGNED NULL,
  solo_tamreen_frequency_id INT UNSIGNED NULL,
  tamreen_method_id INT UNSIGNED NULL,
  takes_ustad_assistance TINYINT(1) NULL,
  uses_idaratuz_zakereen_books TINYINT(1) NULL,

  khidmat_type ENUM('Sansta','Umoor','Both') NULL,
  sansta_name VARCHAR(150) NULL,
  umoor_name VARCHAR(150) NULL,
  khidmat_designation VARCHAR(150) NULL,
  khidmat_since_year SMALLINT UNSIGNED NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_member_profiles_account (member_account_id),
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

CREATE TABLE member_photos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,
  content_type VARCHAR(50) NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  width SMALLINT UNSIGNED NULL,
  height SMALLINT UNSIGNED NULL,
  sha256 CHAR(64) NOT NULL,
  image_data MEDIUMBLOB NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_photos_account (member_account_id),
  CONSTRAINT fk_member_photos_member_account_id
    FOREIGN KEY (member_account_id) REFERENCES member_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE member_titles (
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

CREATE TABLE member_sharafs (
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

CREATE TABLE member_skills (
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

CREATE TABLE member_place_visits (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,
  place_id INT UNSIGNED NOT NULL,
  times_count SMALLINT UNSIGNED NOT NULL,
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

CREATE TABLE member_place_visit_years (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_place_visit_id INT UNSIGNED NOT NULL,
  visited_year SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_place_visit_years (member_place_visit_id, visited_year),
  CONSTRAINT fk_member_place_visit_years_member_place_visit_id
    FOREIGN KEY (member_place_visit_id) REFERENCES member_place_visits(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE member_ashara_attendances (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_account_id INT UNSIGNED NOT NULL,
  attended_with ENUM('With Aqa Moula TUS','With Aamil') NOT NULL,
  hijri_year SMALLINT UNSIGNED NOT NULL,
  moze_id INT UNSIGNED NULL,
  mohallah_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_ashara (member_account_id, hijri_year),
  KEY idx_member_ashara_moze (moze_id),
  KEY idx_member_ashara_mohallah (mohallah_id),
  CONSTRAINT fk_member_ashara_attendances_member_account_id
    FOREIGN KEY (member_account_id) REFERENCES member_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_ashara_attendances_moze_id
    FOREIGN KEY (moze_id) REFERENCES mozes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_member_ashara_attendances_mohallah_id
    FOREIGN KEY (mohallah_id) REFERENCES mohallahs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ============================================================================
-- SAMPLE DATA BELOW — LOCAL ONLY
--
-- All passwords are published in section 6. Every bcrypt hash here is cost 10,
-- matching the application.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3. Sample master data
-- ----------------------------------------------------------------------------

-- Admin — username "admin", password "Admin@1234"
INSERT INTO admins (id, username, admin_name, password_hash) VALUES
  (1, 'admin', 'Local Dev Admin', '$2b$10$WstKuK/srrOaU0971nN/IuDr2T.0iAiVWHmGdBG./Kbo6u22GIDG2');

-- Zones — the zonal_head login identity. Password "Zone@1234" for each.
INSERT INTO zones (id, zone_name, coordinator_name, contact_number, whatsapp_number, password_hash) VALUES
  (1, 'Karachi Central', 'Zone 1 Coordinator', '+92 21 1111111', '+92 300 1111111', '$2b$10$.Xdfatrzio3Sb/Epflinxecadv4mSYb5FUxPdORz/bJGmZKsSIAVu'),
  (2, 'Karachi South',   'Zone 2 Coordinator', '+92 21 2222222', '+92 300 2222222', '$2b$10$.Xdfatrzio3Sb/Epflinxecadv4mSYb5FUxPdORz/bJGmZKsSIAVu'),
  (3, 'Karachi East',    'Zone 3 Coordinator', '+92 21 3333333', '+92 300 3333333', '$2b$10$.Xdfatrzio3Sb/Epflinxecadv4mSYb5FUxPdORz/bJGmZKsSIAVu');

-- Mohallahs — two per zone. They carry a password_hash column but have no login path.
INSERT INTO mohallahs (id, zone_id, mohallah_name, coordinator_name, contact_number, whatsapp_number, password_hash) VALUES
  (1, 1, 'Saifee Mohallah',  'Mohallah 1 Coordinator', '+92 21 1110001', '+92 300 1110001', '$2b$10$.Xdfatrzio3Sb/Epflinxecadv4mSYb5FUxPdORz/bJGmZKsSIAVu'),
  (2, 1, 'Burhani Mohallah', 'Mohallah 2 Coordinator', '+92 21 1110002', '+92 300 1110002', '$2b$10$.Xdfatrzio3Sb/Epflinxecadv4mSYb5FUxPdORz/bJGmZKsSIAVu'),
  (3, 2, 'Taheri Mohallah',  'Mohallah 3 Coordinator', '+92 21 2220001', '+92 300 2220001', '$2b$10$.Xdfatrzio3Sb/Epflinxecadv4mSYb5FUxPdORz/bJGmZKsSIAVu'),
  (4, 2, 'Fakhri Mohallah',  'Mohallah 4 Coordinator', '+92 21 2220002', '+92 300 2220002', '$2b$10$.Xdfatrzio3Sb/Epflinxecadv4mSYb5FUxPdORz/bJGmZKsSIAVu'),
  (5, 3, 'Najmi Mohallah',   'Mohallah 5 Coordinator', '+92 21 3330001', '+92 300 3330001', '$2b$10$.Xdfatrzio3Sb/Epflinxecadv4mSYb5FUxPdORz/bJGmZKsSIAVu'),
  (6, 3, 'Hakimi Mohallah',  'Mohallah 6 Coordinator', '+92 21 3330002', '+92 300 3330002', '$2b$10$.Xdfatrzio3Sb/Epflinxecadv4mSYb5FUxPdORz/bJGmZKsSIAVu');

-- Venues — the coordinator login identity. Password "Venue@1234" for each.
INSERT INTO venues (id, venue_name, mohallah_id, coordinator_name, contact_number, whatsapp_number, address, password_hash, min_parties, max_parties, is_active) VALUES
  (1, 'Saifee Masjid Hall',      1, 'Venue 1 Coordinator', '+92 21 4110001', '+92 300 4110001', '1 Saifee Street, Karachi',  '$2b$10$yVVJsieRWwDOdPJhI8/pYOupMfWU9mYmAV25r33SFtPmHCuG0P7HO', 1, 4, 1),
  (2, 'Saifee Community Centre', 1, 'Venue 2 Coordinator', '+92 21 4110002', '+92 300 4110002', '2 Saifee Street, Karachi',  '$2b$10$yVVJsieRWwDOdPJhI8/pYOupMfWU9mYmAV25r33SFtPmHCuG0P7HO', 1, 3, 1),
  (3, 'Burhani Masjid Hall',     2, 'Venue 3 Coordinator', '+92 21 4120001', '+92 300 4120001', '3 Burhani Road, Karachi',   '$2b$10$yVVJsieRWwDOdPJhI8/pYOupMfWU9mYmAV25r33SFtPmHCuG0P7HO', 2, 5, 1),
  (4, 'Taheri Masjid Hall',      3, 'Venue 4 Coordinator', '+92 21 4230001', '+92 300 4230001', '4 Taheri Lane, Karachi',    '$2b$10$yVVJsieRWwDOdPJhI8/pYOupMfWU9mYmAV25r33SFtPmHCuG0P7HO', 1, 4, 1),
  (5, 'Fakhri Hall',             4, 'Venue 5 Coordinator', '+92 21 4240001', '+92 300 4240001', '5 Fakhri Avenue, Karachi',  '$2b$10$yVVJsieRWwDOdPJhI8/pYOupMfWU9mYmAV25r33SFtPmHCuG0P7HO', 1, 3, 1),
  (6, 'Najmi Masjid Hall',       5, 'Venue 6 Coordinator', '+92 21 4350001', '+92 300 4350001', '6 Najmi Road, Karachi',     '$2b$10$yVVJsieRWwDOdPJhI8/pYOupMfWU9mYmAV25r33SFtPmHCuG0P7HO', 2, 5, 1),
  (7, 'Hakimi Hall',             6, 'Venue 7 Coordinator', '+92 21 4360001', '+92 300 4360001', '7 Hakimi Street, Karachi',  '$2b$10$yVVJsieRWwDOdPJhI8/pYOupMfWU9mYmAV25r33SFtPmHCuG0P7HO', 1, 4, 1),
  (8, 'Hakimi Annexe',           6, 'Venue 8 Coordinator', '+92 21 4360002', '+92 300 4360002', '8 Hakimi Street, Karachi',  '$2b$10$yVVJsieRWwDOdPJhI8/pYOupMfWU9mYmAV25r33SFtPmHCuG0P7HO', 1, 2, 0);

-- Parties — the party login identity, by ITS No. Password "Party@1234" for each.
-- Categories span A, B, C and H; the scheduler excludes H from automatic allocation.
INSERT INTO parties (id, its_no, leader_name, contact_number, whatsapp_number, party_name, zone_id, category, is_active, password_hash) VALUES
  (1,  '30100001', 'Party 1 Leader',  '+92 300 5000001', '+92 300 5000001', 'Hizbe Ammar',    1, 'A', 1, '$2b$10$SQqZAPgizmU7vEtY.Z39ee7XiZhBMnvy.NsGsGUtqc2QD.t/ZekTa'),
  (2,  '30100002', 'Party 2 Leader',  '+92 300 5000002', '+92 300 5000002', 'Hizbe Abedeen',  1, 'A', 1, '$2b$10$SQqZAPgizmU7vEtY.Z39ee7XiZhBMnvy.NsGsGUtqc2QD.t/ZekTa'),
  (3,  '30100003', 'Party 3 Leader',  '+92 300 5000003', '+92 300 5000003', 'Hizbe Fatemi',   1, 'B', 1, '$2b$10$SQqZAPgizmU7vEtY.Z39ee7XiZhBMnvy.NsGsGUtqc2QD.t/ZekTa'),
  (4,  '30100004', 'Party 4 Leader',  '+92 300 5000004', '+92 300 5000004', 'Hizbe Zainy',    2, 'A', 1, '$2b$10$SQqZAPgizmU7vEtY.Z39ee7XiZhBMnvy.NsGsGUtqc2QD.t/ZekTa'),
  (5,  '30100005', 'Party 5 Leader',  '+92 300 5000005', '+92 300 5000005', 'Hizbe Husami',   2, 'B', 1, '$2b$10$SQqZAPgizmU7vEtY.Z39ee7XiZhBMnvy.NsGsGUtqc2QD.t/ZekTa'),
  (6,  '30100006', 'Party 6 Leader',  '+92 300 5000006', '+92 300 5000006', 'Hizbe Qutbi',    2, 'C', 1, '$2b$10$SQqZAPgizmU7vEtY.Z39ee7XiZhBMnvy.NsGsGUtqc2QD.t/ZekTa'),
  (7,  '30100007', 'Party 7 Leader',  '+92 300 5000007', '+92 300 5000007', 'Hizbe Najmi',    3, 'A', 1, '$2b$10$SQqZAPgizmU7vEtY.Z39ee7XiZhBMnvy.NsGsGUtqc2QD.t/ZekTa'),
  (8,  '30100008', 'Party 8 Leader',  '+92 300 5000008', '+92 300 5000008', 'Hizbe Taheri',   3, 'B', 1, '$2b$10$SQqZAPgizmU7vEtY.Z39ee7XiZhBMnvy.NsGsGUtqc2QD.t/ZekTa'),
  (9,  '30100009', 'Party 9 Leader',  '+92 300 5000009', '+92 300 5000009', 'Hizbe Burhani',  3, 'C', 1, '$2b$10$SQqZAPgizmU7vEtY.Z39ee7XiZhBMnvy.NsGsGUtqc2QD.t/ZekTa'),
  (10, '30100010', 'Party 10 Leader', '+92 300 5000010', '+92 300 5000010', 'Mudreka Aziz',   1, 'H', 1, '$2b$10$SQqZAPgizmU7vEtY.Z39ee7XiZhBMnvy.NsGsGUtqc2QD.t/ZekTa'),
  (11, '30100011', 'Party 11 Leader', '+92 300 5000011', '+92 300 5000011', 'Hizbe Saifee',   2, 'C', 0, '$2b$10$SQqZAPgizmU7vEtY.Z39ee7XiZhBMnvy.NsGsGUtqc2QD.t/ZekTa');

-- Miqaats. Every hijri_date below was produced by the project's own conversion
-- (backend/src/utils/hijriDate.ts), so the seed is internally consistent.
INSERT INTO miqaats (id, miqaat_name, english_date, hijri_date, is_active) VALUES
  (1, 'Ashara Mubaraka',          '2026-07-06', '21st Moharram-ul-Haram 1448 AH', 1),
  (2, 'Chehlum',                  '2026-07-15', '30th Moharram-ul-Haram 1448 AH', 1),
  (3, 'Milad un Nabi',            '2026-09-13', '1st Rabi-ul-Akhar 1448 AH',      1),
  (4, 'Urus Mubarak',             '2026-12-25', '16th Rajab-ul-Asab 1448 AH',     1),
  (5, 'Shab e Meraj',             '2027-01-09', '1st Shaban-ul-Karim 1448 AH',    1);

-- A few published schedule rows, so Party and Coordinator screens are not empty.
INSERT INTO schedules (id, miqaat_id, venue_id, party_id, is_manual, is_published, created_by_role, created_by_id) VALUES
  (1, 1, 1, 1, 0, 1, 'admin', 1),
  (2, 1, 1, 2, 0, 1, 'admin', 1),
  (3, 1, 3, 3, 0, 1, 'admin', 1),
  (4, 1, 4, 4, 0, 1, 'admin', 1),
  (5, 1, 6, 7, 0, 1, 'admin', 1),
  (6, 2, 2, 1, 1, 1, 'admin', 1),
  (7, 2, 3, 5, 0, 0, 'admin', 1);

INSERT INTO party_venue_history (party_id, venue_id, visit_count) VALUES
  (1, 1, 3), (1, 2, 1), (2, 1, 2), (3, 3, 4), (4, 4, 1), (5, 3, 2), (7, 6, 5);


-- ----------------------------------------------------------------------------
-- 4. Membership lookups
--
--    is_draft = 1 means the UI shows the value as "DRAFT - NEEDS REVIEW".
--    Clear it with, for example:  UPDATE titles SET is_draft = 0 WHERE id = 1;
-- ----------------------------------------------------------------------------

-- Sanads — AUTHORITATIVE. These ten are named verbatim in the requirement, so is_draft = 0.
INSERT INTO sanads (sanad_name, display_order, is_active, is_draft) VALUES
  ('Surah Balad',                       1, 1, 0),
  ('Surah Inshiqaq',                    2, 1, 0),
  ('Marhala Ula',                       3, 1, 0),
  ('Marhala Sania',                     4, 1, 0),
  ('Marhala Salesa',                    5, 1, 0),
  ('Marhala Rabea',                     6, 1, 0),
  ('Marhala Khamesa',                   7, 1, 0),
  ('Marhala Sadesa',                    8, 1, 0),
  ('Marhala Sabea',                     9, 1, 0),
  ('Shahadat Hifz al-Quran al-Kareem', 10, 1, 0);

INSERT INTO marital_statuses (marital_status_name, display_order, is_active, is_draft) VALUES
  ('Single', 1, 1, 1), ('Married', 2, 1, 1), ('Widowed', 3, 1, 1), ('Divorced', 4, 1, 1);

INSERT INTO tamreen_frequencies (tamreen_frequency_name, display_order, is_active, is_draft) VALUES
  ('Daily', 1, 1, 1), ('Weekly', 2, 1, 1), ('Fortnightly', 3, 1, 1),
  ('Monthly', 4, 1, 1), ('Occasionally', 5, 1, 1), ('Never', 6, 1, 1);

INSERT INTO tamreen_methods (tamreen_method_name, display_order, is_active, is_draft) VALUES
  ('Self Study', 1, 1, 1), ('With a Group', 2, 1, 1), ('With an Ustad', 3, 1, 1),
  ('Audio Recording', 4, 1, 1), ('Video Recording', 5, 1, 1),
  ('Written Notes', 6, 1, 1), ('Other', 7, 1, 1);

-- Skills. Generic occupational categories. NO EXTERNAL SOURCE IS CLAIMED for this list.
INSERT INTO skills (skill_name, display_order, is_active, is_draft) VALUES
  ('Accounting and Finance', 1, 1, 1), ('Administration', 2, 1, 1), ('Architecture', 3, 1, 1),
  ('Audio and Sound Engineering', 4, 1, 1), ('Automotive and Mechanical', 5, 1, 1),
  ('Banking', 6, 1, 1), ('Carpentry', 7, 1, 1), ('Catering and Food Service', 8, 1, 1),
  ('Civil Engineering', 9, 1, 1), ('Construction', 10, 1, 1), ('Customer Service', 11, 1, 1),
  ('Data Entry', 12, 1, 1), ('Dentistry', 13, 1, 1), ('Design and Graphics', 14, 1, 1),
  ('Electrical', 15, 1, 1), ('Electronics', 16, 1, 1), ('Event Management', 17, 1, 1),
  ('First Aid and Paramedical', 18, 1, 1), ('Hardware Repair', 19, 1, 1),
  ('Human Resources', 20, 1, 1), ('Information Technology', 21, 1, 1), ('Insurance', 22, 1, 1),
  ('Legal', 23, 1, 1), ('Logistics and Transport', 24, 1, 1), ('Manufacturing', 25, 1, 1),
  ('Marketing', 26, 1, 1), ('Medicine', 27, 1, 1), ('Networking and Infrastructure', 28, 1, 1),
  ('Nursing', 29, 1, 1), ('Pharmacy', 30, 1, 1), ('Photography and Videography', 31, 1, 1),
  ('Plumbing', 32, 1, 1), ('Printing', 33, 1, 1), ('Project Management', 34, 1, 1),
  ('Public Speaking', 35, 1, 1), ('Real Estate', 36, 1, 1), ('Retail and Sales', 37, 1, 1),
  ('Security', 38, 1, 1), ('Software Development', 39, 1, 1),
  ('Tailoring and Textiles', 40, 1, 1), ('Teaching and Training', 41, 1, 1),
  ('Telecommunications', 42, 1, 1), ('Translation and Languages', 43, 1, 1),
  ('Travel and Tourism', 44, 1, 1), ('Welding and Fabrication', 45, 1, 1);

-- ############################################################################
-- #  PLACEHOLDERS: titles, sharafs, halqas, mozes, places             #
-- #                                                                          #
-- #  The production seed (membership_seed.sql) leaves these FIVE    #
-- #  lists EMPTY on purpose, because filling them would mean inventing        #
-- #  Dawoodi Bohra religious and organisational terms, and place names, and   #
-- #  presenting them as real.                                                #
-- #                                                                          #
-- #  Here they are filled with obviously-fake labels, so Tabs 2, 7, 8, 9 and  #
-- #  10 can actually be exercised locally. The labels say LOCAL TEST so they  #
-- #  can never be mistaken for the real thing.                               #
-- #                                                                          #
-- #  places is the Tab 8 list: the PLACES a member has visited, with   #
-- #  how many times and in which years. It is NOT derived from the existing   #
-- #  `miqaats` table, which is the scheduling calendar of majlis sessions.    #
-- #                                                                          #
-- #  Replace all five with your authoritative values before any real use.    #
-- ############################################################################

INSERT INTO titles (title_name, display_order, is_active, is_draft) VALUES
  ('LOCAL TEST Title A', 1, 1, 1),
  ('LOCAL TEST Title B', 2, 1, 1),
  ('LOCAL TEST Title C', 3, 1, 1);

INSERT INTO sharafs (sharaf_name, display_order, is_active, is_draft) VALUES
  ('LOCAL TEST Sharaf A', 1, 1, 1),
  ('LOCAL TEST Sharaf B', 2, 1, 1),
  ('LOCAL TEST Sharaf C', 3, 1, 1);

INSERT INTO halqas (halqa_name, display_order, is_active, is_draft) VALUES
  ('LOCAL TEST Halqa A', 1, 1, 1),
  ('LOCAL TEST Halqa B', 2, 1, 1);

INSERT INTO mozes (moze_name, display_order, is_active, is_draft) VALUES
  ('LOCAL TEST Moze A', 1, 1, 1),
  ('LOCAL TEST Moze B', 2, 1, 1),
  ('LOCAL TEST Moze C', 3, 1, 1);

-- Tab 8: places visited. Nothing here is derived from the `miqaats` scheduling table.
INSERT INTO places (place_name, display_order, is_active, is_draft) VALUES
  ('LOCAL TEST Place A', 1, 1, 1),
  ('LOCAL TEST Place B', 2, 1, 1),
  ('LOCAL TEST Place C', 3, 1, 1);


-- ----------------------------------------------------------------------------
-- 5. Sample member accounts and profiles
--
--    Five accounts covering every state the module has to handle. Password
--    "Member@1234" for all of them.
-- ----------------------------------------------------------------------------

INSERT INTO member_accounts (id, its_no, member_name, password_hash, must_change_password, password_changed_at, is_active) VALUES
  -- Fresh: forced password change still outstanding. Use this to test that path.
  (1, '30200001', 'Fresh Member One',    '$2b$10$Whau0joPM8E7hMgdR4U/nenjK906UZTwF0BYdza.YW9Aemnr8NMCO', 1, NULL, 1),
  (2, '30200002', 'Fresh Member Two',    '$2b$10$Whau0joPM8E7hMgdR4U/nenjK906UZTwF0BYdza.YW9Aemnr8NMCO', 1, NULL, 1),
  -- Settled: password already chosen, so sign-in goes straight to the profile.
  (3, '30200003', 'Complete Member',     '$2b$10$Whau0joPM8E7hMgdR4U/nenjK906UZTwF0BYdza.YW9Aemnr8NMCO', 0, '2026-10-01 10:00:00', 1),
  (4, '30200004', 'Partial Member',      '$2b$10$Whau0joPM8E7hMgdR4U/nenjK906UZTwF0BYdza.YW9Aemnr8NMCO', 0, '2026-10-05 11:30:00', 1),
  -- Deactivated: must be refused at sign-in, with the same message as a wrong password.
  (5, '30200005', 'Deactivated Member',  '$2b$10$Whau0joPM8E7hMgdR4U/nenjK906UZTwF0BYdza.YW9Aemnr8NMCO', 0, '2026-09-20 09:00:00', 0);

-- A fully populated profile across all twelve tabs, for member 3 (ITS 30200003).
-- The Hijri date of birth was computed with the project's own converter.
-- `bmi` is omitted because it is a generated column: MySQL rejects any write to it.
INSERT INTO member_profiles (
  member_account_id,
  first_prefix, name, father_prefix, father_name, surname,
  dob_gregorian, dob_hijri_day, dob_hijri_month, dob_hijri_year, dob_hijri_text,
  marital_status_id, residence_address,
  phone_no, mobile_no_1, mobile_no_2, whatsapp_no_1, whatsapp_no_2, email,
  prefix_year,
  zone_id, party_id, hizb_role,
  occupation_type, organisation_name, designation, occupation_since_year, work_address, work_phone_no,
  education_level, major_subjects, education_status,
  has_hifz_sanad, sanad_id, hifz_current_surah, hifz_current_ayyah, hifz_last_update,
  blood_group, is_regular_donor, last_donation_date, height_cm, weight_kg,
  asbaq_level, halqa_id, asbaq_ustad,
  attends_karachi_tamreen, tamreen_absence_reason,
  party_tamreen_frequency_id, solo_tamreen_frequency_id, tamreen_method_id,
  takes_ustad_assistance, uses_idaratuz_zakereen_books,
  khidmat_type, sansta_name, umoor_name, khidmat_designation, khidmat_since_year
) VALUES (
  3,
  'Sheikh', 'Complete', 'Mulla', 'Father Name', 'Surname',
  '1985-03-14', 22, 6, 1405, '22nd Jammad-il-Ukhra 1405 AH',
  2, '12 Example Street, Saifee Mohallah, Karachi',
  '+92 21 3500001', '+92 300 6000001', '+92 321 6000001', '+92 300 6000001', NULL, 'complete.member@example.test',
  2008,
  1, 1, 'Leader',
  'Job', 'Example Engineering Pvt Ltd', 'Senior Engineer', 2010, 'Plot 5, Industrial Area, Karachi', '+92 21 3500002',
  'Bachelors', 'Mechanical Engineering', 'Complete',
  1, 5, 'Al-Baqarah', '150-200', '2026-10-15',
  'O+', 1, '2026-06-10', 174.00, 72.50,
  'Taweel', 1, 'Ustad Example Name',
  1, NULL,
  2, 1, 3,
  1, 1,
  'Both', 'Example Sansta', 'Example Umoor', 'Committee Member', 2015
);

-- A deliberately partial profile for member 4 (ITS 30200004): Tab 1 only, nothing else.
-- This exercises the rule that a profile can be saved incomplete and finished later.
INSERT INTO member_profiles (
  member_account_id, first_prefix, name, father_prefix, father_name, surname,
  dob_gregorian, dob_hijri_day, dob_hijri_month, dob_hijri_year, dob_hijri_text,
  marital_status_id, mobile_no_1, email
) VALUES (
  4, 'None', 'Partial', 'None', 'Father Name', 'Surname',
  '1992-11-02', 7, 5, 1413, '7th Jammad-il-Ula 1413 AH',
  1, '+92 300 6000002', 'partial.member@example.test'
);

-- Repeatable sections for member 3.
INSERT INTO member_titles (member_account_id, title_id, title_year) VALUES
  (3, 1, 2012), (3, 2, 2018), (3, 1, 2021);

INSERT INTO member_sharafs (member_account_id, sharaf_id, sharaf_year) VALUES
  (3, 1, 2014), (3, 2, 2019), (3, 3, 2023);

INSERT INTO member_skills (member_account_id, skill_id) VALUES
  (3, 21), (3, 35), (3, 41), (3, 9);

-- Tab 8: `times_count` MUST equal the number of year rows attached, or a save is refused.
-- Both rows below satisfy that, so they are valid starting data.
INSERT INTO member_place_visits (id, member_account_id, place_id, times_count) VALUES
  (1, 3, 1, 3),
  (2, 3, 2, 2);

INSERT INTO member_place_visit_years (member_place_visit_id, visited_year) VALUES
  (1, 2019), (1, 2022), (1, 2024),
  (2, 2021), (2, 2023);

-- Tab 9: one record per member per Hijri year, enforced by a unique key.
INSERT INTO member_ashara_attendances (member_account_id, attended_with, hijri_year, moze_id, mohallah_id) VALUES
  (3, 'With Aqa Moula TUS', 1441, 1, 1),
  (3, 'With Aamil',         1443, 2, 1),
  (3, 'With Aqa Moula TUS', 1446, 1, 2);


-- ----------------------------------------------------------------------------
-- 6. Verification and credentials
-- ----------------------------------------------------------------------------

SELECT 'Tables created' AS check_name, COUNT(*) AS value
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE();
-- Expected: 33  (13 existing + 20 membership)

SELECT 'bmi is a generated column' AS check_name, EXTRA AS value
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_profiles' AND COLUMN_NAME = 'bmi';
-- Expected: VIRTUAL GENERATED

-- Confirms the generated column computes: 72.50kg at 174cm is about 23.95.
SELECT ma.its_no, mp.height_cm, mp.weight_kg, mp.bmi
FROM member_profiles mp
JOIN member_accounts ma ON ma.id = mp.member_account_id;

-- Confirms the Tab 8 rule holds for the seeded rows: counts must match.
SELECT mt.place_name, mm.times_count, COUNT(my.id) AS year_rows,
       IF(mm.times_count = COUNT(my.id), 'OK', 'MISMATCH') AS consistency
FROM member_place_visits mm
JOIN places mt ON mt.id = mm.place_id
LEFT JOIN member_place_visit_years my ON my.member_place_visit_id = mm.id
GROUP BY mm.id, mt.place_name, mm.times_count;

SELECT 'row counts' AS section, '' AS tbl, NULL AS n
UNION ALL SELECT '', 'zones', COUNT(*) FROM zones
UNION ALL SELECT '', 'mohallahs', COUNT(*) FROM mohallahs
UNION ALL SELECT '', 'parties', COUNT(*) FROM parties
UNION ALL SELECT '', 'venues', COUNT(*) FROM venues
UNION ALL SELECT '', 'miqaats', COUNT(*) FROM miqaats
UNION ALL SELECT '', 'schedules', COUNT(*) FROM schedules
UNION ALL SELECT '', 'member_accounts', COUNT(*) FROM member_accounts
UNION ALL SELECT '', 'member_profiles', COUNT(*) FROM member_profiles
UNION ALL SELECT '', 'places', COUNT(*) FROM places
UNION ALL SELECT '', 'skills', COUNT(*) FROM skills;

-- ============================================================================
-- LOCAL CREDENTIALS  (all weak and published — local use only)
--
--   Role          Role dropdown       Identifier                  Password
--   -----------   -----------------   -------------------------   ------------
--   Admin         Admin               admin                       Admin@1234
--   Zonal Head    Zonal Head          Karachi Central   (or 1)    Zone@1234
--   Party         Party               30100001                    Party@1234
--   Coordinator   Venue Coordinator   Saifee Masjid Hall (or 1)   Venue@1234
--   Member        Member  (new)       30200001                    Member@1234
--
--   Member accounts and what each is for:
--     30200001  forced password change outstanding  -> test that flow
--     30200002  forced password change outstanding  -> second fresh account
--     30200003  settled, FULL profile across 12 tabs
--     30200004  settled, PARTIAL profile (Tab 1 only)
--     30200005  DEACTIVATED -> must be refused at sign-in
-- ============================================================================
