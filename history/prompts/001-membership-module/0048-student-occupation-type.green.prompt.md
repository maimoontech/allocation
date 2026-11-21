---
id: 0048
title: Student occupation type
stage: green
date: 2026-11-21
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: (direct request)
labels: ["occupation", "tab-4", "schema", "enum", "FR-050a"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - database/sources/membership_schema.sql
 - database/MEMBERSHIP_LIVE_INSTALL.sql (regenerated)
 - backend/src/db/ensureSchema.ts
 - backend/src/services/memberProfileService.ts
 - backend/src/services/memberFormCompletion.ts
 - backend/src/__tests__/memberProfile.test.ts
 - backend/src/__tests__/memberFormCompletion.test.ts
 - frontend/src/pages/member/tabs/Tab04Occupation.tsx
 - frontend/src/pages/member/tabs/conditionalTabs.test.tsx
 - specs/001-membership-module/spec.md
 - CHANGELOG.md
tests:
 - frontend: 355 passing across 21 files (7 new, Tab 4 Student)
 - frontend: tsc -b clean, vite build clean
 - backend: tsc clean; both modified test files typecheck
 - backend: the new cases NOT executed — globalSetup refuses a non-local DB_HOST and no
   local database exists on this machine. The completion-measure change was verified
   through tsx instead (8 checks, all passed), including that 100% stays reachable for a
   Student and for a Job
 - database: build_live_update.mjs --check reports current; 41 CREATE TABLE statements
---

## Prompt

Add one occupation type in Occupation tab, "Student" if member select Student than only skills field enabled.

## Response snapshot

Tab 4 offers Job, Business or Student. Student leaves Skills as the only usable field.

**Switched off rather than removed.** The request said "only skills field enabled", and that
is also the better design: deleting five controls empties most of the tab, and a member who
has just chosen Student cannot tell a deliberate narrowing from a fault. The fields stay,
greyed, each carrying "Not applicable to a Student" — the pattern the Solo rule on Tab 3
already established.

**Cleared in the same update that disables them, and again on the server.** This is the part
that would have been a real bug if left out. A disabled control fires no change event, so once
greyed the browser can never clear these fields; a member who worked and then returned to
study would keep a stored employer and work address behind controls they can no longer reach.

**The clearing runs BEFORE the date and year validation**, which meant moving the Tab 4
conditional block above those checks rather than leaving it with the other conditionals. A
Student whose form still carried a future `occupation_since_year` would otherwise be handed a
validation error about a disabled field the server was about to discard — an error with
nothing to correct and no way to correct it.

**The completion measure exempts a Student's employment fields** (FR-112). Counting questions
the form does not ask would have put 100% permanently out of a Student's reach. Their Tab 4 is
one question: the type itself, since Skills is a list and lists are not counted.

**Schema.** `occupation_type` gains `'Student'`. This is the one case the file's usual
backfill pattern would have missed: every other check asks whether a COLUMN EXISTS, and
`occupation_type` has existed since the module shipped, so the ALTER would never have run and
every Student save would have failed inside MySQL with a truncation error. The guard asks what
the column's COLUMN_TYPE currently is. The widening is strictly an addition — Job and Business
keep their positions, because removing or reordering an ENUM member silently coerces
non-matching rows to ''.

## Outcome

- ✅ Impact: Tab 4 gains a third occupation type; `member_profiles.occupation_type` widened;
  dashboard completion figure corrected for Students. No API shape change.
- 🧪 Tests: 355 frontend across 21 files (7 new). Backend cases written; not executable here.
  The completion logic verified via tsx — 8 checks, including 100% reachable for a Student
  (40 questions) and still for a Job (51).
- 📁 Files: 11 modified, 1 regenerated.
- 🔁 Next prompts: redeploy the backend — `ensureSchema()` widens the enum at boot, and
  without it saving a Student fails in MySQL. Consider a Help Topic for the Occupation tab:
  there is currently none, so the agent cannot answer "what do I put if I am a student?".
- 🧠 Reflection: the enum widening was the trap. Copying the surrounding
  `COLUMN_NAME = ...` pattern would have produced an ensure that compiled, ran, reported
  nothing wrong and silently did nothing — and the failure would have surfaced as a
  truncation error on a member's save, not at boot.

## Evaluation notes (flywheel)

- Failure modes observed: three frontend tests failed first time, each for a reason worth
  keeping. `getByLabelText(/^Skills/)` found nothing because `MultiSelect` renders a
  `<legend>`, not a label — the real controls are the option checkbox and the "Search Skills"
  box. `/^Company Name/` disappeared after switching to Business, because that label follows
  the occupation type. And the explanatory note could not be matched because
  Testing Library's default text matcher reads only an element's DIRECT text nodes, so the
  `<strong>` tags inside the sentence broke it — fixed by restructuring the note so the
  asserted sentence is one text node, which is better markup anyway.
- Graders run and results (PASS/FAIL): frontend vitest PASS (355/355); frontend `tsc -b` PASS;
  frontend build PASS; backend `tsc` PASS; completion logic via tsx PASS (8/8); live SQL
  `--check` PASS; backend vitest NOT RUN (no local database).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a test that walks every `ENUM_COLUMNS` entry in
  `memberProfileService.ts` against the live `COLUMN_TYPE`, so a value added in code but not
  in the schema fails at test time rather than on a member's save.
