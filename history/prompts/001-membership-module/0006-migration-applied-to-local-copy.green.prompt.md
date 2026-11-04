---
id: 0006
title: Migration Applied To Local Copy
stage: green
date: 2026-10-29
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["migration-applied", "collation-bug", "local-environment", "verification", "membership-module"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - .gitignore
  - specs/001-membership-module/migrations/001_membership_schema.draft.sql
  - database/local-dev/local_dev_setup.sql
  - database/local-dev/before-state-baseline.md
  - database/local-dev/README.md
  - PROJECT_AS_IS.md
  - specs/001-membership-module/data-model.md
  - specs/001-membership-module/plan.md
  - specs/001-membership-module/tasks.md
  - history/prompts/001-membership-module/0006-migration-applied-to-local-copy.green.prompt.md
tests:
  - migration executed against the local masjid_scheduling copy - 20 tables created, 33 total
  - ONE distinct table collation across all 33 tables (utf8mb4_general_ci) - the point of the fix
  - bmi rejects a direct write with error 3105 and computes 23.95 from 174cm/72.5kg
  - the its_no cross-table join between member_accounts and parties executes without error 1267
  - all 12 pre-existing row counts identical to the T008 baseline
  - backend starts against the database, /health reports db_name masjid_scheduling, both auth paths return 401 not 500
---

## Prompt

Turn 1: `Check database info in .env`

Turn 2: `next`

(Preceded by the IDE reporting that `backend/.env` had been opened.)

## Response snapshot

### What the `.env` check found

`DB_NAME` had been changed from the `mpss_local` I set to **`masjid_scheduling`** — and that
database already existed locally, holding a **real copy of production**: 80 parties, 651
schedules, 491 party-venue history rows, 51 venues, 19 miqaats, 2 zones (City Saddar, Hyderi),
1 admin, 2343 refresh tokens. So the sample-data script was unnecessary; the better path was
Route B from the local-dev README, against real data.

Three things that data settled:

- **`members` holds 0 rows**, confirming that leaving the dormant table alone (research R1) costs nothing.
- **All 80 parties have an `its_no` and a password hash**, 57 active, so the Phase 3 party-login regression tests can run against real records.
- **No category `H` parties exist** — all 80 are A, B or C — so the "H excluded from auto-scheduling" rule has no data to exercise on this copy.

### The bug the real database exposed

**Every one of the 13 existing tables is `utf8mb4_general_ci`, while the database default is
`utf8mb4_0900_ai_ci`.** The migration declared only `DEFAULT CHARSET=utf8mb4`, so all 20 new
tables would have inherited `0900_ai_ci` and mismatched everything existing. Any comparison
between a new VARCHAR column and an old one — `member_accounts.its_no` against `parties.its_no`
most obviously — would have failed with **error 1267, "Illegal mix of collations"**, and would
have surfaced only once someone wrote that join, well into Stage 2.

Fixed by declaring `COLLATE=utf8mb4_general_ci` explicitly on all 20 tables, with a comment
explaining why so it does not get "simplified" away later.

It also means **`database/mpss_mysql.sql` is wrong**: it declares the database as
`utf8mb4_unicode_ci`, which the live schema contradicts. Corrected in `PROJECT_AS_IS.md`,
`data-model.md`, `plan.md` and the local-dev README, each now pointing at the live schema as
the authority.

This is the clearest argument for the user's instinct to test locally against real data: the
bug was invisible to every offline structural check, which all passed.

### Migration applied and verified

Backup first: `mysqldump --single-transaction`, 435K, 13 tables, into
`database/local-dev/dumps/`, with `.gitignore` rules added **before** the dump was written so
real personal data could never be committed.

Then `001` and `002`, and every check passed:

| Check | Result |
|---|---|
| Tables | 33 (13 + 20) |
| Distinct collations | **1** — `utf8mb4_general_ci` |
| `bmi` | `VIRTUAL GENERATED`; direct write rejected with error 3105; computes 23.95 |
| `its_no` cross-table join | executes, no 1267 |
| 12 pre-existing row counts | all identical to baseline |
| Backend | starts; `/health` reports `db_name: masjid_scheduling`; auth returns 401 not 500 |

A probe row confirmed the generated column *and* the cascade delete, then cleaned itself up:
`member_accounts` and `member_profiles` both back to 0.

### A second finding, from running the seed on real data

The seed derives Miqaat types with `SELECT DISTINCT miqaat_name FROM miqaats`. It produced
**19 types from 19 rows — nothing collapsed**, which revealed what `miqaats` actually contains:
`All Waaz`, `2nd Day | 3ji Raat Majlis` through `9th Day | Ashura Raat Majlis`,
`Chehlum Raat: Imam Hussain (S.A.)`, several named Urus, and
`16mi Raat - Safar-ul-Muzaffar 1448H` — with a Hijri year inside the name. All dated
2026-06-16 to 2026-10-25, 18 of 19 inactive.

So `miqaats` is the **majlis schedule for one year (1448H)**, not a set of repeatable occasion
types. That vindicates the decision not to reuse it for Tab 8, but it also means the derived
list is the wrong granularity: Tab 8 asks how many times a member attended a Miqaat and in
which years, which needs occasions like Ashara Mubaraka or Chehlum, not individual nightly
sessions.

All 19 are `is_draft = 1`, so nothing is presented as authoritative. **`miqaat_types` is now a
fifth lookup needing the user's input**, alongside `titles`, `sharafs`, `halqas` and `mozes`.

## Outcome

- Impact: the local environment is fully configured and the schema is live on a real-data copy. 16 of 124 tasks complete — T006, T007, T008, T014, T015, T016 all closed this run, which unblocks Phase 3.
- Tests: the migration itself is now verified by execution rather than structural inspection alone. The 165 unit tests from the previous run still pass; no application code was touched here.
- Files: 2 created (`before-state-baseline.md`, this record), 8 modified — the collation fix in two SQL scripts, three documentation corrections, `.gitignore`, and task status.
- Next prompts: Phase 3 (T019-T026) — the regression suite, which can now run against real party, admin, zonal-head and coordinator records. It must be green before T046 touches `authService.ts`.
- Reflection: every offline check on the migration passed, and the migration was still wrong. The collation defect could not be found by reading the file, only by looking at the database it was going to run against — and it would have failed late, in a join nobody had written yet. The lesson is narrow and worth keeping: for schema work, "validated" means executed against a representative copy, not parsed.

## Evaluation notes (flywheel)

- Failure modes observed: the migration shipped with an implicit-collation defect that six separate structural validations passed over, because the fault lay in the gap between the script and the target database rather than in the script. Also notable: `database/mpss_mysql.sql` had been trusted as the schema of record for three earlier runs and is wrong about collation; the live database should have been the authority from the start. Minor: 28 "Integer display width is deprecated" warnings from `TINYINT(1)`, left as-is because the existing 13 tables use the same form and matching the codebase matters more than silencing a warning.
- Graders run and results (PASS/FAIL): PASS — 33 tables; one collation; `bmi` generated, write-rejecting and numerically correct; cross-table `its_no` join executes; all 12 baseline row counts identical; backend boots and serves `/health`; `ensureSchema` confirmed a no-op because its three columns already exist.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): before writing any migration, query the target's actual `TABLE_COLLATION` and `SCHEMATA` defaults rather than reading the committed schema file. One query would have pre-empted this entire defect.
