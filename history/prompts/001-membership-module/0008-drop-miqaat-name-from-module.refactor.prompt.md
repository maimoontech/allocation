---
id: 0008
title: Drop Miqaat Name From Module
stage: refactor
date: 2026-10-29
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["naming", "ambiguity-removal", "schema-rename", "places-visited", "membership-module"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-membership-module/spec.md
  - specs/001-membership-module/data-model.md
  - specs/001-membership-module/research.md
  - specs/001-membership-module/quickstart.md
  - specs/001-membership-module/plan.md
  - specs/001-membership-module/tasks.md
  - specs/001-membership-module/checklists/requirements.md
  - specs/001-membership-module/contracts/member-api.openapi.yaml
  - specs/001-membership-module/migrations/001_membership_schema.draft.sql
  - specs/001-membership-module/migrations/002_membership_seed.draft.sql
  - specs/001-membership-module/migrations/999_membership_rollback.draft.sql
  - database/local-dev/local_dev_setup.sql
  - database/local-dev/README.md
  - database/local-dev/before-state-baseline.md
  - PROJECT_AS_IS.md
  - history/prompts/001-membership-module/0008-drop-miqaat-name-from-module.refactor.prompt.md
tests:
  - the three tables were dropped and recreated in the live local database; the only remaining miqaat table is the existing scheduling `miqaats`
  - 33 tables, 1 collation; scheduling data unchanged (miqaats 19, schedules 651, parties 80)
  - SQL structural re-validation passed - 20/20 and 33/33 explicit collations, 0 FK ordering problems
  - no member-module miqaat identifier remains in any artifact outside PHR history and the database dump
  - 165 unit tests still pass; no application code touched
---

## Prompt

Let make it simple. Leave old things as it is. and in members module change miqaat name to place visited so system not make any confusion

## Response snapshot

The right instruction, and simpler than what the previous run produced. Rather than keep the
word "Miqaat" in the member module and rely on everyone remembering it means something
different there, the word is now gone from the module entirely. The scheduling module keeps it,
untouched.

### Final naming

| Originally | Now |
|---|---|
| `miqaat_types`, then `miqaat_places` | **`places`** |
| `miqaat_type_name` / `miqaat_place_name` | **`place_name`** |
| `miqaat_type_id` / `miqaat_place_id` | **`place_id`** |
| `member_miqaats`, then `member_miqaat_visits` | **`member_place_visits`** |
| `member_miqaat_years`, then `member_miqaat_visit_years` | **`member_place_visit_years`** |
| `member_miqaat_visit_id` | **`member_place_visit_id`** |
| `attended_year` | **`visited_year`** |
| Tab 8 titled "Miqaat" | Tab 8 titled **"Places Visited"** |
| API `miqaats: []`, `MiqaatEntry` | **`places_visited: []`**, **`PlaceVisitEntry`** |
| UI `Tab08Miqaat.tsx` | **`Tab08PlacesVisited.tsx`** |

The resulting names also match the project's existing conventions more closely than the
intermediate ones did: a plural-noun lookup table (`places`, like `zones`, `parties`,
`venues`) with a `<noun>_name` display column.

### Scope kept narrow, as asked

Nothing in the scheduling module changed. `miqaats`, `schedules.miqaat_id`,
`uq_schedules_miqaat_party`, `idx_miqaats_date`, `idx_schedules_miqaat_venue`,
`miqaatsRoutes.ts` and `MiqaatsPage.tsx` are all exactly as they were. The sed patterns were
written to match only the member-module identifiers, and a targeted grep afterwards confirmed
the scheduling references survived intact.

`Documentation/claude_membership_module_prompt.md` — the original brief — was also left alone,
since it is the source document. The spec instead carries a note at Tab 8 saying the tab was
renamed from "Miqaat", so the two can still be mapped against each other.

### Applied across 15 files and the live database

Spec, data model, research, quickstart, plan, tasks, requirements checklist, the OpenAPI
contract, all three migration scripts, the local setup script, both local-dev documents and
`PROJECT_AS_IS.md`. PHR history was left as written.

The three tables were empty, so they were dropped and recreated from the corrected migration.
Verified afterwards: `places`, `member_place_visits`, `member_place_visit_years` present with
the new column names; the only `miqaat` table in the database is the scheduling `miqaats`; 33
tables; one collation; `miqaats` 19 / `schedules` 651 / `parties` 80 unchanged.

### One correction to my own earlier reasoning

Assumption 17 in the spec previously read as a definition of what "Miqaat" means in Tab 8. It
now records something stronger: that the word is deliberately not used in this module at all,
because removing the ambiguity at the source beats documenting it. That is the actual decision,
and it is cheaper to maintain.

## Outcome

- Impact: the member module no longer contains a term that means something else elsewhere in the system. Second rename of these three tables in one session, both free because they were empty and no code referenced them — a fortnight later this would have been a data migration plus changes across the service, routes, API slice and tab component.
- Tests: live schema verified; both SQL scripts re-validated structurally; 165 unit tests pass; no application code touched.
- Files: 15 modified, 1 created (this record). Task count unchanged at 16 of 124.
- Next prompts: Phase 3 (T019-T026), the regression suite. Still blocked on a usable local password for a successful-login test. T018 needs five lists, now `titles`, `sharafs`, `halqas`, `mozes` and `places`.
- Reflection: two renames in one session is a signal, not just churn. The first fixed what the thing *is*; this one fixed what it is *called*. I had carried "Miqaat" into the module purely because the brief used that word, without asking whether it collided with an existing meaning in the same database — and it did, on the very table the brief told me to reuse. When a requirement borrows a term the system already uses for something else, the cheapest fix is usually to stop using the term, not to qualify it.

## Evaluation notes (flywheel)

- Failure modes observed: the original design inherited an ambiguous domain term from the brief and propagated it into 50-odd identifiers across 15 files before the collision was raised. The ordering hazard recurred too — `member_miqaat_visit_years` had to be substituted before `member_miqaat_visits`, and `miqaat_place_name` before `miqaat_places`, or the shorter patterns would have corrupted the longer names; handled by sequencing longest-first in a single sed pass.
- Graders run and results (PASS/FAIL): PASS — zero member-module miqaat identifiers remain outside PHR history and the database dump; scheduling identifiers all intact; 20/20 and 33/33 explicit collations with 0 FK ordering problems; live database at 33 tables and one collation with the three tables correctly renamed; scheduling row counts unchanged; 165 unit tests green.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): when a brief says "populated from the existing X table", check whether X already means something else in that schema before adopting the name. Here the collision was visible in the table list from the very first inspection.
