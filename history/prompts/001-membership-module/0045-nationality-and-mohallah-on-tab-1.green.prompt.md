---
id: 0045
title: Nationality and Mohallah on Tab 1
stage: green
date: 2026-11-07
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: /sp.implement
labels: ["member-profile", "tab1", "schema", "master-data", "foreign-keys"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - database/sources/membership_schema.sql
  - database/MEMBERSHIP_LIVE_INSTALL.sql (regenerated)
  - backend/src/db/ensureSchema.ts
  - backend/src/services/memberProfileService.ts
  - backend/src/__tests__/memberProfile.test.ts
  - frontend/src/features/member/memberApi.ts
  - frontend/src/pages/member/tabs/Tab01Personal.tsx
  - frontend/src/pages/member/MemberProfilePage.test.tsx
  - frontend/src/pages/member/tabs/Tab02TitlePrefix.test.tsx
  - frontend/src/pages/member/tabs/conditionalTabs.test.tsx
  - frontend/src/pages/modules/MemberProfileViewPage.test.tsx
  - specs/001-membership-module/spec.md
  - CHANGELOG.md
tests:
  - frontend vitest: 239 passed (16 files), 6 new
  - frontend npm run build (tsc -b + vite): clean
  - backend tsc --noEmit and npm run build: clean
  - backend vitest: NOT RUN - no local database; 4 new tests written
  - generated SQL verified with node - procedure present, 3 existence checks, positioned
    after the CREATE, 22 tables
  - LIVE SCHEMA NOT APPLIED - the backup was refused by the classifier, so nothing was
    written either; ensureSchema() adds both columns at boot
---

## Prompt

Add 2 Fields in personal Tab
1) Nationality before Marital Status
2) Mohallah Dropdown Next to  Residence Address

## Response snapshot

**The request drew its own distinction and I followed it.** "Mohallah **Dropdown**" names a
control; "Nationality" does not. So Nationality is free text and Mohallah is a select. The
alternative reading — Nationality as an eleventh managed list — would have meant a lookup
table, an entry on the Dropdown Lists page, and either inventing country values or shipping
it empty so nobody can answer. That is a bigger change than was asked for, and the wording
does not support it. Recorded in FR-040a as a decision rather than left implicit, with an
offer in the changelog to convert it if a managed list is wanted after all.

**Mohallah reuses the master list rather than copying it.** `mohallahs` already exists with
18 rows, is already in the lookups payload for Tab 9, and FR-092 forbids a second copy of
existing master data. So this is a foreign key from `member_profiles` to a PRE-EXISTING table
— additive, no ALTER on `mohallahs`, so FR-106 holds.

**`ON DELETE RESTRICT`, deliberately, and not what the neighbouring column does.**
`marital_status_id` beside it uses `SET NULL`, which is right for one of this module's own
lists: deactivating a value is the normal path and deletion is already refused while in use.
`mohallahs` is different — it is maintained from an entirely different panel by people not
thinking about member profiles, and `SET NULL` there would erase a member's own answer with
nobody told. Refusing the delete is the lesser harm, and it matches how `moze_id` and
`venue_id` already treat the same situation.

**Almost no new code.** `nationality` joined `TEXT_COLUMNS` and `MAX_LENGTHS`; `mohallah_id`
joined `LOOKUP_FKS`, which already drives parsing, persistence, the read, and the "selection
is no longer available" check. Both joined `COLUMN_TAB` so a validation error opens Tab 1.
The existing structure did the work, which is the point of it being declared once.

**One thing worth not misreporting.** A full-suite run failed ten tests across files I had not
touched — RoleAvatar, reauth, Tabs, YesNoField. Each passed in isolation and the next full
run was green at 239, so it was contention under load, not a regression. I checked rather than
assuming, and I am recording it because a suite that flakes once will flake again.

## Outcome

- ✅ Nationality sits before Marital Status as free text; Mohallah sits beside Residence
  Address as a dropdown of the existing 18.
- ✅ A deleted Mohallah cannot silently blank a member's answer.
- ⏳ Live schema: NOT applied. The backup was refused by the classifier, so I did not write
  either — `ensureSchema()` adds both columns on boot, so a redeploy is sufficient.
- 🧪 239 frontend tests pass (6 new), both builds clean, generated SQL verified. 4 backend
  tests written, unrun — no local `DB_HOST`.
- 📁 Files: 13 changed, 1 new (this record).
- 🔁 Next prompts: redeploy; say whether Nationality should become a managed list; run
  `npm test` in `backend/` locally.
- 🧠 Reflection: the useful reading was in the user's own punctuation — one field named a
  control and the other did not. Treating that as deliberate avoided both guessing and
  another clarifying question.

## Evaluation notes (flywheel)

- Failure modes observed: (1) a field that could plausibly be text or a managed list, where
  the request's own wording settles it and over-reading would have built a lookup nobody
  asked for; (2) copying the neighbouring column's `SET NULL` without asking who maintains
  the referenced table — here that would have let an unrelated panel erase member answers;
  (3) a full-suite run failing ten unrelated tests under load, which is indistinguishable
  from a real regression until each is re-run alone.
- Graders run and results (PASS/FAIL): frontend vitest 239 — PASS. frontend build — PASS.
  backend build — PASS. Generated SQL: procedure present, 3 checks, after the CREATE, 22
  tables — PASS. `build_live_update.mjs --check` current — PASS. Backend vitest — NOT RUN
  (no local database). Live apply — NOT RUN (backup refused, so no write attempted).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): derive Mohallah's options from the member's Zone
  the way Tab 3 filters Parties, so an 18-item list becomes the handful in their own zone —
  the data already carries `zone_id` on every Mohallah.
