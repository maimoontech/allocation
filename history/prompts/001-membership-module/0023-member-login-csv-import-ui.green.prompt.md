---
id: 0023
title: Member Login CSV Import UI
stage: green
date: 2026-10-30
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["import-export", "members", "csv", "provisioning", "frontend"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/routes/importExportRoutes.ts
 - backend/src/__tests__/memberProvisioning.test.ts
 - backend/dist/routes/importExportRoutes.js
 - frontend/src/pages/modules/ImportExportPage.tsx
 - API_DOCUMENTATION.md
tests:
 - backend/src/__tests__/memberProvisioning.test.ts (28 passed, 2 added)
 - backend full suite: 20 files, 440 tests passed
 - backend tsc --noEmit: clean
 - frontend tsc --noEmit: clean
---

## Prompt

i will provide. ITS No.  and Password CSV for login. add csv import for members login in import page

## Response snapshot

The backend already carried a `members` entity in `importExportRoutes.ts` (template
`its_no,member_name,password,is_active`, bcrypt hashing, FR-005 protection for members who
already chose their own password). Two things were missing for the stated workflow:

1. The import rejected any file not carrying **every** template column, so a two-column
   `its_no,password` roster failed with `Missing column: member_name`. Added an optional
   `requiredHeaders` to the entity config — declared only for `members` as
   `["its_no", "password"]` — and the header check now reads
   `cfg.requiredHeaders ?? cfg.templateHeaders`. Every other entity is unchanged.
   Omitted columns take their existing defaults: `member_name` stays NULL on insert and is
   preserved on update via the existing `COALESCE`, `is_active` defaults to 1.

2. The Import/Export page's `EntityKey` union and dropdown listed only zones, mohallahs,
   parties, venues and miqaats. Added **Member Logins**, and replaced the static password
   footnote with an entity-aware hint so the members case explains the two-column form and
   the FR-005 carve-out.

Documented the required-vs-template column distinction in `API_DOCUMENTATION.md`.

## Outcome

- ✅ Impact: An admin can now select "Member Logins" on the Import/Export page and upload a
  bare `its_no,password` CSV to provision member sign-in accounts; template download and
  export for the same entity come along for free through the existing generic handlers.
- 🧪 Tests: 2 new cases in `memberProvisioning.test.ts` (two-column roster inserts with
  defaults; an absent `member_name` column does not blank an existing name). Full backend
  suite 440/440 green; both tsc projects clean; `backend/dist` rebuilt.
- 📁 Files: 1 route, 1 test, 1 page, 1 doc, 1 built artifact.
- 🔁 Next prompts: provide the real roster CSV and run it against the live database; consider
  whether the member export should stay admin-only in the same page.
- 🧠 Reflection: the widening was one config key plus one `??` — the generic import path
  absorbed the whole request, so no member-specific endpoint was needed.

## Evaluation notes (flywheel)

- Failure modes observed: none in the final state. The existing "rejects a file missing a
  required column" test still passes because `password` remains required.
- Graders run and results (PASS/FAIL): PASS — vitest 440/440, tsc backend PASS, tsc frontend PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): accept common header aliases ("ITS No.", "its
  number") in `normalizeHeader` so a roster exported from elsewhere imports without renaming.
