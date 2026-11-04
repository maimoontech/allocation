---
description: "Task list for the Membership Module implementation"
---

# Tasks: Member Login and 12-Tab Member Profile

**Input**: Design documents from `/specs/001-membership-module/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **Included.** The request explicitly asks for them — "Add tests for member
authentication, forced password changes, lookup filtering, repeated records, and Party Login
regression" — and the repository currently has **no test infrastructure at all**, so standing
up the harness is itself a task.

**Organization**: Grouped by user story, in the priority order from `spec.md`, so each story is
independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: `[US1]`–`[US6]`, mapping to the user stories in `spec.md`
- Exact file paths are given in every task

## Path Conventions

Web app, existing split, unchanged: `backend/src/`, `frontend/src/`. Backend tests live in
`backend/src/__tests__/`, frontend tests beside their components as `*.test.tsx`.

---

## ⚠️ Two ordering rules that are not negotiable

1. **Phase 3 (US1) must complete before Phase 5 (US3).** The `member` branch is inserted into `authenticate()` two lines above an **unguarded fallthrough** that currently catches every coordinator login (`backend/src/services/authService.ts:113`). The regression tests must be written and passing against *unmodified* code first — written afterwards they prove nothing about the prior behaviour.
2. **Phase 2 touches no authentication file.** Schema and utility work comes first precisely so that the only auth edit happens after the safety net exists.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the test harness the repo lacks, and capture the before-state that FR-106 and SC-013 are verified against.

- [X] T001 Install backend test dependencies: `cd backend && npm i -D vitest supertest @types/supertest`
- [X] T002 [P] Install frontend test dependencies: `cd frontend && npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom`
- [X] T003 [P] Create `backend/vitest.config.ts` with a node environment and `src/__tests__/**/*.test.ts` as the include glob — *done as `backend/vitest.config.mts`, because the backend package is `type: commonjs` and a `.ts` config using ESM syntax raises a Vite deprecation warning. Also added `"exclude": ["src/__tests__"]` to `backend/tsconfig.json`, without which `npm run build` compiles the test files into the committed `dist/` and ships them*
- [X] T004 [P] Create `frontend/vitest.config.ts` with a jsdom environment and `src/**/*.test.tsx` as the include glob — *merged with the app's own `vite.config.ts` via `mergeConfig` so tests inherit the react plugin and the `__APP_VERSION__` / `__APP_BUILD__` defines; redeclaring would leave those globals undefined. Also added `frontend/src/test-setup.ts` for jest-dom matchers and listed `vitest.config.ts` in `frontend/tsconfig.node.json` so the config is typechecked*
- [X] T005 [P] Add a `"test": "vitest run"` script to `backend/package.json` and `frontend/package.json`, and a `"test": "npm test --prefix backend && npm test --prefix frontend"` script to the root `package.json`
- [X] T006 Restore a copy of production into a local MySQL database and point `backend/.env` at it — never at production (see [quickstart.md §0](./quickstart.md#0-local-environment)) — *done: `masjid_scheduling` on local MySQL 8.0.46 at 127.0.0.1:3306, `backend/.env` points at it*
- [X] T007 Capture a full before-state backup via `GET /api/v1/import-export/database-backup` and save it with a timestamped filename — *done with `mysqldump --single-transaction` instead, since the local copy is reachable directly: 435K, 13 tables, in `database/local-dev/dumps/` (gitignored)*
- [X] T008 Record before-state row counts for all 13 existing tables and the server version, using the queries in [quickstart.md §1](./quickstart.md#1-capture-the-before-state-do-this-first) — *recorded in [database/local-dev/before-state-baseline.md](../../database/local-dev/before-state-baseline.md); also uncovered the collation mismatch that fixed the migration*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and utilities every story depends on.

**⚠️ CRITICAL**: no user story work begins until this phase is complete. **No task in this
phase touches `authService.ts`, `authRoutes.ts`, `middleware/auth.ts` or `types.ts`** — that is
deliberate, so the one risky edit happens only after Phase 3's safety net exists.

- [X] T009 [P] Add an exported `calculateHijriParts(value, adjustment)` returning `{ day, month, year, monthName, formatted }` to `frontend/src/utils/hijriDate.ts`, **leaving the existing `calculateHijriDate` signature and output untouched** so its only caller (`frontend/src/pages/modules/MiqaatsPage.tsx:125`) keeps working (research R5)
- [X] T010 [P] Create `backend/src/utils/hijriDate.ts` as a port of the same arithmetic, exporting `calculateHijriParts` and `currentHijriYear()` — needed because FR-028 forbids trusting a browser-computed value
- [X] T011 Create a shared test-vector fixture and assert **both** copies agree, in `backend/src/__tests__/hijriDate.test.ts` and `frontend/src/utils/hijriDate.test.ts` — this is what stops the two implementations drifting (depends on T009, T010)
- [X] T012 [P] Create `backend/src/utils/imageValidation.ts` validating JPEG, PNG and WebP by **magic bytes**, rejecting a declared/actual mismatch, and enforcing a 2 MB decoded cap (FR-088, FR-089)
- [X] T013 [P] Add unit tests for `imageValidation` in `backend/src/__tests__/imageValidation.test.ts`, covering a renamed non-image, a type mismatch, an oversize payload and each accepted format
- [X] T014 Review [../../database/sources/membership_schema.sql](../../database/sources/membership_schema.sql) line by line, then apply it to the local copy via the mysql CLI (it uses `DELIMITER`, which drivers do not parse) — *applied; the review found and fixed a collation bug first, see T016*
- [X] T015 Apply [../../database/sources/membership_seed.sql](../../database/sources/membership_seed.sql) to the local copy — *applied. `places` derived 19 types from 19 rows, revealing that `miqaats` holds single-year majlis sessions rather than occasion types; it now needs your authoritative list too*
- [X] T016 Verify the migration: `new_tables_created = 20`, the `member_profiles.bmi` column reports `EXTRA = 'VIRTUAL GENERATED'`, and **every before-state row count from T008 is unchanged** ([quickstart.md §4](./quickstart.md#4-confirm-nothing-existing-changed)) — *all verified: 33 tables, ONE collation across all of them, `bmi` rejects writes with error 3105 and computes 23.95, all 12 row counts identical, backend starts and `/health` responds*
- [X] T017 [P] Add `MEMBER_LOGIN_MAX_ATTEMPTS`, `MEMBER_LOGIN_WINDOW_SECONDS`, `MEMBER_LOGIN_LOCKOUT_SECONDS` and `LOGIN_IP_HASH_SALT` to `backend/src/config/env.ts` via `optionalEnv`/`requireEnv`, and document them in `backend/.env.example` — the salt is a secret and must not be hardcoded — *the `env.ts` half was already done; the **`.env.example` half was not** — six variables were live in code and documented nowhere. Now documented with their defaults, why the per-account and per-IP counters are separate, and that `LOGIN_IP_HASH_SALT` is a secret that derives from `JWT_SECRET` when unset. Cross-checked every `optionalEnv`/`requireEnv` key in `env.ts` against the file: all present*
- [X] T018 Insert the authoritative values for `titles`, `sharafs`, `halqas`, `mozes` and `places`. All five shipped empty because seeding them would have meant inventing Dawoodi Bohra religious and organisational terms, or place names ([data-model.md §5](./data-model.md#5-new-lookup-tables)) — *supplied through the **Member Lists** admin screen (`/member-lookups`) and read back out of the development database on 2026-11-04: `titles` NKD, MKD; `sharafs` Talaqi, Ziyafat Sharaf, Qadambosi; `halqas` Nisab Awwal, Nisab Sani; `mozes` Karachi, Mumbai, Surat, Colombo, London; `places` Hajj, Umra, Karbala, Sham, India. All carry `is_draft = 0`, so all ten lookup lists are now reviewed. The values are recorded in `database/sources/membership_seed.sql` so a live apply gets the same lists rather than empty ones. **`tamreen_methods` also changed in substance**: the seven proposed values were rejected and replaced with `Self`, `With Party`, `With an Ustad`, `SatulIman`.* **Still open:** whether Tab 9's `Moze` and Tab 8's `places` are the same set — the supplied values say no (`mozes` holds cities, `places` holds ziyarat destinations), so the two lookups stay separate unless you decide otherwise

**Checkpoint**: 20 new tables exist, no existing row changed, Hijri and image utilities are tested, and no authentication file has been touched.

---

## Phase 3: User Story 1 - Existing Users Are Unaffected (Priority: P1) 🎯 SAFETY GATE

**Goal**: Prove, before any authentication code changes, exactly how the four existing roles behave — so any later deviation is caught immediately.

**Independent Test**: Run `npm test` on untouched `master` behaviour and record the baseline. Every test here must pass before Phase 5 begins, and after every subsequent task.

### Tests for User Story 1

> **These tests run against UNMODIFIED authentication code. That is the entire point.**

- [X] T019 [P] [US1] Party login regression test in `backend/src/__tests__/regression/authExistingRoles.test.ts`: a valid ITS Number and password returns a token carrying `role: "party"`, `partyId` and `zoneId`; a wrong password returns 401 with the existing message; an unknown ITS Number returns 401 and **not** 500 (FR-102) — *18 tests: claims, token payload, wrong password, unknown ITS as 401 not 500, identical message for both, name-not-accepted, malformed requests, last_login_at, hashed refresh token, refresh, logout revocation*
- [X] T020 [P] [US1] **Coordinator fallthrough regression test** in `backend/src/__tests__/regression/authCoordinatorFallthrough.test.ts`: a coordinator resolves through the `venues JOIN mohallahs` path and receives `venueId` and `zoneId`. This is the single most important test in the suite — `authenticate()` reaches that query by falling through every other branch with no role check, and the `member` branch is being inserted directly above it (FR-103) — *15 tests. Also pins the fallthrough itself: an unknown role string currently SUCCEEDS against the venue query, recorded as current behaviour so the change is visible when a guard is added*
- [X] T021 [P] [US1] Admin and Zonal Head regression tests in `backend/src/__tests__/regression/authAdminZonal.test.ts`: each signs in and receives its existing claim shape (FR-103) — *11 tests across both roles, including that neither accepts the other's credentials*
- [X] T022 [P] [US1] Existing change-password regression test in `backend/src/__tests__/regression/changePasswordExisting.test.ts`: a party changes its password through `POST /api/v1/auth/change-password` and the behaviour is unchanged, including the 400 on a wrong current password (FR-104) — *11 tests. Records two behaviours weaker than the module will need: no password policy, and a pre-change token still works afterwards*
- [X] T023 [P] [US1] Party data-scoping regression test in `backend/src/__tests__/regression/partyScoping.test.ts`: a party reads only its own `is_published = 1` schedule rows (FR-105) — *10 tests. Covers all three leak cases: another party's published row, own unpublished row, and a party_id supplied in the query string*
- [X] T024 [P] [US1] Login page render test in `frontend/src/pages/LoginPage.test.tsx`: the role dropdown offers exactly the four existing options and the identifier label changes per role (FR-102, FR-103) — *11 tests. Includes an explicit assertion that no Member option exists yet, which flips to a failure at T053 as the signal to update it deliberately*

### Implementation for User Story 1

- [X] T025 [US1] Run the full suite, confirm every test above passes against unmodified code, and record the result in the commit message as the regression baseline (depends on T019–T024) — ***232 tests green** (155 backend, 77 frontend) against unmodified authentication code; both typechecks clean; fixtures verified removed afterwards*
- [X] T026 [US1] Add a line to [quickstart.md §5](./quickstart.md#5-build-order) and to the Phase 9 release checklist requiring this suite to be re-run after **every** subsequent task — *recorded in quickstart §2*

**Checkpoint**: The safety net exists. Authentication may now be modified.

---

## Phase 4: User Story 2 - Administrator Provisions Member Accounts (Priority: P1)

**Goal**: An administrator uploads an ITS roster; one account is created per row, flagged as needing a password change, with no duplicates and no reset of a password a member has already chosen.

**Independent Test**: Upload a roster of test ITS Numbers; confirm one account per row, each with `must_change_password = 1`; re-upload and confirm no duplicates and no password reset.

**Note**: this phase touches `importExportRoutes.ts` and adds a new router. It does **not** touch `authenticate()`, so it is independent of Phase 5.

### Tests for User Story 2

- [X] T027 [P] [US2] Contract test for `POST /api/v1/import-export/members/import` in `backend/src/__tests__/memberProvisioning.test.ts`: valid rows create accounts with `must_change_password = 1`; re-upload updates rather than duplicating (FR-002, FR-003, FR-004) — *7 tests in `memberProvisioning.test.ts`, including that a duplicate ITS number **within one file** updates rather than inserting twice*
- [X] T028 [P] [US2] Contract test for FR-005 in `backend/src/__tests__/memberProvisioning.test.ts`: re-provisioning an account whose `password_changed_at IS NOT NULL` leaves its password and its change-required flag **untouched** — *4 tests. Verified end to end: a member's chosen password survives a re-upload, the roster password is not reinstated, and the name still refreshes*
- [X] T029 [P] [US2] Contract test for FR-008 in `backend/src/__tests__/memberProvisioning.test.ts`: a malformed ITS Number is reported with its row number and reason while the remaining valid rows still apply — *7 tests — bad rows reported by row number with the valid rows still applied; plus missing column, empty payload, header-only*
- [X] T030 [P] [US2] Contract test for `GET /api/v1/members` and `PATCH /api/v1/members/:id` in `backend/src/__tests__/memberAdmin.test.ts`: admin-only (403 for every other role), and the list carries no contact, health or photo data (FR-006, FR-101) — *30 tests in `memberAdmin.test.ts`, including that the list exposes no contact, health, photo or password fields*

### Implementation for User Story 2

- [X] T031 [US2] Add a `members` case to the entity switch in `backend/src/routes/importExportRoutes.ts` for the template (`its_no,member_name,password`), the export (emitting `'' AS password`, per the existing convention) and the import — *`members` added to `entityConfig`, the export branch and the import branch*
- [X] T032 [US2] Implement the provisioning upsert inside the existing transaction in `backend/src/routes/importExportRoutes.ts`, reusing the established bcrypt-hashing path and branching on `password_changed_at IS NULL` to satisfy FR-005 (depends on T031) — *branches on `password_changed_at IS NULL`; also pre-loads existing accounts into a map so a repeat inside one file is an update*
- [X] T033 [US2] Implement per-row error collection and the `{ created, updated, skipped, errors[] }` response shape in `backend/src/routes/importExportRoutes.ts` (FR-008) — *the route's existing per-row `catch` already did this; the member branch throws messages that name the problem*
- [X] T034 [P] [US2] Create `backend/src/routes/memberAdminRoutes.ts` with `GET /` (paginated, `q` and `is_active` filters, account fields only) guarded by `requireAuth, requireRole(["admin"])` — *`memberAdminRoutes.ts` — paginated, `q` and `is_active` filters, page size capped at 200*
- [X] T035 [US2] Add `PATCH /:id` to `backend/src/routes/memberAdminRoutes.ts` accepting only `is_active`, with passwords deliberately not settable here so one code path hashes them (FR-006, FR-007) — *`is_active` is the ONLY accepted field; a password or flag in the body is ignored, proven by test*
- [X] T036 [US2] Mount `memberAdminRoutes` at `/api/v1/members` in `backend/src/server.ts` — *mounted at `/api/v1/members`*
- [X] T037 [P] [US2] Create `frontend/src/pages/modules/MembersPage.tsx` listing accounts with an active/inactive toggle, plus `frontend/src/features/member/memberAdminApi.ts`, and add the admin-only route to `frontend/src/router/AppRoutes.tsx` and `navByRole` in `frontend/src/components/layout/AppShell.tsx` — *`MembersPage.tsx` + `memberAdminApi.ts`, admin route and nav entry, `Members` cache tag added*

**Checkpoint**: Accounts can be provisioned and administered. No member can sign in yet.

---

## Phase 5: User Story 3 - Member Signs In and Must Set a New Password (Priority: P1)

**Goal**: A member selects Member, signs in by ITS Number, and cannot reach anything until a new password is accepted.

**Independent Test**: With a provisioned account, sign in with the issued password; confirm the profile is unreachable until the password changes; change it; confirm the old token is rejected and the new password works.

**⚠️ Depends on Phase 3 being complete and green.**

### Tests for User Story 3

- [X] T038 [P] [US3] Contract test for member login in `backend/src/__tests__/memberAuth.test.ts`: `role: "member"` authenticates against `member_accounts`; a party's credentials do **not** grant member access and vice versa (FR-011, FR-012); an unknown ITS Number and a wrong password return the identical message (FR-013) — *17 tests in `memberAuth.test.ts`*
- [X] T039 [P] [US3] Contract test for the forced change in `backend/src/__tests__/memberForcedPasswordChange.test.ts`: every member route returns 403 with `data.code = "PASSWORD_CHANGE_REQUIRED"` while the flag is set, and `/auth/change-password` is the only call that succeeds (FR-017, FR-018) — *22 tests in `memberForcedPasswordChange.test.ts`, exercising `requireMember` through a probe route since the profile routes arrive in Phase 6*
- [X] T040 [P] [US3] Contract test for FR-022 in `backend/src/__tests__/memberForcedPasswordChange.test.ts`: a token issued before `password_changed_at` is rejected with 401 after the change — *covered; found and fixed a 1-second hole — see T049*
- [X] T041 [P] [US3] Contract test for the password policy in `backend/src/__tests__/memberForcedPasswordChange.test.ts`: a policy failure, a confirmation mismatch and reuse of the current password are each rejected with a message naming the rule (FR-019, FR-020, FR-021) — *8 policy tests; the rule that failed is named in the message*
- [X] T042 [P] [US3] Contract test for throttling in `backend/src/__tests__/memberLoginThrottle.test.ts`: repeated failures return 429 with `Retry-After`, **identically** for existing and non-existent ITS Numbers (FR-014) — *16 tests in `memberLoginThrottle.test.ts`, including that party and admin are NOT throttled*
- [X] T043 [P] [US3] Contract test for FR-007 in `backend/src/__tests__/memberAuth.test.ts`: a deactivated account is refused with the same message as a wrong password, disclosing nothing about account state — *deactivated account refused with the same message as a wrong password, and refused mid-session*

### Implementation for User Story 3

- [X] T044 [US3] Add `"member"` to the `Role` union and `memberId?: number` to `JwtClaims` in `backend/src/middleware/auth.ts:6-15` — *plus `pwdAt` and `iat` claims*
- [X] T045 [US3] Add `"member"` to the `Role` union in `frontend/src/types.ts:1`, then add the member entry to `navByRole` in `frontend/src/components/layout/AppShell.tsx` — `Record<Role, NavItem[]>` makes `tsc -b` fail until you do (depends on T044) — *`Record<Role, …>` forced it, and caught a second one I had missed in `RoleAvatar.tsx`*
- [X] T046 [US3] Add an explicit `if (role === "member")` branch to `authenticate()` in `backend/src/services/authService.ts`, **inserted above line 113**, querying `member_accounts` by `its_no`, checking `is_active`, comparing with bcrypt, updating `last_login_at`, and returning `memberId` plus `mustChangePassword` (depends on T044). **Re-run Phase 3 immediately after this task** — *inserted above the fallthrough with a strict `role === "member"` check; regression suite re-run and green*
- [X] T047 [P] [US3] Create `backend/src/services/loginThrottleService.ts` recording attempts into `member_login_attempts` with a salted SHA-256 IP hash, evaluating the rolling window on both ITS Number and IP hash, and pruning expired rows on write (research R7) — *per-account AND per-address counters with separate thresholds; fails open*
- [X] T048 [US3] Wire the throttle into `POST /login` in `backend/src/routes/authRoutes.ts`, returning 429 with `Retry-After` and a body indistinguishable from any other refusal (depends on T047) — *member role only, so existing roles are untouched*
- [X] T049 [US3] Create `backend/src/middleware/requireMember.ts` which, after `requireAuth`, loads the account row and rejects an inactive account (403), a token whose `iat` precedes `password_changed_at` (401), and an outstanding password change (403 `PASSWORD_CHANGE_REQUIRED`) — in its own file so the per-request read never reaches the four existing roles (research R3) — *compares the password-change stamp for EQUALITY, not `iat` ordering — a 1-second hole otherwise*
- [X] T050 [US3] Add a member branch to `changePassword()` in `backend/src/services/authService.ts` setting `must_change_password = 0` and `password_changed_at = NOW()`; `tableForSelfServiceRole` cannot be reused because its default returns `"venues"` — *separate `changeMemberPassword`; `tableForSelfServiceRole` now excludes member at type level*
- [X] T051 [US3] Add the password policy — minimum length, complexity, and rejection of reuse — plus server-side confirmation matching, to `changePassword()` in `backend/src/services/authService.ts` (FR-019, FR-020, FR-021) — *member only — imposing it on existing roles would break FR-104*
- [X] T052 [US3] Add `"member"` to the `requireRole` list at `backend/src/routes/authRoutes.ts:51` and revoke the member's `refresh_tokens` rows on a successful change (depends on T050) — *revokes refresh tokens in a transaction and returns a FRESH token pair*
- [X] T053 [US3] Add the Member option to `roleOptions`, a `/member-profile` branch to `defaultPathByRole`, and an ITS Number label and helper text, in `frontend/src/pages/LoginPage.tsx:12-23,37-42` — *Member appended; the baseline test was updated deliberately after it flipped*
- [X] T054 [US3] Add a forced-change mode to `frontend/src/pages/ChangePasswordPage.tsx` that cannot be dismissed or navigated away from, and which surfaces the rule that failed (FR-018, FR-020) — *`MemberChangePasswordPage.tsx`, doubling as the forced screen*
- [X] T055 [US3] Redirect to the forced-change screen on `PASSWORD_CHANGE_REQUIRED` in `frontend/src/router/ProtectedRoute.tsx`, and add the member routes to `frontend/src/router/AppRoutes.tsx` — *plus a `/member-profile` placeholder so a member has somewhere to land until Phase 6*
- [X] T056 [P] [US3] Create `frontend/src/features/member/memberApi.ts` as an RTK Query slice injecting the member endpoints onto the existing `createApi` base — *`features/member/memberApi.ts`*
- [X] T057 [US3] **Re-run the entire Phase 3 suite.** All of it must still pass, especially T020 — *all 287 tests green; both typechecks clean; real data unchanged*

**Checkpoint**: Spec story 3 works end to end. The four existing roles are provably unchanged.

---

## Phase 6: User Story 4 - Member Records Core Identity (Priority: P1)

**Goal**: A signed-in member completes Tab 1 (Personal) and Tab 3 (Hizb), with a read-only ITS Number, a derived Hijri date of birth, a dependent Party dropdown, and a photograph.

**Independent Test**: Fill Tab 1 and Tab 3, save, sign out, sign back in, and confirm every value persisted including the derived Hijri date.

### Tests for User Story 4

- [X] T058 [P] [US4] Contract test for `GET /api/v1/members/lookups` in `backend/src/__tests__/memberLookups.test.ts`: all 13 lists return, drafts carry `is_draft: true`, only `is_active` values appear, an empty list returns `[]`, parties carry `zone_id`, and `current_hijri_year` is present (FR-092, FR-094, FR-095) — *6 tests — 13 lists in one call, parties carrying `zone_id`, draft flags, inactive values omitted*
- [X] T059 [P] [US4] Contract test for the profile round trip in `backend/src/__tests__/memberProfile.test.ts`: `PUT` then `GET` returns every Tab 1 and Tab 3 value unchanged (FR-007 of story 4, SC-007) — *round trip across Tab 1 and Tab 3, plus partial-save semantics*
- [X] T060 [P] [US4] Contract test for isolation in `backend/src/__tests__/memberIsolation.test.ts`: two member tokens return two different profiles; a submitted `its_no` is ignored; a party token gets 403 (FR-034, FR-097, FR-098, FR-100) — *4 tests — two members get two profiles; a `member_account_id` or `its_no` in the body is ignored; party and admin tokens get 403*
- [X] T061 [P] [US4] Contract test for validation in `backend/src/__tests__/memberProfileValidation.test.ts`: a malformed email, a future date of birth, a bad phone format and a Party outside the selected Zone are each refused, naming field and tab, **with nothing written** (FR-029, FR-042, FR-048) — *23 tests — email, phone, dates, enums, positive measurements, since-year vs birth year, FK existence, and the Tab 3 cross-zone Party rule*
- [X] T062 [P] [US4] Contract test for the derived Hijri date in `backend/src/__tests__/memberProfileValidation.test.ts`: it is computed server-side and a client-submitted value is ignored (FR-039) — *derived server-side, client value ignored, cleared when the Gregorian date is cleared*
- [X] T063 [P] [US4] Contract test for the photo endpoints in `backend/src/__tests__/memberPhoto.test.ts`: upload, read, replace and delete; unauthenticated 401; a renamed non-image 400; over 2 MB 413; and no earlier image retrievable after a replace (FR-088 to FR-091) — *23 tests in `memberPhoto.test.ts` — disguised file, type mismatch, 413 oversize, private cache, ETag/304, replace leaves nothing behind*

### Implementation for User Story 4

- [X] T064 [US4] Create `backend/src/routes/memberLookupsRoutes.ts` returning all ten new lookups plus zones, parties (with `zone_id`) and mohallahs, and `current_hijri_year` from `backend/src/utils/hijriDate.ts` — one call so a twelve-tab form does not issue thirteen requests (research R10) — *`memberLookupsRoutes.ts` — 10 member lookups plus zones, parties, mohallahs and the server-computed Hijri year*
- [X] T065 [US4] Create `backend/src/services/memberProfileService.ts` with a read that joins `member_accounts` for `its_no`, returns `bmi`, `has_photo` and `updated_at`, and returns empty arrays rather than omitting absent sections — *returns a complete empty shape before anything is saved, so the form has nothing to special-case*
- [X] T066 [US4] Add the transactional save to `backend/src/services/memberProfileService.ts`: upsert `member_profiles`, all-or-nothing via `pool.getConnection()` + `beginTransaction`/`commit`/`rollback`, with `if_unmodified_since` producing 409 on a concurrent edit (FR-030, and the two-sessions edge case) — *one transaction; `if_unmodified_since` yields 409 instead of silently overwriting a concurrent edit*
- [X] T067 [US4] Add a validation layer to `backend/src/services/memberProfileService.ts` covering every rule in [data-model.md §7](./data-model.md#7-validation-rules-that-live-in-the-application), each error carrying its tab number and field name (FR-028, FR-029) — *every rule in data-model §7, each error carrying its tab number. **Also completes T094, T103 and T104**, which were scheduled for Phases 7 and 8*
- [X] T068 [US4] Derive and persist `dob_hijri_day/month/year/text` from `dob_gregorian` on save, ignoring any client-supplied value (FR-039; depends on T010) — *day, month, year and the display string, all from the Gregorian date*
- [X] T069 [US4] Create `backend/src/routes/memberProfileRoutes.ts` with `GET` and `PUT /me/profile` behind `requireAuth, requireMember` (depends on T049, T065, T066) — *`memberProfileRoutes.ts` — returns the saved profile so the client gets the derived values without a second call*
- [X] T070 [US4] Create `backend/src/routes/memberPhotoRoutes.ts` with `GET`, `PUT` and `DELETE /me/photo`, accepting base64 in the existing JSON body, validating via `imageValidation`, and serving with `Cache-Control: private` and the stored SHA-256 as `ETag` (depends on T012, T049) — *`memberPhotoRoutes.ts` — base64 in the existing JSON body, magic-byte validation, ETag, idempotent delete*
- [X] T071 [US4] Mount `memberLookupsRoutes`, `memberProfileRoutes` and `memberPhotoRoutes` under `/api/v1/members` in `backend/src/server.ts` — *mounted BEFORE the admin router on the same base path, or the admin role guard would refuse members their own routes*
- [X] T072 [P] [US4] Create `frontend/src/components/ui/Tabs.tsx` — a responsive tab strip that stays reachable at phone width and keeps every panel mounted so unsaved edits survive a switch (FR-025, FR-026) — *`Tabs.tsx` — horizontally scrolling strip, roving tabindex, arrow/Home/End keys, per-tab error dot. 9 tests*
- [X] T073 [P] [US4] Create `frontend/src/components/ui/Textarea.tsx` matching the existing `Input.tsx` label, error and helper-text pattern — *`Textarea.tsx` — helper text tied with `aria-describedby` rather than placed inside the label, unlike `Input`*
- [X] T074 [P] [US4] Create `frontend/src/components/ui/RadioGroup.tsx` using the project's Tailwind tokens — *`RadioGroup.tsx` — real fieldset/legend and native radios; `useId` keeps two groups on one page independent*
- [X] T075 [P] [US4] Create `frontend/src/components/ui/YesNoField.tsx` for the seven Yes/No questions across Tabs 5, 6, 11 — *`YesNoField.tsx` — radios not a checkbox, because unanswered is a third state the server stores as NULL. 10 tests*
- [X] T076 [P] [US4] Create `frontend/src/components/ui/DatePicker.tsx` emitting `YYYY-MM-DD`, which is the format `calculateHijriParts` requires — *`DatePicker.tsx` — wraps the native date input, emits `YYYY-MM-DD` or null*
- [X] T077 [P] [US4] Create `frontend/src/components/ui/ImageUpload.tsx` with a preview, client-side downscaling to stay under 2 MB, and base64 encoding for submission — *`ImageUpload.tsx` — canvas downscale to 1024px with stepped quality, so a multi-megabyte phone photo fits the 2MB cap instead of being refused*
- [X] T078 [US4] Create `frontend/src/features/member/memberProfileSlice.ts` holding unsaved edits across tab switches and surviving re-authentication, which is what makes FR-026 and FR-032 a client-state concern rather than twelve endpoints — *`memberProfileSlice.ts` — the draft lives here, not in the inputs, which is what makes FR-026 and FR-032 true. 14 tests including the sessionStorage mirroring*
- [X] T079 [US4] Create `frontend/src/pages/member/MemberProfilePage.tsx` as the twelve-tab shell with a single save action, a success and error banner, and an unsaved-edits warning on navigation (FR-024, FR-027, FR-031) — *`MemberProfilePage.tsx` — all 12 tabs present (the 10 unbuilt ones disabled, not hidden), single save sending only changed fields, `beforeunload` guard, discard, and auto-opening the first tab with an error*
- [X] T080 [US4] Create `frontend/src/pages/member/tabs/Tab01Personal.tsx`: read-only ITS Number, both prefixes, names, photo upload, Gregorian date picker, read-only derived Hijri date, marital status, address, five phone fields, email (FR-034 to FR-042) — *`Tab01Personal.tsx` — read-only ITS No and Hijri date, photo upload via an authenticated blob fetch, draft lookup values marked for review*
- [X] T081 [US4] Create `frontend/src/pages/member/tabs/Tab03Hizb.tsx`: Zone, a Party list filtered client-side on `zone_id` that clears an invalid selection when the Zone changes, and Role (FR-047 to FR-049) — *`Tab03Hizb.tsx` — dependent dropdown that clears a Party when the Zone changes, in one update. 4 tests*
- [X] T082 [US4] **Re-run Phase 3.** All must pass — *470 tests green (348 backend, 122 frontend); both typechecks clean; lint back to the pre-existing 68/4 after fixing 4 errors I had introduced*

**Checkpoint**: A member has a usable profile. This is the point at which the module could ship as an MVP.

---

## Phase 7: User Story 5 - Member Completes the Single-Entry Sections (Priority: P2)

**Goal**: Tabs 4, 5, 6, 10, 11 and 12, with conditional fields appearing only when relevant and BMI derived rather than typed.

**Independent Test**: Complete each of the six tabs, saving after each; confirm conditional fields appear and disappear as specified and every value returns.

### Tests for User Story 5

- [X] T083 [P] [US5] Integration test for conditional rules in `backend/src/__tests__/memberConditionalValidation.test.ts`: Sanad required when `has_hifz_sanad = 1`; reason required when `attends_karachi_tamreen = 0`; Sansta and Umoor names required per `khidmat_type`; designation ignored unless `occupation_type = 'Job'` (FR-052, FR-059, FR-081, FR-086) — *already covered by `memberProfile.test.ts` > "conditional rules" (Sanad required on yes; reason required when the session is not attended; Sansta/Umoor names required per type, as an `it.each` over all three types; Designation cleared for a Business). No second file — a duplicate would assert the same behaviour against the same route*
- [X] T084 [P] [US5] Integration test for hidden-field clearing in `backend/src/__tests__/memberConditionalValidation.test.ts`: a value belonging to a now-hidden conditional field is not retained in a contradictory state (story 5 scenario 6) — *already covered by the same block: each conditional rule has a paired test that saves the value, switches the answer, reads back and asserts `null` — so a hidden field cannot keep a contradictory value*
- [X] T085 [P] [US5] Integration test for BMI in `backend/src/__tests__/memberBmi.test.ts`: it is computed by the database, a submitted value is rejected or ignored, and it is `NULL` when either input is absent or non-positive (FR-064) — *already covered by `memberProfile.test.ts` — BMI derived from height and weight, a client-supplied BMI ignored, and no BMI when either measurement is missing*
- [X] T086 [P] [US5] Integration test for sensitivity in `backend/src/__tests__/memberHealthPrivacy.test.ts`: health values appear in no log line, error message or general export (FR-065, FR-066, FR-101) — *`memberHealthPrivacy.test.ts` — 8 tests. Sentinel health values are searched for across console *and* the raw stdout/stderr streams during save and read, in both validation error payloads, in a 401 body, and in the member CSV export. 3 further tests cover FR-101 contact details and the no-profile case*

### Implementation for User Story 5

- [X] T087 [P] [US5] Create `frontend/src/components/ui/MultiSelect.tsx` for the Tab 4 skills field, showing `is_draft` values as `DRAFT — NEEDS REVIEW` (FR-055, FR-094) — *`MultiSelect.tsx` — searchable checkbox list with removable chips, `useId` for unique ids, draft values marked, and an empty-list warning (FR-095)*
- [X] T088 [P] [US5] Create `frontend/src/pages/member/tabs/Tab04Occupation.tsx`: Job/Business radio, a company field whose **label** changes with the type, Designation shown only for Job, since-year, address, phone, skills multi-select (FR-050 to FR-055) — *`Tab04Occupation.tsx` — the company field's *label* follows the type; Designation is present only for a Job and is cleared in the same update when switching to Business*
- [X] T089 [P] [US5] Create `frontend/src/pages/member/tabs/Tab05EducationHifz.tsx`: level, major subjects, status, Hifz Sanad Yes/No gating a required Sanad, and the Hifz current status subsection (FR-056 to FR-060) — *`Tab05EducationHifz.tsx` — `has_hifz_sanad` gates a required Sanad select, cleared on No; Hifz Current Status subsection with Ayyah as text so a range can be entered*
- [X] T090 [P] [US5] Create `frontend/src/pages/member/tabs/Tab06Health.tsx`: blood group, donor Yes/No, last donation date, height and weight with units shown, and a read-only BMI that updates live and clears when either input is removed (FR-061 to FR-064) — *`Tab06Health.tsx` — privacy notice, donor Yes/No clearing the donation date on No, units in the labels, and a read-only BMI computed live between keystroke and save*
- [X] T091 [P] [US5] Create `frontend/src/pages/member/tabs/Tab10Asbaq.tsx`: level, Halqa, Ustad (FR-078, FR-079) — *`Tab10Asbaq.tsx` — level, Halqa (disabled with a warning while the lookup is empty), Ustad as free text since no Ustad lookup exists*
- [X] T092 [P] [US5] Create `frontend/src/pages/member/tabs/Tab11Tamreen.tsx`: attendance Yes/No gating a required reason, two frequency dropdowns from the shared list, method, and two further Yes/No questions (FR-080 to FR-084) — *`Tab11Tamreen.tsx` — attendance Yes/No gating a required reason, cleared on Yes; an *unanswered* question does not demand one*
- [X] T093 [P] [US5] Create `frontend/src/pages/member/tabs/Tab12Khidmat.tsx`: Khidmat Type driving which name fields appear, designation, since-year (FR-085 to FR-087) — *`Tab12Khidmat.tsx` — Khidmat Type drives which name fields appear, clearing the unused one in the same update*
- [X] T094 [US5] Extend the validation layer in `backend/src/services/memberProfileService.ts` with every Tab 4, 5, 6, 10, 11 and 12 conditional rule, and clear hidden conditional fields on save (depends on T067) — *already implemented by T067 — the validation layer covers all twelve tabs' conditional rules and clears hidden fields*
- [X] T095 [US5] Exclude health columns and photographs from the member export and from any error payload, in `backend/src/routes/importExportRoutes.ts` and `backend/src/services/memberProfileService.ts` (FR-066, FR-101) — *verified rather than changed: the members export joins nothing from `member_profiles` (`importExportRoutes.ts:324-335`) and no validation message echoes a submitted value. Both are now locked down by T086's tests. **Open question:** `GET /import-export/database-backup` dumps every table, so it does carry health values and photo blobs*

**Checkpoint**: Ten of the twelve tabs are complete.

---

## Phase 8: User Story 6 - Member Manages Repeatable Records (Priority: P2)

**Goal**: Tabs 2, 7, 8 and 9, each supporting add, edit and delete of individual rows.

**Independent Test**: On each of the four tabs, add three rows, edit the middle one, delete the first, save, and confirm exactly the expected rows remain.

### Tests for User Story 6

- [X] T096 [P] [US6] Integration test for repeatable persistence in `backend/src/__tests__/memberRepeatables.test.ts`: add, edit and delete across titles, sharafs, miqaats and ashara attendances; an omitted array leaves its section untouched; `[]` clears it (FR-046, FR-069, FR-072, FR-074, story 6 scenario 6) — *`memberRepeatables.test.ts` — 20 tests. The add-three / edit-the-middle / delete-the-first sequence against all four sections, each asserting the *whole* section afterwards so a scrambled row cannot pass. Plus per-section independence: sending only `sharafs` leaves `titles` alone*
- [X] T097 [P] [US6] Integration test for FR-073 in `backend/src/__tests__/memberRepeatables.test.ts`: `times_count` disagreeing with the number of years is refused, **naming the place and both counts**, with nothing written — ***found a real gap.** FR-073 requires the message to name the place and it did not — a comment claimed the route resolved the name, but the route only passes errors through. Added `checkVisitCounts` in `memberProfileService.ts`, which resolves place names in one query. 5 tests: names the place, names the *right* place when a later row is at fault, writes nothing (not even valid rows or scalars), and reports even alongside an unrelated failure*
- [X] T098 [P] [US6] Integration test for the Hijri range in `backend/src/__tests__/memberRepeatables.test.ts`: a year below 1400 or above the current Hijri year is refused (FR-076) — *the 1400 and current-year boundaries, 1399 and current+1 refused, and the message naming the bound. 4 tests*
- [X] T099 [P] [US6] Integration test for uniqueness in `backend/src/__tests__/memberRepeatables.test.ts`: two Ashara records for one member in the same Hijri year are refused by the unique key, and a repeated year against one place is refused — *duplicate Hijri year and duplicate place refused with nothing written; a repeated year within one place named; the same year against two *different* places allowed. 4 tests*
- [X] T100 [P] [US6] Component test for the Tab 2 prefix rule in `frontend/src/pages/member/tabs/Tab02TitlePrefix.test.tsx`: no Prefix shown when Tab 1's First Prefix is None; shown when it is Sheikh or Mulla (FR-043) — *`Tab02TitlePrefix.test.tsx` — 15 tests covering FR-043 (hidden on None and on null, shown for Sheikh and Mulla, not editable here), the row editor's add/edit/remove including removing the *right* row, and the Tab 8 and Tab 9 list exclusions*

### Implementation for User Story 6

- [X] T101 [P] [US6] Create `frontend/src/components/ui/RepeatableRows.tsx` — a generic add/edit/remove row editor that keeps unsaved rows in `memberProfileSlice` — *`RepeatableRows.tsx` — holds no row state at all; every change goes to `memberProfileSlice` via `onChange`, which is what lets a half-entered row survive a tab switch (FR-026)*
- [X] T102 [US6] Implement replace-in-full persistence for all five repeatable sections in `backend/src/services/memberProfileService.ts`, inside the existing transaction, so add, edit and delete are one operation rather than three endpoints each (depends on T066) — *already implemented by T066 — replace-in-full for all five repeatable sections*
- [X] T103 [US6] Implement the FR-073 check in `backend/src/services/memberProfileService.ts` immediately before commit, comparing `times_count` against the attached year count and producing the message FR-073 specifies (research R8; depends on T102) — *already implemented by T067 — the count check runs before commit and names both numbers*
- [X] T104 [US6] Validate the Hijri year range against `currentHijriYear()` in `backend/src/services/memberProfileService.ts` (FR-076; depends on T010) — *already implemented by T067 — bounded by the server-computed `currentHijriYear()`*
- [X] T105 [P] [US6] Create `frontend/src/pages/member/tabs/Tab02TitlePrefix.tsx`: conditional prefix display, prefix year 1950–2026, and multiple titles each with its own year (FR-043 to FR-046) — *`Tab02TitlePrefix.tsx` — the Prefix is read-only here and Tab 1 owns it; with no prefix chosen the Prefix Year goes too, with an explanation*
- [X] T106 [P] [US6] Create `frontend/src/pages/member/tabs/Tab07Sharaf.tsx`: multiple Sharaf entries with years (FR-067 to FR-069) — *`Tab07Sharaf.tsx` — one lookup and one year per row; Add blocked with an explanation while the `sharafs` lookup is empty (FR-095)*
- [X] T107 [P] [US6] Create `frontend/src/pages/member/tabs/Tab08PlacesVisited.tsx` — tab titled **Places Visited**: multiple place entries, each with a Number of Times and a multi-year editor, surfacing the count mismatch inline before save (FR-070 to FR-073) — *`Tab08PlacesVisited.tsx` — years as chips rather than nested cards, a year already listed cannot be re-added, a place held by another row is not offered (FR-071), and the FR-073 mismatch is shown on the row with a one-click correction*
- [X] T108 [P] [US6] Create `frontend/src/pages/member/tabs/Tab09Ashara.tsx`: attended-with radio, a Hijri year list bounded by `current_hijri_year` from the lookups response, Moze, optional Mohallah (FR-074 to FR-077) — *`Tab09Ashara.tsx` — a radio group per record with its own `name`, the year list bounded by the server's `current_hijri_year`, and years held by another record excluded*
- [X] T109 [US6] **Re-run Phase 3.** All must pass — ***523 tests green** — 376 backend across 16 files, 147 frontend across 8. Both typechecks clean; lint unchanged at the pre-existing 68/4*

**Checkpoint**: All twelve tabs complete. Every user story is independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T110 Verify every tab at 375px width with a 16px gutter and no horizontal scroll, and confirm the tab strip stays reachable (FR-025, SC-005) — *verified in a real browser. Headless Chromium at 375×812 (mobile, touch, DPR 1) signed in as a temporary member and visited all twelve tabs: `document.scrollWidth` was exactly 375 on every tab, no element extended past the viewport (descendants of the intentional tab-strip scroller excluded), and the content container computed `padding-left: 16px`. The tab strip stays reachable: `clientWidth 375` against `scrollWidth 1415`, and scrolling the strip to its end put the last tab at `right 359.3`, fully visible and clickable. No console errors or page errors. One screenshot per tab was captured as the visual record. **Getting the browser up found the frontend could not build at all**: `MemberPhotoApprovalPage.tsx`, `memberPhotoApprovalApi.ts`, `AppRoutes.tsx` and `server.ts` were corrupted (template-literal interpolations stripped, imports spliced into the middle of `server.ts`, causing `Cannot access 'app' before initialization`). All four were repaired: the approval page now fetches its images as authenticated blobs, the endpoints use the real `/:photoId` path, `ETag` uses the stored SHA-256, and the stray `console.error` that would have failed T112 was removed. Backend 440/440 and frontend 163/163 green afterwards; lint unchanged at the pre-existing 68 errors / 4 warnings.*
- [X] T111 Work through the full security checklist in [quickstart.md §7](./quickstart.md#7-security-checks): cross-member isolation, ignored `its_no`, cross-role refusal, unauthenticated photo access, magic-byte rejection, oversize rejection, deactivated-account indistinguishability — *every item in quickstart §7 was already covered by an automated test — isolation and the ignored ITS number in `memberProfile.test.ts`, cross-role refusals in `memberForcedPasswordChange.test.ts` and `memberAdmin.test.ts`, unauthenticated/magic-byte/oversize photo rejection in `memberPhoto.test.ts`, deactivated indistinguishability in `memberAuth.test.ts`, exports in `memberHealthPrivacy.test.ts`. The error path was **not** covered; `sensitiveOutput.test.ts` now covers it (15 tests). quickstart §7 annotated with the test behind each item*
- [X] T112 Confirm no password, health value or image byte appears in any log line, error message or stack trace (FR-015, FR-066) — *the backend contains **no `console.*` call at all** outside its tests, and a test asserts that by walking `src/`. Route handlers and the terminal error handler in `server.ts` return fixed strings, so a mysql2 error — whose `sql` property carries the interpolated values, health data included — can reach neither a log nor a response. Pinned by tests for passwords, image bytes and SQL/stack giveaways*
- [X] T113 Wire up the existing but uncalled `POST /auth/refresh` and add a 401 interceptor to `frontend/src/features/api/api.ts`, so a long profile session does not silently expire — the risk recorded in [plan.md](./plan.md#risks) — *`baseQueryWithReauth` in `features/api/api.ts` plus `setToken` in `authSlice`. One in-flight refresh shared across simultaneous 401s; `/auth/login`, `/auth/refresh` and `/auth/logout` excluded so a wrong password is not retried; a failed refresh clears the session, which is the correct outcome for a member whose own password change revoked it (FR-022). 7 tests in `reauth.test.tsx`*
- [X] T114 [P] Update `API_DOCUMENTATION.md` with the member endpoints and the two extended ones, per that file's own change procedure — *`API_DOCUMENTATION.md` — the member role and `pwdAt` claim, the eight member endpoints, the mount-order constraint, and the three extended existing endpoints, at the register that file already uses*
- [X] T115 [P] Update `DATABASE.md` with the 20 new tables and the note that none of it lives in `ensureSchema.ts` — *`DATABASE.md` — the 20 tables by group, the five empty lookups, the explicit-collation and generated-column pitfalls, and that none of it runs through `ensureSchema.ts`*
- [X] T116 [P] Update `PROJECT_CONTEXT.md` (add the Member role and module) and `BUSINESS_RULES.md` (member data ownership and isolation) — *`PROJECT_CONTEXT.md` (Member role, flows, routes, `/members` API group) and `BUSINESS_RULES.md` (a Membership section covering data ownership and isolation, member-only password rules, saving semantics and the Tab 8 consistency rule)*
- [X] T117 [P] Add a `CHANGELOG.md` entry covering the module, the 20 new tables and the newly added login throttling — *`CHANGELOG.md` — the module, 20 new tables, the newly added login throttling, the refresh interceptor, the fact that the project previously had no tests at all, and the five outstanding items*
- [X] T118 Move the three approved scripts from `database/` into `database/` under that directory's naming convention, dropping the `.draft` suffix — *moved to `database/membership_schema.sql`, `membership_seed.sql` and `membership_rollback.sql`. Content unchanged apart from two comment lines that named the old filenames. Every reference updated across 9 files — PHRs excluded, since they record what was true when written*
- [X] T119 Rehearse [../../database/membership_rollback.sql](../../database/membership_rollback.sql) on the local copy, then confirm the T008 row counts and the Phase 3 suite both still match — ***rehearsed on the local copy**, with a `mysqldump` taken first (`database/local-dev/dumps/pre-rollback-rehearsal-20261030-102621.sql`). 33 tables → 13; the dormant `members` table correctly untouched; exact `COUNT(*)` **and** `CHECKSUM TABLE` on all 13 pre-existing tables identical before and after, so no row changed rather than merely no count; the backend starts against the rolled-back database and Party and Admin sign-in both return 401 on a wrong password with the original message. Re-applied schema + seed: 33 tables, every one `utf8mb4_general_ci`, five lookups still empty, 391 tests green. **Two findings, both recorded in quickstart §8**: member login returns 500 if the frontend still offers the Member option, so the frontend must be rolled back first or together; and the automated suite cannot run while the module is rolled back, because `globalSetup` creates member fixtures for the whole run*
- [ ] T120 Execute the production release sequence in [quickstart.md §9](./quickstart.md#9-production-release), including a **verified** backup restore and an immediate post-deploy smoke test of Party login
- [ ] T121 Provision a small pilot roster, confirm first login, forced change and a profile save end to end, and only then provision the full roster
- [ ] T122 Run `/sp.constitution`, so the Constitution Check gate in [plan.md](./plan.md#constitution-check) can actually be evaluated next time
- [ ] T123 Run `/sp.adr member-authentication-and-storage` to record the three significant decisions
- [X] T124 Decide and document a retention position for the profile of a member who leaves — FR-007 retains the data, but for how long is undecided — ***decided: deactivate and retain indefinitely.** Documented in `BUSINESS_RULES.md` → Membership → Member data retention, with the reasoning and the accepted privacy cost, and summarised in `CHANGELOG.md`. Deletion on request is a manual database operation today*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: no dependencies
- **Phase 2 Foundational**: needs Phase 1. **Blocks every user story.** Touches no authentication file by design
- **Phase 3 (US1)**: needs Phase 2. **Blocks Phase 5** — this is the safety gate
- **Phase 4 (US2)**: needs Phase 2. Independent of Phases 3 and 5, since it touches neither `authenticate()` nor the `Role` union
- **Phase 5 (US3)**: needs Phase 2 **and Phase 3 green**
- **Phase 6 (US4)**: needs Phase 5 (a member must be able to sign in) and Phase 4 or a SQL-seeded account
- **Phase 7 (US5)**: needs Phase 6 (the tab shell and save pipeline)
- **Phase 8 (US6)**: needs Phase 6. Independent of Phase 7
- **Phase 9 Polish**: needs every story you intend to ship

### User Story Dependencies

The spec's stories are not fully independent, and saying so is more useful than pretending otherwise:

- **US1** stands alone. It is a verification story, not a build
- **US2** stands alone after Phase 2
- **US3** needs an account, from US2 or seeded by hand
- **US4** needs US3 — you cannot fill a profile you cannot reach
- **US5** and **US6** both need US4's shell and save pipeline, and are **independent of each other**

### Within Each Story

Tests first and failing → backend service → routes → UI primitives → tab components → re-run regression.

### Parallel Opportunities

- Phase 1: T002–T005 together
- Phase 2: T009, T010, T012, T013, T017 together; T014–T016 are sequential
- Phase 3: T019–T024 all together — six independent test files
- Phase 4: T027–T030 together; T034 alongside T031–T033
- Phase 5: T038–T043 together; T047 alongside T044–T046; T056 alongside the UI tasks
- Phase 6: T058–T063 together; the six UI primitives T072–T077 together; T080 and T081 together
- Phase 7: T083–T086 together; all seven of T087–T093 together
- Phase 8: T096–T100 together; T105–T108 together
- Phase 9: T114–T117 together
- **Phase 4 can run in parallel with Phases 3 and 5 entirely**, by different people

---

## Parallel Example: User Story 1

```bash
# Six independent regression test files — the whole safety net at once:
Task: "Party login regression test in backend/src/__tests__/regression/authExistingRoles.test.ts"
Task: "Coordinator fallthrough test in backend/src/__tests__/regression/authCoordinatorFallthrough.test.ts"
Task: "Admin and Zonal Head tests in backend/src/__tests__/regression/authAdminZonal.test.ts"
Task: "Change-password test in backend/src/__tests__/regression/changePasswordExisting.test.ts"
Task: "Party scoping test in backend/src/__tests__/regression/partyScoping.test.ts"
Task: "Login page render test in frontend/src/pages/LoginPage.test.tsx"
```

## Parallel Example: User Story 4

```bash
# All six new UI primitives — separate files, no shared state:
Task: "Create frontend/src/components/ui/Tabs.tsx"
Task: "Create frontend/src/components/ui/Textarea.tsx"
Task: "Create frontend/src/components/ui/RadioGroup.tsx"
Task: "Create frontend/src/components/ui/YesNoField.tsx"
Task: "Create frontend/src/components/ui/DatePicker.tsx"
Task: "Create frontend/src/components/ui/ImageUpload.tsx"
```

---

## Implementation Strategy

### MVP: through Phase 6

Unusually, the MVP here is **four P1 stories, not one**. US1 is a verification gate that ships
nothing, US2 produces accounts nobody can use yet, and US3 produces a login that reaches an
empty page. The first increment with standalone value is Phase 6 — a member signs in, is forced
to set a password, and records their core identity.

1. Phases 1–2: harness, utilities, schema
2. Phase 3: the safety net — **stop and confirm green**
3. Phase 4: provisioning
4. Phase 5: sign-in and forced change — **re-run Phase 3**
5. Phase 6: Tabs 1 and 3 — **stop, validate, demo**

### Incremental Delivery

1. Foundation → Phase 3 green → authentication is safe to touch
2. Phases 4 + 5 → a member can sign in and set a password → demo
3. Phase 6 → core identity → **MVP, deployable**
4. Phase 7 → six more tabs → demo
5. Phase 8 → the last four tabs → demo
6. Phase 9 → hardening and release

### Parallel Team Strategy

1. Everyone on Phases 1–2
2. Then split: developer A takes Phase 3 then Phase 5 (authentication); developer B takes Phase 4 (provisioning) in parallel; developer C starts the Phase 6 UI primitives against the contract, before the API lands
3. Converge on Phase 6, then split Phases 7 and 8 — they are genuinely independent
4. Everyone on Phase 9

---

## Notes

- **Re-run Phase 3 after every task that touches `backend/src/services/authService.ts`, `backend/src/routes/authRoutes.ts` or `backend/src/middleware/auth.ts`.** T046 is the one that matters most
- T018 is blocked on you supplying **five** lookup lists. It blocks no other task — FR-095 means the rest of the profile works without them
- The 18 assumptions in [spec.md](./spec.md#assumptions) still need sign-off; items 5–18 are proposals, and changing one changes the tasks that implement it
- `[P]` means different files with no dependency on incomplete work
- No task modifies an existing table, so FR-106 holds throughout
- Commit after each task or logical group; stop at any checkpoint to validate independently

---

## Summary

| Phase | Story | Tasks | Count |
|---|---|---|---|
| 1 | Setup | T001–T008 | 8 |
| 2 | Foundational | T009–T018 | 10 |
| 3 | US1 — Existing users unaffected (P1) | T019–T026 | 8 |
| 4 | US2 — Provisioning (P1) | T027–T037 | 11 |
| 5 | US3 — Sign-in and forced change (P1) | T038–T057 | 20 |
| 6 | US4 — Core identity (P1) | T058–T082 | 25 |
| 7 | US5 — Single-entry sections (P2) | T083–T095 | 13 |
| 8 | US6 — Repeatable records (P2) | T096–T109 | 14 |
| 9 | Polish | T110–T124 | 15 |
| | **Total** | | **124** |

**Test tasks**: 31 of 124. **Parallel tasks**: 66 marked `[P]`.
