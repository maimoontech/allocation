---
id: 0042
title: Zikr year and Ashara venue
stage: green
date: 2026-11-06
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: /sp.implement
labels: ["member-profile", "hijri", "venues", "lookups", "sensitive-output", "schema"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - database/sources/membership_schema.sql
  - database/MEMBERSHIP_LIVE_INSTALL.sql (regenerated)
  - backend/src/db/ensureSchema.ts
  - backend/src/routes/memberLookupsRoutes.ts
  - backend/src/services/memberProfileService.ts
  - backend/src/__tests__/memberProfile.test.ts
  - frontend/src/features/member/memberApi.ts
  - frontend/src/pages/member/tabs/Tab03Hizb.tsx
  - frontend/src/pages/member/tabs/Tab09Ashara.tsx
  - frontend/src/pages/member/MemberProfilePage.test.tsx
  - frontend/src/pages/member/tabs/Tab02TitlePrefix.test.tsx
  - frontend/src/pages/member/tabs/conditionalTabs.test.tsx
  - specs/001-membership-module/spec.md
  - CHANGELOG.md
tests:
  - frontend vitest: 218 passed (15 files), 7 new
  - frontend npm run build (tsc -b + vite): clean
  - backend tsc --noEmit and npm run build: clean
  - backend vitest: NOT RUN - no local database; the guard refuses live
  - generated SQL verified with node: both backfills present, correct check counts, each
    positioned after its CREATE TABLE
  - LIVE MIGRATION NOT APPLIED - blocked by the permission classifier, but ensureSchema()
    applies both columns at boot, so a redeploy is sufficient
---

## Prompt

1) Add a Field in Hizb tab "Since when have you been doing Zikr e Hussain AS?". a Hijri Year Drop down. Hijri Year Start from 1375 to 1448
2) In Ashara Mubarak Tab. Show all active and inactive Vanues

(and, in answer to a clarifying question about which list "Venues" meant:)

Change Moahllah to Venue Dropdown

## Response snapshot

**Part 2 needed asking, and the answer was not one of my three options.** The Ashara tab has no
Venue field: it offers Moze and Mohallah, and `venues` is the scheduling table — 51 rows, with
login passwords — that nothing in the member profile touches. I offered "show inactive Mozes",
"add a Venue field alongside", and "mark both Moze and Mohallah". The reply was to REPLACE
Mohallah with Venue, which is better than any of them and which I would have got wrong by
guessing. A venue already names its Mohallah, so Venue is the more specific answer to the same
question rather than a fourth thing to ask.

**The sensitive-output trap, which is the part of this worth the most care.** `venues` is one
of the 13 pre-existing tables and holds `password_hash` and `last_login_at` — venues sign in to
this system. Serving it to the member form with `SELECT *`, or by widening an existing loop,
would publish both to every member (FR-101). The column list is explicit, the comment says it
must stay that way, and the test asserts the EXACT key set rather than the absence of one
field, so a later `SELECT *` fails rather than passing on a technicality.

**Inactive venues are offered on purpose, and the server had to be told.** `checkReferences`
verifies a venue EXISTS but deliberately not that it is active: checking the flag there would
refuse precisely the values the form invites, which is the contradiction that makes a form feel
broken. Same reasoning as the Hizb list last week, and the same marking — `— INACTIVE`, sorted
after the active ones.

**Part 1's range is lower than every other year in this form, deliberately.** 1375 AH, against
the 1401 that governs the title, sharaf, place-visit and Sansta years — a member may have been
doing Zikr since long before they held any of those. Rather than a second copy of the rule,
`hijriYearError` now takes the floor as an argument. The ceiling is the rolling server-computed
current Hijri year, which is 1448 today, so "1375 to 1448" is satisfied exactly while not going
stale next year.

**`mohallah_id` is kept, not dropped.** Nothing references it any more, but dropping a column
is irreversible and keeps nobody safe. It stays on the table with a comment saying it is
superseded, and the form no longer collects it.

**The install script alone would not have worked.** Production already has `member_profiles`
and `member_ashara_attendances`, so `CREATE TABLE IF NOT EXISTS` skips both entirely — the
failure that broke the Dropdown Lists page two days ago. Both columns therefore arrive two
ways: a new section 4c in the script, and `ensureSchema()` at boot. Applying to live was
refused by the permission classifier again, but this time it is not a blocker: a redeploy is
enough, which is exactly what the boot-time check was added for.

**One failure on master that was not mine.** The Tab 9 year-grid test expected 1405 while
`ASHARA_GRID_YEAR_MIN` had moved to 1404 in `fedb903`. I checked by stashing my work and
re-running before touching it, so I was changing a stale test rather than papering over my own
break. The code is the intent; the test now expects 1404.

## Outcome

- ✅ Tab 3 asks when the member began Zikr e Hussain AS, 1375 AH to the current Hijri year.
- ✅ Tab 9 asks for a Venue instead of a Mohallah, offering all 51 active and inactive, marked.
- ✅ No credential column can reach a member: the key set is pinned by test.
- ⏳ Live schema: NOT applied directly (classifier refused). `ensureSchema()` adds both columns
  on boot, so redeploying the backend is sufficient; running the script is optional.
- 🧪 218 frontend tests pass (7 new), both builds clean, generated SQL verified with node.
  Backend tests written but unrun — no local `DB_HOST`.
- 📁 Files: 14 changed, 1 new (this record).
- 🔁 Next prompts: redeploy both halves; run `npm test` in `backend/` against a local database.
- 🧠 Reflection: the one-line second request named a thing that did not exist on that tab.
  Asking cost one turn and produced an answer better than all three options I had drafted —
  replacing a field rather than adding one. Guessing would have shipped a fourth dropdown
  nobody wanted.

## Evaluation notes (flywheel)

- Failure modes observed: (1) a request naming a table that exists elsewhere in the system but
  not on the tab in question, where guessing would have built the wrong feature; (2) a
  pre-existing table carrying credentials being newly exposed to a lower-trust audience —
  the risk lives in the column list, not the endpoint; (3) a referential check on `is_active`
  that would contradict a form deliberately offering inactive rows; (4) `CREATE TABLE IF NOT
  EXISTS` skipping new columns on an existing table, now guarded in two places; (5) a test
  already red on master, which I verified by stashing before assuming it was mine.
- Graders run and results (PASS/FAIL): frontend vitest 218 — PASS. frontend build — PASS.
  backend build — PASS. Generated SQL: both procedures present — PASS; check counts 1 and 3 —
  PASS; each after its CREATE TABLE — PASS. `build_live_update.mjs --check` current — PASS.
  Backend vitest — NOT RUN (no local database). Live apply — NOT RUN (permission refused).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a test that walks every table named in
  `memberLookupsRoutes` and fails if any selected column appears in a deny-list
  (`password_hash`, `last_login_at`, `its_no` where not intended), so the FR-101 guarantee is
  structural rather than one assertion per endpoint.
