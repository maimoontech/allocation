---
id: 0009
title: Regression Safety Net Green
stage: green
date: 2026-10-29
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["regression-baseline", "phase-3", "test-fixtures", "no-regression", "membership-module"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/__tests__/helpers/testApp.ts
  - backend/src/__tests__/helpers/fixtures.ts
  - backend/src/__tests__/globalSetup.ts
  - backend/src/__tests__/regression/authExistingRoles.test.ts
  - backend/src/__tests__/regression/authCoordinatorFallthrough.test.ts
  - backend/src/__tests__/regression/authAdminZonal.test.ts
  - backend/src/__tests__/regression/changePasswordExisting.test.ts
  - backend/src/__tests__/regression/partyScoping.test.ts
  - backend/vitest.config.mts
  - frontend/src/test-setup.ts
  - frontend/src/test-utils.tsx
  - frontend/src/pages/LoginPage.test.tsx
  - specs/001-membership-module/tasks.md
  - history/prompts/001-membership-module/0009-regression-safety-net-green.green.prompt.md
tests:
  - 232 passing - 155 backend across 7 files, 77 frontend across 2
  - 76 of those are new this run (55 backend regression, 11 login page, plus fixture-driven cases)
  - all written and passing against UNMODIFIED authentication code, which is the point
  - backend tsc --noEmit clean; frontend tsc -b clean
  - fixtures verified removed after the run; all 11 real-data row counts identical to the T008 baseline
---

## Prompt

Next

(Continuing from the previous turn, where the next step was Phase 3 — the regression suite —
and the open question was how to obtain a working password for a successful-login test.)

## Response snapshot

Phase 3 complete. **T019 to T026 all closed; 24 of 124 tasks done.** The safety net now
exists, so `authService.ts` can be modified.

### The credential problem, solved without credentials

The blocker was that a login test needs a password that actually works, and none was
available. Rather than ask for a production password, the suite creates its own fixtures in
the local database — which is better practice anyway, since tests that depend on
human-supplied credentials break the moment those change.

The fixtures are built to be impossible to confuse with real data and impossible to leave
behind:

- every name carries a `__TEST_` marker and the ITS number sits in a 999 range
- `ensureFixtures()` is idempotent, so each test file calls it in `beforeAll` without coordinating
- teardown identifies rows by marker rather than by id, so it also cleans up after an interrupted run
- the test zone cascades to its mohallah, venue and party, so one delete clears most of it
- `refresh_tokens` has no foreign key, so the rows created by logging in are deleted explicitly — otherwise they would accumulate exactly as the 2343 real ones have
- passwords are hashed at run time rather than hard-coded, so the cost factor always matches the application

Verified afterwards: zero leftover fixture rows, and all 11 real-data counts identical to the
baseline.

### One structural decision

`server.ts` calls `startServer()` at module scope, which runs `ensureSchema()` — issuing
`ALTER TABLE` — and binds a port. Importing it from a test would mutate the schema and leave a
listener open.

The options were to make it importable, or to mount the real routers in a minimal test app.
Chose the latter: changing the bootstrap of a live system is not worth it when the alternative
exercises the same route → service → database path with the same `express.json` limit. What it
omits — the CORS allow-list and the terminal error handler — this feature does not touch.

### What the 55 backend tests actually pin

| File | Tests | Guards |
|---|---|---|
| `authExistingRoles` | 18 | FR-102 — party login by ITS number, claims, 401-not-500, refresh, logout revocation, hashed refresh token |
| `authCoordinatorFallthrough` | 15 | FR-103 — the dangerous one |
| `authAdminZonal` | 11 | FR-103 — both explicit branches, neither accepting the other's credentials |
| `changePasswordExisting` | 11 | FR-104 — including two behaviours weaker than the module needs |
| `partyScoping` | 10 | FR-105 — all three data-leak cases |

**The coordinator file is the one that matters.** `authenticate()` reaches the venue query by
falling through every other branch with no role check, and the `member` branch goes directly
above it. Two tests there are deliberately unusual:

- One records that **an unknown role string currently succeeds** against the venue query. That is not an endorsement — it is the current behaviour written down, so that when a proper guard is added the test fails and the change is made deliberately rather than noticed later.
- Two more confirm that party and coordinator credentials are not interchangeable, which is what would break first if the new branch were written loosely.

`changePasswordExisting` similarly records that there is **no password policy** today and that
**a token issued before a password change still works afterwards**. The module requires both to
change (FR-020, FR-022); writing the current state down first means it will be visible whether
adding them altered the existing roles too.

`partyScoping` exists because authentication is only half of what must not regress. A party's
token carries `partyId`, which the schedules route turns into two SQL conditions. Lose the
first and a party sees every party's schedule; lose the second and it sees unpublished drafts.
Neither would show up in a login test, and both are data leaks rather than broken features.

## Outcome

- Impact: Phase 3's gate is green, which unblocks Phase 5. Tasks T019-T026 closed; 24 of 124 complete. No production source file was touched — verified with a targeted `git diff` over routes, services, middleware, db, config, the login page and shared components.
- Tests: 232 passing, 76 new. Both typechecks clean. Fixtures removed; real data unchanged.
- Files: 12 created, 2 modified (`backend/vitest.config.mts` for globalSetup, `frontend/src/test-setup.ts` for cleanup).
- Next prompts: Phase 4 (T027-T037, provisioning) or straight to Phase 5 (T038-T057, member sign-in). Phase 5 is where T046 inserts the `member` branch — re-run this suite immediately after.
- Reflection: the instinct worth keeping is that a regression baseline should record what is true, not what ought to be. Three of these tests assert behaviour that is mildly wrong — an unguarded fallthrough, no password policy, tokens surviving a password change — and asserting it is what makes the later improvement visible instead of silent. A suite that only tested the good paths would have passed just as happily while a coordinator got locked out.

## Evaluation notes (flywheel)

- Failure modes observed: three self-inflicted, all caught by running the suite. (1) `pool.end()` was placed inside the first of two `describe` blocks in `authAdminZonal`, and a describe's `afterAll` runs before the next describe's `beforeAll`, so the second block met a closed pool — moved to file level. (2) Testing Library's auto-cleanup registers via a *global* `afterEach`, which does not exist when Vitest runs with `globals: false`; renders accumulated and `getByLabelText` failed with "found multiple elements" from the second test onwards — registered `cleanup()` explicitly in the setup file. (3) `components/ui/Input.tsx` renders `helperText` inside the wrapping `<label>`, so a field's accessible name becomes label-plus-hint, e.g. "ID / NameUse your Admin username"; queries now use a start-anchored regex. That third one is a genuine pre-existing accessibility wrinkle — helper text should not form part of a field's accessible name — recorded in the test file and left unfixed, since changing shared UI is outside a regression baseline's remit.
- Graders run and results (PASS/FAIL): PASS — 232 tests green against unmodified authentication code; backend and frontend typechecks clean; zero leftover fixture rows across six tables; all 11 real-data row counts identical to baseline; no production source file modified.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): when a suite needs working credentials, create fixtures rather than request them. It removed a human dependency, made the tests repeatable, and took less effort than waiting would have.
