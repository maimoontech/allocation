---
id: 0034
title: Profile year dropdowns become Hijri
stage: green
date: 2026-11-04
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: /sp.implement
labels: ["member-profile", "hijri", "calendar", "data-migration", "validation", "silent-failure"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/pages/member/tabs/shared.ts
  - frontend/src/pages/member/tabs/Tab02TitlePrefix.tsx
  - frontend/src/pages/member/tabs/Tab07Sharaf.tsx
  - frontend/src/pages/member/tabs/Tab08PlacesVisited.tsx
  - frontend/src/pages/member/tabs/Tab12Khidmat.tsx
  - frontend/src/pages/member/tabs/Tab02TitlePrefix.test.tsx
  - backend/src/services/memberProfileService.ts
  - backend/src/__tests__/memberProfile.test.ts
  - backend/src/__tests__/memberRepeatables.test.ts
  - database/convert_profile_years_to_hijri.sql (new)
  - database/README.md
  - specs/001-membership-module/spec.md
  - CHANGELOG.md
tests:
  - frontend vitest: 196 passed (14 files), 11 of them new
  - frontend tsc --noEmit: clean
  - backend tsc --noEmit: clean
  - backend vitest: NOT RUN - no local database; the guard refuses live
  - live migration applied, then re-run to prove idempotency (second run converted nothing)
---

## Prompt

Prefix Year, Title Year, Sharf Year, Place Visited Year, and Other Sansta Year dropdown should
be islamic year from 1401 till 1438

## Response snapshot

**Two things in the request needed checking before building, and both changed the work.**

The upper bound. Today is 1448 AH — I ran the project's own `currentHijriYear()` rather than
reasoning about it. A window ending at 1438 would stop ten years short: a title received in
1445 could not be recorded at all, and every Hijri new year would push the list further out of
date. Asked, and the answer was 1401 to the current year, rolling. That is also the shape Tab 9
already uses, so the codebase had the pattern.

The stored data. Two values were already in these columns — `prefix_year` 2006 and a
`title_year` 2005, both Gregorian. Under a Hijri dropdown they match no option, so the field
renders blank and the save is refused: the same silent-failure shape as the bug fixed one
prompt earlier. Asked, and the answer was to convert them.

**What was actually wrong is worth stating plainly.** This was not a cosmetic range. A Hijri
year sits inside 1950–2026 as comfortably as a Gregorian one, so whichever calendar the member
picked was stored without complaint, and the column could hold both at once with nothing to
distinguish them later. The old bounds were also three different rules that had grown up
separately — 1950–2026 for prefix and title years, 1900–2100 for sharaf and visit years, and
for `khidmat_since_year` no range check at all. They are now one shared `hijriYearError`
helper, so they cannot drift apart again.

**The trap, and it would have been a bad one.** `khidmat_since_year` was validated against the
member's GREGORIAN year of birth — "Year cannot be before your year of birth." Once the field
is Hijri, 1447 is numerically less than a 2006 birth year, so that check would have rejected
every valid value, and the message would have sent the member to their date of birth rather
than to the real cause. It was moved off that comparison deliberately, with a test pinning it.
`occupation_since_year` keeps the check, because it is still Gregorian.

**The ceiling is the server's, never the browser's.** It is `currentHijriYear()` evaluated per
request on the server and `lookups.current_hijri_year` in the client — not a constant, so the
window rolls over on its own, and not `new Date().getFullYear()`, which two tabs were using and
which a wrong device clock would have widened past what the server accepts.

**Migration.** `convert_profile_years_to_hijri.sql` converts only unambiguously Gregorian values
(`>= 1900`) with `FLOOR((g - 622) * 33 / 32)`, verified against the application's own converter
rather than trusted as arithmetic: 2005 → 1426, 2006 → 1427. That `>= 1900` guard is what makes
it idempotent, and I proved that by running it twice — the second run found nothing to convert
and left both values untouched. `occupation_since_year` is explicitly excluded and printed in
the log as unchanged, so the exclusion is visible rather than assumed. Backup of all four
affected tables taken first.

**Scope held.** Only the five fields named. Tab 4's Since Year stays Gregorian and Tab 9's
Ashara year keeps its own 1400 AH floor, which FR-076 names explicitly — both noted in the code
so the inconsistency reads as a decision rather than an oversight.

## Outcome

- ✅ Impact: all five dropdowns offer 1401 AH to the current Hijri year, labelled `(AH)`, with
  the server enforcing the same window through one shared helper.
- ✅ The two stored Gregorian values converted on live and verified; migration proven idempotent.
- 🧪 Tests: 196 frontend passed (11 new), both typechecks clean. New backend tests written for
  all five fields plus the birth-year trap — unrun, no local database.
- ⚠️ Deferred, stated not hidden: Tab 4 `occupation_since_year` remains Gregorian; nobody asked
  for it to move, and moving it would need the same birth-year treatment.
- 📁 Files: 12 changed, 2 new (the migration and this record).
- 🔁 Next prompts: rebuild and redeploy both halves; run `npm test` in `backend/` against a
  local `DB_HOST`; decide whether Tab 4's Since Year should be Hijri too.
- 🧠 Reflection: the stated upper bound was ten years stale and the stated scope silently
  invalidated two stored rows. Neither was visible in the request; both came from checking the
  request against the system — the current Hijri year from the code, the orphaned rows from the
  database — before writing anything.

## Evaluation notes (flywheel)

- Failure modes observed: (1) two calendars sharing one column with no way to tell them apart,
  because the valid ranges overlap; (2) a cross-field rule (birth year) that silently inverts
  when one of its operands changes calendar, and whose error message then points at the wrong
  field; (3) `new Date().getFullYear()` as a dropdown ceiling, which lets a wrong device clock
  offer years the server will refuse; (4) three range rules for one concept, drifted apart
  (1950–2026, 1900–2100, none); (5) a requested bound that was already a decade out of date.
- Graders run and results (PASS/FAIL): frontend vitest 196 — PASS. frontend tsc — PASS. backend
  tsc — PASS. Live conversion matched the helper's values exactly (1426, 1427) — PASS. Second
  run of the migration converted nothing — PASS. `gregorian_remaining` 0 on all five columns —
  PASS. Backend vitest — NOT RUN (no local database).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): have the profile read endpoint return a per-field
  calendar tag, so the UI cannot label a Gregorian column `(AH)` by mistake — the label is
  currently hand-written next to a range that is enforced somewhere else entirely.
