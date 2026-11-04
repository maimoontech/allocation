---
id: 0021
title: Cors Origin Caused The 500
stage: green
date: 2026-10-30
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["bugfix", "cors", "diagnosis", "error-ref", "testability", "pre-existing"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/middleware/httpBoundary.ts
  - backend/src/server.ts
  - backend/src/config/env.ts
  - backend/src/__tests__/httpBoundary.test.ts
  - backend/src/__tests__/sensitiveOutput.test.ts
  - backend/dist/ (rebuilt)
  - API_DOCUMENTATION.md
  - CHANGELOG.md
  - history/prompts/001-membership-module/0021-cors-origin-caused-the-500.green.prompt.md
tests:
  - 593 passing - 430 backend across 19 files, 163 frontend across 10
  - 13 new backend tests covering the CORS allow-list and the terminal error handler
  - reproduced the exact fault, fixed it, and confirmed all four origin cases live
  - backend tsc --noEmit clean; frontend tsc -b clean; lint unchanged at 68/4
---

## Prompt

Internal server error (ref 28200e52)

## Response snapshot

### The reference worked

One grep:

```
[error 28200e52] POST /api/v1/auth/login code=none name=Error
```

Three facts in one line. The route was `POST /api/v1/auth/login` — so it *was* at login, as
the user said from the first report. `code=none` ruled out the database. And reaching the
terminal handler at all meant the error had escaped the login route's own try/catch, so it was
thrown before routing.

That left the middleware, and `cors` was the only candidate that throws a plain `Error`:

```ts
return callback(new Error("CORS_NOT_ALLOWED"));
```

`name=Error`, no `code`. An exact match.

### Why two turns of testing missed it

**curl sends no `Origin` header.** The CORS callback short-circuits on `!origin`, so every
check I ran — direct, through the Vite proxy, every role, every endpoint — never executed the
rejection path. The endpoint was genuinely healthy from the command line and genuinely broken
in a browser.

And the reason it looked like an auth bug: **a browser sends `Origin` on a POST even when it is
same-origin, but not on a same-origin GET.** So pages loaded normally and only signing in
failed. "At login it showing Internal server error" was a precise description of the symptom;
I kept looking inside the login code because that is where the symptom pointed.

Reproduced immediately once I knew: `Origin: http://127.0.0.1:5173` produced a log line
identical in shape to the user's, while `http://localhost:5173` returned a clean 401. The
allow-list had `localhost` and not `127.0.0.1` — **different origins to a browser**, and Vite
serves both.

### Two bugs, not one

1. **A rejected origin answered 500.** Wrong twice over: nothing had failed on the server, and "Internal server error" gave nobody a way to fix it. It now returns **403**, naming the origin and the variable to add it to, with no error reference and no log line — there is no fault to trace.
2. **`127.0.0.1:5173` was not allow-listed.** Added. Allowing one spelling of localhost and not the other breaks whichever address the developer happens to type, with a symptom that points somewhere else entirely.

Both are pre-existing — the CORS config long predates this feature — but this is what the user
was hitting, so fixing it was the work.

### The handlers had no tests, and could not have had any

`server.ts` calls `startServer()` at module scope, which runs `ensureSchema()` and binds a
port, so it cannot be imported from a test. The CORS allow-list and the terminal error handler
were therefore **the only middleware in the application with no coverage** — and they turned
out to be where the bug was. Extracted to `middleware/httpBoundary.ts`, so `server.ts` and the
tests exercise the same code rather than a copy of it. 13 tests now cover: no-Origin allowed,
every configured origin allowed, both spellings of localhost, an unknown origin refused with
403 and the right message, a refused origin producing no reference and no log line, a port-only
difference refused, a real 500 carrying a reference whose log line leaks nothing, two failures
getting two references, and a duplicate key still mapping to 409.

### The source-walking test earned its keep again

Moving the error line out of `server.ts` broke the test asserting exactly where the application
writes to a stream — correctly, which is the whole point of writing it that way. Second time in
two turns: once when my remembered list of stream writes was wrong, once when a write moved.
Updated to the real set, with `httpBoundary.ts` noted as the only one of the four that runs
while serving requests, and therefore the only one that could ever see member data.

## Outcome

- Impact: the reported error is diagnosed and fixed. A disallowed origin is now a 403 that says what to change; both spellings of localhost work in development; and the two handlers at the HTTP boundary have tests for the first time.
- Tests: 593 passing, 13 new. Both typechecks clean. Lint unchanged at the pre-existing 68/4. `backend/dist` rebuilt.
- Files: 2 created, 4 modified, dist rebuilt.
- Verified live: `localhost:5173` → 401, `127.0.0.1:5173` → 401 (was 500), an unknown origin → 403, no Origin → 401.
- Reflection: the error reference turned a fault I had failed to reproduce twice into a one-grep diagnosis, which is the strongest argument for having built it. The deeper lesson is about the shape of my own testing: I had verified the endpoint exhaustively **with curl**, and concluded it was healthy. Every one of those checks skipped the failing branch, because the absence of an `Origin` header is itself a code path. "I tested it thoroughly" was true and useless — the tool I tested with could not reach the bug.
- Still open: unchanged — T018's values, T110 at 375px, T120/T121 release authorisation, T122/T123, and confirming Render's build command. Worth adding: production's allow-list is the default unless `CORS_ALLOWED_ORIGINS` is set in Render, so the real site's origin should be confirmed there before release.
