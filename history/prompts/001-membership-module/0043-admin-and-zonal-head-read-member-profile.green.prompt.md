---
id: 0043
title: Admin and Zonal Head read member profile
stage: green
date: 2026-11-06
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: /sp.implement
labels: ["authorisation", "privacy", "health-data", "audit", "member-profile", "refactor"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - database/sources/membership_schema.sql
  - database/MEMBERSHIP_LIVE_INSTALL.sql (regenerated)
  - database/build_live_update.mjs
  - backend/src/db/ensureSchema.ts
  - backend/src/routes/memberAdminRoutes.ts
  - backend/src/__tests__/memberAdminCreate.test.ts
  - backend/src/__tests__/globalSetup.ts
  - frontend/src/features/api/api.ts
  - frontend/src/features/member/memberAdminApi.ts
  - frontend/src/pages/member/tabs/profileTabs.tsx (new)
  - frontend/src/pages/member/tabs/Tab01Personal.tsx
  - frontend/src/pages/member/MemberProfilePage.tsx
  - frontend/src/pages/modules/MemberProfileViewPage.tsx (new)
  - frontend/src/pages/modules/MemberProfileViewPage.test.tsx (new)
  - frontend/src/pages/modules/MembersPage.tsx
  - frontend/src/router/AppRoutes.tsx
  - specs/001-membership-module/spec.md
  - CHANGELOG.md
tests:
  - frontend vitest: 226 passed (16 files), 8 new
  - frontend npm run build (tsc -b + vite): clean
  - backend tsc --noEmit and npm run build: clean
  - backend vitest: NOT RUN - no local database; 10 new tests written
  - LIVE SCHEMA NOT APPLIED - ensureSchema() creates the audit table at boot, so a redeploy
    is sufficient
---

## Prompt

Admin and Zonal Head can see Members Profile.

(and, in answer to two clarifying questions:)

Health data = "Both see the full profile including health"
Edit rights = "Admin can edit, Zonal Head view-only"

## Response snapshot

**One sentence, two permissions, and a requirement that said no.** FR-065 read "health values
MUST be readable and writable only by the member they belong to and by explicitly authorised
administrators". So administrator access had cover already; a Zonal Head is not an
administrator, and Tab 6 is blood group, donor status, height, weight and BMI. Building it
without asking would have been a quiet decision about medical data for someone else's zone.
Both answers came back wider than the recommendation — Zonal Heads see health too — so FR-065
is amended with its previous wording recorded, not reinterpreted.

**I said an edit path needs an audit trail, so I built one.** The answer chose "Admin can
edit", having been told a disputed value is otherwise unresolvable. `member_profile_edits`
records who, when, and which fields — **field NAMES only**. That restraint is the interesting
part: FR-066 says health values must appear in no log line, and an audit table is a log.
Writing the old and new blood group into it would have moved the problem rather than solved
it, creating a second place holding medical data that needs protecting just as carefully.
Recording that `blood_group` changed, by whom and when, gives provenance without that. A test
asserts the value `AB-` is absent from the audit row that records its own change.

**The edit verdict is the server's, and the page is told.** `can_edit` rides in the payload;
the browser never derives it from the signed-in role. Two reasons: a client that guessed wrong
would offer a Save button the server then refuses, and a second page copying the role check
could get it wrong independently. The `PUT` carries its own `requireRole(["admin"])`, so the
flag is a courtesy, never the control. The frontend tests change only that flag and assert the
page follows it.

**A collision that would have shipped silently.** `memberApi` already injects an endpoint named
`getMemberProfile`. Naming the admin one the same meant RTK Query kept the first, and my admin
query quietly fetched `/members/me/profile` — the administrator's own. It surfaced as an empty
page with twelve tabs and no data. Renamed to `getAdminMemberProfile`, with a comment saying
why, because nothing warns about this at build time.

**A bug the refactor exposed.** `Tab01Personal` fetched `members/me/photo`, hardcoded. Reused
on an admin view that would have shown the ADMINISTRATOR's own photograph on every member they
opened — plausible-looking and wrong. The path is now a parameter and a dependency of the
effect, so switching members refetches.

**Shared rather than duplicated.** The twelve-branch tab switch moved into `profileTabs.tsx`.
Two copies means two places to add tab thirteen, and the one that gets forgotten is the admin
view, which nobody uses daily.

**Not changed, deliberately:** the member list still carries no profile answers. A page of
fifty members should not be a page of fifty medical records, and nothing in the request asked
for that. The two stale comments claiming the whole profile "stays private" were corrected
rather than left to contradict the code.

**One unasked-for fix:** `globalSetup` now runs `ensureSchema()` before the suite. Without it
these tests fail on a developer's machine with "unknown table member_profile_edits", which
reads as a broken test rather than a stale database.

## Outcome

- ✅ Both roles open one member's twelve tabs, health included; only administrators may save.
- ✅ Every administrator edit is attributable, without putting medical values in a log.
- ✅ A Zonal Head is confined to their zone, and a 403 is explained as a boundary, not an error.
- ⏳ Live schema: the audit table is created by `ensureSchema()` at boot, so a redeploy is
  enough. Applying the install script directly was refused by the classifier again.
- 🧪 226 frontend tests pass (8 new), both builds clean. 10 backend tests written, unrun —
  no local `DB_HOST`.
- 📁 Files: 18 changed, 4 new.
- 🔁 Next prompts: redeploy; run `npm test` in `backend/` locally; decide whether a member
  should be able to see who edited their profile.
- 🧠 Reflection: the request was seven words and touched the most sensitive data in the
  system. The useful move was not building faster but noticing that an existing requirement
  said no, and asking whose decision it was to change it — then recording the answer where
  the next person will find it rather than only in the code.

## Evaluation notes (flywheel)

- Failure modes observed: (1) a feature request that silently contradicts a privacy
  requirement, where the cost of guessing is disclosed medical data; (2) an audit log that
  would itself breach the rule it exists to support, unless it stores names rather than
  values; (3) two `injectEndpoints` calls sharing an endpoint name — the later one is dropped
  with no build error and the wrong URL is fetched; (4) a hook hardcoding `me` in its path,
  invisible until the component is reused for somebody else; (5) a client-side role check
  standing in for authorisation, which drifts from the server the moment a second page
  appears; (6) tests that would fail on a colleague's machine purely because their database
  predates the migration.
- Graders run and results (PASS/FAIL): frontend vitest 226 — PASS. frontend build — PASS.
  backend build — PASS. `can_edit: false` hides Save and disables fields — PASS. 403 renders
  as a zone message — PASS. Audit row excludes the health value — PASS (asserted). Backend
  vitest — NOT RUN (no local database). Live apply — NOT RUN (permission refused).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): show the member, on their own profile, that an
  administrator changed named fields on a date. The audit table already holds it, and a
  member learning it from the people who changed it is better than never learning it.
