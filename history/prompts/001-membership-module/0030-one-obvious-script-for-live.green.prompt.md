---
id: 0030
title: One obvious script for live
stage: green
date: 2026-11-04
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: /sp.implement
labels: ["database", "migration", "repo-layout", "operator-safety", "documentation"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - database/MEMBERSHIP_LIVE_INSTALL.sql (renamed from membership_live_update.sql, regenerated)
  - database/README.md (new)
  - database/sources/membership_schema.sql (moved)
  - database/sources/membership_seed.sql (moved)
  - database/already-applied/add_party_contact_numbers.sql (moved)
  - database/already-applied/add_party_its_no.sql (moved)
  - database/already-applied/add_venue_contact_fields.sql (moved)
  - database/already-applied/add_venue_location_fields.sql (moved)
  - database/already-applied/membership_schema_update_photo_approval.sql (moved)
  - database/build_live_update.mjs
  - database/local-dev/README.md
  - database/local-dev/before-state-baseline.md
  - backend/src/__tests__/liveUpdateScript.test.ts
  - DATABASE.md
  - CHANGELOG.md
  - specs/001-membership-module/quickstart.md
  - specs/001-membership-module/plan.md
  - specs/001-membership-module/spec.md
  - specs/001-membership-module/tasks.md
tests:
  - backend vitest: 461 passed (22 files)
  - frontend vitest: 175 passed (14 files)
  - backend tsc --noEmit: clean
  - node database/build_live_update.mjs --check: current
  - scratch DB apply of the renamed file, then information_schema diff vs the working dev DB
  - markdown link-target resolution for every ../../database/*.sql reference
---

## Prompt

i found more then 1 script in database. kindly make a single script file to excute in live data base

## Response snapshot

The single self-contained script already existed — `membership_live_update.sql` — but the
folder gave no way to know that. `database/` held eleven files, and the four most similar names
differed by one word:

```
membership_live_update.sql    installs the module
membership_schema.sql         a source; never run directly
membership_seed.sql           a source; never run directly
membership_rollback.sql       DROPS ALL 20 TABLES AND ALL MEMBER DATA
```

One installs, one destroys every member account and photograph, two should never be run at all.
Being unable to tell which is which is a hazard, not a naming preference — so the fix is the
layout, not a reply explaining it.

**Confirmed first that nothing else is pending.** The four `add_*.sql` scripts alter `parties`
and `venues`, which are pre-existing tables, so they are not membership work. Checked all 11
columns they add against the development database: every one present. Party sign-in by ITS
Number depends on them and is live, so they are certainly applied to production already. They
are history.

**Changes.**

- Renamed the generated output to `database/MEMBERSHIP_LIVE_INSTALL.sql` — uppercase, names the
  action, sorts to the top of a listing, and cannot be confused with the three lowercase
  `membership_*` files. Its generated header now opens by stating it is the only file to run,
  and what each other file is.
- `database/sources/` — the two maintained sources, moved away from the thing generated from
  them.
- `database/already-applied/` — the four `add_*.sql` plus the superseded
  `membership_schema_update_photo_approval.sql`. Re-running any of them now fails with error
  1060, since MySQL's `ADD COLUMN` has no `IF NOT EXISTS`.
- `database/README.md` — new, answers "which file do I run?" in its first line, with the
  expected verification values in a table, then explains every other file and why it is not the
  one. `DATABASE.md` now points at it rather than listing scripts itself.
- `mpss_mysql.sql` stays, now documented as never to be run against live: it resets the admin
  password, and declares `utf8mb4_unicode_ci` when every live table is `utf8mb4_general_ci`.

**No SQL changed.** Re-verified after the move by applying the renamed file to a scratch
database holding only the 13 pre-existing tables: 20 tables created, `approval_columns_present`
5, `approval_indexes_present` 2, `still_draft` 0 across all ten lists, and an
`INFORMATION_SCHEMA` diff against the working development database showing 192 columns and 70
index columns identical.

Moves used `git mv` so history follows the files. Updated every live reference — generator,
guard test, `DATABASE.md`, `quickstart.md`, the two local-dev docs — and the markdown links in
`plan.md` and `tasks.md` that would otherwise have 404'd. Left dated CHANGELOG entries and PHRs
alone; they record what was true when written, which is the convention T118 already set.

The guard test gained a `readSource()` helper and a `GENERATED` constant, so the paths live in
one place rather than being repeated at eleven call sites.

## Outcome

- ✅ Impact: `database/` now has exactly one file that looks like the thing to run against
  production, and a README that says so first. The rollback — which destroys all member data —
  can no longer be mistaken for the installer on the strength of a similar name.
- 🧪 Tests: 461 backend, 175 frontend, typecheck clean, `--check` current, scratch-database
  apply re-verified identical to dev, every markdown link target resolves.
- 📁 Files: 1 renamed, 7 moved, 1 new README, 10 updated.
- 🔁 Next prompts: run `MEMBERSHIP_LIVE_INSTALL.sql` against live and compare the BEFORE/AFTER
  blocks in `run.log`; provision member accounts from the roster.
- 🧠 Reflection: the information needed to pick the right file existed — in a header comment
  inside the file, and in `DATABASE.md`. Neither is where someone looks: they open the folder
  and read filenames. Names next to each other are the interface, and four names differing by
  one word, one of which drops all member data, is a bad one. Worth noticing that the question
  was asked rather than a wrong file being run.

## Evaluation notes (flywheel)

- Failure modes observed: (1) a directory where the destructive file and the installer differ by
  one word, with the disambiguating information only inside the files; (2) already-applied
  historical migrations stored beside pending ones, so the reader cannot tell which still need
  running; (3) renaming and moving files silently breaks markdown links — these are easy to miss
  because nothing fails, so link targets were checked explicitly; (4) my first link checker
  resolved `../../database/x` by prefixing the spec directory instead of stripping to the repo
  root, and reported two false "BROKEN" results on correct links.
- Graders run and results (PASS/FAIL): scratch apply of the renamed file — PASS. information_schema
  diff vs dev (columns, indexes) — PASS (identical). `--check` — PASS. 461 + 175 tests — PASS.
  tsc — PASS. Link-target resolution — PASS (3/3).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a test asserting that every `database/*.sql` path
  named in a non-history markdown file exists, so the next move cannot leave a dead link.
