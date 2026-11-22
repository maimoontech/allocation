---
id: 0050
title: Member completion percentage and Excel export
stage: green
date: 2026-11-22
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: (direct request)
labels: ["members-list", "completion", "export", "excel", "privacy", "FR-112b", "FR-006c", "FR-101b"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/services/memberCompletionQuery.ts (new)
 - backend/src/services/memberDashboardService.ts
 - backend/src/routes/memberAdminRoutes.ts
 - backend/src/__tests__/memberCompletionQuery.test.ts (new)
 - backend/src/__tests__/memberAdmin.test.ts
 - backend/src/__tests__/memberDashboard.test.ts
 - backend/dist (rebuilt)
 - frontend/src/utils/excelExport.ts (new)
 - frontend/src/pages/modules/membersExport.ts (new)
 - frontend/src/pages/modules/membersExport.test.ts (new)
 - frontend/src/pages/modules/MembersPage.tsx
 - frontend/src/pages/modules/MembersPage.test.tsx
 - frontend/src/features/member/memberAdminApi.ts
 - specs/001-membership-module/spec.md
 - CHANGELOG.md
tests:
 - frontend: 388 passing across 22 files (33 new: 21 in membersExport.test.ts, 12 in
   MembersPage.test.tsx)
 - frontend: tsc -b clean, vite build clean
 - backend: tsc clean, npm run build clean
 - backend: the new cases NOT executed - globalSetup refuses a non-local DB_HOST and no local
   database exists on this machine. The pure module was verified through tsx instead: 80
   checks, all passing, covering every presence alias, the mp/ph alias contract, the health
   columns being read as presence only, and the Student rule surviving the SQL bridge
---

## Prompt

Members in Admin and Zonal Head
1) Show profile filling percentage of all Individual members in members information row
2) Members Grid information Export to Excel option

## Response snapshot

### 1. The percentage in the row (FR-112b)

Each row carries the percentage, a bar for scanning, and the fraction underneath - "32 of
42". The fraction is not decoration: the denominator differs per member because it counts
only the questions that member was asked, so a Student is measured out of a different total
from a shopkeeper. A bare percentage invites "out of what?" and the answer is per member.

**The restructuring was the real work.** The presence select list and the row mapping moved
out of `memberDashboardService.ts` into a new `memberCompletionQuery.ts` that both the
dashboard and the account list call. Two implementations of the same measure would have been
free to drift, and the failure would have been invisible - a member reading 76% in their row
while being counted as something else in the average looks reasonable from either end, and
nobody would think to compare them. A test asserts `DASHBOARD_QUERY` contains the shared
fragment, so the sharing cannot be undone silently.

**Derived from presence, never from an answer.** The query selects 1 or 0 per field; those
columns are consumed in the route and left out of the response. The forbidden-keys test in
`memberAdmin.test.ts` now names `p_blood_group` and `is_regular_donor` among the keys that
must never appear - the query reads them, so the test has to say the response must not
carry them.

One deliberate difference from the dashboard: the dashboard measures ACTIVE accounts only,
because it reports work somebody intends to do. A row carries a figure for every account
listed, deactivated ones included, because a row is a specific member being looked at.

### 2. Export to Excel (FR-006c)

Every account matching the current search, status filter and order - not the twenty-five on
screen. It walks the same endpoint the grid uses, 200 rows at a time, rather than calling a
second export route: that is what makes the file and the grid the same set of members, with
one search, one filter, one order, one zone scope and one completion measure, all decided on
the server.

The loop has three stopping conditions and all three are load-bearing. Reaching the server's
`total` is the normal one. An empty page guards against a total that moves mid-export -
somebody creating or deactivating an account would otherwise leave it asking for page after
page. A 5,000-row ceiling guards against a filter nobody meant to set, and when it bites the
file says it was cut short.

Three Excel-specific details:

- **The ITS number and telephone numbers go in as text.** An ITS number is 6 to 20 digits and
  is an identifier, not a quantity; past 15 significant figures Excel rounds, so a 20-digit
  ITS number would have arrived subtly wrong and a search pasted from it would find nobody.
- **The percentage goes in as a bare number** with the unit in the heading, because "76%" is
  text to a spreadsheet and a text column cannot be averaged or filtered with "greater than".
- **The file states its own scope** - rows out of matches, the search, the order, whose scope,
  and what it leaves out. A spreadsheet outlives the screen it came from.

### The question that had to be asked

FR-101 forbids contact details in an export "unless that is separately specified and
authorised", and the grid displays WhatsApp and Mobile. That is a privacy decision belonging
to the organisation, not a default to pick, so it was put to the user with the alternatives
priced: include them, omit them, or admin-only. The answer was to include them, and FR-101b
records the exception and keeps it narrow - those two columns and nothing else.

### Numbering

The obvious id for the new requirement was FR-112a, which the spec already uses for the
dashboard's Zone and Mohallah filters. Caught while writing the spec entry, after the code
comments had been written: renumbered to FR-112b across eleven files, leaving the two
pre-existing FR-112a references alone.

## Outcome

- Impact: the account list gains a Profile column and an Export to Excel button for both
  roles. The dashboard is unchanged in behaviour but now shares its completion query.
- Tests: 388 frontend across 22 files (33 new). Backend cases written; not executable here.
  The shared module verified via tsx - 80 checks, all passing.
- Files: 6 new, 8 modified, dist rebuilt.
- Next prompts: redeploy. Worth considering next: sorting the list BY completion, which needs
  a SQL expression rather than the per-row computation used here, since paging has to happen
  in the same order the sort claims.
- Reflection: the instinct to add a second completion query to the route would have shipped
  and passed review. Making the dashboard and the row read one select list cost one new file
  and removed a whole class of bug that no test would ever have caught by accident.

## Evaluation notes (flywheel)

- Failure modes observed: two. A backtick inside an SQL comment ended the template literal
  holding the query, which surfaced as "',' expected" two lines away from the real cause - the
  comment now says why there are no backticks in it. And the new no-profile test first used
  ITS 99900197, which `memberDashboard.test.ts` already owns; the files run in parallel
  against one shared database and the test DELETES what it creates, so it would have removed
  another file's fixture mid-run. Found by grepping the test ITS numbers in use rather than
  by running anything.
- Graders run and results (PASS/FAIL): frontend vitest PASS (388/388); frontend `tsc -b` PASS;
  vite build PASS; backend `tsc` PASS; backend build PASS; shared module via tsx PASS (80/80);
  backend vitest NOT RUN (no local database).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a test that renders one member through the row
  and through the dashboard aggregate and asserts the two agree on that member's percentage.
  The current test proves they share a query; it does not prove they agree on an answer.
