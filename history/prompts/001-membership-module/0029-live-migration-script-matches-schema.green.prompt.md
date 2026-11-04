---
id: 0029
title: Live migration script matches schema
stage: green
date: 2026-11-04
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: /sp.implement
labels: ["database", "migration", "seed", "live-release", "schema-drift"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - database/membership_schema.sql
  - database/membership_seed.sql
  - database/membership_live_update.sql
  - database/membership_schema_update_photo_approval.sql
  - database/build_live_update.mjs
  - backend/src/__tests__/liveUpdateScript.test.ts
  - backend/dist/ (rebuilt)
  - DATABASE.md
  - CHANGELOG.md
  - specs/001-membership-module/spec.md
  - specs/001-membership-module/tasks.md
tests:
  - backend vitest: 461 passed (22 files)
  - frontend vitest: 175 passed (14 files)
  - backend tsc --noEmit: clean
  - frontend tsc -b: clean
  - node database/build_live_update.mjs --check: current
  - scratch DB fresh apply, then re-apply (idempotency)
  - scratch DB regressed to old shape, then apply (upgrade/backfill path)
  - membership_rollback.sql against the updated schema
  - information_schema diff of columns, indexes, FKs and seed values against the working dev DB
---

## Prompt

1) Create mysql Script for live database only membership module related change as system already live only now attached membership module.
2) Push to repo and make it ready for live
3) I will just update tables using your given script

## Response snapshot

The scripts already existed (`membership_schema.sql`, `membership_seed.sql`, generated
`membership_live_update.sql`). Rather than write a new one, I verified the existing one against
reality — and it was wrong in two ways.

**Method.** Created a scratch database holding only the 13 pre-existing tables (structure-only
`mysqldump` of `admins, members, miqaats, mohallahs, parties, party_venue_history,
performance_ratings, ratings, refresh_tokens, schedule_edits, schedules, venues, zones`), with
the database default collation set to `utf8mb4_0900_ai_ci` to mirror production. Applied
`membership_live_update.sql`, then diffed `INFORMATION_SCHEMA` columns (including ordinal
position and collation), indexes, foreign keys and all ten lookup lists against the working
development database.

**Finding 1 — five missing columns, two missing indexes.** The photo approval workflow had been
applied to the development database with a standalone
`database/membership_schema_update_photo_approval.sql`, and the migration script was never
updated. It would have created `member_photos` without `approval_status`, `approved_by`,
`approved_by_role`, `approved_at` or `rejection_reason`, and every approval query on production
would have failed with error 1054. `build_live_update.mjs --check` passed throughout, because it
compares the generated file against its two sources and both were equally stale.

Fixed by declaring the columns and indexes in the `CREATE TABLE` (in the same ordinal positions
the dev database has) plus a conditional `mm_backfill_photo_approval()` procedure, because
`CREATE TABLE IF NOT EXISTS` skips an existing table entirely and would otherwise leave an
already-migrated database five columns short while reporting success.

**Finding 2 — six wrong lookup values, and five empty lists.** The seed left `titles`,
`sharafs`, `halqas`, `mozes`, `places` empty (correct when the real names were unknown) and
seeded seven speculative `tamreen_methods` as drafts. The user has since supplied all five lists
through the Member Lists admin screen and replaced the seven methods with four real ones. All
ten dev lists carry `is_draft = 0`. Promoted those values into the seed, closing T018.

`tamreen_methods` needed care: the unique key is on the name, so inserting the four could not
displace the seven — a database with the old seed would have offered all eleven. Added section 4b
to deactivate the six rejected names (`is_active = 0`, not `DELETE`, so referencing profiles stay
readable).

Also reversed the seed's rule against writing `is_draft` on conflict. That rule was right while
the file shipped drafts — writing the flag could then only re-flag something a human had
approved. Now every value ships `is_draft = 0`, so writing it can only *clear* the flag, and
*not* writing it caused the very bug it guarded against: `With an Ustad` appears in both the old
and new lists and would have kept `is_draft = 1` forever.

**Test changes.** The guard asserting "no ALTER/UPDATE/DELETE anywhere in the schema" now failed
legitimately. It was a proxy for FR-106; replaced with the actual rule, which is stricter: parse
every mutating statement in both sources for its target table, require it to be one of the 20
module tables, and forbid any of the 13 pre-existing names. Replaced the "five lists ship empty"
test with one asserting all ten are seeded and no value ships `is_draft = 1`. Added a test
asserting the `member_photos` approval columns and the backfill exist — the guard that would have
caught the original drift.

**Result.** The script now reproduces the working development database exactly: 192 columns, 70
index columns, 22 foreign keys, 87 lookup values, all identical.

## Outcome

- ✅ Impact: `membership_live_update.sql` is safe to apply to the live database. It was not
  before: it would have created `member_photos` without the five approval columns, breaking the
  entire photo approval feature on production, and would have left five lookup lists empty while
  seeding six rejected `tamreen_methods` values.
- 🧪 Tests: 461 backend (up from 459 — two guards rewritten, two added), 175 frontend, both
  typechecks and both builds clean. Four scratch-database rehearsals: fresh apply, re-apply,
  upgrade from the old shape, and rollback.
- 📁 Files: 2 SQL sources + 1 regenerated script + 1 superseded file marked, 1 generator, 1 test
  file, `backend/dist/` rebuilt, 4 docs (DATABASE.md, CHANGELOG.md, spec.md, tasks.md).
- 🔁 Next prompts: apply to live and compare the BEFORE/AFTER row counts in `run.log`; provision
  member accounts from the roster; decide whether `mozes` and `places` should merge (the supplied
  values say no).
- 🧠 Reflection: `--check` reported "current" the whole time while the script was missing five
  columns the application depends on. A generator that only verifies its own sources cannot detect
  that both sources are stale — the only check with authority is a diff against a database the
  application actually runs against. That diff should be the gate before any live apply, not a
  one-off.

## Evaluation notes (flywheel)

- Failure modes observed: (1) a generated-artifact freshness check mistaken for a correctness
  check — `--check` passes on two equally stale sources; (2) schema drift introduced by applying
  a standalone `ALTER` to a live database without updating the migration source, with no test
  able to notice; (3) a test encoding a convenient proxy (`no ALTER anywhere`) rather than the
  rule it stood for (`never touch the 13 pre-existing tables`), which then blocks a legitimate
  change; (4) `schema.indexOf(";")` to find the end of a `CREATE TABLE` — the `sha256` column's
  `COMMENT` contains a semicolon, so my first version of the new test failed against a correct
  file.
- Graders run and results (PASS/FAIL): information_schema column/index/FK/seed diff vs dev DB —
  PASS (identical). Fresh apply — PASS. Re-apply idempotency — PASS. Upgrade-from-old-shape
  backfill — PASS. Rollback to 13 tables, no leftover procedures — PASS. 461 + 175 tests — PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a test that connects to a configured database and
  fails when its membership schema differs from what `membership_live_update.sql` produces. That
  is the check that was missing, and the only one that would have caught this before a live run.
