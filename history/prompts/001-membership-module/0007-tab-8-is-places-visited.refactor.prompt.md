---
id: 0007
title: Tab 8 Is Places Visited
stage: refactor
date: 2026-10-29
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["requirement-correction", "schema-rename", "miqaat-places", "domain-semantics", "membership-module"]
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
  - specs/001-membership-module/contracts/member-api.openapi.yaml
  - specs/001-membership-module/migrations/001_membership_schema.draft.sql
  - specs/001-membership-module/migrations/002_membership_seed.draft.sql
  - specs/001-membership-module/migrations/999_membership_rollback.draft.sql
  - database/local-dev/local_dev_setup.sql
  - database/local-dev/README.md
  - database/local-dev/before-state-baseline.md
  - PROJECT_AS_IS.md
  - history/prompts/001-membership-module/0007-tab-8-is-places-visited.refactor.prompt.md
tests:
  - the three renamed tables were dropped and recreated in the live local database; 33 tables, one collation, five lookups empty, existing data untouched (parties 80, schedules 651, miqaats 19)
  - SQL structural re-validation passed on both scripts - 20/20 and 33/33 explicit collations, 0 FK ordering problems
  - no duplicate FR numbers after the spec edit; 107 requirements
  - 165 unit tests still pass; no application code was touched
---

## Prompt

current miqaat table is use for scheduling, and in membership module miqaat is places where visited

## Response snapshot

A requirement correction that invalidated part of the design, caught before any code was built
on it.

### What was wrong

The design had treated Tab 8's "Miqaat" as a repeatable **occasion type** — something a member
attends, counted over years. The previous run had even derived the lookup from
`SELECT DISTINCT miqaat_name FROM miqaats`, reasoning that the scheduling calendar was at least
a real, verifiable source rather than invented data.

The clarification is that Tab 8's Miqaat means **the places a member has visited**, and the
existing `miqaats` table is purely the scheduling module's calendar.

So the derivation was wrong in **kind**, not merely too granular — which is the part the
previous run got wrong. It had noticed the list looked unusable (19 types from 19 rows, names
like `2nd Day | 3ji Raat Majlis` and `16mi Raat - Safar-ul-Muzaffar 1448H`) and concluded it
needed *pruning*. No amount of pruning turns a majlis session into a place. The right
conclusion was that the source was categorically wrong.

The design decision to not *reuse* `miqaats` was correct. Borrowing its values anyway was not.

### What changed

| Before | After |
|---|---|
| `miqaat_types` | `miqaat_places` |
| `miqaat_type_name` / `miqaat_type_id` | `miqaat_place_name` / `miqaat_place_id` |
| `member_miqaats` | `member_miqaat_visits` |
| `member_miqaat_years` | `member_miqaat_visit_years` |
| `attended_year` | `visited_year` |
| seeded with 19 derived rows | **empty — awaiting the authoritative list** |

Indexes and foreign-key constraint names followed. Applied across 14 files: the spec, data
model, research notes, quickstart, plan, tasks, the OpenAPI contract, all three migration
scripts, the local setup script, both local-dev documents, and `PROJECT_AS_IS.md`. The PHR
history was deliberately left untouched, since those records are what was true at the time.

The rename was mechanical but order-sensitive — `member_miqaat_years` had to be substituted
before `member_miqaats`, or the longer name would have been corrupted by the shorter
replacement.

Then applied to the live local database: the three tables were empty of member data (only the
19 bad derived rows), so they were dropped and recreated from the corrected migration.

### Beyond the rename

Two requirements gained precision rather than just new nouns:

- **FR-071** now states that a place may appear at most once per member, which is what makes its count and years one coherent record. That was already enforced by `uq_member_miqaat_visits` but was not written down.
- **FR-070** states the list is kept separately from the scheduling calendar, so the mistake is hard to repeat.

Two assumptions were added to the spec, 17 and 18, recording the correction and one question it
raises: **Tab 9's `Moze` is also a place.** If `mozes` and `miqaat_places` draw on the same
real-world set, the two lookups should be merged into one. They are separate for now only
because the requirement lists them as separate fields — flagged for the user, not decided.

`miqaat_places` also joins the list of lookups shipping empty, making it **five**, not four:
`titles`, `sharafs`, `halqas`, `mozes`, `miqaat_places`.

## Outcome

- Impact: Tab 8 now models the right thing. Timing mattered — the tables were empty and no code referenced them, so the rename cost one session; after Phase 6 it would have meant a data migration and changes across the service, routes, RTK Query slice and tab component.
- Tests: the live local schema re-verified — 33 tables, one collation, five lookups empty, `parties` 80 / `schedules` 651 / `miqaats` 19 unchanged. Both SQL scripts re-validated structurally. 165 unit tests still pass; no application code touched.
- Files: 14 modified, 1 created (this record). Task count unchanged at 16 of 124.
- Next prompts: Phase 3 (T019-T026), the regression suite. T018 now needs five lists, plus the Moze-versus-places decision.
- Reflection: the previous run had the evidence and drew the wrong conclusion from it. Seeing `16mi Raat - Safar-ul-Muzaffar 1448H` in a list meant to span many years should have prompted a question about what Tab 8 meant, not a note that the list needed pruning. The derivation felt safe because it avoided inventing data — but borrowing real values from the wrong concept is its own error, and a more confident-looking one. Worth asking what a field *means* before deciding where its values come from.

## Evaluation notes (flywheel)

- Failure modes observed: a domain term was assumed rather than confirmed. "Miqaat" was read in its common sense of a religious occasion, when in this module it means a place visited, and the brief's wording ("Dropdown populated from the existing Miqaat table") actively encouraged the wrong reading. Also self-caught during this run: inserting a new FR-074 for the uniqueness rule collided with Tab 9's existing FR-074, so the point was folded into FR-071 rather than renumbering 100+ requirements.
- Graders run and results (PASS/FAIL): PASS — no stale identifiers outside the intentional before/after table; 20/20 and 33/33 explicit collations; 0 FK ordering problems in both scripts; no duplicate FR numbers across 107 requirements; live schema at 33 tables with one collation; existing row counts unchanged; 165 unit tests green.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): when a spec says "populated from the existing X table", verify what that table actually contains *and* what the field is for, before designing against it. One question here would have saved a rename across 14 files.
