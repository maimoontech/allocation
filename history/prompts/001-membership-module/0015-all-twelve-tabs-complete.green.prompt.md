---
id: 0015
title: All Twelve Tabs Complete
stage: green
date: 2026-10-30
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["phase-8", "repeatable-rows", "fr-073", "golden-master", "requirement-gap"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/services/memberProfileService.ts
  - backend/src/__tests__/memberRepeatables.test.ts
  - backend/src/__tests__/helpers/memberLookups.ts
  - backend/src/__tests__/memberProfile.test.ts
  - frontend/src/components/ui/RepeatableRows.tsx
  - frontend/src/pages/member/tabs/Tab02TitlePrefix.tsx
  - frontend/src/pages/member/tabs/Tab07Sharaf.tsx
  - frontend/src/pages/member/tabs/Tab08PlacesVisited.tsx
  - frontend/src/pages/member/tabs/Tab09Ashara.tsx
  - frontend/src/pages/member/tabs/Tab02TitlePrefix.test.tsx
  - frontend/src/pages/member/MemberProfilePage.tsx
  - frontend/src/pages/member/MemberProfilePage.test.tsx
  - specs/001-membership-module/tasks.md
  - history/prompts/001-membership-module/0015-all-twelve-tabs-complete.green.prompt.md
tests:
  - 523 passing - 376 backend across 16 files, 147 frontend across 8
  - 35 new this pass - 20 backend repeatable-section tests, 15 frontend row-editor tests
  - backend tsc --noEmit clean; frontend tsc -b clean
  - lint unchanged at the pre-existing 68 errors / 4 warnings
  - memberProfile.test.ts held at 68/68 across a 129-line fixture extraction (golden master)
---

## Prompt

Next

(Phase 8, tasks T096 to T109 — the four repeatable tabs, following Phase 7 in record 0014.)

## Response snapshot

Phase 8 complete. **T096 to T109 closed; 107 of 124 tasks done.** All twelve tabs now render,
and every user story in the spec is independently functional.

### A requirement that was not actually met

T097 asked for a test that the Tab 8 count mismatch names the place. Writing it showed the
message did not:

```
Number of times (3) does not match the 2 year(s) listed.
```

FR-073 says *"naming the place and both counts"*. A comment in the service even acknowledged
it — "The place NAME is not known here — the route resolves it" — but the route only passes
errors through, so nothing resolved it. The existing test asserted both numbers and never the
name, so it passed while the requirement did not hold.

The place name is not in the payload, only its id, so building the message needs a query. That
is why the check now lives in a separate async step, `checkVisitCounts`, rather than in the
synchronous parse:

```
__TEST_LOOKUP__ Place B: Number of times (5) does not match the 1 year(s) listed.
```

One deliberate choice there: it runs **whether or not other fields failed**, unlike the
referential checks which are skipped once anything else is wrong. A member with a count
mismatch and an unrelated typo should learn about both at once, not fix the typo, save, and
only then discover the mismatch. There is a test for exactly that.

This is the second time in this feature that a property which *looked* satisfied was not. The
pattern both times: the test asserted the parts that were easy to assert and skipped the part
the requirement actually turned on.

### Why the add/edit/delete tests are not redundant

There is no add, edit or delete endpoint — there is one save that replaces each section in
full. So "edit the middle row" and "delete the first row" are not operations the server knows
about; they are differences between two arrays. `memberProfile.test.ts` already covered
replace-in-full, so the risk left is not that one of the three fails, it is that **order,
identity or position is quietly lost in the round trip** — row 2 edited but coming back as
row 3, or a delete removing the wrong row because something keys on position where it should
not.

Every assertion therefore checks the whole section after the save. A test looking only at the
row that changed would pass while the others were scrambled.

### A fixture extraction, with the tests as the golden master

`memberRepeatables.test.ts` needs the same seeded lookups as `memberProfile.test.ts`, and the
five lookups it depends on ship intentionally empty. Duplicating 129 lines of seeding would
have meant two files writing the same marker into the same tables, where one file's teardown
could remove rows the other still needed.

Extracted to `helpers/memberLookups.ts` and pointed both files at it. `memberProfile.test.ts`
held at **68 of 68** before and after, which is the only reason the extraction is trustworthy —
the suite was the golden master for a refactor of its own fixture.

### The row editor holds no state, and that is the whole design

`RepeatableRows` keeps nothing locally. Every change goes out through `onChange` to the draft
in `memberProfileSlice`, and the rows come back as a prop.

That is not tidiness. Only the active tab panel is rendered (FR-026), so a half-entered row in
local state would be destroyed the moment the member looked at another tab — and the four
repeatable tabs are exactly where a member accumulates the most unsaved work. Keeping rows in
the draft is what makes Add append a blank row rather than open a dialog, and it is why the
tests can see an add or a remove at all: the only evidence is the array that goes out.

Rows are identified by position, which is also how the server reports errors on them
(`titles[1].title_year`). Removing a row renumbers the ones after it — fine, because the whole
section is replaced on save, and the page already clears errors by field prefix as soon as the
section changes, so a stale message cannot outlive the edit that caused it.

### Three places where the UI prevents a refusal rather than explaining one

Each of these removes an option the server would reject, instead of letting the member pick it
and then be told no:

- **Tab 8 years** are chips with a select that offers only years not already listed, so `2019 is listed twice` is unreachable.
- **Tab 8 places** exclude any place another row already holds (FR-071), while each row still shows its own selection.
- **Tab 9 years** exclude any Hijri year another record holds, and the upper bound is `current_hijri_year` from the lookups response — computed by the same server-side logic that validates the save. Computing it in the browser would mean two implementations that can disagree, and the one the member sees would be the one enforcing nothing.

The one mismatch that *cannot* be prevented is FR-073's, because both numbers are legitimately
the member's to enter. Number of Times stays editable rather than derived: a member who visited
a place three times but remembers only two of the years needs to be able to say so. The row
shows the disagreement as soon as it exists, with both numbers side by side and a one-click
correction, so the member can see which of the two is wrong.

### Dead code the phase retired

`ALL_TABS` carried a `ready` flag, which drove a `(soon)` suffix, a disabled tab button and a
placeholder panel. With all twelve built it was uniformly true, so the flag, the suffix and the
panel are gone.

The page test `"survives a visit to a tab that is not built yet"` lost its subject for the same
reason — it had already been re-pointed once this session, from Occupation to Sharaf. Replaced
with `"keeps a typed value through a visit to every other tab"`, which walks all twelve. That is
the stronger test anyway: it would catch a single tab whose mount or unmount disturbed the
draft, which a single there-and-back could not.

## Outcome

- Impact: all twelve tabs render and persist. Every user story in the spec (US1 to US6) is independently functional. 107 of 124 tasks complete; only Phase 9 polish remains.
- Tests: 523 passing, 35 new. Both typechecks clean. Lint unchanged at the pre-existing 68/4.
- Files: 6 created, 8 modified. One behaviour change in the service (FR-073 now names the place).
- Next prompts: Phase 9 (T110-T124) — docs and release steps, plus T113 (wire up the unused `/auth/refresh` and a 401 interceptor), T118 (move the migrations into `database/`), T122 (`/sp.constitution`, never yet run, so the Constitution Check gate still cannot be evaluated), T123 (`/sp.adr`) and T124 (the retention decision for a departed member).
- Reflection: the FR-073 gap is the useful finding. A test existed, it passed, and the requirement was still unmet — because the test asserted the two numbers and not the name, which was the part the requirement turned on. Reading the requirement text again before writing the test, rather than reading the existing test, is what surfaced it. The temptation on seeing "integration test for FR-073" next to an apparently-passing test was to tick the box.
- Still open: the 18 spec assumptions need sign-off; the five empty lookups (titles, sharafs, halqas, mozes, places) need authoritative values before a member can complete Tabs 2, 7, 8, 9 and 10; whether health values and photographs in the admin database backup are authorised under FR-101.
