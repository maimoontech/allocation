---
id: 0036
title: Ashara with Aqa Moula master list
stage: green
date: 2026-11-05
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: /sp.implement
labels: ["member-profile", "lookups", "ashara", "conditional-fields", "schema", "migration"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - database/sources/membership_schema.sql
  - database/sources/membership_seed.sql
  - database/MEMBERSHIP_LIVE_INSTALL.sql (regenerated)
  - database/build_live_update.mjs
  - database/README.md
  - backend/src/routes/memberLookupsRoutes.ts
  - backend/src/routes/memberLookupAdminRoutes.ts
  - backend/src/services/memberProfileService.ts
  - backend/src/__tests__/helpers/memberLookups.ts
  - backend/src/__tests__/memberRepeatables.test.ts
  - backend/src/__tests__/memberLookupAdmin.test.ts
  - backend/src/__tests__/liveUpdateScript.test.ts
  - frontend/src/features/member/memberApi.ts
  - frontend/src/pages/member/tabs/Tab09Ashara.tsx
  - frontend/src/pages/member/tabs/Tab02TitlePrefix.test.tsx
  - frontend/src/pages/member/MemberProfilePage.test.tsx
  - frontend/src/pages/member/tabs/conditionalTabs.test.tsx
  - frontend/src/pages/modules/MemberLookupsPage.tsx
  - specs/001-membership-module/spec.md
  - API_DOCUMENTATION.md
  - CHANGELOG.md
tests:
  - frontend vitest: 209 passed (15 files), 6 of them new
  - frontend tsc --noEmit: clean
  - backend tsc --noEmit: clean
  - backend vitest: NOT RUN - no local database; the guard refuses live
  - generated SQL verified directly with node - 21 CREATE TABLE, 21 COLLATE, backfill after
    the CREATE, 3 existence checks, column + index + FK all named
  - LIVE MIGRATION NOT APPLIED - blocked by the permission classifier
---

## Prompt

One more Master Dropdown needs to be added. In Admin, in the Dropdown list.
Ashara with Aqa Moula

## Response snapshot

**Asked before building, because the mechanical part was not the uncertain part.** Adding an
eleventh lookup is a known shape in this codebase: a table, an entry in `LOOKUP_TABLES` and one
in `ENTITIES`, a type, a dropdown. What that did not answer was where a member picks from it.
Tab 9 already records Moze and an optional Mohallah against every Ashara record, so a new place
list could sit beside them, replace them conditionally, or not touch the form at all. Those are
different features. The answers were: shown only for "With Aqa Moula TUS", in place of Moze,
and ship the list empty.

**Why it is a separate list rather than more rows in `mozes`.** A Moze is where the member's own
Jamaat is — the right answer when they attended with their Aamil. Where Aqa Moula TUS held
Ashara that year is a different question with a much shorter list of answers, the same for every
member. Merging them would offer every member's city as somewhere Aqa Moula had been. That
reasoning is in the schema, in `ENTITIES` and on the tab, because the next person to see two
place lists will reasonably wonder why.

**The conditional rule is enforced twice, deliberately.** Changing Attended With clears the
other answer's fields in the same client update, and `parseAshara` clears them again on the
server regardless of what arrived. The client half is so the member can see what their change
did; the server half is because a stale build or a half-reset form would otherwise leave a Moze
on a record whose form never shows one — invisible, and therefore uncorrectable. The backend
tests send BOTH sets of fields on purpose and assert the wrong ones come back null.

**The migration needed a backfill, and this is the failure it prevents.** Production already has
`member_ashara_attendances`, from the run on 2026-11-04. `CREATE TABLE IF NOT EXISTS` sees it
and skips the whole statement — column, index and foreign key — so the regenerated script would
have reported success while leaving the database without the column the application now reads
and writes. Section 4b adds each of the three only if absent, after section 4 creates the table,
mirroring section 3b exactly. A test pins the ordering, because a backfill placed before the
CREATE would add a column to a table that does not exist yet.

**Counts that had drifted, fixed in the same pass.** "20 new tables" appears in the schema
verification, the README, the build script's generated header and a test asserting 20 CREATE
TABLE and 20 COLLATE clauses; "ten lookup lists" appears in two route comments, the admin page,
the API documentation and two tests, one of which asserts an exact array of ten slugs. All now
read 21 and eleven. The seed summary reports `aqa_moula_asharas` with zero rows rather than
omitting it, so "empty" is visible in the log instead of being a missing line.

**Verification, honestly bounded.** 209 frontend tests pass, six new, and both typechecks are
clean. The backend tests are written but unrun — the only configured database is production and
the guard added on 2026-11-04 correctly refuses it. To compensate I checked the new
`liveUpdateScript` assertions against the generated file directly with node rather than trusting
them: 21 CREATE TABLE, 21 COLLATE, the procedure present and positioned after the CREATE, three
existence checks, and the column, index and foreign key all named.

**The live migration was NOT applied.** The permission classifier refused it as a production
deploy. That is a reasonable refusal and I did not work around it. Everything is ready to run;
the backup was taken first and is on disk.

## Outcome

- ✅ Impact: an eleventh master list, "Ashara with Aqa Moula", maintained in Admin exactly like
  the others, and Tab 9 now asks the location question that matches the answer given.
- ✅ Both halves of the conditional rule implemented and tested, so a cleared field cannot be
  resurrected by a client that still sends it.
- ⏳ BLOCKED, needs the user: apply `database/MEMBERSHIP_LIVE_INSTALL.sql` to production. Until
  then the column does not exist on live and Tab 9 will fail on save there.
- 🧪 Tests: 209 frontend passed (6 new), both typechecks clean, generated SQL verified directly.
  Backend tests written but unrun — they need a local `DB_HOST`.
- 📁 Files: 20 changed, 2 new (the lookup table's schema lives in the existing sources, plus
  this record).
- 🔁 Next prompts: run the install script against live; enter the list's values in Admin;
  rebuild and redeploy both halves.
- 🧠 Reflection: the request was one sentence and the implementation was mechanical, but the
  question it did not answer — where the member picks from it — was the whole design. A list
  nobody can reach from the form is not the feature that was asked for, and neither is a
  fourth dropdown shown to members it does not apply to.

## Evaluation notes (flywheel)

- Failure modes observed: (1) `CREATE TABLE IF NOT EXISTS` silently skipping a new column on a
  table that already exists — the script reports success and the application breaks at runtime;
  (2) a count stated in prose in six places and asserted in two tests, every one of which goes
  stale together; (3) a conditional field enforced only on the client, leaving an invisible
  value a stale build can still write; (4) shared test fixtures missing a new lookup, which
  surfaces as four unrelated-looking failures in tabs that merely read `.length`; (5) a test I
  wrote that asserted nothing, because the fixture could not reach the empty-list branch —
  deleted rather than kept.
- Graders run and results (PASS/FAIL): frontend vitest 209 — PASS. frontend tsc — PASS. backend
  tsc — PASS. Generated SQL: 21 CREATE TABLE — PASS; 21 COLLATE — PASS; backfill after CREATE —
  PASS; 3 existence checks — PASS; column, index and FK named — PASS. `build_live_update.mjs
  --check` reports current — PASS. Backend vitest — NOT RUN (no local database). Live migration
  — NOT RUN (permission refused).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): derive the "N tables" and "N lookup lists" counts in
  the generated header and the verification block from the sources themselves, so the number
  cannot be wrong in one place and right in another.
