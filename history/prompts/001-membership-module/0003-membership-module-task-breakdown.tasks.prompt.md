---
id: 0003
title: Membership Module Task Breakdown
stage: tasks
date: 2026-10-29
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: /sp.tasks
labels: ["membership-module", "task-breakdown", "regression-gate", "test-first", "stage-1-design"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-membership-module/tasks.md
  - history/prompts/001-membership-module/0003-membership-module-task-breakdown.tasks.prompt.md
tests:
  - none run or added - this run produced the task list only
  - 31 of the 124 tasks are test tasks; tests were included because the request explicitly asks for them and because the repository has no test infrastructure at all, making the harness itself a task
---

## Prompt

`/sp.tasks` was invoked with no arguments.

The command's own outline supplied the workflow: run `check-prerequisites.ps1 -Json`, load
`plan.md` and `spec.md` plus whichever optional documents exist, organise tasks **by user
story** in the priority order from `spec.md`, use `.specify/templates/tasks-template.md` as the
structure, enforce the strict checklist format
(`- [ ] [TaskID] [P?] [Story?] Description with file path`), and report counts, parallel
opportunities, independent test criteria and a suggested MVP scope.

It also specified that test tasks are optional and should only be generated if explicitly
requested.

## Response snapshot

Generated `specs/001-membership-module/tasks.md` — **124 tasks across 9 phases**, every one
format-validated. No application code, schema or database was changed.

**Tests were included**, because the request explicitly asks for them — "Add tests for member
authentication, forced password changes, lookup filtering, repeated records, and Party Login
regression" — and because the repository has **no test runner, no spec file and no CI**, which
makes standing up the harness a task in its own right rather than an assumption.

**The structural decision that shaped everything: Phase 3 is a safety gate, not a build.**

Spec story US1 is "existing users are unaffected", which produces no feature. It is placed as
Phase 3 and **blocks Phase 5**, because the `member` branch is inserted into `authenticate()`
two lines above an unguarded fallthrough that currently catches every coordinator login
(`authService.ts:113`). Its eight tasks write the regression suite against *unmodified* code.
T020 — the coordinator fallthrough test — is the single most important task in the list.

Phase 2 (Foundational) was deliberately constrained to touch **no** authentication file:
schema, Hijri utilities and image validation only. That is what allows the one risky edit (T046)
to happen strictly after the safety net exists. Three tasks — T057, T082, T109 — exist solely
to re-run Phase 3 after each subsequent phase.

**The MVP is unusually four P1 stories, not one**, and the task list says so plainly: US1 ships
nothing, US2 produces accounts nobody can use yet, and US3 produces a login that reaches an
empty page. The first increment with standalone value is Phase 6 — a member signs in, is forced
to set a password, and records their core identity.

**Story independence was reported honestly rather than asserted.** The template presumes mostly
independent stories; these are not. US3 needs an account from US2, US4 needs US3, and US5 and
US6 both need US4's shell — though US5 and US6 are genuinely independent of each other, and
Phase 4 can run in parallel with Phases 3 and 5 entirely. Saying this is more useful than
claiming a parallelism that would break.

**Per-story counts**: US1 8, US2 11, US3 20, US4 25, US5 13, US6 14, plus Setup 8,
Foundational 10 and Polish 15. 66 tasks marked `[P]`.

T018 is flagged **BLOCKED ON USER** — the four lookup lists that ship empty. It blocks no other
task, because FR-095 means the rest of the profile works without them.

## Outcome

- Impact: Stage 1 is now complete end to end — spec, as-is record, research, data model, API contract, draft SQL, runbook and task list. The branch holds everything needed to begin Stage 2 on approval. `git diff master -- backend frontend database` remains empty.
- Tests: None run. 31 test tasks defined, with the regression suite ordered before the authentication edit it protects.
- Files: 1 created (`tasks.md`) plus this record.
- Next prompts: `/sp.implement` once the assumptions are signed off; `/sp.adr member-authentication-and-storage`; `/sp.constitution`; `/sp.analyze` for a cross-artifact consistency pass.
- Reflection: The useful work here was not enumerating 124 tasks but getting two orderings right. Placing a verification-only story as a blocking gate reads oddly against the template's "each story is an MVP increment" framing, yet it is the only arrangement in which the no-regression requirement can actually be proven rather than hoped for. And constraining Phase 2 to touch no auth file is what makes that gate meaningful — without it, foundational work would have already modified the code the baseline is supposed to capture.

## Evaluation notes (flywheel)

- Failure modes observed: `check-prerequisites.ps1` ran cleanly, unlike the two earlier scripts in this feature. Two self-caught defects in the first draft of `tasks.md`: nine tasks said "in the same file" instead of naming a path, which would have forced an implementer to read a neighbouring task to execute one — replaced with explicit paths; and the summary table understated the parallel-task count as 63 against an actual 66 — corrected after counting the file rather than trusting the draft.
- Graders run and results (PASS/FAIL): PASS — 124 tasks, IDs strictly sequential T001–T124 with no gaps or duplicates; every task carries a checkbox and an ID; every task in a story phase carries a story label; no story label appears in Setup, Foundational or Polish; no template placeholder or sample task survives; every implementation task names a file path.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): have the generator assert that every task description contains a path, a shell command or an explicit verification action, so "in the same file" style back-references are caught before review rather than after.
