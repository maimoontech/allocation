---
id: 0012
title: Profile API Implemented
stage: green
date: 2026-10-30
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["phase-6", "profile-api", "validation-layer", "photo-storage", "lookups"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/services/memberProfileService.ts
  - backend/src/routes/memberProfileRoutes.ts
  - backend/src/routes/memberLookupsRoutes.ts
  - backend/src/routes/memberPhotoRoutes.ts
  - backend/src/server.ts
  - backend/src/__tests__/memberProfile.test.ts
  - backend/src/__tests__/memberPhoto.test.ts
  - specs/001-membership-module/tasks.md
  - history/prompts/001-membership-module/0012-profile-api-implemented.green.prompt.md
tests:
  - 428 passing - 348 backend across 14 files, 80 frontend across 2
  - 91 new this phase
  - backend tsc --noEmit clean; frontend tsc -b clean; lint total unchanged at the pre-existing 68 errors / 4 warnings
  - end-to-end verified against the running server - lookups, Tab 1 and Tab 3 save, derived Hijri and BMI, the Tab 8 count refusal, the Tab 3 cross-zone refusal, the Hijri upper bound, a disguised file rejected, a real PNG stored and served privately with an ETag
  - all 7 real-data row counts identical to baseline; 33 tables and one collation; every e2e artefact removed
---

## Prompt

Next

then: Countinue

(Phase 6 was offered in two passes — backend API first, then the UI. This is the API pass,
tasks T058 to T071.)

## Response snapshot

Phase 6's API is complete. **T058 to T071 closed, plus four later tasks that fell out of
doing the validation layer properly: 73 of 124 done.**

### One GET and one PUT for all twelve tabs

That shape is what makes FR-030's all-or-nothing save the natural case instead of the hard
one, and it turns tab switching into client state with no round trip (FR-026). Neither route
takes a member identifier — the member always comes from the token, so there is no parameter
to tamper with (FR-034, FR-098).

The read returns a **complete empty shape** before anything is saved, rather than a 404 or a
sparse object, so the form has nothing to special-case on first open (FR-033).

### The validation layer turned out to be the whole job

T067 asked for "every rule in data-model §7", and writing it properly also finished **T094,
T102, T103 and T104**, which the plan had scheduled for Phases 7 and 8. Splitting the save
across phases would have meant writing it twice, so the service handles the full payload now:

- type and enum checking for every column, from one declaration shared by the read and the save
- conditional rules that also **clear** the fields their answer makes meaningless, so a hidden field cannot keep a contradictory value
- cross-field rules a per-field check would miss — a since-year before the member's year of birth, a Party outside the selected Zone
- batched referential checks, so a profile with many selections costs a handful of queries rather than one per field
- replace-in-full for all five repeatable sections

Every error carries its tab number, so the UI can open the right one (FR-029).

### Three choices worth recording

**Mount order matters.** The member routes are mounted BEFORE the admin router on the same
`/api/v1/members` base path. Express matches in order and the admin router applies
`requireRole(["admin"])` to everything under it — so with the admin router first, a member
hitting `/members/me/profile` would be refused 403 by the admin guard before ever reaching
their own route. The specific `/me/...` paths cannot collide with the admin router's `/` and
`/:id`.

**Derived values are computed, never accepted.** A client-supplied `bmi`, `its_no` or
`dob_hijri_*` is silently dropped rather than rejected, so an unchanged round trip of a read
response still saves. Tested in both directions: the submitted value is ignored and the
derived one is correct.

**Photographs stay out of the profile payload.** The bytes live in their own table, so a
profile read is 1.6 KB rather than megabytes, and `has_photo` is a joined flag. Served with
`Cache-Control: private` and the stored SHA-256 as the ETag, so no shared cache can hold a
member's photograph and an unchanged image is not re-sent.

### The bug the first test run found

The suite passed 325 tests and then failed in `afterAll`. The cause was worth knowing: the
repeatable tables hang off `member_accounts`, **not** `member_profiles` — which is the
documented design, since a member can hold titles without a profile row. So deleting the
profile row left titles and visits behind, and those reference the seeded lookups with
`ON DELETE RESTRICT`, which blocked the lookup cleanup.

The fix was in the test, not the code: a reset helper that clears every member-owned table in
dependency order. Worth noting because the same trap waits for anyone writing a data-deletion
routine later.

## Outcome

- Impact: a member can now read and save their whole profile, and upload a photograph. 73 of 124 tasks complete, and four tasks from later phases are already done.
- Tests: 428 passing, 91 new. Both typechecks clean. Lint total unchanged at the pre-existing 68 errors / 4 warnings.
- Files: 6 created, 3 modified.
- Next prompts: Phase 6's UI pass (T072-T082) — eight UI primitives, the unsaved-edit slice, the twelve-tab shell, and Tabs 1 and 3. That reaches the MVP boundary.
- Reflection: the mount-order problem would have been a confusing bug to chase from the outside — a member getting 403 on their own profile, with the member guard looking correct and the admin guard looking unrelated. It only surfaced because I thought about what `app.use` on a shared base path actually does before writing the line, rather than after a test failed. The test-reset bug went the other way: the design was right and my cleanup was wrong, and only running it revealed which.

## Evaluation notes (flywheel)

- Failure modes observed: (1) a `tsc` catch — `{ id: values.party_id }` passed an `unknown` where mysql2 wants a value type; fixed with `Number()`. (2) The test teardown failed on an `ON DELETE RESTRICT` foreign key because my reset deleted `member_profiles` but not the repeatable tables, which hang off `member_accounts` instead; fixed with a reset helper that clears all member-owned tables in order. No defect reached the end-to-end run.
- Graders run and results (PASS/FAIL): PASS — 428 tests green; both typechecks clean; lint unchanged; end-to-end run covering 13 lookup lists in one call with a server-computed Hijri year of 1448, a Tab 1 and Tab 3 save with `its_no` and `bmi` submitted and correctly ignored while the derived Hijri date and BMI of 23.95 were computed, the Tab 8 refusal naming both numbers, the Tab 3 cross-zone refusal, the Hijri upper bound at 1448, a renamed shell script refused as UNSUPPORTED_TYPE, a real PNG stored at 120x90 and served with `private` caching plus an ETag, an unauthenticated read refused 401, and a 1.6 KB profile payload carrying no image bytes; all 7 real-data row counts identical to baseline with 33 tables and one collation; every artefact removed.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): when mounting two routers on one base path, reason about match order and each router's guards before writing the second `app.use`. The failure mode — a 403 from a guard that belongs to a different router — looks nothing like its cause.
