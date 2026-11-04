---
id: 0004
title: Harness And Shared Utilities
stage: green
date: 2026-10-29
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: /sp.implement
labels: ["membership-module", "test-harness", "hijri-conversion", "image-validation", "golden-master", "partial-implementation"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/package.json
  - backend/package-lock.json
  - backend/tsconfig.json
  - backend/vitest.config.mts
  - backend/src/utils/hijriDate.ts
  - backend/src/utils/imageValidation.ts
  - backend/src/__tests__/fixtures/hijriVectors.ts
  - backend/src/__tests__/hijriDate.test.ts
  - backend/src/__tests__/imageValidation.test.ts
  - frontend/package.json
  - frontend/package-lock.json
  - frontend/tsconfig.node.json
  - frontend/vitest.config.ts
  - frontend/src/test-setup.ts
  - frontend/src/utils/hijriDate.ts
  - frontend/src/utils/hijriDate.test.ts
  - package.json
  - specs/001-membership-module/tasks.md
  - history/prompts/001-membership-module/0004-harness-and-shared-utilities.green.prompt.md
tests:
  - backend - 100 passing across 2 files (hijriDate.test.ts, imageValidation.test.ts)
  - frontend - 65 passing across 1 file (hijriDate.test.ts)
  - 165 total, all green; the repository had zero tests before this run
  - backend tsc --noEmit clean; frontend tsc -b clean; the 4 new/changed frontend files lint clean
---

## Prompt

`/sp.implement` was invoked with no arguments.

The command's outline specified: run `check-prerequisites.ps1 -Json -RequireTasks
-IncludeTasks`, scan `FEATURE_DIR/checklists/` and stop for confirmation if any checklist is
incomplete, load the design documents, verify ignore files, parse `tasks.md`, then execute
phase by phase, marking each completed task `[X]`.

## Response snapshot

**Stopped before implementing and asked for authorization**, then implemented only the scope
the user granted.

### Why the stop

The command's own checklist gate **passed** — `requirements.md` is 16/16 complete. But two
other things did not:

1. **The user's own approval gate was unsatisfied.** The feature brief says three times to wait for approval before modifying application code or applying database changes. Running `/sp.implement` is an affirmative step but is not the sign-off the brief specifies, and four items were still open: the 16 assumptions, the four lookup lists, the plaintext-password decision, and retention.
2. **Stage 2 was hard-blocked on infrastructure regardless of approval.** Verified: `backend/.env` absent, `DB_HOST`/`DB_NAME`/`DB_USER` all unset, `mysql` CLI not on PATH, and `node_modules` not installed in either project. So the before-state capture, the migration and the regression suite could not be *run* — and the regression suite's entire value is running it against unmodified code.

The user chose **"Harness + utilities only"** and **"You set up the database, then I continue"**.

### What was implemented — 10 tasks

**Phase 1 (T001–T005)** — the test harness, which the repository completely lacked:

- Vitest + supertest in the backend; Vitest + React Testing Library + jsdom in the frontend
- `backend/vitest.config.mts` — `.mts`, not `.ts`, because the backend package is `type: commonjs` and a `.ts` config using ESM syntax raises a Vite deprecation warning
- `frontend/vitest.config.ts` — **merged with the app's own `vite.config.ts`** via `mergeConfig`, so tests inherit the react plugin and the `__APP_VERSION__` / `__APP_BUILD__` defines. Redeclaring the config would have left those globals undefined and broken any component reading them
- `"exclude": ["src/__tests__"]` added to `backend/tsconfig.json` — **not in the task text, but required**: without it `npm run build` compiles the test files into the committed `dist/` and ships supertest into production. Verified with `tsc --listFiles`: 0 test files in the build graph
- `test` / `test:watch` scripts in all three `package.json` files

**Phase 2 (T009–T013)** — the shared utilities:

- `calculateHijriParts` added to `frontend/src/utils/hijriDate.ts`, with `calculateHijriDate` now delegating to it. Signature and output unchanged
- `backend/src/utils/hijriDate.ts` — the port, plus `currentHijriYear()`, needed because the Ashara Mubaraka upper bound must not be settable from a client clock
- `backend/src/utils/imageValidation.ts` — magic-byte detection for JPEG/PNG/WebP, strict base64 decoding, a 2 MiB cap screened on the encoded length before materialising, SHA-256, and dimension extraction for all three formats
- 165 tests, all passing

### The part worth recording: a golden-master refactor

Before touching `calculateHijriDate`, its output was captured for 18 dates spanning the 1582
Gregorian reform, leap centuries, the Unix epoch, 1400 AH and 2100, plus three moon-sighting
adjustments and eleven invalid inputs. Those captured values became
`backend/src/__tests__/fixtures/hijriVectors.ts`, and **both** suites assert against that one
fixture — so a change to one copy of the algorithm that is not mirrored in the other fails the
build.

That mattered, because the refactor **removed a block of dead code**: the original computed the
Gregorian date back from the Julian Day (`bb`, `cc`, `dd`, `ee`, reassigning `day`/`month`/
`year`) and never read the result — the Hijri computation uses only `jd`. Removing it was safe,
and the golden master is what proves it rather than asserts it.

One test failure occurred and was instructive: the JPEG dimension test failed, and the parser
was correct — my hand-built fixture was malformed. A JPEG segment's length field counts itself,
so declaring 16 while supplying 14 bytes desynchronised the marker walk. The fixture was fixed,
not the parser.

## Outcome

- Impact: the repository has a working test harness and 165 passing tests where it had none. The two Hijri implementations are pinned together by a shared golden-master fixture. No authentication file, no database and no existing behaviour was touched; the only existing source file modified is `frontend/src/utils/hijriDate.ts`, additively.
- Tests: backend 100 passing, frontend 65 passing, 165 total. `tsc --noEmit` clean in the backend, `tsc -b` clean in the frontend.
- Files: 11 created, 8 modified. 10 of 124 tasks marked `[X]`.
- Next prompts: the user sets up a restored production copy plus `backend/.env` and the mysql client, then `/sp.implement` resumes at T006. Phase 3's regression suite is the next gate and must be green before the `authService.ts` edit at T046.
- Reflection: the right call was stopping rather than working down the list. Four tasks in, the plan hits a database that does not exist here, and the task after that is a regression suite whose only purpose is capturing behaviour *before* a change — writing it without being able to run it would have produced something that looks like a safety net and is not one. Stopping cost one exchange; proceeding would have produced unverifiable work on a live system's authentication.

## Evaluation notes (flywheel)

- Failure modes observed: `npm run lint` fails in the frontend with 68 errors and 4 warnings — **all pre-existing**, in 14 page files none of which this run touched (`ReportsPage.tsx` alone holds 32). Verified by linting the four new and changed files in isolation: exit 0, no output. Also noted: `frontend/dist` and `backend/dist` are committed build artifacts and are now stale relative to `src`, deliberately, because rebuilding would produce a large artifact diff; they must be rebuilt at deploy time, which `ARCHITECTURE.md` already prescribes. One self-inflicted error: the authorization question described the granted scope as "13 tasks" when T001–T005 plus T009–T013 is 10.
- Graders run and results (PASS/FAIL): PASS — 165/165 tests green; backend and frontend typechecks clean; `tsc --listFiles` confirms 0 test files enter the backend build graph while both new utils do; the four new/changed frontend files lint clean; golden-master assertions confirm `calculateHijriDate` is byte-identical across all 18 dates, 3 adjustments and 11 invalid inputs after the refactor.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): capture a golden master before every refactor of an existing function, not just this one. It converted "the dead code looks unused" into a verified fact for the cost of one throwaway script.
