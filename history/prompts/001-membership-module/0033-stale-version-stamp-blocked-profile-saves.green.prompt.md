---
id: 0033
title: Stale version stamp blocked profile saves
stage: green
date: 2026-11-04
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: /sp.implement
labels: ["member-profile", "optimistic-concurrency", "silent-failure", "regression-test", "git-hygiene"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/pages/member/MemberProfilePage.tsx
  - frontend/src/pages/member/MemberProfilePage.test.tsx
  - CHANGELOG.md
tests:
  - frontend vitest: 185 passed (14 files), 2 of them new
  - both new tests verified RED without the fix and GREEN with it
  - frontend tsc --noEmit: clean
  - live MariaDB read-only: member_profiles row 2 confirms the signature
---

## Prompt

1) Already zone and Party name selected in members portal but not showing in admin.
2) Make single Master Branch on git

(with two screenshots: the Admin Members list showing dashes under Zone, Party and Mobile No.,
and the member's Tab 3 Hizb showing City Saddar / Hizbe Emadi / Leader selected)

## Response snapshot

**The screenshots overturned my previous answer, and they were right to.** One prompt earlier I
had concluded the blank columns were not a bug — the live row genuinely held NULLs, so the list
was reporting accurately. That was true and still is. What it did not explain, and what I had
not been shown, was a member looking at a filled-in Tab 3. Accurate reporting of a NULL is only
the end of the story if the NULL is the member's own doing.

**The first check was whether the selects were lying.** A `<select>` with no empty option
displays its first item while the bound value is `""` — which would have made the screenshot
meaningless. They are not: Zone and Role carry explicit `Select...` placeholders, and Party is
`disabled` until a Zone is chosen. For Party to render enabled and showing *Hizbe Emadi*,
`zone_id` had to be set in the form state. So the selections were real.

**Then the database, which gave the decisive clue.** `zone_id`, `party_id` AND `hizb_role` all
NULL — every field on Tab 3 — while `whatsapp_no_1` from Tab 1 was set. `updated_at` 01:43:17,
unchanged. Three fields failing together is not three members forgetting; it is one save not
landing.

**The path end to end was correct, which is what made this interesting.** `zone_id` and
`party_id` are handled on the write path (not merely the read path — I had cited the read
path's `scalarColumns` last time, which was my mistake), `hizb_role` is a validated ENUM
column, and `onSave` posts the whole draft. Nothing drops the fields. So the save was not
dropping them — it was never being accepted.

**The bug.** `clearDraft` resets `draft` and `fieldErrors` but leaves `baseUpdatedAt` alone, and
the effect that seeds it is guarded by `if (profile && !baseUpdatedAt)` — so once set it never
refreshes. Every save after the first keeps sending the ORIGINAL read's `updated_at` as
`if_unmodified_since`. The server compares it against its own completed write, finds the stored
value newer, and returns 409 *"This profile was changed in another session."* There was no other
session. It was the member's own previous save.

The live row is the arithmetic: save #1 created the profile with `if_unmodified_since` null, so
the check was skipped; the refetch then seeded the stamp at 01:41:03; save #2 matched and
landed at 01:43:17; save #3 — Tab 3 — still claimed 01:41:03 against a stored 01:43:17 and was
refused. Two saves, then a wall.

**Fix: re-base on the save's own response.** `saveMemberProfile` already returns the saved
profile, so `dispatch(setDraftBase(saved.updated_at))` after `clearDraft()` costs no request and
cannot race a refetch — the alternative, nulling the stamp and letting the effect re-seed, would
re-seed from the stale cached profile before the refetch arrived and reproduce the bug.

**Both regression tests were verified RED first.** That mattered here more than usual: the first
save was always correct, so a test that saves once passes against the broken code. The
assertion that earns its place is on the SECOND save's `if_unmodified_since`. I also had to fix
the test stub — it echoed the original `updated_at` on every PUT, which no real server does, and
that alone would have hidden the bug from any test written against it.

**Git consolidation stopped short, deliberately.** `master` already contained every commit from
`002-single-live-script`, so collapsing to one branch was nearly a no-op — except that
`001-membership-module` carries one unmerged commit, `d68a921 "db change"`, adding
`database/backups/04112026.sql` and the pre-membership dump: 137 and 5 bcrypt password hash
lines respectively, plus `refresh_tokens` and `admins` rows. Merging that into `master` would
put production credentials in the default branch. It is already pushed to
`origin/001-membership-module`, so the exposure exists now and deleting the branch does not
retract it. Surfaced for a decision rather than merged or silently dropped.

## Outcome

- ✅ Impact: a member can save their profile more than twice. Zone, Party and Role will reach
  the database and appear in the Admin list once the member saves again.
- ✅ The previous answer stands on its facts (the NULLs were real) but its conclusion was
  wrong — the member had not failed to enter the data, the app had refused to store it.
- 🧪 Tests: 185 frontend passed (2 new, both confirmed failing without the fix), tsc clean.
- ⚠️ Open decision: `d68a921` on `001-membership-module` commits password hashes. Not merged.
- 📁 Files: 3 changed, 1 new (this record).
- 🔁 Next prompts: decide the fate of the backup commit and whether to rotate the hashed
  credentials; redeploy the frontend; the 17 backend tests still need a local `DB_HOST`.
- 🧠 Reflection: "the data is genuinely NULL" answered *what* the database held and was
  mistaken for *why*. The query confirmed the symptom and I read it as the cause. The screenshot
  of a filled-in form was the missing evidence, and nothing I could have queried would have
  replaced it — the failure lived in the client's in-memory state, which leaves no trace in the
  row it fails to write.

## Evaluation notes (flywheel)

- Failure modes observed: (1) optimistic-concurrency state cleared on one axis (the draft) but
  not the other (the version stamp), so the feature fights its own previous success; (2) a
  re-seeding effect guarded by `!value`, which makes it one-shot and silently un-refreshable;
  (3) a test stub returning a constant `updated_at` where the real server returns a fresh one —
  the stub made the bug untestable; (4) confirming a symptom in the database and treating it as
  the cause; (5) a 409 whose message names a cause ("another session") that cannot occur,
  sending the reader away from the real one.
- Graders run and results (PASS/FAIL): frontend vitest 185 — PASS. New tests RED without fix —
  PASS (2 failed, exactly the two). tsc --noEmit — PASS. Live row signature matches the
  predicted two-saves-then-wall pattern — PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): make the 409 message distinguish "your own earlier
  save" from "another session" by returning the stored `updated_at`, so a stamp that is merely
  stale reads differently from a genuine concurrent edit.
