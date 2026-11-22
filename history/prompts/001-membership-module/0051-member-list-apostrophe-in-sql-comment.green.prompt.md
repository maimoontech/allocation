---
id: 0051
title: Member list broken by an apostrophe in an SQL comment
stage: green
date: 2026-11-22
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: (direct request)
labels: ["bug", "mysql2", "named-placeholders", "members-list", "diagnosability", "FR-066"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/routes/memberAdminRoutes.ts
 - backend/src/__tests__/sqlNamedPlaceholders.test.ts (new)
 - backend/package.json
 - backend/dist (rebuilt)
 - CHANGELOG.md
tests:
 - backend: tsc clean, npm run build clean
 - backend: the new test file NOT executed - globalSetup refuses a non-local DB_HOST. Its
   logic was run through tsx instead, against the real tokeniser and the real source tree:
   39 files, 93 queries with named placeholders, none broken
 - backend: the guard was verified AGAINST THE BUG - re-inserting the one apostrophe leaves
   :limit and :offset unconverted, which is exactly what shipped
---

## Prompt

Could not load member accounts. in members

## Response snapshot

### The fault

A single apostrophe, in an SQL comment I wrote in the previous change.

The pool runs with `namedPlaceholders: true`, so mysql2 rewrites every `:name` into `?`
before sending. The tokeniser that does it understands quoted strings but does not know that
`--` starts a comment. The apostrophe in "the other's reason for existing" read as the
opening of a string literal, swallowed the rest of the statement, and left `:limit` and
`:offset` in the query as literal text. MySQL rejected the statement, the route answered 500,
and the page said what it says when the list will not load.

### How it was found

By ruling things out in the order of what the symptom could mean, rather than by reading the
new code hoping to spot it.

1. The banner is the list query failing, so the request is reaching the server and being
   refused - not a render fault, not a stale frontend.
2. Every column the new fragment names was checked against the schema source: 57 referenced,
   all present. So not a missing column.
3. The exact query string was reconstructed from the route source with the fragment
   interpolated, then run through `named-placeholders` - the actual package mysql2 uses. It
   reported **0 placeholders found** and `:limit, :offset` left behind. That is the whole
   bug, and it took one run to see once the question was "what does mysql2 send?" rather than
   "is this SQL valid?".

The reconstruct-and-tokenise step is the one worth keeping. Valid SQL and valid-after-mysql2
are different questions, and only the second one matters.

### The guard

`sqlNamedPlaceholders.test.ts` walks every `.ts` under `src`, extracts the template literals
that look like a query carrying named placeholders, and runs each through the same tokeniser,
asserting no `:name` survives. It also states the rule plainly - no apostrophe inside an SQL
comment - so a failure names the cause and not the symptom.

Scanned: 39 files, 93 queries. None broken. And the guard was checked against the bug itself:
re-inserting that apostrophe leaves `:limit` and `:offset` unconverted. A guard that has not
been shown to catch the thing it was written for is a guess.

`named-placeholders` moved into devDependencies. It comes in under mysql2 either way, but a
test relying on that would break the day mysql2 changed how it rewrites placeholders, and the
point is to use the exact code that does the rewriting.

### Why it needed diagnosing instead of reading a log

The list route caught the error and answered "Failed to list members", discarding it. The
only evidence anywhere was a message that said no more than the browser already showed. It
now hands the error to the terminal boundary, which writes the one line this application
permits itself - reference, method, path, driver error code, error class, never the message
and never `err.sql` (FR-066) - and returns that reference to the caller.

### One thing the failure confirms

The backend IS running the current build. That answers the open question from two days ago:
the Student occupation type and the Occupation help topic are live.

## Outcome

- Impact: the member list loads again. A whole class of query bug is now caught at test time
  rather than at a member-facing 500.
- Tests: new scan file written; executed through tsx (the suite needs a local database),
  including a check that it catches the original bug.
- Files: 1 new, 3 modified, dist rebuilt.
- Next prompts: redeploy. Other routes in this file still swallow their errors the old way;
  worth converting them, but that is a separate change from fixing the one that broke.
- Reflection: the apostrophe was in a comment I added to explain a subtlety - the comment was
  correct and useful, and it broke the query. There is no amount of care in writing SQL
  comments that makes this safe; only a check that runs the real tokeniser does.

## Evaluation notes (flywheel)

- Failure modes observed: the bug itself was mine, shipped the same day. Two smaller ones
  while fixing it: the scratchpad script could not resolve `named-placeholders` because
  module resolution follows the script's own directory, not the project's (fixed with an
  absolute path), and the first draft of the test imported the package statically, which
  would have been a declared-dependency problem and an ESM/CJS interop risk in a file the
  local suite cannot run - changed to a dynamic import plus a devDependency entry.
- Graders run and results (PASS/FAIL): backend `tsc` PASS; backend build PASS; query scan via
  tsx PASS (93 queries, 0 broken); guard-catches-the-bug check PASS; backend vitest NOT RUN
  (no local database).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): have the scan also assert that no route catch
  block discards its error - the same report would then have arrived with a reference already
  in it.
