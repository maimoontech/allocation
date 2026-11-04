---
id: 0032
title: Admin and Zonal Head add member
stage: green
date: 2026-11-04
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 002-single-live-script
user: Fakhruddins128
command: /sp.implement
labels: ["members", "provisioning", "authorisation", "zone-scoping", "test-safety", "mariadb"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: https://github.com/maimoontech/allocation/pull/new/002-single-live-script
files:
  - backend/src/routes/memberAdminRoutes.ts
  - backend/src/__tests__/memberAdminCreate.test.ts (new)
  - backend/src/__tests__/globalSetup.ts
  - frontend/src/pages/modules/MembersPage.tsx
  - frontend/src/pages/modules/MembersPage.test.tsx
  - frontend/src/features/member/memberAdminApi.ts
  - frontend/src/components/layout/AppShell.tsx
  - frontend/src/router/AppRoutes.tsx
  - specs/001-membership-module/spec.md
  - CHANGELOG.md
tests:
  - frontend vitest: 183 passed (14 files), 8 of them new
  - frontend tsc --noEmit: clean
  - backend tsc --noEmit: clean (covers the 17 new backend tests)
  - backend vitest: NOT RUN - no local database configured; the new guard refuses live
  - route SQL executed against the live MariaDB read-only; the INSERT inside a rolled-back
    transaction (0 rows left, member_accounts still 0)
---

## Prompt

I am update live database detail in .env
now update Database with membership module tables with master data

(then, after the migration completed:)

In Admin and Zonal Head Panel. Both can add New Member basic Data for Entry. ITS No. Full Name, and Password for login

## Response snapshot

Two pieces of work: applying the module to production (PHR 0031), then this feature.

**The schema already anticipated the request.** `member_accounts.member_name` exists with the
comment "from the provisioning roster, so an admin list is readable before Tab 1 is filled" —
exactly a full name held on the account before the profile exists. So ITS No + Full Name +
Password needed no schema change at all.

**Asked before building, because two of the three choices were not mine to make.** The answers
came back as: record no zone, give the Zonal Head a zone-scoped list plus creation, and force a
password change at first sign-in. The first two pull against each other and I said so rather
than shipping something that quietly does not work: with no zone recorded, a Zonal Head's
zone-scoped list cannot contain the member they just created, because zone lives on
`member_profiles` and that row does not exist yet.

I built the chosen design and made the consequence visible instead of hiding it — the form and
the empty state both say the new member will not appear until they choose a zone, and a test
pins the behaviour so that making creation set a zone has to be a deliberate rewrite. The
alternative patch, treating zone-less accounts as belonging to whoever created them, was
refused on its merits: with no column recording the creator it would show every zone-less
account to every Zonal Head, disclosing one zone's new members to another.

**Backend.** `POST /api/v1/members` creates one account. Same ITS rule as the import route
(`/^\d{6,20}$/`), name onto `member_name`, password through the EXISTING
`validateMemberPassword` rather than a second policy, then bcrypt cost 10 with
`must_change_password = 1` and `password_changed_at = NULL`. Duplicate ITS is a 409 naming the
number. The router guard widened from `["admin"]` to `["admin", "zonal_head"]`, and every
handler resolves a zone scope first: `null` for an administrator, the zone id for a Zonal Head,
and a refusal for a `zonal_head` token with no usable `zoneId` — a broken token must not fall
through to an unscoped query. The active toggle reads the member's zone BEFORE writing, so a
403 can never follow a completed update.

**Frontend.** One page for both roles, since they do the same job; only the wording differs.
The form is collapsed behind `Add member` so the list stays primary. The password can be
revealed, deliberately: a typo cannot be corrected from this page — the member simply cannot
sign in — so the operator has to be able to read what they typed, and a confirm field only
proves the same typo twice when the value is pasted. Server messages are surfaced verbatim,
because they name the rule that failed; a generic "could not create" would throw that away.

**FR-006 said "Only administrators MUST be able to provision, deactivate or reactivate member
accounts."** The request overrides it, but the spec cannot be left contradicting the code, so
FR-006 is amended with its previous wording recorded, and FR-001a and FR-006a added for single
creation and for how a Zonal Head's confinement is derived.

**Separately, and more seriously: I ran the backend suite against production.** The suite
writes — `ensureFixtures` inserts into seven tables and teardown deletes by marker — and
nothing in it distinguished a local database from a live one, because both come from `DB_HOST`
in the same `.env` the application uses. It created fixture rows in `admins`, `zones`,
`mohallahs`, `venues`, `parties`, `miqaats` and `schedules`. I stopped the run, then verified
all 13 pre-existing tables were back to their exact baseline counts — teardown had removed its
own rows. Nothing persisted, but that depended on teardown completing, which is luck.
`globalSetup.ts` now refuses to run unless `DB_HOST` is local, before a single statement is
sent, naming the host and database it declined.

While checking the damage I nearly deleted real data: `sharafs` held 10 rows against the 3 I
seeded, and the extra 7 — Qadam Mubarak, Majmui Ziafat, Jooti, Chammar, Pankho, Ziafat Teru,
Qadam Teru — were entered by hand through the Dropdown Lists panel at 00:21–00:22, twenty
seconds apart. Genuine values, not test pollution. Checking the timestamps and the content
before deleting is what caught it.

**Verification, honestly bounded.** 183 frontend tests pass (8 new) and both typechecks are
clean. The 17 new backend tests are written and typecheck, but have NOT run: the only
configured database is production and the new guard correctly refuses it. To compensate, I ran
the route's own SQL against the live MariaDB — the scoped list, the photo join and the
pre-write read as read-only queries, and the INSERT inside a transaction I rolled back, which
showed the row with `must_change_password = 1` and `password_changed_at` NULL and then left 0
rows behind.

## Outcome

- ✅ Impact: both roles can add a member from three fields. A Zonal Head is confined to their
  own zone on the list, the photo endpoint and the active toggle, and is told plainly that a
  member they create is not yet in that zone.
- ⚠️ Known gap, by the chosen design: a Zonal Head cannot see the account they just created.
  One nullable `provisioning_zone_id` on `member_accounts` would close it.
- 🧪 Tests: 183 frontend passed, both typechecks clean, route SQL proven against MariaDB with
  the write rolled back. 17 backend tests written but unrun — they need a local `DB_HOST`.
- 📁 Files: 10 changed, 2 new (a backend test file and this record).
- 🔁 Next prompts: run `npm test` in `backend/` with `DB_HOST` pointed at a local database;
  decide whether to add `provisioning_zone_id`; provision the real roster.
- 🧠 Reflection: the dangerous part of this session was not the feature, it was running a
  writing test suite with production credentials in `.env`. The suite had no idea which
  database it was pointed at, and neither did I until after it ran. "Tests are safe" is an
  assumption about configuration, not a property of tests.

## Evaluation notes (flywheel)

- Failure modes observed: (1) a write-heavy test suite sharing one `.env` with the application,
  so repointing the app silently repoints the tests at production; (2) two user answers that
  contradict each other, where building both as stated produces a feature that does not work —
  worth stating rather than silently resolving; (3) real hand-entered data closely resembling
  test pollution, distinguishable only by timestamps and content; (4) `getByLabelText` with an
  exact string failing because the `Input` component renders helper text inside the same
  `<label>`, so the accessible name is label+helper; (5) a `<strong>` mid-sentence splitting
  text across nodes and defeating `getByText`; (6) appending a `describe` to a file whose first
  block closes the shared pool in `afterAll` would break it, so a new file was needed.
- Graders run and results (PASS/FAIL): frontend vitest 183 — PASS. frontend tsc — PASS.
  backend tsc — PASS. Live SQL validity for all four statements — PASS. Rolled-back INSERT
  leaves 0 rows — PASS. Guard refuses live `DB_HOST` with exit 1 — PASS. Production back to
  baseline on all 13 pre-existing tables — PASS. Backend vitest — NOT RUN (no local database).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): make `validateMemberPassword`'s rule text a single
  exported constant the UI imports, so the helper text under the password field cannot drift
  from the rule the server enforces — it is currently a hand-copied sentence.
