---
id: 0026
title: Members List Zone Party Columns
stage: green
date: 2026-11-02
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["members", "admin-panel", "zone", "party", "columns"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/routes/memberAdminRoutes.ts
 - backend/src/__tests__/memberAdmin.test.ts
 - backend/dist/routes/memberAdminRoutes.js
 - frontend/src/features/member/memberAdminApi.ts
 - frontend/src/pages/modules/MembersPage.tsx
 - frontend/src/pages/modules/MembersPage.test.tsx
tests:
 - backend/src/__tests__/memberAdmin.test.ts (29 passed; 2 new)
 - frontend/src/pages/modules/MembersPage.test.tsx (2 passed)
 - full backend suite (459 passed), full frontend suite (175 passed)
---

## Prompt

in Admin Panel-> Members, list should be Picture, ITS No,  full name (First Prefix, Name, Father Name, Surname), Zone, Party, Whatsapp No. Mobile No.

## Response snapshot

Reshaped the admin Members list to the requested seven columns: Zone and Party added, Status
and Last Sign-In dropped.

Backend — `backend/src/routes/memberAdminRoutes.ts`:
- Added `LEFT JOIN zones z ON z.id = mp.zone_id` and `LEFT JOIN parties p ON p.id = mp.party_id`,
  selecting `z.zone_name` and `p.party_name`.
- Both are nullable FKs on `member_profiles` (`ON DELETE SET NULL`), so LEFT JOINs keep members
  with no posting — and members with no profile row at all — in the list rather than filtering
  them out.
- The COUNT query was deliberately left unjoined: the new joins are one-to-one and cannot change
  the row count, so adding them there would cost work without changing the total.

Frontend:
- `memberAdminApi.ts`: added `zone_name` and `party_name` to `MemberAccount`.
- `MembersPage.tsx`: headers now Picture, ITS No, Name, Zone, Party, WhatsApp No., Mobile No.,
  Action. Zone/Party cells fall back to an em dash. Removed the now-unused `formatDateTime`.
- The Status *filter* dropdown is retained — it filters rather than displays, and is the only
  way to find deactivated accounts.
- The Action column is retained; its label ("Deactivate" / "Activate") carries the account state
  that the removed Status column used to show, so no functionality was lost with the column.

## Outcome

- ✅ Impact: Admin Members list now shows the zone and party each member is posted to, matching the requested column set.
- 🧪 Tests: 2 new backend tests — one asserting a posted member resolves to the real `zone_name`/`party_name` via a dedicated `99900196` fixture account, one asserting a profile-less member returns nulls instead of dropping out. Frontend test fixtures gained zone/party values (one posted, one null) and now assert the Zone/Party headers are present and the Status/Last Sign-In headers are gone. Full suites: backend 459 passed, frontend 175 passed. `tsc --noEmit` clean both sides.
- 📁 Files: 6 changed (2 backend src/test, 1 dist rebuild, 3 frontend).
- 🔁 Next prompts: Consider making the search box match zone and party names too — it currently covers ITS number, roster name and profile name parts only. Zone/Party filter dropdowns alongside the Status filter may also be wanted.
- 🧠 Reflection: Used a dedicated test member rather than mutating the shared `memberSettled` fixture, because the backend suite runs 22 isolated workers against one database and cross-file mutation of shared accounts would be a flake source.

## Evaluation notes (flywheel)

- Failure modes observed: None. The removed-column assertions were written as `queryByRole(...).not.toBeInTheDocument()` so a silent revert of the column change would fail the test.
- Graders run and results (PASS/FAIL): backend suite PASS (459), frontend suite PASS (175), frontend tsc PASS, backend tsc PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Extend the `q` search predicate to `z.zone_name` and `p.party_name`.
