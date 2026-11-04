---
id: 0016
title: Polish Docs And Reauth
stage: green
date: 2026-10-30
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["phase-9", "refresh-interceptor", "logging-audit", "length-validation", "docs", "release-gate"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/features/api/api.ts
  - frontend/src/features/auth/authSlice.ts
  - frontend/src/features/api/reauth.test.tsx
  - backend/src/services/memberProfileService.ts
  - backend/src/__tests__/sensitiveOutput.test.ts
  - database/membership_schema.sql
  - database/membership_seed.sql
  - database/membership_rollback.sql
  - API_DOCUMENTATION.md
  - DATABASE.md
  - PROJECT_CONTEXT.md
  - BUSINESS_RULES.md
  - CHANGELOG.md
  - specs/001-membership-module/quickstart.md
  - specs/001-membership-module/research.md
  - specs/001-membership-module/plan.md
  - database/local-dev/README.md
  - database/local-dev/local_dev_setup.sql
  - database/local-dev/before-state-baseline.md
  - specs/001-membership-module/tasks.md
  - history/prompts/001-membership-module/0016-polish-docs-and-reauth.green.prompt.md
tests:
  - 545 passing - 391 backend across 17 files, 154 frontend across 9
  - 22 new this pass - 15 backend sensitive-output tests, 7 frontend refresh-interceptor tests
  - backend tsc --noEmit clean; frontend tsc -b clean
  - lint unchanged at the pre-existing 68 errors / 4 warnings
---

## Prompt

next

(Phase 9, tasks T110 to T124 — polish and release, following Phase 8 in record 0015.)

## Response snapshot

**T111 to T118 closed; 115 of 124 tasks done.** The nine that remain all need a decision or an
authorisation rather than work: see the end of this record.

### The refresh interceptor, and the hole it closes (T113)

`POST /auth/refresh` existed on the server from before this feature and **no client had ever
called it**. With a one-day access token, the session long enough to cross that boundary is
exactly the one this module creates: a member filling in twelve tabs. The failure mode was the
worst kind — the save returns 401 and the member's work is stranded behind a login screen.
(The draft is mirrored to sessionStorage so it is recoverable, but the member has no way to
know that.)

Four details that are the whole substance of it:

- **One refresh for many 401s.** The profile page issues several requests at once, so an expired token produces several 401s within milliseconds. Each would otherwise start its own refresh; the first would succeed and the rest would present an already-rotated token. They share a module-level in-flight promise.
- **`/auth/login` is excluded.** A 401 there is a wrong password — an answer, not an expired session. Retrying it would turn one failed sign-in into two and could clear a session the member still had.
- **A failed refresh clears the session.** This is the right outcome, not a fallback: a member whose own password change revoked their refresh token (FR-022) *should* be signed out. Silently re-granting would defeat the point of invalidating it.
- **403 is not retried.** The forced-password-change refusal is a 403 and must reach the page, which redirects to the change screen.

### The backend makes no log calls at all, which turns out to matter a lot (T112)

Auditing for sensitive output found something stronger than expected: there is not one
`console.*` call anywhere in `backend/src` outside the tests. Both the route handlers and the
terminal error handler in `server.ts` return fixed strings.

Why that is load-bearing rather than merely tidy: **`mysql2` interpolates named placeholders
client-side**, so a failed query produces an error whose `sql` property contains the values
being written — health values included. Were such an error logged or returned, every guarantee
about health data would be void on exactly the request where something went wrong.

So the property is now pinned by a test that walks `src/` and fails on any new `console.*`
call. If logging is ever wanted, that test fails and whoever adds it has to decide explicitly
what a log line may say. The trade-off is stated in quickstart.md: a production failure
currently leaves no diagnostic trail.

### A gap the audit turned up: no length validation anywhere

Checking what a database error would leak meant finding a way to cause one, and that exposed
the real problem — **no text column had any length validation at all**. An over-long value
reached MySQL, came back as ER_DATA_TOO_LONG, was caught by the route and returned as
`"Failed to save profile"`, a 500 naming no field. The member saw the whole twelve-tab save
fail with nothing to correct.

Added bounds for all 22 text columns and both decimals. The widths were read from
`information_schema` on the real schema rather than from the migration file, so the two cannot
drift apart silently — the same habit that caught the collation bug in Phase 2.

Two details worth recording: the limit is measured on the **trimmed** value, because trailing
whitespace is stripped before storage and should not count against a value that fits; and
`height_cm`/`weight_kg` are `DECIMAL(5,2)`, so the upper bound is 999.99 and the message says
so rather than only "must be positive".

### T111 was mostly verification, and the gap was the error path

Every item in the quickstart §7 checklist already had a test: isolation and the ignored ITS
number, cross-role refusals in both directions, unauthenticated and magic-byte and oversize
photo rejection, deactivated-account indistinguishability, the export rules. §7 is now
annotated with the test behind each line, so it reads as a way to confirm a deployed instance
matches the suite rather than as the only place those properties are checked.

What had no coverage was the **error** path, which is where leaks actually happen. That is what
`sensitiveOutput.test.ts` is for: no echoed input, no SQL, no stack, no driver detail, no
password on a failed *or* successful sign-in, and the same refusal shape for an unknown ITS
number as for a wrong password.

### T110 is marked partial, deliberately

The structural audit is clean on every point: every member grid is `grid gap-3 sm:grid-cols-N`
so 375px gets one column; no fixed widths, no `min-w-`, no tables; the tab strip is
`-mx-4 … overflow-x-auto px-4`, so the strip scrolls and the page does not; `AppShell` gives
the content `p-4` and — the class that actually matters — `min-w-0 flex-1`, which is what stops
a flex child forcing the page wider than the viewport.

But the task says *verify at 375px*, and no browser tool was available in this session. jsdom
does no layout, so no test can assert it either. Left unticked with the audit recorded, so the
outstanding work is only the visual confirmation.

### Documentation, and one thing I did not touch

`API_DOCUMENTATION.md`, `DATABASE.md`, `PROJECT_CONTEXT.md`, `BUSINESS_RULES.md` and
`CHANGELOG.md` updated — each at the register it already used, rather than importing the spec's
level of detail. The changelog entry states plainly that the project previously had no test
runner and no tests, because that is the context for why a regression net was written before
the member branch was added.

The three migration scripts moved to `database/membership_schema.sql`, `membership_seed.sql`
and `membership_rollback.sql`, with references updated across nine files. **The PHRs were left
alone**: they record what was true when written, and rewriting paths in them would make the
history disagree with itself.

## Outcome

- Impact: the refresh hole is closed, the sensitive-output guarantees are pinned by tests rather than resting on care, an over-long value is now a named field error instead of a generic 500, and the five project documents plus the migration locations match what was built. 115 of 124 tasks complete.
- Tests: 545 passing, 22 new. Both typechecks clean. Lint unchanged at the pre-existing 68/4.
- Files: 2 created, 19 modified; 3 moved.
- Next prompts: nothing further can be closed without the user. T119 would drop 20 tables on the local copy and needs a go-ahead; T120 and T121 are the production release and explicitly require authorisation; T122 (`/sp.constitution`) and T123 (`/sp.adr`) are theirs to run, and CLAUDE.md forbids creating an ADR without consent; T124 is a retention decision, not an implementation task.
- Reflection: the length-validation gap was found by asking "how would I even cause a database error here?" while testing something else entirely. That question is a better auditing tool than reading the validation code, which looked complete — it lists every column and checks a rule for each, and the rule it was missing was the one no column declared.
- Still open: the 18 spec assumptions; the five empty lookups, without which Tabs 2, 7, 8, 9 and 10 cannot be completed; whether health values and photo blobs in the admin database backup are authorised under FR-101, and that endpoint building its whole dump as one in-memory string; and that the committed `backend/dist` and `frontend/dist` are stale and need rebuilding at deploy time.
