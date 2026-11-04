---
id: 0002
title: Membership Module Design Plan
stage: plan
date: 2026-10-29
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: /sp.plan
labels: ["membership-module", "database-design", "api-contract", "migration", "no-regression", "stage-1-design"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-membership-module/plan.md
  - specs/001-membership-module/research.md
  - specs/001-membership-module/data-model.md
  - specs/001-membership-module/quickstart.md
  - specs/001-membership-module/contracts/member-api.openapi.yaml
  - specs/001-membership-module/migrations/001_membership_schema.draft.sql
  - specs/001-membership-module/migrations/002_membership_seed.draft.sql
  - specs/001-membership-module/migrations/999_membership_rollback.draft.sql
  - history/prompts/001-membership-module/0002-membership-module-design-plan.plan.prompt.md
tests:
  - none run or added - this run produced design documents and unexecuted draft SQL only
  - the plan specifies the harness to stand up first (Vitest + supertest + React Testing Library) and requires the Party and Coordinator regression tests to be written against unmodified code BEFORE authService.ts is edited
---

## Prompt

`/sp.plan` was invoked with no arguments.

The command's own outline supplied the workflow: run `setup-plan.ps1 -Json`, load the feature
spec and the constitution, fill the plan template, evaluate the Constitution Check gate,
produce `research.md` in Phase 0, produce `data-model.md`, `contracts/` and `quickstart.md` in
Phase 1, run `update-agent-context.ps1 -AgentType claude`, re-evaluate the gate after design,
then stop and report.

The feature description it operated on is the Membership Module brief recorded verbatim in
`0001-member-login-profile-spec.spec.prompt.md`. The user had previously chosen, during
`/sp.specify`, that `/sp.plan` would deliver the database design, the implementation plan and
the draft SQL.

## Response snapshot

Produced the full Phase 0 and Phase 1 design. No application code, schema or database was
changed; the SQL is draft and unexecuted.

**Thirteen decisions recorded in `research.md`**, each with rationale and rejected
alternatives. The ones that shaped the rest:

- **R1** — new `member_accounts` table; `its_no` is a plain UNIQUE column, deliberately **not** a foreign key to `parties.its_no`, because one ITS Number may identify a member, a party, both or neither. The dormant `members` table is never read, written or altered.
- **R3** — a `requireMember` middleware compares the token's `iat` against `password_changed_at` to satisfy FR-022. The decisive point: a per-request account read is needed **anyway** for FR-007 and FR-018, so the comparison is free. It is confined to member routes, so the four existing roles keep the claims-only path.
- **R4** — photographs as `MEDIUMBLOB` in a **separate** table, base64 inside the existing `express.json({ limit: "5mb" })` body. No new dependency. Separate table so profile reads never drag megabytes, and the unique key makes FR-091 a plain UPDATE.
- **R5** — add `calculateHijriParts` beside the existing `calculateHijriDate` rather than changing it, so its only caller (`MiqaatsPage.tsx:125`) is untouched; port to the backend because FR-028 forbids trusting a browser-computed value.
- **R6** — `bmi` as a MySQL **virtual generated column**, making FR-064's read-only guarantee structural: the engine rejects any write, so no future bug can corrupt it or let it drift from its inputs.
- **R9** — one idempotent, additive-only script under `specs/`, **not** an extension of `ensureSchema.ts`, which runs before `app.listen` and which `DATABASE.md:98-102` forbids extending.
- **R11** — stand up Vitest and **write the Party and Coordinator regression tests first**, against unmodified code. The `member` branch goes two lines above the unguarded fallthrough at `authService.ts:113` that currently catches coordinator logins; a test written afterwards proves nothing about the prior behaviour.

**`data-model.md`** specifies **20 new tables, 0 altered, 0 dropped** — 2 authentication, 2
profile, 6 repeatable, 10 lookup. FR-106 therefore holds by construction, and rollback reduces
to dropping what was created. One deliberate departure from the schema's blanket
`ON DELETE CASCADE` habit: `member_profiles.zone_id` and `party_id` use `SET NULL`, because
cascading would delete a member's whole profile when a Zone or Party is removed.

**`contracts/member-api.openapi.yaml`** defines 10 operations. Two are **extensions** of
existing endpoints (`/auth/login`, `/auth/change-password`) rather than replacements. One `GET`
and one `PUT` carry the whole profile, so FR-030's all-or-nothing save is the natural case
rather than the hard one, and one lookups call returns all 13 lists plus the server-computed
current Hijri year.

**An honest deviation, flagged rather than papered over**: four lookup lists — `titles`,
`sharafs`, `halqas`, `mozes` — ship **empty**, against the user's choice to seed draft values.
Seeding them would mean inventing Dawoodi Bohra religious and organisational terms and
presenting them as real, which the brief explicitly forbids, and a plausible-looking wrong
value is worse than an empty list because it gets selected, stored, and becomes
indistinguishable from a correct one. FR-095 covers the consequence. `miqaat_types` avoided the
problem by deriving from a real source: `SELECT DISTINCT miqaat_name FROM miqaats`.

**Constitution Check could not be evaluated** — `.specify/memory/constitution.md` is still the
unfilled template, so there are no ratified principles. Reported rather than worked around;
inventing principles and then declaring compliance with them would be a check that proves
nothing. In its place the plan was checked against the project's real written standards
(`CLAUDE.md`, `ARCHITECTURE.md`, `DATABASE.md`, `BUSINESS_RULES.md`) — 10 items, all pass — and
the three departures from existing practice are recorded under Complexity Tracking.

## Outcome

- Impact: Phase 0 and Phase 1 complete. The branch now holds a 13-decision research record, a 20-table database design, a 10-operation API contract, three draft SQL scripts and a runbook covering apply, verify, demonstrate, roll back and release. `git diff master -- backend frontend database` remains empty.
- Tests: None run or added. The plan specifies the harness and, critically, requires the regression tests to precede the `authService.ts` edit.
- Files: 8 created (plan, research, data model, quickstart, contract, 3 migrations) plus this record. `plan.md` was seeded from the template by `setup-plan.ps1` and then filled.
- Next prompts: `/sp.tasks` for the dependency-ordered task list; `/sp.adr` for the three significant decisions; `/sp.constitution` so the gate can be evaluated next time.
- Reflection: The strongest part of this design is not any single table but the additive-only constraint. Because no existing table is altered, "no existing record changed" stops being a promise to be careful and becomes a property of the migration that a row-count comparison can verify. The same instinct drove the test ordering: the one dangerous edit is a five-line insertion above a fallthrough, and the only way to prove it safe is to have captured the prior behaviour first.

## Evaluation notes (flywheel)

- Failure modes observed: `update-agent-context.ps1 -AgentType claude` **reported success falsely.** It printed "Added language / framework / database", but a byte-level diff shows its only effect was prepending a UTF-8 BOM to `CLAUDE.md` — no tech context was inserted, because this repo's `CLAUDE.md` is a hand-written SpecKit rules file and contains none of the insertion markers the script looks for (`Active Technologies`, `Recent Changes`, `MANUAL ADDITIONS`). The BOM was reverted, since it is a spurious change to a tracked file and BOMs break some tooling. Separately, `create-new-feature.ps1:267` remains broken on Windows PowerShell 5.1 (three-argument `Join-Path`); `setup-plan.ps1` was checked for the same fault before running and is clean.
- Graders run and results (PASS/FAIL): PASS — zero unresolved template placeholders across all Phase 0 and Phase 1 artifacts; zero NEEDS CLARIFICATION; every one of the spec's 107 requirements traced to a table, a constraint, an endpoint or an application-layer rule; `git diff master` against `backend`, `frontend` and `database` empty. PARTIAL — the Constitution Check gate can neither pass nor fail, because no constitution exists.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): make `update-agent-context.ps1` fail loudly when it finds no insertion marker, instead of reporting additions it did not make. A script that claims success while doing nothing is worse than one that errors.
