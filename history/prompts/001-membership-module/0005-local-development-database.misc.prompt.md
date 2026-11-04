---
id: 0005
title: Local Development Database
stage: misc
date: 2026-10-29
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["local-environment", "database-seed", "developer-onboarding", "membership-module"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - database/local-dev/local_dev_setup.sql
  - database/local-dev/README.md
  - backend/.env
  - history/prompts/001-membership-module/0005-local-development-database.misc.prompt.md
tests:
  - the setup script was NOT executed - the local MySQL root password is not available, so it is validated structurally only
  - structural validation passed - 33 CREATE TABLE, 34 FK references with 0 ordering problems, profile INSERT 57 columns against 57 values, bmi correctly omitted as a generated column, all seeded FK ids within range, DELIMITER blocks balanced
  - bcrypt hashes generated with the project's own bcryptjs at cost 10, matching the application
  - Hijri values in the seed produced by backend/src/utils/hijriDate.ts, so the data is internally consistent
---

## Prompt

make a database backup (MySql Script with data) i will restore locally so testing and modification is much easier and configure this module on local till final deployment

## Response snapshot

**Could not produce a dump of production**, and said so rather than improvising: there is no
`backend/.env`, no database credentials and no production access from this environment, and
guessing at any of that would be wrong. Delivered two routes instead.

### What was found

A search for a MySQL client turned up more than expected: **MySQL Server 8.0.46 is installed
locally**, the `MySQL80` service is running, and it is listening on 3306. The client is at
`C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`, simply not on `PATH` — which is why
the earlier `/sp.implement` check reported no mysql client. That finding changes the picture:
the local database work is possible on this machine, blocked only on the root password.

A single passwordless `root` connection attempt was made and refused. No further credentials
were tried — guessing at passwords is not something to do on someone's machine.

### Route A — a self-contained local environment (built)

`database/local-dev/local_dev_setup.sql`, one script, 33 tables:

- **Sections 1 and 2** are structurally identical to `database/mpss_mysql.sql` and to `001_membership_schema.draft.sql`, so whatever works locally works in production.
- **Sections 3 to 5** are local-only sample data: 3 zones, 6 mohallahs, 8 venues, 11 parties spanning categories A/B/C/H with one inactive, 5 miqaats, 7 schedule rows, and 5 member accounts.
- Database named **`mpss_local`**, deliberately not `masjid_scheduling`, so it cannot collide with a restored production copy on the same server.
- Opens with `DROP DATABASE IF EXISTS mpss_local`, which makes it repeatable — re-run for a clean slate — and touches nothing else.

Three details worth recording:

1. **The bcrypt hashes are real**, generated with the project's own `bcryptjs` at cost 10, so every seeded account actually signs in rather than merely looking plausible.
2. **The Hijri values are computed**, not invented — `backend/src/utils/hijriDate.ts` produced every `miqaats.hijri_date` and every `dob_hijri_*` value, so the seed is internally consistent with what the application will calculate at runtime.
3. **The five member accounts cover every state the module must handle**: two with a password change outstanding, one settled with a full twelve-tab profile, one settled with a deliberately partial profile, and one deactivated.

### The judgment call on the four placeholder lookups

The production seed leaves `titles`, `sharafs`, `halqas` and `mozes` **empty** on purpose,
because filling them would mean inventing Dawoodi Bohra religious terms. But an empty lookup
makes Tabs 2, 7, 9 and 10 impossible to exercise locally.

Resolved by seeding them here with labels like `LOCAL TEST Title A` — obviously fake, so they
can never be mistaken for the real thing, while still letting the tabs be tested. The README
states the distinction and gives the replacement SQL.

### Route B — exporting the real production data (documented)

`database/local-dev/README.md` gives both methods: the application's own
`GET /api/v1/import-export/database-backup` endpoint, which needs only an admin account and
picks up new tables automatically because it iterates `SHOW TABLES`; and `mysqldump` with
`--single-transaction` for a consistent snapshot against a live server, plus a `--no-data`
variant for structure without personal data.

It carries an explicit warning that this copies live names, contact numbers, ITS numbers and
password hashes onto a laptop, and notes that `.gitignore` covers `.env` but **not** `*.sql`
in the tracked `database/` folder, with the two lines to add before putting a dump there.

Following Route B also completes tasks T006, T007, T008, T014, T015 and T016 — exactly where
implementation is currently blocked.

### Also created

`backend/.env`, pointing at `mpss_local` with a freshly generated 64-character `JWT_SECRET`,
and **`DB_PASS` deliberately left blank**. Putting the password in the gitignored file the app
already reads means it never has to travel through chat.

## Outcome

- Impact: a local environment can be stood up with one command once `DB_PASS` is filled in. The script is validated structurally but has not been run.
- Tests: the script was not executed. Offline validation passed on every structural check: 33 `CREATE TABLE`, 34 FK references with 0 ordering problems, the 57-column profile `INSERT` matching 57 values, `bmi` correctly omitted, all seeded FK ids in range, `DELIMITER` balanced.
- Files: 3 created (`local_dev_setup.sql`, `README.md`, `backend/.env`) plus this record. No application code changed.
- Next prompts: fill `DB_PASS` in `backend/.env`, then the script can be run and verified, and `/sp.implement` resumes at T006 against the local database.
- Reflection: the most useful thing in this run was not the script but discovering that MySQL 8.0.46 was already installed and running — the earlier implement check had correctly reported "no mysql client" because it was not on `PATH`, and taking that at face value would have left the whole local-database path looking blocked when it was one `export PATH` away. Worth checking common install locations before concluding a tool is absent.

## Evaluation notes (flywheel)

- Failure modes observed: the earlier `/sp.implement` prerequisite check concluded "mysql CLI not on PATH" and, implicitly, that no local database was available. The first half was true and the second was wrong — MySQL 8.0.46 was installed and running the whole time. Also self-caught: a stray non-English string ("Login page選択") appeared in the credentials comment block of the first draft and was corrected; and generating bcrypt hashes from the scratchpad failed on module resolution until the command was run from inside `backend/`, where its `node_modules` is.
- Graders run and results (PASS/FAIL): PASS on structure — 33 tables, FK ordering clean, column/value counts matched, generated column excluded, seeded foreign keys within range. NOT RUN — execution against MySQL, pending the local root password. The script should not be considered proven until it has been executed once.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): when a required CLI appears to be missing, probe the platform's usual install locations before reporting it absent. One `ls` across four Windows paths would have found MySQL in the previous run.
