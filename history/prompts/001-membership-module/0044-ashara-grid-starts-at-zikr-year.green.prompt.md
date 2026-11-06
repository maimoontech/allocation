---
id: 0044
title: Ashara grid starts at Zikr year
stage: green
date: 2026-11-06
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: /sp.implement
labels: ["member-profile", "ashara", "cross-tab-rule", "hijri", "presentation-only"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/pages/member/tabs/Tab09Ashara.tsx
  - frontend/src/pages/member/tabs/Tab02TitlePrefix.test.tsx
  - specs/001-membership-module/spec.md
  - CHANGELOG.md
tests:
  - frontend vitest: 233 passed (16 files), 6 new
  - 4 of the 6 verified RED against a simulated revert to the fixed floor; the other 2 assert
    the fallback, which is correct either way and says so
  - frontend npm run build (tsc -b + vite): clean
  - no backend change, so no backend test and no schema change
---

## Prompt

The Ashara Mubarak grid will start from where, in the hizb, it says 'Since when have you been doing Zikr e Hussain AS? (AH)' — whichever year is written there, if it is a year before 1404, then the grid will start from 1404.

## Response snapshot

A small rule with a clear reason behind it: a member cannot have attended Ashara Mubaraka
before they began doing Zikr e Hussain, so listing those years asks a question with only one
possible answer. The grid floor becomes `max(zikr_e_hussain_since_year, 1404)`, with 1404 also
covering the case where no Zikr year has been given.

**Three decisions the instruction did not spell out, taken from what the form already does:**

*It follows the UNSAVED value.* The floor is read from the merged draft, not the saved
profile, so changing the year on Tab 3 and returning to Tab 9 shows the new range
immediately. Tab 2 already takes its prefix from Tab 1 this way, and a grid that only
updated after saving would look broken rather than careful.

*A record below the new floor is still shown.* The existing behaviour appended any answered
year outside the range as an extra row, marked "(earlier)", and that now matters more: a
member who shortens their own Zikr year would otherwise hide an Ashara they had already
recorded. Hiding it would leave a saved value they can see nowhere and change never — which
is the exact failure shape this feature has produced twice before. A test covers it.

*The server is deliberately NOT tightened.* It still accepts 1400 AH upwards (FR-076).
Rejecting anything below the Zikr year would invalidate records that are already saved and
legitimate, and would contradict the rule above by refusing to save the very row the form
still lets the member edit. So FR-076c says presentation only, in those words.

**Verification worth stating.** Four of the six new tests were confirmed RED against a
simulated revert to the fixed floor. The other two — the fallbacks for an early Zikr year and
for none at all — pass either way, because 1404 is the answer in both the old and the new
behaviour. That is not a weakness, but it would be misleading to count them as proof, so it is
recorded here.

**Two stale pieces of text fixed in passing.** `ASHARA_GRID_YEAR_MIN` moved from 1405 to 1404
in `fedb903`, but the constant's own comment, the component's doc block and FR-076b all still
said 1405. Corrected rather than left to mislead the next reader about which number is real.

## Outcome

- ✅ The grid starts where the member says they began, never earlier than 1404 AH.
- ✅ A previously answered year below the floor stays visible, marked, and correctable.
- ✅ Nothing saved becomes unsavable: the server's accepted range is untouched.
- 🧪 233 frontend tests pass (6 new, 4 verified red first), build clean.
- 📁 Files: 4 changed, 1 new (this record). No schema change, no deploy step beyond the
  frontend.
- 🔁 Next prompts: redeploy the frontend; the backend tests still need a local `DB_HOST`.
- 🧠 Reflection: the instruction gave a floor and a fallback and said nothing about the two
  cases that actually decide whether this feels right — an unsaved Tab 3 edit, and a record
  that falls below the new floor. Both were answerable from what the form already does, which
  is why they did not need asking.

## Evaluation notes (flywheel)

- Failure modes observed: (1) a presentation rule that, if pushed into server validation,
  would reject data already saved and still editable; (2) a narrowing range hiding a record
  the member had already entered — the same "visible nowhere, changeable never" shape as the
  save bug of 2026-11-04 and the blank Zone column before it; (3) a constant changed in one
  commit while its own comment, the component doc and the requirement kept the old number.
- Graders run and results (PASS/FAIL): frontend vitest 233 — PASS. Build — PASS. New tests
  red against a reverted floor — PASS (4 of 6; the 2 fallback tests are floor-invariant by
  design). Record below the floor still rendered and marked — PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when a member raises their Zikr year above a year
  they already answered, say so on Tab 3 rather than silently leaving an "(earlier)" row on
  Tab 9 — the data is right either way, but the member is the one who can tell which of the
  two answers was the mistake.
