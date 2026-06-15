CREATE DATABASE IF NOT EXISTS masjid_scheduling
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE masjid_scheduling;

CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(100) NOT NULL,
  admin_name VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS zones (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mohallahs (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS parties (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS members (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS venues (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  venue_name VARCHAR(150) NOT NULL,
  mohallah_id INT UNSIGNED NOT NULL,
  coordinator_name VARCHAR(150) NULL,
  contact_number VARCHAR(20) NULL,
  whatsapp_number VARCHAR(20) NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS miqaats (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  miqaat_name VARCHAR(150) NOT NULL,
  english_date DATE NOT NULL,
  hijri_date VARCHAR(50) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_miqaats_date (english_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS schedules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  miqaat_id INT UNSIGNED NOT NULL,
  venue_id INT UNSIGNED NOT NULL,
  party_id INT UNSIGNED NOT NULL,
  is_manual TINYINT(1) NOT NULL DEFAULT 0,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS schedule_edits (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ratings (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS performance_ratings (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS party_venue_history (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refresh_tokens (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO admins (username, admin_name, password_hash)
VALUES ('admin', 'System Admin', '$2b$10$/Y4NYMHT/5NDeFbFY7ty7e92kaACeq6nxPS3z5m.GWSohNAloziAu')
ON DUPLICATE KEY UPDATE admin_name = VALUES(admin_name), password_hash = VALUES(password_hash);
