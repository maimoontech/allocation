---
id: 0011
title: Admin Provisioning Implemented
stage: green
date: 2026-10-29
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["phase-4", "provisioning", "csv-import", "admin-ui", "no-regression"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/routes/importExportRoutes.ts
  - backend/src/routes/memberAdminRoutes.ts
  - backend/src/server.ts
  - backend/src/__tests__/memberProvisioning.test.ts
  - backend/src/__tests__/memberAdmin.test.ts
  - frontend/src/features/api/api.ts
  - frontend/src/features/member/memberAdminApi.ts
  - frontend/src/pages/modules/MembersPage.tsx
  - frontend/src/router/AppRoutes.tsx
  - frontend/src/components/layout/AppShell.tsx
  - specs/001-membership-module/tasks.md
  - history/prompts/001-membership-module/0011-admin-provisioning-implemented.green.prompt.md
tests:
  - 337 passing - 257 backend across 12 files, 80 frontend across 2
  - 50 new, all green on their first run
  - backend tsc --noEmit clean; frontend tsc -b clean; new files lint clean, project total unchanged at the pre-existing 68 errors / 4 warnings
  - end-to-end verified - roster upload with a deliberately bad row, FR-005 re-upload, deactivation, export with no hash, party token refused
  - all 7 real-data row counts identical to the T008 baseline; every e2e artefact removed
---

## Prompt

next

(Continuing from the previous turn, which recommended Phase 4 — admin provisioning — as the
shorter path to something testable with a real roster.)

## Response snapshot

Phase 4 complete. **T027 to T037 all closed; 55 of 124 tasks done.** A roster can now be
uploaded, the accounts it creates can sign in, and an administrator can see and suspend them.

### Built on the existing import route, not beside it

`members` was added to `importExportRoutes.ts` as another entity rather than given its own
endpoint. That reuses the CSV parser, the transaction, the bcrypt hashing and the per-row
error collection that are already in production use for zones, parties and venues — all four
of which FR-001, FR-003 and FR-008 would otherwise have needed rewriting.

Reading the existing code first also corrected the contract: the response shape is
`{ inserted, updated, skipped, errors }`, not the `{ created, ... }` the OpenAPI draft had
assumed. Following what is there beat imposing what I had written down.

### FR-005 is the requirement that matters here

Once a member has chosen their own password, re-running the roster must not reset it and must
not put them back through the forced change. Get that wrong and every re-import locks out
everyone who had already set themselves up.

Implemented by branching on `password_changed_at IS NULL`, which is exactly what that column
was added for in the data model. Verified end to end rather than only by unit test: provision,
sign in, change the password, re-upload the same roster, then confirm the member's own
password still works (200) and the roster password does not (401) — while the roster name
still refreshed.

### Two details worth noting

**A duplicate ITS number inside one file.** The import pre-loads existing accounts into a map
and writes back the insert id, so a second row for the same ITS number in the same upload is
treated as an update rather than failing on the unique key. Covered by a test, because a
hand-assembled roster is exactly where that happens.

**The admin view is deliberately narrow.** `GET /members` returns account state only, and
`PATCH /members/:id` accepts `is_active` and nothing else — so passwords stay on the single
hashing path. Tests assert that a `password`, `password_hash` or `must_change_password` in the
body is ignored, and that no contact, health, photo or password field appears in either the
list or the export. Deactivation needs no token revocation, because `requireMember` reads
`is_active` on every request; a test confirms an open session stops on its next call.

### The frontend

`MembersPage.tsx` with search, an active filter and pagination, plus one action: activate or
deactivate. It says plainly that accounts are created under Import/Export and that a member's
own details are private, so the page cannot be mistaken for a profile editor.

## Outcome

- Impact: the module is now usable with a real roster. An administrator can provision, review and suspend accounts; a provisioned member can sign in and set their own password.
- Tests: 337 passing, 50 new, all green on the first run. Both typechecks clean. New files lint clean and the project total is unchanged at the pre-existing 68 errors / 4 warnings.
- Files: 4 created, 6 modified, 1 record.
- Next prompts: Phase 6 (T058-T082) — the lookups endpoint, the transactional profile read and save, the photo endpoints, eight new UI primitives, and Tabs 1 and 3. That is the MVP boundary.
- Reflection: the fifty tests passing first time was not luck — it was the payoff from reading `importExportRoutes.ts` before writing anything, and following its shape rather than the shape I had invented in the contract. The one place I had drifted, the response field names, was caught by that reading rather than by a failing test later. Cheaper to read 200 lines than to debug a mismatch.

## Evaluation notes (flywheel)

- Failure modes observed: one typing slip, caught by `tsc` — `params` declared as `Record<string, unknown>` where mysql2's `QueryValues` wants `any`, which the surrounding branches already use. Also a documentation drift found by reading rather than by failure: the OpenAPI contract specified `created` in the import response where the existing route returns `inserted`; the implementation follows the route. No bugs reached the test run.
- Graders run and results (PASS/FAIL): PASS — 337 tests green; both typechecks clean; new files lint clean with the project total unchanged; end-to-end run covering the template, a 3-row roster with one deliberately bad row reported at the right row number while the other two applied, FR-005 across a re-upload, deactivation taking effect immediately, an export containing zero bcrypt hashes, and a party token refused 401; all 7 real-data row counts identical to baseline and every e2e artefact removed.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): when extending an existing route, read its whole shape before writing the new branch. It cost a few minutes here and prevented a contract mismatch plus the type error pattern the neighbouring code had already solved.
