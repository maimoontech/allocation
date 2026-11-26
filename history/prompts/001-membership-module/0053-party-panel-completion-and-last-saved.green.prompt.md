---
id: 0053
title: Party panel shows completion and last saved
stage: green
date: 2026-11-26
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: (direct request)
labels: ["party-panel", "completion", "FR-112c", "privacy", "shared-component"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/routes/partyMemberRoutes.ts
 - backend/src/__tests__/partyMembers.test.ts
 - backend/dist (rebuilt)
 - frontend/src/components/member/ProfileCompletion.tsx (new)
 - frontend/src/components/member/ProfileCompletion.test.tsx (new)
 - frontend/src/features/party/partyMemberApi.ts
 - frontend/src/pages/party/PartyMembersPage.tsx
 - frontend/src/pages/party/PartyMembersPage.test.tsx
 - frontend/src/pages/modules/MembersPage.tsx
 - specs/001-membership-module/spec.md
 - CHANGELOG.md
tests:
 - frontend: 409 passing across 23 files (21 new - 16 for the shared cells, 5 for the party page)
 - frontend: tsc -b clean
 - backend: tsc clean, npm run build clean
 - backend: 5 new cases written; NOT executed - globalSetup refuses a non-local DB_HOST
 - backend: the SQL rules re-verified through tsx - 183 SQL literals, none with an SQL
   comment; 93 named-placeholder queries, every one tokenising and formatting clean
---

## Prompt

In party Panel.
in member section. show when member last update his profile with precentage

## Response snapshot

Two columns on the party's member section: **Profile** (how much of the twelve-tab form that
member has filled in) and **Last saved** (when the profile was last written), each showing a
figure and the detail under it.

### Why this role gets it

A Zonal Head sees a zone and an administrator sees everybody, but the person who can telephone
a member and ask them to finish their form is the one running their Hizb. The chasing happens
in the party panel, so the figures belong there.

### It adds no member to what a party can see

The scoping is untouched - the party id comes from the token and every read is filtered by
`member_profiles.party_id`. What is new is two facts about the members the party already sees,
and both are about the profile rather than from it. The completion figure is computed from
PRESENCE, and the presence columns are consumed in the route and left out of the response. A
test asserts that none of them appears anywhere in the payload, naming the two that would be
Tab 6 medical data if they did.

The existing exhaustive `toEqual` on the roster item did its job here: adding four keys broke
it, which forced them to be listed and explained rather than slipped in. That is the whole
value of an exhaustive assertion on the narrowest view in the application.

### One measure, three screens

The percentage comes from the same `memberCompletionQuery` the Members list and the dashboard
use. The CELLS are now shared too: moved into `components/member/ProfileCompletion.tsx` and
used by both pages. Copying them would have been the smaller diff and the worse answer - the
thresholds and the wording would drift, and an operator comparing two screens about one member
would be comparing two different claims.

### Last saved, not last updated by the member

`member_profiles.updated_at` already moves on any successful save, including one that changed
only a repeating section such as Skills - `saveMemberProfile` touches it deliberately for that
case, which I checked before assuming it. It also moves when an administrator corrects the
profile under FR-047a.

So the column is NOT attributed to the member, and the note says plainly that it is "by the
member or by an administrator correcting it". The alternative was to cross-reference
`member_profile_edits` on every row to work out who saved last - a lot of machinery to avoid
one honest sentence.

Each cell shows how long ago as well as the date: "6 months ago" answers "who has gone quiet",
while "12/May/26" is what gets quoted back in a conversation. Only a gap of six months or more
is coloured, because a profile untouched for a week is normal and colouring it would turn the
column into noise.

### The SQL comment rule held

The new query carries no `--` comment. The explanation sits in TypeScript above it, including
why `mp` is INNER JOINed here when `memberCompletionQuery` describes it as LEFT JOINed: the
party association IS `member_profiles.party_id`, so a member with no profile row has no party
and cannot appear in a party roster at all. There is no 0%-with-no-profile case to preserve.

## Outcome

- Impact: the party roster gains two columns. The Members list now draws its completion cell
  from the shared component instead of its own copy. No scoping or privacy change.
- Tests: 409 frontend across 23 files (21 new). Backend cases written; not executable here.
- Files: 2 new, 9 modified, dist rebuilt.
- Next prompts: redeploy - the two columns read from the new response fields, and without it
  the Profile column shows 0% for everyone (the cell clamps a missing figure rather than
  printing NaN, which is a test of its own).
- Reflection: the instinct was to copy the completion cell into the party page, which would
  have passed review and left two definitions of the same number on two screens. Extracting
  it cost one file.

## Evaluation notes (flywheel)

- Failure modes observed: one, and it was the test rather than the code. `daysSince` compares
  LOCAL calendar days on purpose, because "yesterday" means yesterday where the reader is; the
  first draft asserted against `2026-11-25T23:30:00Z`, which is late on the 25th in London and
  already the 26th here, so it failed correctly. The fixtures are now built in local time and
  the file says why. Separately, a two-heredoc shell command for the new test files failed to
  parse and was redone with the file-writing tool - the same lesson as PHR 0048.
- Graders run and results (PASS/FAIL): frontend vitest PASS (409/409); frontend `tsc -b` PASS;
  backend `tsc` PASS; backend build PASS; SQL comment and tokenising rules via tsx PASS
  (183 literals, 93 queries); backend vitest NOT RUN (no local database).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): let the party roster sort by Profile or by Last
  saved. Both would need a SQL expression rather than the per-row computation used here,
  because paging must happen in the order the sort claims - the same open item as the Members
  list.
