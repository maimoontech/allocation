---
id: 0041
title: Allow duplicate Aqa Moula place names
stage: green
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: none
labels: ["lookups", "ashara", "admin", "schema"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - database/sources/membership_schema.sql
  - database/MEMBERSHIP_LIVE_INSTALL.sql (regenerated)
  - backend/src/db/ensureSchema.ts
  - backend/src/routes/memberLookupAdminRoutes.ts
  - backend/src/__tests__/liveUpdateScript.test.ts
  - backend/dist (2 rebuilt files)
  - specs/001-membership-module/spec.md
  - CHANGELOG.md
tests:
  - backend tsc --noEmit: clean
  - new liveUpdateScript assertions checked directly with node against the generated SQL
  - backend vitest: NOT RUN, because vitest is not installed in backend/
---

## Prompt

Duplicate allow in Ashara with Aqa Moula in Dropdownlist in Admin

## Response snapshot

I read this as: the same place name may be entered for several years. The unique key on the
name was removed from the CREATE, and the live-script backfill and the boot-time ensureSchema
both drop it where it exists. The Hijri year stays unique, so Tab 9 still resolves one place
per year. The other ten lists are unchanged.

## Outcome

- ✅ Impact: an admin can enter, for example, the same city for 1440 and 1446.
- 🧪 Tests: the backend typecheck is clean and the generated SQL was checked with node.
- 📁 Files: 5 source files changed, plus the spec, CHANGELOG and 2 rebuilt dist files.
- 🔁 Next prompts: deploy the backend; ensureSchema drops the key at boot.
- 🧠 Reflection: "duplicate" could have meant duplicate years, but that would break the year → place lookup the user asked for earlier.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): tsc PASS
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
