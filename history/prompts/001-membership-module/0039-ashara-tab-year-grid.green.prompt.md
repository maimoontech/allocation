---
id: 0039
title: Ashara tab becomes a year grid
stage: green
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: none
labels: ["member-profile", "ashara", "tab-9", "lookups", "schema", "ux"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/pages/member/tabs/Tab09Ashara.tsx
  - frontend/src/pages/member/tabs/Tab02TitlePrefix.test.tsx
  - frontend/src/pages/modules/MemberLookupEditPage.tsx
  - frontend/src/features/member/memberApi.ts
  - frontend/src/features/member/memberLookupAdminApi.ts
  - backend/src/routes/memberLookupAdminRoutes.ts
  - backend/src/routes/memberLookupsRoutes.ts
  - backend/src/services/memberProfileService.ts
  - backend/src/db/ensureSchema.ts
  - backend/src/__tests__/liveUpdateScript.test.ts
  - backend/src/__tests__/memberRepeatables.test.ts
  - backend/dist (4 rebuilt files)
  - database/sources/membership_schema.sql
  - database/MEMBERSHIP_LIVE_INSTALL.sql (regenerated)
  - specs/001-membership-module/spec.md
  - CHANGELOG.md
tests:
  - frontend vitest: 214 passed (15 files); Tab 9 tests rewritten for the grid
  - frontend tsc --noEmit: clean
  - backend tsc --noEmit: clean
  - backend vitest: NOT RUN, because vitest is not installed in backend/ and there is no local DB
  - new liveUpdateScript assertions checked directly with node against the generated SQL
---

## Prompt

Can you make the 'Ashara Mubarak' tab simpler from a UI perspective, for the range 1405 to 1448? 'Ashara with Aqa Moula' is fixed — meaning for every year, the list of where that event took place is already available. The rest, 'with Amil,' can vary — so can you make it grid-style or something else that's easier?

## Response snapshot

Asked three questions first, because the "Ashara with Aqa Moula" list held only place names,
with no year. The user's answers were: add a Hijri year to each Admin entry (one place per
year), lay the tab out as one row per year, and hide 1400 to 1404 from the form only.

Tab 9 now lists every year from the current Hijri year (served by the backend) down to 1405,
each with Not attended / With Aqa Moula TUS / With Aamil pills. For Aqa Moula, the row shows
that year's place, and the server derives `aqa_moula_ashara_id` from the year on save. For
Aamil, the row shows Moze and an optional Mohallah inline. Not attended means no record, so the
data shape is unchanged. Records saved for 1400 to 1404 show as extra rows.

Admin: a Hijri Year field and column on the "Ashara with Aqa Moula" list only, with a
plain-words message on a duplicate year. Schema: nullable `hijri_year` and a unique key,
added by the live-script backfill and at boot.

## Outcome

- ✅ Impact: Tab 9 is answered with one click per year instead of add, pick year, pick type and
  pick place.
- 🧪 Tests: 214 frontend tests pass and both typechecks are clean. The backend tests are written
  but have not been run.
- ⏳ Needs the user: enter a Hijri year against each Aqa Moula place in Admin. Deploy the
  backend: ensureSchema adds the column at boot, or run MEMBERSHIP_LIVE_INSTALL.sql.
- 🔁 Next prompts: fill the year for each place in Admin; deploy.
- 🧠 Reflection: the request assumed a year-to-place mapping that the data model did not have.
  Asking before building avoided a grid that would have needed a dropdown on every row anyway.

## Evaluation notes (flywheel)

- Failure modes observed: a tsc rebuild rewrote line endings across unrelated dist files; they
  were restored so only four compiled files differ.
- Graders run and results (PASS/FAIL): frontend vitest PASS, tsc PASS.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
