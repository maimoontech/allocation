---
id: 0054
title: Muntasib question and completion sort
stage: green
date: 2026-11-27
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: (direct request)
labels: ["tab-12", "muntasib", "FR-086b", "FR-006d", "sorting", "completion"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/services/memberProfileService.ts
 - backend/src/services/memberFormCompletion.ts
 - backend/src/services/memberCompletionQuery.ts
 - backend/src/services/memberDashboardService.ts
 - backend/src/services/helpChatKnowledge.ts
 - backend/src/db/ensureSchema.ts
 - backend/src/routes/memberAdminRoutes.ts
 - backend/src/__tests__/memberProfile.test.ts
 - backend/src/__tests__/memberFormCompletion.test.ts
 - backend/src/__tests__/memberCompletionQuery.test.ts
 - backend/src/__tests__/memberAdmin.test.ts
 - backend/src/__tests__/partyMembers.test.ts
 - backend/dist (rebuilt)
 - database/sources/membership_schema.sql
 - database/MEMBERSHIP_LIVE_INSTALL.sql (regenerated)
 - frontend/src/features/member/memberApi.ts
 - frontend/src/features/member/memberAdminApi.ts
 - frontend/src/pages/member/tabs/Tab12Khidmat.tsx
 - frontend/src/pages/member/tabs/conditionalTabs.test.tsx
 - frontend/src/pages/member/tabs/Tab02TitlePrefix.test.tsx
 - frontend/src/pages/modules/MembersPage.tsx
 - frontend/src/pages/modules/MembersPage.test.tsx
 - frontend/src/pages/modules/membersExport.ts
 - specs/001-membership-module/spec.md
 - CHANGELOG.md
tests:
 - frontend: 417 passing across 23 files (up from 409); tsc -b clean; vite build clean
 - backend: tsc clean, npm run build clean
 - backend: ~20 new/extended cases written; NOT executed - globalSetup refuses a non-local
   DB_HOST, correctly, because the suite writes
 - backend: SQL rules re-verified through tsx - 163 SQL literals, none carrying an SQL
   comment; 94 named-placeholder queries, every one tokenising and formatting clean
 - backend: BOTH branches of the list query rebuilt and run through the real tokeniser and
   the real formatter - 6, 4 and 12 placeholders against 6, 4 and 12 values, ids landing in
   rank order in both IN() and FIELD(), LIMIT 50 OFFSET 0 on the ranked path
 - backend: the completion measure's new branches checked through tsx against the pure
   function - tab 12 asks 4 questions unanswered or on No, 5 on Yes, and 100% stays reachable
---

## Prompt

1) Add in Members Profile, in other Sansta Khidmat
An option button "Are you a Muntasib Ila Jamea?" if yes then ask "Farig Year" in text box

2) In Admin, members In Sorting by Profile Percentage

## Response snapshot

Two unrelated additions, delivered together.

### 1. The Muntasib Ila Jamea question (FR-086b)

Tab 12 now ends with a Yes/No question and a **Farig Year** box that appears only on Yes, in
its own section under a dividing rule - the question is about Aljamea-tus-Saifiyah and the
rest of the tab is about Sansta and Umoor Khidmat, so running them together would read as one.

**One thing was worth asking about rather than deciding privately.** The tab already has a
`Since (AH)` dropdown, and the Occupation tab's year is Gregorian, so "text box" left the
calendar open. The options put to the user were a validated AH year, a validated CE year, or
free text with no checking. They chose **free text, no checking**, and that is what was built:
VARCHAR(20), stored exactly as typed, so "1441", "1441 AH" and "2019-20" all survive. Nothing
counts, sorts or computes on the value, and that is precisely what makes leaving it open safe
rather than sloppy. Had anything needed to aggregate it, the answer would have had to be a
calendar.

**Radios, not a checkbox**, for the reason the seven other Yes/No questions here use radios:
unanswered is not No. The two are different members and the completion figure treats them
differently.

**A No clears the year, enforced on the server.** The browser removes the box on No, and a
control that is not on screen fires no change event - so without the server rule, a year typed
before the answer changed would stay saved where nobody could see it to correct it. The same
rule FR-059 applies to the Hifz Sanad. A test sends the year again on the No, as a stale form
would, and asserts it does not survive.

**Neither question is mandatory.** FR-095 holds that a partly answered profile still saves, and
demanding free text that nothing validates would block a save to no purpose. The unanswered
Farig Year surfaces through the completion measure instead.

**The denominator grew, for everybody.** An empty profile went from 42 questions to 43, so
every member's percentage drops a little until they answer. That is the honest consequence of
adding a question to the form, and `memberFormCompletion` says as much in its own header:
"a question missing from this list makes the dashboard read HIGH, and a dashboard that
flatters the data is worse than none." The Farig Year joins the denominator only on Yes, so
100% stays reachable for everyone - there is a test for exactly that, in both directions.

The Need Help chat's Khidmat topic was updated, because it otherwise described a tab that had
changed.

### 2. Ordering the member list by Profile % (FR-006d)

Two new orders: least complete first (who needs a telephone call) and most complete first.

**This is the one order that could not be an `ORDER BY`,** which is why it was still an open
item from PHR 0053. Completion is not a column - it is answered over ASKED, and what a member
is asked depends on their own answers. So the server ranks it in a pass of its own: presence
bits for every account the filters match, the same measure the row's figure uses, ordered,
then this page's slice taken as a list of ids. The display query is confined to those ids and
ordered by `FIELD()`.

**Ranking the whole filtered set rather than the page IS the feature.** Ranking only the fifty
rows a LIMIT had already chosen would sort each page within itself and leave the pages in
ITS-number order - which looks sorted, page by page, and is not. The test that matters pages
through one row at a time and compares the result with the single-page ordering.

**The alternative was rejected deliberately.** A second definition of the measure, written in
SQL purely to sort by, is how a row comes to read 76% inside a list ordered as though it read
something else. The row now shows the figure it was RANKED by, carried over from the ranking
pass, so a member saving between the two reads cannot make the order look broken.

**The server may decline, and says so.** The pass is linear in the filtered set, so there is a
ceiling of 20,000 accounts - far above this organisation's membership, far below anything that
would hold a request open. Past it the list returns in ITS-number order, the response reports
that (the `sort` echo FR-006b already required), and the page says plainly it is not in the
order asked for. A list quietly mislabelled "least complete first" would be the real failure.

### The SQL rules held, and one near-miss

The two new queries carry no `--` comment; the explanations are in TypeScript. One mistake was
caught and corrected before commit: the first draft moved `LIMIT :limit OFFSET :offset` into a
`${listLimit}` hole so the ranked path could omit it. That compiles, runs and is tidier - and
it quietly removes the query from the set `sqlNamedPlaceholders.test.ts` scans, because that
guard looks for source literals carrying `:name`. This is the query that has twice gone to
production broken. The clause stays inline and the ranked path passes `offset: 0` instead.

## Outcome

- Impact: Tab 12 gains two questions; every member's completion denominator grows by one; the
  Members list gains two orders. No scoping or privacy change - the ranking reads presence
  bits and the discriminants, never a value.
- Tests: 417 frontend across 23 files. ~20 backend cases written; not executable here.
- Files: 25 touched, 0 new modules, dist and the live install SQL regenerated.
- Next prompts: redeploy. Without it the Muntasib question saves nothing (the columns are
  added by `ensureSchema` at boot) and the two new orders are rejected as unknown keys, which
  falls back to ITS number rather than failing.
- Reflection: the instinct on the sort was to find a SQL expression for completion, because
  "sorting happens in the database" is a strong default. It is the wrong default when the
  thing being sorted is not in the database. Reading the whole filtered set costs one cheap
  presence scan and keeps one definition of the measure.

## Evaluation notes (flywheel)

- Failure modes observed: three, all caught before commit. (1) The `${listLimit}` hole above,
  which weakened the guard that exists because of two previous outages. (2) Two tautological
  assertions written into tests - one `expect(x).toEqual(cond ? x : x)` and one pointless
  `render/unmount` pair - both replaced with assertions that can fail. (3) My own expected
  counts in the completion check were off by one; the code was right and tab 12 already had
  three unconditional questions. Separately, several minutes were lost to shell fumbling over
  the scratchpad path, fixed by resolving it from a glob into a variable rather than retyping
  it.
- Graders run and results (PASS/FAIL): frontend vitest PASS (417/417); frontend `tsc -b` PASS;
  frontend build PASS; backend `tsc` PASS; backend build PASS; live-install `--check` PASS;
  SQL comment and tokenising rules via tsx PASS (163 literals, 94 queries); both list query
  branches rebuilt and formatted PASS; completion measure branches via tsx PASS; backend
  vitest NOT RUN (no local database).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): the party roster could take the same two orders.
  The ranking pass is already written and the roster is a smaller set, so it is mostly a
  question of whether a Hizb leader wants it. The ceiling would never be reached there.
