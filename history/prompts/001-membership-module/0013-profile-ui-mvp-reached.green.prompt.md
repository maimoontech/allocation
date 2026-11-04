---
id: 0013
title: Profile UI MVP Reached
stage: green
date: 2026-10-30
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["phase-6", "ui-primitives", "unsaved-edits", "dependent-dropdown", "mvp"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/components/ui/Tabs.tsx
  - frontend/src/components/ui/Textarea.tsx
  - frontend/src/components/ui/RadioGroup.tsx
  - frontend/src/components/ui/YesNoField.tsx
  - frontend/src/components/ui/DatePicker.tsx
  - frontend/src/components/ui/ImageUpload.tsx
  - frontend/src/utils/dates.ts
  - frontend/src/features/member/memberApi.ts
  - frontend/src/features/member/memberProfileSlice.ts
  - frontend/src/pages/member/MemberProfilePage.tsx
  - frontend/src/pages/member/tabs/Tab01Personal.tsx
  - frontend/src/pages/member/tabs/Tab03Hizb.tsx
  - frontend/src/features/api/api.ts
  - frontend/src/store.ts
  - frontend/src/test-utils.tsx
  - frontend/vitest.config.ts
  - frontend/src/router/AppRoutes.tsx
  - specs/001-membership-module/tasks.md
  - history/prompts/001-membership-module/0013-profile-ui-mvp-reached.green.prompt.md
tests:
  - 470 passing - 348 backend across 14 files, 122 frontend across 6
  - 42 new frontend tests this pass
  - backend tsc --noEmit clean; frontend tsc -b clean
  - lint back to the pre-existing 68 errors / 4 warnings after fixing 4 I had introduced
  - Vite dev server starts and the profile module compiles with no build error
---

## Prompt

Next

(Phase 6's UI pass, tasks T072 to T082, following the API pass in record 0012.)

## Response snapshot

Phase 6 complete. **T072 to T082 closed; 84 of 124 tasks done.** This is the MVP boundary: a
member signs in, is forced to set a password, and records their core identity.

### How the unsaved-edit guarantee actually works

The design decision worth recording. Only the active tab panel is rendered, so the inputs for
the other eleven tabs do not exist in the DOM. Values therefore cannot live in the inputs —
they live in `memberProfileSlice`, and a tab is a view onto that draft. Switching tabs changes
which fields are shown and nothing else (FR-026).

That has three further consequences, all deliberate:

- The draft holds **only what changed**, so a save sends just those fields and cannot overwrite something the member never touched. A test asserts the exact request body.
- It is mirrored to **sessionStorage**, so a lapsed session does not cost the member their work (FR-032). sessionStorage rather than localStorage, because a draft profile holds personal data and should not outlive the browser tab on a shared machine.
- Correcting a field clears its error by prefix, so `titles[0].title_year` clears when `titles` changes and stale messages do not linger.

The test that matters most is literally "type into Tab 1, go to Tab 3, come back" — and it
asserts that Tab 1's input is genuinely *gone* while on Tab 3, not merely hidden, so the test
would fail if the implementation quietly kept everything mounted.

### Two primitives where the obvious choice was wrong

**Yes/No is radios, not a checkbox.** The server stores these as nullable booleans, so
"not answered" is a third state and it matters. A checkbox can express two of the three and
would render every unanswered question as No — which for "do you attend the Karachi Tamreen
session?" would then demand a reason the member never meant to give (FR-081).

**The photo is downscaled on the client.** A modern phone camera produces 4 to 8 MB files and
the server caps at 2 MB. Without a canvas downscale, most real uploads would be refused and
the member told to resize the image themselves, which is not a realistic instruction. It
scales the longest edge to 1024px and steps the JPEG quality down until it fits.

### The photo preview needed a blob fetch

An `<img src>` sends no Authorization header, and the photo endpoint requires a bearer token
(FR-090) — so a plain src would 401. The preview is fetched with the token, turned into an
object URL, and revoked on cleanup. Keyed by a version counter so replacing the photo
refetches rather than showing the previous blob.

### Three test-harness problems, each with a real cause

1. **Every page test failed with "Could not load your profile".** Not the component: `apiBaseUrl` is the relative `/api/v1`, and Node's `Request` cannot parse a relative URL, so the request failed before any fetch stub was consulted. Fixed with an absolute base URL in the vitest env only.
2. **The save test saw no request body.** `fetchBaseQuery` calls `fetch` with a single `Request` object, not `(url, init)`, so reading `init.method` treated the PUT as a GET. The stub now handles both shapes.
3. **A hand-rolled response object left queries stuck loading.** `fetchBaseQuery` does more with a response than call `text()`. Replaced with a real `Response`, which jsdom provides anyway.

Along the way I added `fetchFn: (...args) => globalThis.fetch(...args)` to the shared api
config. Without the indirection `fetchBaseQuery` captures whatever `fetch` was at import
time, so anything replacing it later is ignored. Browser behaviour is identical.

### Four lint errors I introduced, and fixed

The project baseline is 68 errors and 4 warnings, all pre-existing. My first pass took it to
72. All four were mine and all four were worth fixing rather than tolerating:

- `todayIso` exported from the DatePicker module defeats React Fast Refresh, which can then only reload by remounting the tree — losing form state as you edit. Moved to `utils/dates.ts`.
- A synchronous `setState` in the photo effect's body caused a second render pass on every change. Replaced by storing the URL *with* its version and deriving, so a stale value simply does not match.
- Two trivial unused-assignment errors in the slice test.

Back to 68/4, with every new file clean.

## Outcome

- Impact: the MVP boundary is reached. A member can sign in, set their password, and complete Tab 1 and Tab 3 with a photograph, a derived Hijri date of birth and a dependent Zone/Party dropdown. 84 of 124 tasks complete.
- Tests: 470 passing, 42 new. Both typechecks clean. Lint at the pre-existing baseline. The Vite dev server starts and the profile module compiles.
- Files: 14 created, 7 modified.
- Next prompts: Phase 7 (T083-T095, the six single-entry tabs) then Phase 8 (T096-T109, the four repeatable tabs). The server already validates and persists every one of those tabs, so both phases are UI work against an API that is done and tested.
- Reflection: all three test-harness failures looked like component bugs and none were. "Could not load your profile" in particular pointed squarely at the page, when the cause was a relative URL that Node cannot parse — two layers away. The habit that resolved it was refusing to keep guessing after the second attempt and instead throwing the query's actual error state out of a scratch test. One minute of instrumentation beat three rounds of plausible fixes.

## Evaluation notes (flywheel)

- Failure modes observed: three harness faults, each initially presenting as a component defect — a relative base URL unparseable by Node's `Request`; `fetchBaseQuery` passing a single `Request` rather than `(url, init)`, so a stubbed method check silently took the GET path; and a partial response stub leaving queries in a permanent loading state. Separately, four self-introduced lint errors that pushed the project total above its baseline, all fixed: a non-component export breaking Fast Refresh, a synchronous setState in an effect body, and two unused assignments.
- Graders run and results (PASS/FAIL): PASS — 470 tests green; both typechecks clean; lint restored to the pre-existing 68/4 with every new file clean; Vite dev server starts and `MemberProfilePage.tsx` compiles; the FR-026 test asserts Tab 1's input is absent while on Tab 3 and its value restored on return; the save test asserts the exact request body carries only the changed field plus `if_unmodified_since`.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): when a UI test fails in a way that implicates the component, print the data-layer error state before touching the component. Twice now the message named the wrong layer.
