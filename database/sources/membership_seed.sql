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
UNION ALL SELECT 'mozes',               COUNT(*), SUM(is_active), SUM(is_draft) FROM mozes;

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
