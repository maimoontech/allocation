---
id: 0047
title: Dashboard filters and member sorting
stage: green
date: 2026-11-20
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: (direct request)
labels: ["dashboard", "filtering", "sorting", "members", "FR-006b", "FR-112a"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/services/memberDashboardService.ts
 - backend/src/routes/memberDashboardRoutes.ts
 - backend/src/routes/memberAdminRoutes.ts
 - backend/src/__tests__/memberDashboard.test.ts (new)
 - backend/src/__tests__/memberAdmin.test.ts
 - frontend/src/features/member/memberDashboardApi.ts
 - frontend/src/features/member/memberAdminApi.ts
 - frontend/src/components/dashboard/MembersOverview.tsx
 - frontend/src/components/dashboard/MembersOverview.test.tsx
 - frontend/src/pages/modules/MembersPage.tsx
 - frontend/src/pages/modules/MembersPage.test.tsx
 - specs/001-membership-module/spec.md
 - CHANGELOG.md
tests:
 - frontend: 348 passing across 21 files (21 new — 11 dashboard filter, 10 member search/sort)
 - frontend: tsc -b clean, vite build clean
 - backend: tsc clean; the three test files typecheck (only pre-existing errors in
   helpers/fixtures.ts, which is why tsconfig excludes __tests__)
 - backend: memberDashboard.test.ts and the new memberAdmin.test.ts cases NOT executed —
   globalSetup refuses a non-local DB_HOST and no local database exists on this machine
---

## Prompt

in Admin dashboard. add zone & Mohallah dropdown for data filtering members account. 

add party  name search and sort option in members

## Response snapshot

Two separate pieces.

**Dashboard filters (FR-112a).** Zone and Mohallah dropdowns, both server-side, combined
with AND.

The design decision worth recording is that the Mohallah list is **not** cascaded from the
chosen Zone, which is the obvious thing to do and would have been wrong. `member_profiles`
holds two independent facts: `zone_id` is the member's Hizb (Tab 3) and `mohallah_id` is
where they live (Tab 1). `mohallahs.zone_id` is a third thing again — which zone that
Mohallah administratively belongs to. A member may do Zikr in one zone and live in a Mohallah
belonging to another, so narrowing the list would have hidden real combinations and implied
no such member could exist. Each Mohallah carries its zone in the label instead.

Each dropdown also offers **"not chosen yet"**, which filters for `IS NULL`. On a LEFT JOINed
profile that also matches accounts with no profile row at all. This is the point of it: a
plain zone filter hides exactly the two groups the figures exist to find, and without this
option they would be reachable only in the unfiltered total.

Two failure modes handled explicitly. A filter matching nobody says so, rather than showing a
page of zeroes that cannot be told apart from a membership that has done nothing. And an
unparseable filter is refused by name, rather than ignored — silently returning the
unfiltered figures would present a wrong number as a right one.

**Members: Party search and sort (FR-006b).** Party name added to the existing search box
rather than a second box; a `sort` parameter with six orders, resolved from a server-side
whitelist because an `ORDER BY` cannot be bound.

Blanks sort LAST in the Party and Zone orders. MySQL puts NULL first ascending, so the Party
order would otherwise have opened with every member who has not chosen one — burying what
was asked for. Every order carries a tie-break on `its_no`, without which paging through
equal values skips and repeats rows.

## Outcome

- ✅ Impact: `GET /api/v1/member-dashboard` accepts `zone_id` and `mohallah_id`;
  `GET /api/v1/members` accepts `sort` and matches `p.party_name` in `q`, and returns the
  order it applied. No schema change.
- 🧪 Tests: 348 frontend across 21 files (21 new). Backend tests written for both and not
  executable here (no local database).
- 📁 Files: 1 new backend test, 12 modified.
- 🔁 Next prompts: redeploy the backend, since both endpoints changed shape.
- 🧠 Reflection: the instinct to cascade Mohallah from Zone was strong and wrong, and only
  reading what each column actually means stopped it. Two columns both called "zone" in
  conversation turned out to be three different facts.

## Evaluation notes (flywheel)

- Failure modes observed: adding `p.party_name` to the search broke the member list's COUNT
  query, which shared the WHERE clause but had its own shorter FROM — a 500 on the whole
  endpoint, from a change that looked confined to one condition. The joins now mirror each
  other with a note, and the test asserts the total comes back, not only the rows. Separately,
  two frontend tests failed because the new prose reuses words that are also tab names and
  dropdown labels ("Personal", "North"); fixed by scoping the queries to a labelled list and
  to the banner element, rather than by weakening the assertions.
- Graders run and results (PASS/FAIL): frontend vitest PASS (348/348); frontend `tsc -b` PASS;
  frontend build PASS; backend `tsc` PASS; backend vitest NOT RUN (no local database).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a completion figure per zone in one table, which
  would answer "which zone is behind" without switching the filter nine times.
