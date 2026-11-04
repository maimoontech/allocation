---
id: 0014
title: Single Entry Tabs Complete
stage: green
date: 2026-10-30
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["phase-7", "conditional-fields", "health-privacy", "multi-select", "fr-066"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/components/ui/MultiSelect.tsx
  - frontend/src/pages/member/tabs/shared.ts
  - frontend/src/pages/member/tabs/Tab04Occupation.tsx
  - frontend/src/pages/member/tabs/Tab05EducationHifz.tsx
  - frontend/src/pages/member/tabs/Tab06Health.tsx
  - frontend/src/pages/member/tabs/Tab10Asbaq.tsx
  - frontend/src/pages/member/tabs/Tab11Tamreen.tsx
  - frontend/src/pages/member/tabs/Tab12Khidmat.tsx
  - frontend/src/pages/member/tabs/conditionalTabs.test.tsx
  - frontend/src/pages/member/tabs/Tab01Personal.tsx
  - frontend/src/pages/member/tabs/Tab03Hizb.tsx
  - frontend/src/pages/member/MemberProfilePage.tsx
  - frontend/src/pages/member/MemberProfilePage.test.tsx
  - backend/src/__tests__/memberHealthPrivacy.test.ts
  - specs/001-membership-module/tasks.md
  - history/prompts/001-membership-module/0014-single-entry-tabs-complete.green.prompt.md
tests:
  - 488 passing - 356 backend across 15 files, 132 frontend across 7
  - 18 new this pass - 10 frontend conditional-rule tests, 8 backend health-privacy tests
  - backend tsc --noEmit clean; frontend tsc -b clean
  - lint still at the pre-existing 68 errors / 4 warnings; no new ones introduced
---

## Prompt

Next

(Phase 7, tasks T083 to T095 — the six single-entry tabs, following the Phase 6 UI pass in
record 0013.)

## Response snapshot

Phase 7 complete. **T083 to T095 closed; 96 of 124 tasks done.** Eight of the twelve tabs now
render; the four repeatable ones are all that remain.

### Three tasks were already done, and writing them again would have been worse

T083, T084 and T085 asked for two new backend test files. `memberProfile.test.ts` already had
all of it, written during the API pass: a `conditional rules` block covering the Sanad gate,
the Tamreen reason, the Khidmat name fields (as an `it.each` over all three types) and the
Designation clear, each with a paired test that saves a value, switches the answer, reads back
and asserts `null`; plus three BMI tests. New files would have asserted the same behaviour
against the same route under different names. Marked complete with a pointer to the existing
coverage rather than duplicated — the task list exists to make sure the behaviour is tested,
not to make sure a filename exists.

### The hide-and-clear pattern, and why the clear is atomic

Every conditional field on these tabs follows one shape. Switching the answer does not just
hide the dependent field; it nulls it **in the same update**:

```ts
onChange("__fields__", { occupation_type: "Business", designation: null });
```

Two separate `onChange` calls would work too, but briefly leave a draft holding a Business with
a Designation. `"__fields__"` is the page's convention for applying several changes as one, so
no intermediate state exists. The server clears these fields too (FR-028, tested since T067) —
this keeps the screen honest rather than being the only line of defence.

The frontend tests assert both halves: the field disappears **and** the stored value is now
null. Only checking the DOM would pass against an implementation that leaves a contradictory
value sitting invisibly in the draft, ready to be saved.

### `shared.ts`, because Tab 3 was importing from Tab 1

`TabProps` lived in `Tab01Personal.tsx` and `Tab03Hizb.tsx` imported it from there, implying a
relationship between two unrelated tabs. Moved to `tabs/shared.ts` with the helpers the tabs
kept re-deriving: `lookupOptions` (which marks `is_draft` values as needing review in one
place), `enumOptions`, `yearOptions`, `toNullableId`, `toNullableNumber`, `computeBmi` and the
empty-lookup note. Eight tabs now share one prop contract.

`MemberProfilePage` passes it as one bundle, so Tab 1 is the only tab with extra props — the
photo handlers it alone needs.

### One existing test had to change, and the change is the point

`"survives a visit to a tab that is not built yet"` clicked Occupation and asserted the
placeholder appeared. Occupation is now built, so it correctly failed. Re-pointed at Sharaf,
which is genuinely still unbuilt. The test is about the shell tolerating a placeholder tab
without losing the draft, not about any particular tab — but it needs a real unbuilt tab to
mean anything, and it will need re-pointing once more after Phase 8 removes the last one.

### Testing an absence: the health-privacy test (T086)

FR-066 says health values must appear in no log line, error message or general export. Proving
a negative needs values that could not come from anywhere else, so the test uses sentinels
distinctive to the digit — `AB-`, `171.3`, `68.4`, `2026-02-17` — and searches **whole
payloads** rather than named fields, because the claim is that the value is nowhere in them,
however it might have been serialised.

Two details that stop it being a false pass:

- The log capture spies on `process.stdout.write` and `process.stderr.write` as well as the six console methods. Most loggers end up at the stream, so a console-only spy would miss the leak it is looking for.
- Every absence assertion is paired with a presence assertion. The save must return 200; the member's own read **must** contain `171.3` (that is FR-065, not a leak); the export must contain the member's ITS number. Without those, an empty response or a failed request would pass every `not.toContain`.

T095 turned out to be verification rather than change: the members export joins nothing from
`member_profiles` (`importExportRoutes.ts:324-335`), and no validation message echoes a
submitted value — the enum error lists the allowed set, the decimal error says "must be a
positive number". Both properties are now pinned by tests, so a future join or a message that
interpolates the input will fail the suite.

### One honest gap, flagged rather than papered over

`GET /import-export/database-backup` iterates `SHOW TABLES`, so it now dumps `member_profiles`
and `member_photos` — health values and photo blobs included. It is admin-only and it is the
rollback tool quickstart.md depends on, so excluding those tables would break the thing it is
for. But FR-101 says health values and photographs must not be in existing exports "unless
that is separately specified and authorised", and this has not been. The test documents the
exclusion explicitly instead of quietly not covering it, and it is raised as an open question.

Separately: that endpoint builds the entire dump as one in-memory string, and `mysql.escape`
renders a photo BLOB as hex, roughly doubling it. With photos stored in MySQL this scales
badly — a few hundred members with photographs is hundreds of megabytes in a single string.
Noted as a risk, not touched, since changing it is outside this phase.

## Outcome

- Impact: eight of twelve tabs render — Personal, Hizb, Occupation, Education/Hifz, Health, Asbaq, Tamreen, Khidmat. Every conditional rule in the brief is now enforced on both sides, and the health-privacy guarantee is tested rather than asserted. 96 of 124 tasks complete.
- Tests: 488 passing, 18 new. Both typechecks clean. Lint unchanged at the pre-existing 68/4.
- Files: 3 created, 13 modified.
- Next prompts: Phase 8 (T096-T109) — `RepeatableRows.tsx` and the four repeatable tabs (2 Title & Prefix, 7 Sharaf, 8 Places Visited, 9 Ashara Mubaraka). T102, T103 and T104 are already closed by T067. Then Phase 9 (T110-T124) for polish, the refresh-token interceptor, `/sp.constitution` and the retention decision.
- Reflection: the instinct on seeing three "write this test file" tasks was to write the files. Reading the existing suite first showed the behaviour was already covered, and the right move was a pointer, not a duplicate. The opposite instinct also paid: on T095 the code looked correct and the temptation was to tick it, but writing the test anyway turned a property that happened to hold into one that cannot silently stop holding.
- Open questions: whether health values and photographs in the admin database backup are authorised under FR-101; and the in-memory size of that backup now that photo blobs are in the database.
