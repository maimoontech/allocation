---
id: 0049
title: Occupation help topic and a Student save error
stage: green
date: 2026-11-21
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: (direct request)
labels: ["help-chat", "occupation", "tab-4", "FR-110", "FR-050a", "deployment"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/services/helpChatKnowledge.ts
 - backend/dist/services/helpChatKnowledge.js (rebuilt)
 - backend/src/__tests__/helpChatKnowledge.test.ts
 - CHANGELOG.md
tests:
 - backend: tsc clean (npm run build)
 - backend: the three new vitest cases NOT executed — globalSetup refuses a non-local
   DB_HOST and no local database exists on this machine
 - backend: the knowledge base verified through tsx instead — 43 checks, all passing,
   covering the three new assertions, that no existing topic's routing moved, that every
   topic is still reachable from its own label, and that the new topic appears in the
   no-match list
---

## Prompt

1) Yes update Help topic for Occupation.
2) Error when save Occupation with value "Student" Please correct 1 field and save again.

## Response snapshot

### 1. The Occupation help topic

Added as a built-in topic, `occupation`, between `health_bmi` and `education`. It answers for
the whole tab: Job asks Company Name and Designation; Business relabels that box to Business
Name and drops Designation; a Student is asked for Skills and nothing else, with the other
boxes switched off AND cleared; Since Year is Gregorian from 1950, not Hijri like most of the
other year boxes; the Phone No. and Address are the place of work; Skills takes more than one
answer and is asked of everybody.

**The clearing is the sentence that earns its place.** It is the only part of the rule a
member cannot discover from the screen — they would fill in an employer, watch it disappear,
and telephone somebody. Pinned by a test, as are the 1950 and the Gregorian.

**Built in rather than entered through Admin → Help Topics.** FR-110a is explicit that the
built-ins restate rules the server enforces and are pinned by tests, which is exactly what
this answer does. It stays overridable: an administrator topic keyed `occupation` replaces it
without a deploy, and deactivating that topic restores this wording.

Keyword weights were chosen so nothing else lost a question: `designation` is weight 1 here
and weight 1 in `khidmat`, so "khidmat designation" still scores 3 to 1 for Khidmat. Verified
by re-checking six existing topics' routing rather than assuming.

### 2. The Student save error — this is the backend deploy, not a code fault

Traced rather than guessed. "Please correct N field(s) and save again." comes from
`MemberProfilePage.onSave`, and it is reached ONLY when `extractFieldErrors` finds
`data.data.errors`, which only a 400 from the validator carries. A 500 — which is what an
un-widened MySQL enum produces — yields no field errors and a different banner
("Internal server error (ref …)"), and there is no mapping anywhere from a driver error code
to a field error.

So the save reached a validator that rejected one field. Walking the whole of
`saveMemberProfile` for the Student path, the current code CANNOT produce one: the enum list
contains Student, the Tab 4 conditional clears the five employment fields, and it was already
moved above the date and year checks so nothing cleared is validated first. `backend/dist` is
tracked and its committed copy already carries
`occupation_type: ["Job", "Business", "Student"]`.

The remaining explanation is that the running backend process is still the previous build.
It fits the deployment shape exactly: the frontend is built by the host from the push, so the
Student radio button appeared immediately, while the backend needs its own restart. An older
validator answers the new option with `occupation_type: "Must be one of: Job, Business."` —
one field, on Tab 4, which is the tab the page then opens.

No code change was made for this, because none would correct it. The confirmation is the red
message under Occupation Type, or `/health`, which reports the running `version` and `build`.

## Outcome

- ✅ Impact: the Need Help agent covers Tab 4. No behaviour change anywhere else.
- 🧪 Tests: 3 new cases written; verified through tsx (43 checks) because the suite's
  live-database guard correctly refuses this machine's `DB_HOST`.
- 📁 Files: 3 modified, 1 rebuilt.
- 🔁 Next prompts: restart the backend, then re-try saving a Student. If the inline message
  under Occupation Type is anything other than "Must be one of: Job, Business.", that text is
  the next thing to look at.
- 🧠 Reflection: the useful move on item 2 was reading which code path produces that exact
  sentence before touching anything. It rules out the whole 500 family in one step, and from
  there the only question left is which build is answering — not what to change.

## Evaluation notes (flywheel)

- Failure modes observed: none in the change itself. The diagnosis was blocked twice —
  a direct query to the live database was refused by the sandbox, and `/health` could not be
  reached because the API base URL lives in the host's environment, not in the repo. Both
  were worked around by reading code rather than by retrying.
- Graders run and results (PASS/FAIL): backend `tsc` PASS; knowledge base via tsx PASS
  (43/43); backend vitest NOT RUN (no local database).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): have `/health` also report whether each
  `ENUM_COLUMNS` entry matches the live `COLUMN_TYPE`. It would not have caught this one —
  an old process reports its own old list — but it makes "which build is answering" a
  question with a URL instead of an inference.
