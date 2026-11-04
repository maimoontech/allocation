---
id: 0018
title: Login Diagnosis And Deploy Blocker
stage: green
date: 2026-10-30
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["diagnosis", "release-blocker", "committed-dist", "doc-drift", "correction"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/dist/ (rebuilt - 14 tracked files changed, 6 new)
  - specs/001-membership-module/quickstart.md
  - specs/001-membership-module/plan.md
  - specs/001-membership-module/tasks.md
  - specs/001-membership-module/checklists/requirements.md
  - CHANGELOG.md
  - PROJECT_AS_IS.md
  - history/prompts/001-membership-module/0018-login-diagnosis-and-deploy-blocker.green.prompt.md
tests:
  - 545 passing - 391 backend across 17 files, 154 frontend across 9
  - member login success path walked end to end with a throwaway account, then cleaned up
  - built artifact verified by running node dist/server.js and checking a member route answers 401 not 404
  - refresh_tokens confirmed back at its 2343 baseline after the diagnostic account was removed
---

## Prompt

at login it showing Internal server error

...then: continue

## Response snapshot

### The report could not be reproduced, and the backend is correct on every path

Walked the whole thing rather than guessing. Created a throwaway member account, drove the
real flow, then deleted it and confirmed `refresh_tokens` was back to its 2343 baseline.

| Path | Result |
|---|---|
| Admin / member login, wrong password | 401 `Invalid credentials` |
| Member login, **correct** password | 200, token + refresh token |
| Forced change-password (the first screen a new member sees) | 200, fresh token pair |
| Profile / lookups / photo afterwards | 200 / 200 / 404 "No photo set" |
| Through the Vite proxy, as the browser does | same |
| Deployed Render backend `/health` | healthy, build `afe7463` |
| Frontend production build | clean |

Ruled out, each by test rather than by reasoning:

- **The throttle.** I suspected `evaluateMemberLoginThrottle` running outside the login route's try/catch, which would let an error escape to the terminal handler and produce exactly "Internal server error". Renamed `member_login_attempts` away to force it: the response was a clean 401. Both throttle functions already catch internally and fail open, with "a broken throttle must not become an outage" written on the catch. **My suspicion was wrong and the code was already right.**
- **No backend running.** With nothing on port 4000 the Vite proxy returns `502 Bad Gateway` with a plain-text body — a different symptom.
- The deployed backend, the frontend build, and my 401 refresh interceptor.

### The most likely cause was mine, and I should have said so in advance

"Internal server error" is produced in exactly two places in the whole backend:
`requireMember.ts:60` and the terminal handler in `server.ts:75`. The first fires when the
`member_accounts` read throws — which is precisely what happened during the **two minutes I had
the 20 membership tables dropped** for the T119 rollback rehearsal. `requireMember` runs on
`/members/me/profile` and `/members/lookups`, the first calls after a member signs in, which is
reasonably described as "at login".

I took a production copy's tables down without telling the user first. The rehearsal was
authorised; the silence about the window was not something I should have left to chance.

### Then "continue" turned up a genuine release blocker

Chasing the dist question I had been flagging loosely for three turns, and getting a sharper
answer than expected:

**`backend/dist` is a committed build artifact, and `npm start` runs `node dist/server.js`.**
The repository's own convention proves it — commit `afe7463` updated `src/config/env.ts` and
`dist/config/env.js` in the same commit. The tracked `dist` was last built on 17 September.

So a deploy from this branch, as it stood, would have shipped the September build and **the
entire membership module would have been absent from production**: the login page offering a
Member option while every `/api/v1/members` route returned 404, and `role: "member"` falling
through to the venue/coordinator query.

Rebuilt it, and verified the artifact rather than trusting the build's exit code — ran
`node dist/server.js` on its own with nothing else holding the port, and confirmed
`/api/v1/members/lookups` answers **401, not 404**. 401 means the route is mounted and the auth
middleware ran; 404 would mean stale. Party login still returns 401 on a wrong password from
the same artifact.

This is now **step 0** of quickstart §9, with the verification command, because it is the
difference between a release and a silent no-op. One thing I could not check: whether Render's
build command runs `npm run build`. If it does, the commit is belt-and-braces. The committed
`dist` implies it does not. Recorded as unverified rather than assumed either way.

### Documentation drift, found while fixing the above

§9 had three stale facts, all of which would have misled whoever ran the release:

- "sign off the **16** assumptions" — there are 18. Items 17 and 18 were added when Tab 8 was corrected from Miqaat to Places Visited, and the count was never updated here.
- "Apply `001` then `002`" — renamed in T118.
- No mention of the dist rebuild at all.

The 16-versus-18 error had spread to `plan.md`, `tasks.md` and
`checklists/requirements.md`. All four corrected. Swept for the same drift elsewhere and for
any remaining "Miqaat" misuse in the module: the surviving references are all legitimate — the
real `miqaats` scheduling table, `MiqaatsPage.tsx`, or the explanations of why the word was
dropped.

### A correction to my own earlier work

`PROJECT_AS_IS.md` item 9 claimed both `backend/dist/` and `frontend/dist/` were tracked
committed build output. **`frontend/dist` is gitignored** (`frontend/.gitignore:11`) and has no
tracked files, because Vercel builds it. That was an inspection-phase error of mine, and I
repeated it to the user this turn before checking. Corrected in place with the correction
marked, since the document is a factual record others will rely on.

## Outcome

- Impact: a release blocker that would have deployed the module as a no-op is removed and the runbook now catches it. Four documents corrected for an assumption count that had drifted since Tab 8 was renamed. One factual error in `PROJECT_AS_IS.md` fixed.
- Tests: 545 passing, unchanged — no `src` changed this turn. The built artifact additionally verified by running it.
- Files: `backend/dist` rebuilt (14 tracked files changed, 6 new); 7 documents modified.
- Next prompts: still the same six blocked tasks — T018 (lookup values), T110 (375px in a browser), T120/T121 (production release, needs authorisation), T122 (`/sp.constitution`), T123 (`/sp.adr`, needs consent). Worth adding: **confirm Render's build command**, which decides whether step 0 is a precaution or the whole release.
- Reflection: two useful lessons, both about evidence. First, I had a confident, well-reasoned hypothesis about the throttle escaping its try/catch — and it was wrong, which only a two-command experiment showed. Second, "the dist folders are stale" is a sentence I had written three times without ever asking *what runs in production*; the answer turned it from housekeeping into the most consequential finding of the phase. A vague flag repeated is not the same as a fact established.
- Also: the user's app had no backend of its own running. One is now running from source on port 4000, started by me, so it will not survive this session.
