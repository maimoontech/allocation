---
id: 0028
title: Loud EADDRINUSE And Build Stamp
stage: green
date: 2026-11-02
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["dev-environment", "server", "startup", "observability", "windows"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/server.ts
 - backend/src/__tests__/sensitiveOutput.test.ts
 - backend/dist/server.js
tests:
 - backend full suite (459 passed)
 - EADDRINUSE harness on spare port 4099 (exit 1, correct message, no false success line)
 - happy-path start on spare port 4097 (announces listening with build timestamp)
---

## Prompt

yes

(Consenting to both offers from PHR 0027: make the server fail loudly on EADDRINUSE instead
of silently, and adopt `npm run dev` for local work.)

## Response snapshot

Two real defects were found and fixed, the second only because the first was being verified
rather than assumed.

**1. EADDRINUSE was never handled.** `app.listen()` had no `error` listener. The event arrives
asynchronously AFTER `app.listen()` returns and after `startServer()` has already resolved, so
the existing `startServer().catch(...)` could never see it. Added a `server.on("error", ...)`
that, for EADDRINUSE, prints which port is taken, states plainly that THIS SERVER IS NOT
RUNNING, gives the two PowerShell commands to find and stop the owning process, and exits 1.

**2. The success line printed even when the bind failed.** Verifying fix 1 showed stdout
carrying `API listening on http://localhost:4099` from a process that had just failed with
EADDRINUSE. Reproduced in isolation: on Windows the 'listening' callback fires BEFORE the
'error' event, with `server.address()` still `null`. This is the precise mechanism that made
three failed restarts look successful. The callback now returns early when `address()` is
null and lets the error handler speak.

**3. Build timestamp at startup.** The success line now carries the mtime of the running file.
`npm start` runs the compiled `dist/`, so a timestamp older than your last `npm run build` is
visible proof the process is serving stale code.

**4. Pre-existing escape bug fixed.** Both existing `process.*.write` calls in `server.ts`
contained `\n` (two characters: backslash, n) rather than a newline, so startup lines printed
a literal `\n`. Corrected while editing those exact lines.

`sensitiveOutput.test.ts` caught the two new writes, exactly as designed — it asserts the
permitted write sites per file so that each addition must be justified. Updated to 4 for
`server.ts` with the justification recorded: all four are startup-only and unreachable once
serving, the EADDRINUSE line interpolates no error object at all (port number only), and the
two that do interpolate `String(error)` carry the same pre-existing, startup-only exposure
already noted there.

On `npm run dev`: no change needed. `specs/001-membership-module/quickstart.md:18` and
`database/local-dev/README.md:68` already prescribe `npm run dev:backend` (root script →
`tsx watch src/server.ts`). The new error message now points there too.

## Outcome

- ✅ Impact: A failed restart can no longer masquerade as a successful one. The specific failure that cost three restart attempts now produces an unmissable message and a non-zero exit.
- 🧪 Tests: Backend suite 459 passed, `tsc --noEmit` clean. Two throwaway harnesses on spare ports: with the port occupied the server exits 1, names the port, says it is not running, and prints NO success line; with the port free it announces listening with the build timestamp. Both harnesses used ports 4097/4099 so the user's running server was untouched.
- 📁 Files: 3 changed (server source, the write-site guard test, rebuilt dist).
- 🔁 Next prompts: The admin Members page still needs the user to stop PID 5288 — that remains blocked by the permission classifier, and the Zone/Party data cannot appear until it is stopped.
- 🧠 Reflection: Verifying the fix rather than trusting it is what exposed defect 2, which was the actual cause of the user's confusion all along — the loud error alone would have been printed beneath a line claiming success.

## Evaluation notes (flywheel)

- Failure modes observed: Windows fires 'listening' before 'error' on a failed bind, so any "server started" log written in that callback is unreliable without an `address()` check. Worth remembering for any other listener in this codebase.
- Graders run and results (PASS/FAIL): backend suite PASS (459), tsc PASS, EADDRINUSE harness PASS, happy-path harness PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Have `npm start` compare `dist/` mtime against `src/` and refuse to run when the build is older.
