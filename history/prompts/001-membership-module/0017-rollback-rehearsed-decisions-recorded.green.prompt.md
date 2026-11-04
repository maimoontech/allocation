---
id: 0017
title: Rollback Rehearsed Decisions Recorded
stage: green
date: 2026-10-30
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["phase-9", "rollback-rehearsal", "retention", "fr-101a", "test-leak", "release-gate"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/.env.example
  - backend/src/__tests__/helpers/fixtures.ts
  - backend/src/__tests__/memberHealthPrivacy.test.ts
  - database/local-dev/before-state-baseline.md
  - database/local-dev/dumps/pre-rollback-rehearsal-20261030-102621.sql
  - specs/001-membership-module/spec.md
  - specs/001-membership-module/quickstart.md
  - specs/001-membership-module/tasks.md
  - BUSINESS_RULES.md
  - CHANGELOG.md
  - history/prompts/001-membership-module/0017-rollback-rehearsed-decisions-recorded.green.prompt.md
tests:
  - 545 passing - 391 backend across 17 files, 154 frontend across 9
  - rollback rehearsed on the local production copy, then fully re-applied
  - all 13 pre-existing tables identical by exact COUNT(*) and CHECKSUM TABLE across the rollback
  - refresh_tokens now stable at its recorded baseline of 2343 across a full run, where it had been leaking
  - backend tsc --noEmit clean; frontend tsc -b clean; lint unchanged at 68/4
---

## Prompt

next

(Phase 9 continued, after the three decisions answered: rehearse the rollback with a backup
first; retain a departed member's data indefinitely; authorise the admin database backup.)

## Response snapshot

**T017, T119 and T124 closed; 118 of 124 tasks done.** The six that remain are the production
release, two slash commands that are the user's to run, the lookup values nobody has supplied,
and the one visual check no tool here can perform.

### The rollback works, and the rehearsal found two things it would not have otherwise

Backed up first (`pre-rollback-rehearsal-20261030-102621.sql`, 485KB), then ran
`membership_rollback.sql` against the local production copy.

| Check | Result |
|---|---|
| Module tables dropped | 33 → 13 |
| Dormant `members` table | untouched, as intended — it is pre-existing and the module never used it |
| Exact `COUNT(*)` on all 13 pre-existing tables | identical |
| `CHECKSUM TABLE` on all 13 | identical |
| Backend starts against the rolled-back database | yes — `ensureSchema()` depends on no module table |
| Party and Admin sign-in | 401 on a wrong password, original message, not 500 |
| Re-apply schema + seed | 33 tables, all `utf8mb4_general_ci`, five lookups still empty, 391 tests green |

I used **checksums as well as counts** because a count proves only that no row was added or
removed. The claim worth making is that no row *changed*, and `CHECKSUM TABLE` is what
supports it.

**Finding 1 — the frontend must be rolled back first.** With the tables dropped but the login
page still offering the Member option, a member signing in gets a 500. The server stays up and
every other role is unaffected, but it is avoidable: ship the frontend without the Member
option before the database rollback, or do both in one window. quickstart §8 now says so.

**Finding 2 — the suite cannot run while the module is rolled back.**
`src/__tests__/globalSetup.ts` calls `ensureFixtures()`, which creates member fixtures for the
whole run, so with the tables gone the setup fails and *no* file executes — including the
regression files that have nothing to do with the module. That is why the verification above is
checksums and live endpoint calls rather than `npm test`. Recorded, with what would have to
change if the regression suite ever needs to run against a rolled-back database.

### A test was leaking rows into a copy of production

Comparing `refresh_tokens` across the rehearsal gave 2367 → 2368, which looked like the
rollback had touched something. It had not: the count was drifting by one **per test run**.

`authCoordinatorFallthrough.test.ts` deliberately signs in with `role: "not_a_real_role"` and
real venue credentials, which currently succeeds — that test exists to document the
pre-existing unguarded fallthrough. But `destroyFixtures` deleted test tokens by
`(user_role, user_id)`, and no entry in its list matches a bogus role, so each run left a row
behind. Twenty-five had accumulated.

The fix had to be careful. Deleting by `user_id` alone would be wrong — `user_id` is not unique
across roles, so it could take a real user's session from a production copy. Deleting any row
whose `user_role` is outside the five the application issues is both precise and safe, because
such a row cannot be anything but a test artefact.

Removed the 25, and verified: a full 391-test run now leaves the count at exactly **2343**,
which is the figure `before-state-baseline.md` recorded when the local copy was first restored.
The table is back to its true baseline and stays there.

This is the second time this session that a measurement intended to check one thing exposed a
problem somewhere else. Both times the tell was a number that was *almost* right.

### T017 was half-done and looked finished

The `env.ts` side had been implemented in Phase 4. The `.env.example` side had not — **six
environment variables were live in code and documented nowhere**, including
`LOGIN_IP_HASH_SALT`, which is a secret. Someone deploying from the example file would have had
no idea the throttle was configurable.

Now documented with defaults, why the per-account and per-IP counters are deliberately
separate, and that the salt derives from `JWT_SECRET` when unset. I then cross-checked every
`optionalEnv`/`requireEnv` key in `env.ts` against the file: all present.

### Two decisions recorded

**Retention (T124): deactivate and retain indefinitely.** Written up in `BUSINESS_RULES.md`
with the reasoning rather than just the rule — including that the privacy cost of holding
health data with no end date is accepted knowingly, not overlooked. The argument that decided
it is the asymmetry: reversing retention later is a deletion, which is easy; reversing an
automatic purge is impossible. Deletion on request is a manual database operation today, and
the note says that if it becomes routine it should become a feature rather than a habit.

**The admin database backup is authorised to contain everything (FR-101a).** A backup that
omits tables cannot restore the system, and this endpoint is the rollback tool the runbook
depends on. Added to the spec as a numbered exception rather than left as a comment somewhere,
so it reads as a decision and not an oversight. FR-101 continues to apply in full to the CSV
entity exports — which is what it was aimed at, and what the tests cover.

The size problem stays on the list: that endpoint builds its whole dump as one in-memory
string, and `mysql.escape` renders a BLOB as hex, roughly doubling it. It should stream. Not
changed here.

## Outcome

- Impact: the rollback script is proven rather than assumed, and the two sequencing hazards it exposed are written into the runbook. A test leak against a copy of production is fixed and the local baseline is exact again. Six undocumented environment variables are documented. Both outstanding decisions are recorded with their reasoning. 118 of 124 tasks complete.
- Tests: 545 passing. Both typechecks clean. Lint unchanged at the pre-existing 68/4.
- Files: 1 created (the backup dump), 10 modified.
- Next prompts: nothing further can be closed here. T120 and T121 are the production release and need explicit authorisation; T122 (`/sp.constitution`) and T123 (`/sp.adr`) are the user's to run, and CLAUDE.md forbids creating an ADR without consent; T018 needs the five lookups' authoritative values; T110 needs a browser at 375px.
- Reflection: the rehearsal was worth far more than the tick in the box. Dropping the tables for real produced two facts no amount of reading the script would have given — that the frontend has to go first, and that the test harness cannot run without the module — plus a leak that had been quietly corrupting the baseline for 25 runs. The habit that paid was comparing checksums rather than counts, and then not dismissing a one-row discrepancy as noise.
- Still open: the 18 spec assumptions need sign-off; the five empty lookups block Tabs 2, 7, 8, 9 and 10 for any real member; whether Tab 9's `Moze` and Tab 8's `places` are the same set and should be merged; the database-backup endpoint's in-memory dump; and the committed `backend/dist` and `frontend/dist` are stale and need rebuilding at deploy time.
