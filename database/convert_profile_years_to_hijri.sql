-- ==========================================================================
-- CONVERT THE FIVE PROFILE YEAR FIELDS FROM GREGORIAN TO HIJRI
-- ==========================================================================
--
-- Feature : 001-membership-module
-- Date    : 2026-11-04
--
-- WHY
--   Prefix Year, Title Year, Sharaf Year, Place Visited Year and the Other Sansta
--   "Since" year are Hijri (AH). They used to be offered as Gregorian 1950-2026,
--   so anything entered before this change is in the wrong calendar.
--
--   This is the kind of mistake nothing catches on its own: a Hijri year sits
--   inside 1950-2026 as comfortably as a Gregorian one. Left alone, the column
--   would hold both calendars at once and no later reader could tell which was
--   which.
--
-- WHAT IT CHANGES
--   Five columns, and ONLY values that are unambiguously Gregorian (>= 1900):
--
--     member_profiles.prefix_year
--     member_profiles.khidmat_since_year
--     member_titles.title_year
--     member_sharafs.sharaf_year
--     member_place_visit_years.visited_year
--
--   occupation_since_year is NOT touched. It is still Gregorian by design — the
--   server validates it against the member's Gregorian year of birth.
--
-- THE CONVERSION
--   FLOOR((gregorian - 622) * 33 / 32), the standard mid-year approximation.
--   A Gregorian year straddles two Hijri years, so an exact answer does not
--   exist; mid-year is the one that covers most of it. Verified against the
--   application's own converter (backend/src/utils/hijriDate.ts):
--     2005 -> 1426, 2006 -> 1427.
--
-- IT IS SAFE TO RE-RUN
--   The >= 1900 guard means a converted value (1401-1448) is never converted a
--   second time. Running it twice changes nothing the second time.
--
-- ROLLBACK
--   There is none, because the original value cannot be recovered from the
--   converted one. TAKE A BACKUP FIRST. The BEFORE block below prints every row
--   this will change, so keep the log.
--
-- HOW TO RUN
--   mysql -h <host> -u <user> -p <database> \
--     < database/convert_profile_years_to_hijri.sql > convert.log 2>&1
--
--   Then compare the BEFORE and AFTER blocks. Every value in AFTER must be
--   between 1401 and the current Hijri year, and gregorian_remaining must be 0.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- Refuse to run against a database that is not this one.
-- --------------------------------------------------------------------------
SELECT COUNT(*) INTO @has_profiles
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_profiles';

SET @abort = IF(@has_profiles = 1, 'ok', NULL);
SELECT CONCAT('Running against: ', DATABASE()) AS target;
-- Errors with "Column 'abort_wrong_database' cannot be null" if member_profiles
-- is absent, before anything is written.
CREATE TEMPORARY TABLE _mpss_guard (abort_wrong_database VARCHAR(8) NOT NULL);
INSERT INTO _mpss_guard (abort_wrong_database) VALUES (@abort);
DROP TEMPORARY TABLE _mpss_guard;

-- --------------------------------------------------------------------------
-- BEFORE — every value this will change. Keep this.
-- --------------------------------------------------------------------------
SELECT 'BEFORE' AS phase, 'member_profiles.prefix_year' AS field,
       id AS row_id, prefix_year AS gregorian,
       FLOOR((prefix_year - 622) * 33 / 32) AS hijri
FROM member_profiles WHERE prefix_year >= 1900
UNION ALL
SELECT 'BEFORE', 'member_profiles.khidmat_since_year',
       id, khidmat_since_year, FLOOR((khidmat_since_year - 622) * 33 / 32)
FROM member_profiles WHERE khidmat_since_year >= 1900
UNION ALL
SELECT 'BEFORE', 'member_titles.title_year',
       id, title_year, FLOOR((title_year - 622) * 33 / 32)
FROM member_titles WHERE title_year >= 1900
UNION ALL
SELECT 'BEFORE', 'member_sharafs.sharaf_year',
       id, sharaf_year, FLOOR((sharaf_year - 622) * 33 / 32)
FROM member_sharafs WHERE sharaf_year >= 1900
UNION ALL
SELECT 'BEFORE', 'member_place_visit_years.visited_year',
       id, visited_year, FLOOR((visited_year - 622) * 33 / 32)
FROM member_place_visit_years WHERE visited_year >= 1900;

-- --------------------------------------------------------------------------
-- The conversion. One transaction: either all five columns move or none do.
--
-- A unique key could in principle be violated — two Gregorian years can land on
-- one Hijri year, and (member_account_id, title_id, title_year) is unique. If
-- that happens the statement errors and the whole transaction rolls back, which
-- is the behaviour we want: a silently dropped row would be worse. Resolve the
-- clash by hand and run again.
-- --------------------------------------------------------------------------
START TRANSACTION;

UPDATE member_profiles
   SET prefix_year = FLOOR((prefix_year - 622) * 33 / 32)
 WHERE prefix_year >= 1900;

UPDATE member_profiles
   SET khidmat_since_year = FLOOR((khidmat_since_year - 622) * 33 / 32)
 WHERE khidmat_since_year >= 1900;

UPDATE member_titles
   SET title_year = FLOOR((title_year - 622) * 33 / 32)
 WHERE title_year >= 1900;

UPDATE member_sharafs
   SET sharaf_year = FLOOR((sharaf_year - 622) * 33 / 32)
 WHERE sharaf_year >= 1900;

UPDATE member_place_visit_years
   SET visited_year = FLOOR((visited_year - 622) * 33 / 32)
 WHERE visited_year >= 1900;

COMMIT;

-- --------------------------------------------------------------------------
-- AFTER — gregorian_remaining must be 0 on every row.
-- --------------------------------------------------------------------------
SELECT 'AFTER' AS phase, 'member_profiles.prefix_year' AS field,
       COUNT(*) AS values_set,
       SUM(prefix_year >= 1900) AS gregorian_remaining,
       MIN(prefix_year) AS lowest, MAX(prefix_year) AS highest
FROM member_profiles WHERE prefix_year IS NOT NULL
UNION ALL
SELECT 'AFTER', 'member_profiles.khidmat_since_year', COUNT(*),
       SUM(khidmat_since_year >= 1900), MIN(khidmat_since_year), MAX(khidmat_since_year)
FROM member_profiles WHERE khidmat_since_year IS NOT NULL
UNION ALL
SELECT 'AFTER', 'member_titles.title_year', COUNT(*),
       SUM(title_year >= 1900), MIN(title_year), MAX(title_year)
FROM member_titles
UNION ALL
SELECT 'AFTER', 'member_sharafs.sharaf_year', COUNT(*),
       SUM(sharaf_year >= 1900), MIN(sharaf_year), MAX(sharaf_year)
FROM member_sharafs
UNION ALL
SELECT 'AFTER', 'member_place_visit_years.visited_year', COUNT(*),
       SUM(visited_year >= 1900), MIN(visited_year), MAX(visited_year)
FROM member_place_visit_years;

-- occupation_since_year is listed only to show it was deliberately left alone.
SELECT 'UNCHANGED' AS phase, 'member_profiles.occupation_since_year' AS field,
       COUNT(*) AS values_set, MIN(occupation_since_year) AS lowest,
       MAX(occupation_since_year) AS highest
FROM member_profiles WHERE occupation_since_year IS NOT NULL;
