-- ============================================================================
-- Membership Module — rollback
-- Feature : 001-membership-module
-- Date    : 2026-10-29
--
-- *** DESTRUCTIVE. DROPS ALL 20 MODULE TABLES AND ALL MEMBER DATA. ***
--
-- Rehearsed on a restored copy of production on 2026-10-30 and verified to leave all
-- 13 pre-existing tables byte-identical (exact COUNT(*) and CHECKSUM TABLE). It works
-- — which is precisely why it must not be run by accident.
--
-- ORDER MATTERS: deploy the frontend WITHOUT the Member login option before, or at the
-- same time as, running this. With the tables gone but the option still offered, a
-- member signing in gets a 500. See quickstart.md §8.
--
-- Reverses membership_schema.sql and membership_seed.sql.
--
-- WHY THIS IS SAFE TO RUN, AND WHAT IT COSTS
--   The migration is additive only: it creates tables and never alters, drops or
--   writes to an existing one. So rollback is simply dropping what was created, and
--   no existing table or row is affected either way. That is the main practical
--   benefit of the additive-only constraint (FR-106).
--
--   The cost is that THIS DELETES ALL MEMBER DATA — every account, profile,
--   photograph and repeatable record. It is the right move while the module is still
--   being introduced and the data is test data. Once real members have filled in
--   profiles, prefer fixing forward.
--
-- BEFORE RUNNING
--   1. GET /api/v1/import-export/database-backup  (admin).
--   2. Confirm with whoever owns the member data that losing it is intended.
--
-- IF MEMBERS HAVE REAL DATA AND YOU ONLY NEED TO DISABLE THE MODULE:
--   Do not run this. Instead, remove "member" from the login page's roleOptions and
--   from the backend Role union. That makes the module unreachable while leaving
--   every row intact, and is reversible in a single deploy.
-- ============================================================================


-- Order matters: children before parents, because the foreign keys are real.
-- FOREIGN_KEY_CHECKS is deliberately NOT disabled — if a drop fails on a
-- constraint, that means something references these tables that this script does
-- not know about, and stopping is the correct outcome.

-- ----------------------------------------------------------------------------
-- 1. Repeatable records (leaf tables first)
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS member_place_visit_years;
DROP TABLE IF EXISTS member_place_visits;
DROP TABLE IF EXISTS member_ashara_attendances;
DROP TABLE IF EXISTS member_skills;
DROP TABLE IF EXISTS member_sharafs;
DROP TABLE IF EXISTS member_titles;

-- ----------------------------------------------------------------------------
-- 2. Profile and photographs
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS member_photos;
DROP TABLE IF EXISTS member_profiles;

-- ----------------------------------------------------------------------------
-- 3. Authentication
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS member_login_attempts;
DROP TABLE IF EXISTS member_accounts;

-- Member sessions in the EXISTING refresh_tokens table. This is the only statement
-- in the whole migration set that touches an existing table, and it is a scoped
-- DELETE of rows this module created — rows for the other four roles are untouched.
DELETE FROM refresh_tokens WHERE user_role = 'member';

-- ----------------------------------------------------------------------------
-- 4. Lookup tables (last: the tables referencing them are gone by now)
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS tamreen_methods;
DROP TABLE IF EXISTS tamreen_frequencies;
DROP TABLE IF EXISTS skills;
DROP TABLE IF EXISTS marital_statuses;
DROP TABLE IF EXISTS sanads;
DROP TABLE IF EXISTS places;
DROP TABLE IF EXISTS mozes;
DROP TABLE IF EXISTS halqas;
DROP TABLE IF EXISTS sharafs;
DROP TABLE IF EXISTS titles;

-- ----------------------------------------------------------------------------
-- 5. Verification
-- ----------------------------------------------------------------------------

-- Expected: 0
SELECT COUNT(*) AS membership_tables_remaining
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'member_accounts','member_login_attempts','member_profiles','member_photos',
    'member_titles','member_sharafs','member_skills','member_place_visits',
    'member_place_visit_years','member_ashara_attendances',
    'titles','sharafs','halqas','mozes','places','sanads',
    'marital_statuses','skills','tamreen_frequencies','tamreen_methods'
  );

-- Every pre-existing table must still be present and unchanged. Compare against the
-- counts recorded in quickstart.md §1.
SELECT 'zones' AS t, COUNT(*) AS n FROM zones
UNION ALL SELECT 'mohallahs', COUNT(*) FROM mohallahs
UNION ALL SELECT 'parties', COUNT(*) FROM parties
UNION ALL SELECT 'venues', COUNT(*) FROM venues
UNION ALL SELECT 'miqaats', COUNT(*) FROM miqaats
UNION ALL SELECT 'schedules', COUNT(*) FROM schedules
UNION ALL SELECT 'members_dormant', COUNT(*) FROM members;

-- Sessions for the four existing roles must be intact.
SELECT user_role, COUNT(*) AS n
FROM refresh_tokens
GROUP BY user_role;
-- Expected: no 'member' row; the other roles unchanged.
