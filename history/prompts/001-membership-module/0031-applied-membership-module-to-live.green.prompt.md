---
id: 0031
title: Applied membership module to live
stage: green
date: 2026-11-04
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 002-single-live-script
user: Fakhruddins128
command: /sp.implement
labels: ["database", "migration", "production", "mariadb", "collation", "backup"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: https://github.com/maimoontech/allocation/pull/new/002-single-live-script
files:
  - .gitignore (added database/backups/)
  - database/backups/masjid_scheduling-pre-membership-20261104-123139.sql (untracked, local only)
tests:
  - live apply of database/MEMBERSHIP_LIVE_INSTALL.sql: exit 0, no errors, no warnings
  - information_schema census on live vs dev: 192 columns, 70 index columns, 22 FKs - identical
  - collation audit of the 20 new tables: 0 tables and 0 text columns deviate from utf8mb4_general_ci
  - cross-table its_no join (member_accounts to parties): executes, no error 1267
  - BEFORE/AFTER row counts of all 13 pre-existing tables: identical
  - leftover procedures after run: 0
  - ensureSchema.ts boot columns already present on live: 3/3, so startup will not ALTER
---

## Prompt

I am update live database detail in .env
now update Database with membership module tables with master data

## Response snapshot

Applied the module to production. The headline is not the apply - that went cleanly - but what
the pre-flight inspection found, because the live server is **not** what every assumption so far
had been built on.

**Live is MariaDB 11.4.7, not MySQL 8.** Dev is MySQL 8. Nothing in the script, the generator,
the guard tests or `DATABASE.md` had ever been exercised against MariaDB. Checked before
running rather than discovering it halfway through:

- The version guard parses `VERSION()` as major/minor. MariaDB reports `11.4.7-MariaDB`, so it
  computes 1104 >= 507 and passes. Correct outcome, but by luck of the format rather than by
  design - the guard's message still says "MySQL 5.7+".
- `DELIMITER` + `CREATE PROCEDURE` + `SIGNAL SQLSTATE` all behave identically. MariaDB has
  supported them since 5.5.
- The VIRTUAL generated `bmi` column was accepted and reports `VIRTUAL GENERATED` with the
  expected expression.
- Scanned the script for MySQL-8-only syntax. Every hit for `0900_ai_ci` and `utf8mb4_unicode_ci`
  is in a comment, not in a statement.

**The collation trap is real here, with the opposite polarity to the one documented.** The
database default is `utf8mb3 / utf8mb3_general_ci`, not MySQL 8's `utf8mb4_0900_ai_ci`. All 13
pre-existing tables are `utf8mb4_general_ci`. So a module table created with an inherited default
would have come out **utf8mb3** and broken every `its_no` comparison. The explicit
`COLLATE=utf8mb4_general_ci` on all 20 tables is what prevented it. Verified after the fact: 0
tables and 0 text columns deviate, and a `member_accounts` to `parties` join on `its_no` executes
without error 1267.

**Backup first.** The grant is scoped to `masjid_scheduling` alone - no `CREATE DATABASE` - so a
rehearsal schema on the live server was not possible and there was no way to dry-run against the
real engine. That made a backup the only safety net, so it came before the apply: 13 tables,
447 KB, `Dump completed` marker present, INSERT data for all 11 non-empty tables. `mysqldump` 8.0
needed `--column-statistics=0` to talk to MariaDB.

`database/backups/` was untracked but **not ignored**. A dump of this database contains the admin
bcrypt hashes and 2,353 refresh tokens, so it was one `git add -A` away from being published to
the repository. Added to `.gitignore` before anything else.

**Result.** 20 tables created, 5 approval columns, 2 approval indexes, all ten lookup lists
seeded with `still_draft = 0` across 86 values, and BEFORE/AFTER row counts identical for all 13
pre-existing tables - the additive-only guarantee (FR-106) held in production. `information_schema`
census matches dev exactly: 192 columns, 70 index columns, 22 foreign keys.

Also confirmed `ensureSchema.ts` will not mutate live at boot: all three columns it ensures
(`schedules.is_published`, `venues.address`, `venues.google_map_link`) already exist.

Credentials were passed via a `--defaults-extra-file` written to the scratchpad, so the password
never appeared in a command line or process listing, and the file was deleted afterwards.

## Outcome

- ✅ Impact: the membership module is live. Master data is seeded and reviewed; zero member
  accounts exist yet, so provisioning from the roster is the remaining step before members can
  sign in.
- 🧪 Tests: apply exit 0 with no warnings; schema census identical to dev; collation audit clean;
  cross-collation join proven; pre-existing row counts unchanged; 0 leftover procedures.
- 📁 Files: 1 changed (`.gitignore`), 1 backup created outside version control.
- 🔁 Next prompts: provision member accounts from the roster; deploy the frontend; consider
  whether the server clock warrants attention (it runs ~13h behind local, so `created_at` is
  stamped in server time - pre-existing behaviour, not introduced here).
- 🧠 Reflection: the engine was never verified. Every document said "MySQL 8 / InnoDB" and the
  live server is MariaDB with a utf8mb3 default - so the one defensive measure that mattered most,
  explicit per-table collation, was adopted for a reason that turned out to be the wrong reason
  and protected against a different failure than the one it was written for. Worth generalising:
  the script was verified against a scratch copy of the *dev* engine, which proves portability to
  nothing. Checking `VERSION()` and the database default collation should be the first two
  statements of any such inspection, not an afterthought.

## Evaluation notes (flywheel)

- Failure modes observed: (1) a production engine differing in *vendor* from dev, with no document
  recording it and no test covering it; (2) the database default collation differing from the
  table collation, so inheriting the default silently produces a schema that joins against nothing;
  (3) a backup directory that was untracked but unignored - invisible in `git status` as a concern,
  yet one `git add -A` from publishing admin hashes and refresh tokens; (4) `mysqldump` 8.0 needing
  `--column-statistics=0` for MariaDB, which fails the whole dump rather than degrading.
- Graders run and results (PASS/FAIL): live apply - PASS (exit 0, no warnings). Schema census vs
  dev - PASS (192/70/22 identical). Collation audit - PASS (0 deviations). Cross-collation join -
  PASS (no 1267). Additive-only BEFORE/AFTER - PASS (13/13 unchanged). Backup integrity - PASS.
  ensureSchema no-op check - PASS (3/3 present).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): have the script's own pre-flight record `VERSION()`,
  `@@collation_database` and the distinct `TABLE_COLLATION` of pre-existing tables, and abort if
  the pre-existing tables are not all one collation - so the next environment states its shape
  instead of being assumed. Also reword the version-guard message, which claims MySQL on a
  MariaDB server.
