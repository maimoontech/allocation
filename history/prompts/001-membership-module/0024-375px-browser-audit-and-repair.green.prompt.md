---
id: 0024
title: 375px Browser Audit and Repair
stage: green
date: 2026-10-31
surface: agent
model: opencode/big-pickle
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["responsive", "375px", "browser-audit", "photo-approval", "repair"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-membership-module/tasks.md
 - backend/src/server.ts
 - backend/src/routes/memberPhotoApprovalRoutes.ts
 - backend/src/__tests__/memberLookupAdmin.test.ts
 - frontend/src/router/AppRoutes.tsx
 - frontend/src/features/member/memberPhotoApprovalApi.ts
 - frontend/src/pages/modules/MemberPhotoApprovalPage.tsx
tests:
 - browser audit: 12/12 tabs at 375x812, no page scroll, no overflowing elements, 16px gutter, strip reachable
 - backend full suite: 20 files, 440 tests passed
 - frontend full suite: 10 files, 163 tests passed
 - backend tsc --noEmit: clean
 - frontend tsc -b: clean
 - backend build: clean (dist rebuilt)
 - frontend build: clean
 - frontend lint: 68 errors / 4 warnings (unchanged pre-existing baseline)
---

## Prompt

continue

(Followed by a clarifying choice; the selected answer was "T110: 375px responsiveness audit".)

## Response snapshot

T110 asked for every member tab to be checked at 375px in a real browser, with a 16px
gutter, no horizontal page scroll, and a reachable tab strip. A headless Chromium (Playwright
against the cached browser binary) was driven against the running local stack: a temporary
member account (`99999999`) was provisioned directly in the local database, signed in through
the UI, and all twelve tabs were visited at 375×812 with mobile emulation.

Measured result on every tab: `document.scrollWidth` was exactly 375, no element extended
past the viewport once descendants of the intentional tab-strip scroller were excluded, the
content container computed `padding-left: 16px`, and no console or page errors occurred. The
tab strip is reachable: `clientWidth 375` vs `scrollWidth 1415`, and scrolling it to the end
left the last tab fully visible (`right = 359.3`). Twelve full-page screenshots were written
to the temp audit folder as the visual record. The temporary member account, its refresh
tokens and its login attempts were deleted afterwards.

The browser run exposed that the working tree did not build at all. Four files were
corrupted, with template-literal interpolations stripped and imports spliced into the middle
of `server.ts`; the backend died with `Cannot access 'app' before initialization` and Vite
refused `MemberPhotoApprovalPage.tsx` with a parse error. All four were repaired: imports and
mounts consolidated in `server.ts`; approval endpoints restored to
`/member-photo-approvals/:photoId/approve|reject`; the page's image now fetched as an
authenticated blob (an `<img src>` cannot send a bearer token); `ETag` set from the stored
SHA-256; the stray `console.error` removed, which T112's no-console test would otherwise have
failed.

One pre-existing test also needed correcting:
`memberLookupAdmin.test.ts > reports the seeded draft counts` asserted that
`tamreen_methods` still had draft rows. The lists have since been curated through the Member
Lists UI — the intended workflow (T018) — so the test now inserts its own draft row and
asserts the index counts it, which is independent of live data.

## Outcome

- Impact: T110 is closed on evidence rather than inference, and the frontend/backend build is
  working again. Phase 9 now has four open items: T120, T121, T122, T123.
- Tests: backend 440/440 and frontend 163/163 green after the repairs; both typechecks clean;
  both production builds clean; lint unchanged at the pre-existing 68 errors / 4 warnings.
- Files: 3 corrupted files repaired, 1 test made data-independent, 1 task record updated.
- Next prompts: T120/T121 (release and pilot roster) need live access and your approval. T122
  and T123 are the constitution and ADR commands. The photo-approval endpoints still have no
  automated tests; adding a contract test is the smallest useful follow-up.
- Reflection: the layout was already correct; the real value of the browser check was that it
  uncovered a broken build that no green typecheck claim in the task log could see, because
  the broken files were newer than the last recorded run.

## Evaluation notes (flywheel)

- Failure modes observed: four source files corrupted by earlier unrecorded editing
  (stripped `${...}` interpolations, duplicated/misplaced imports); a data-dependent test that
  silently rotted when lookup lists were curated; a test/checksum claim in tasks.md that was
  stale relative to the working tree.
- Graders run and results (PASS/FAIL): PASS — browser audit 12/12, backend 440/440, frontend
  163/163, tsc backend PASS, tsc frontend PASS, build backend PASS, build frontend PASS, lint
  baseline unchanged.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add `memberPhotoApproval.test.ts` covering admin
  and zonal-head approval, cross-zone 403, and the pending-only list.
