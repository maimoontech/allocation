---
id: 0020
title: Traceable Server Errors
stage: green
date: 2026-10-30
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["diagnosability", "error-ref", "privacy", "logging-decision", "unreproduced-report"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/utils/errorRef.ts
  - backend/src/server.ts
  - backend/src/middleware/requireMember.ts
  - backend/src/__tests__/sensitiveOutput.test.ts
  - backend/dist/ (rebuilt)
  - API_DOCUMENTATION.md
  - CHANGELOG.md
  - history/prompts/001-membership-module/0020-traceable-server-errors.green.prompt.md
tests:
  - 580 passing - 417 backend across 18 files, 163 frontend across 10
  - 4 new backend tests covering the error line's content and the permitted stream writes
  - verified live by hiding member_accounts and confirming the ref in both the response and the log
  - backend tsc --noEmit clean; frontend tsc -b clean; lint unchanged at 68/4
---

## Prompt

Internal server error

## Response snapshot

Second report of this with no further detail, and I could not reproduce it again. So rather
than guess a third time, I fixed the thing that made it unguessable.

### What I verified first, and all of it passed

- Login: admin and member, wrong password and correct password
- The full member flow: forced change-password, profile, lookups, photo
- **All ten new lookup endpoints**, plus a complete write cycle — create, partial patch, duplicate → 409, delete, no leftovers
- The backend process, its log, and the Vite proxy path

The new admin screens are not the source. Neither is anything else I could reach.

### The actual defect was the error message

`"Internal server error"` appeared in exactly two places in the backend and carried **nothing**:
no reference, no route, no code. Two completely unrelated faults produced the identical string,
and the application logs nothing, so a user reporting it gave nobody anything to work with —
including me, twice.

Every 500 now carries a short reference, in the message and in `data.ref`:

```json
{ "success": false, "data": { "ref": "a5998dab" }, "message": "Internal server error (ref a5998dab)" }
```

and exactly one line goes to stderr:

```
[error a5998dab] GET /api/v1/members/me/profile code=ER_NO_SUCH_TABLE name=Error
```

Verified by forcing the real thing — renaming `member_accounts` away, which is precisely the
state that produced this error during the rollback rehearsal — and confirming the ref appeared
in both the response and the log. `ER_NO_SUCH_TABLE` on a named route is a complete diagnosis.
That is the answer I spent two turns guessing at.

### Reversing my own decision, deliberately

Last turn I pinned "the backend makes no `console.*` call at all" with a test, and the reason
was sound: `mysql2` interpolates named placeholders client-side, so a failed query carries the
values it was writing on its error object — health values included (FR-066). Anything logging
errors wholesale would void every guarantee about health data on exactly the request where
something went wrong.

That test existed so adding a log line would be a deliberate act with an explicit decision
about what it may say. This is that moment, and the decision is: **the reference, the method,
the path, the driver's error code, and the error's class name. Nothing else.** Never the
message, never `err.sql`, never a stack, never a request body.

A test now asserts that directly: it builds an error shaped like the dangerous case — `code`,
`sqlMessage`, and an `sql` property containing `blood_group` and `height_cm` values — and
checks the formatted line contains the route and the code but not `AB-`, not `171.3`, not
`INSERT`, not `member_profiles`, not the driver message, and is a single line so it cannot
smuggle a stack.

### A wrong assumption, caught by its own test

I asserted the codebase had exactly two stream writes, both in `server.ts`. It has **four** —
`env.ts` also writes a startup error, and `server.ts` had a startup-failure line I had not
accounted for. The test failed and I replaced my guess with the real set, asserted by file, so
adding a fifth fails and whoever adds it has to justify it. Writing the assertion from memory
instead of from a grep was the mistake; the test caught it immediately, which is the argument
for writing it that way.

Noted and not changed: that startup-failure line interpolates `String(error)`, which on a
connection failure can include the database host and user. Pre-existing, startup-only, and
outside this feature.

### One structural tidy

`requireMember` no longer answers its own 500. It hands the error to the terminal handler via
`next(err)`, so every 500 has one path and one format. Returning a bare string there was the
opaque dead end that could not be traced to a route.

## Outcome

- Impact: a 500 is now traceable to its route and cause in one line, without logging anything a member typed. The privacy property is unchanged in substance and now has a tighter test than before.
- Tests: 580 passing, 4 new. Both typechecks clean. Lint unchanged at the pre-existing 68/4. `backend/dist` rebuilt so the new util ships.
- Files: 1 created, 4 modified, dist rebuilt.
- Next prompts: **the user's error is still undiagnosed.** With this in place the next occurrence carries a reference, and the one log line explains it. That is the thing to ask for.
- Reflection: I was two turns into guessing at an error I could not reproduce. The useful move was to stop treating the report as the problem and notice that the *message* was the problem — a string that made two different faults indistinguishable and told nobody anything. Also worth recording: I reversed a decision I had made one turn earlier and written a test to enforce. That was right, because the test was never meant to forbid logging forever; it was meant to make adding it a decision rather than a reflex.
