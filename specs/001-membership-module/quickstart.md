# Quickstart — Membership Module

**Feature**: `001-membership-module` · **Date**: 2026-10-29

How to apply, verify, demonstrate and if necessary reverse this module. Written for whoever
executes Stage 2, which has not started — **nothing here has been run.**

The ordering is not arbitrary: §2 (the regression baseline) comes before any change to
`authService.ts`, because a test written after the change cannot tell you what the behaviour
was before it.

---

## 0. Local environment

```bash
# Backend  (http://localhost:4000)
npm run dev:backend

# Frontend (http://localhost:5173, proxies /api to :4000)
npm run dev:frontend
```

`backend/.env` is required and gitignored — `backend/src/config/env.ts` throws at startup
listing every missing variable. Copy `backend/.env.example` and fill in `DB_HOST`, `DB_NAME`,
`DB_USER`, `DB_PASS`, `JWT_SECRET`. The loader rejects placeholder secrets (`change_me`,
`secret`, `test`, …) and warns below 32 characters.

**Point `DB_*` at a restored copy of production, never at production.**

---

## 1. Capture the before-state (do this first)

SC-013 requires proof that no existing record changed, and FR-106 requires that to be true.
Neither can be shown after the fact, so capture it now.

```bash
# 1. Full backup — iterates SHOW TABLES, so it captures everything including new tables later
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:4000/api/v1/import-export/database-backup \
  -o "before-membership-$(date +%Y%m%d-%H%M%S).sql"
```

```sql
-- 2. Row counts. Keep this output; §4 and the rollback script compare against it.
SELECT 'admins' AS t, COUNT(*) AS n FROM admins
UNION ALL SELECT 'zones',               COUNT(*) FROM zones
UNION ALL SELECT 'mohallahs',           COUNT(*) FROM mohallahs
UNION ALL SELECT 'parties',             COUNT(*) FROM parties
UNION ALL SELECT 'venues',              COUNT(*) FROM venues
UNION ALL SELECT 'miqaats',             COUNT(*) FROM miqaats
UNION ALL SELECT 'schedules',           COUNT(*) FROM schedules
UNION ALL SELECT 'schedule_edits',      COUNT(*) FROM schedule_edits
UNION ALL SELECT 'ratings',             COUNT(*) FROM ratings
UNION ALL SELECT 'performance_ratings', COUNT(*) FROM performance_ratings
UNION ALL SELECT 'party_venue_history', COUNT(*) FROM party_venue_history
UNION ALL SELECT 'refresh_tokens',      COUNT(*) FROM refresh_tokens
UNION ALL SELECT 'members_dormant',     COUNT(*) FROM members;

-- 3. Server version — the migration aborts below 5.7 (research R6)
SELECT VERSION();

-- 4. Does the dormant members table hold anything? Recorded for the record;
--    this module neither reads nor writes it.
SELECT COUNT(*) AS dormant_member_rows FROM members;
```

---

## 2. Stand up the test harness and the regression baseline

**Before touching `backend/src/services/authService.ts`.**

```bash
# Backend
cd backend
npm i -D vitest supertest @types/supertest

# Frontend
cd ../frontend
npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Write and run the Party-login regression tests **now**, against the unmodified code, and record
that they pass:

| Test | Guards |
|---|---|
| Party signs in by ITS Number and receives a token with `role: "party"`, `partyId`, `zoneId` | FR-102 |
| Party with a wrong password gets 401 and the existing message | FR-102 |
| Unknown ITS Number gets 401, not 500 | FR-102 |
| Admin, Zonal Head and Coordinator each sign in and receive their existing claims | FR-103 |
| Coordinator resolves through the `venues` JOIN `mohallahs` path | FR-103 |
| Party changes its password through the existing endpoint | FR-104 |
| Party reads only its own published schedule rows | FR-105 |

That last coordinator test matters more than it looks: `authenticate()` currently reaches the
venue query by **falling through** every other branch, with no `role === "coordinator"` check
(`authService.ts:113`). The `member` branch is being inserted directly above it. This test is
what proves the insertion did not capture coordinator logins.

Re-run this whole set after every step in §3 and §5.

---

## 3. Apply the schema

```bash
cd database   # from the repository root

# Through the mysql CLI — the scripts use DELIMITER, which drivers do not parse
mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < membership_schema.sql
mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < membership_seed.sql
```

Both are idempotent, so a partial run can be repeated.

**Expected output:**

- `001` — `new_tables_created = 20`; the `bmi` column reports `EXTRA = 'VIRTUAL GENERATED'`.
- `002` — `sanads` 10 rows with 0 draft; `marital_statuses` 4; `tamreen_frequencies` 6; `tamreen_methods` 7; `skills` 45; and **`titles`, `sharafs`, `halqas`, `mozes`, `places` all 0**.

Those five zeros are intentional — see
[data-model.md §5](./data-model.md#5-new-lookup-tables). Supply the authoritative values with:

```sql
INSERT INTO titles (title_name, display_order, is_active, is_draft)
VALUES ('<your value>', 1, 1, 0);
```

**Do not add any of this to `backend/src/db/ensureSchema.ts`.** That runs before `app.listen`,
so a failed `ALTER` blocks startup, and `DATABASE.md:98-102` forbids it without design approval.

---

## 4. Confirm nothing existing changed

Re-run the §1 row counts. **Every number must be identical.** The migration contains no
`ALTER`, `DROP`, `UPDATE` or `DELETE` against an existing table, so any difference means
something else ran.

```sql
-- The one existing table the module reads from. It must be unchanged.
SELECT COUNT(*) AS miqaats_rows FROM miqaats;

-- The dormant table must be exactly as recorded in §1.
SELECT COUNT(*) AS dormant_member_rows FROM members;
```

Then re-run §2. All of it must still pass.

---

## 5. Build order

Each step is independently verifiable. Re-run §2 after each.

| # | Step | Verify |
|---|---|---|
| 1 | `calculateHijriParts` added to `frontend/src/utils/hijriDate.ts`; `calculateHijriDate` untouched | New unit tests pass; `MiqaatsPage` still shows the same Hijri string |
| 2 | Port to `backend/src/utils/hijriDate.ts` | **The same test vectors pass against both copies** — this is what stops them drifting |
| 3 | `Role` union gains `member` in `backend/src/middleware/auth.ts:6` **and** `frontend/src/types.ts:1` | `tsc -b` fails until `AppShell`'s `navByRole: Record<Role, NavItem[]>` gains a member entry — a useful forced reminder |
| 4 | `member` branch in `authenticate()`, **inserted above line 113** | §2 passes, especially the coordinator test |
| 5 | `requireMember` middleware | Inactive account → 403; outstanding password change → 403 `PASSWORD_CHANGE_REQUIRED`; token older than `password_changed_at` → 401 |
| 6 | `member` branch in `changePassword` + role guard at `authRoutes.ts:51` | §2's party password test still passes; member change clears the flag and sets `password_changed_at` |
| 7 | Login throttling | Repeated failures return 429 with `Retry-After`, identically for existing and non-existent ITS Numbers |
| 8 | Login page `roleOptions`, `defaultPathByRole`, `ProtectedRoute`, nav | Member reaches the profile; the four existing roles are unaffected |
| 9 | UI primitives: Tabs, Textarea, RadioGroup, YesNo, MultiSelect, DatePicker, ImageUpload, RepeatableRows | Render tests; existing `Button`/`Card`/`Input`/`Select` untouched |
| 10 | `GET /members/lookups` + admin lookup maintenance | All 13 lists return; drafts carry `is_draft: true`; empty lists return `[]` |
| 11 | `GET`/`PUT /members/me/profile` | Round-trip across all 12 tabs; a validation failure writes nothing |
| 12 | Photo endpoints | §7 below |
| 13 | 12-tab form | §6 below |
| 14 | `members` entity in `importExportRoutes.ts` | Roster creates accounts; re-upload creates no duplicates and resets no chosen password |

---

## 6. Demonstrate the member journey

```bash
# 1. Provision. Reuses the existing import route, which bcrypt-hashes the password column.
curl -X POST http://localhost:4000/api/v1/import-export/members/import \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"csv":"its_no,member_name,password\n30456789,Test Member,TempPass!2026\n"}'

# 2. First sign-in. Expect user.mustChangePassword = true.
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"30456789","password":"TempPass!2026","role":"member"}'

# 3. The profile must be refused until the password is changed (FR-018).
#    Expect 403 with data.code = PASSWORD_CHANGE_REQUIRED.
curl -i http://localhost:4000/api/v1/members/me/profile \
  -H "Authorization: Bearer $MEMBER_TOKEN"

# 4. Change it.
curl -X POST http://localhost:4000/api/v1/auth/change-password \
  -H "Authorization: Bearer $MEMBER_TOKEN" -H "Content-Type: application/json" \
  -d '{"current_password":"TempPass!2026","new_password":"CorrectHorseBattery7","confirm_password":"CorrectHorseBattery7"}'

# 5. The OLD token must now be rejected (FR-022). Expect 401.
curl -i http://localhost:4000/api/v1/members/me/profile \
  -H "Authorization: Bearer $MEMBER_TOKEN"

# 6. Sign in again, then the profile opens.
```

Then in the browser: select **Member**, sign in, change the password, and work through all
twelve tabs.

**Check by hand, because these are the things tests miss:**

- Pick a Gregorian date of birth → the Hijri date appears and **cannot be typed over** (FR-039).
- Choose a Zone → the Party list narrows; change the Zone → a now-invalid Party clears (FR-048).
- Enter height and weight → BMI appears, read-only; clear either → BMI disappears (FR-064).
- Occupation Type Job → Designation appears; Business → it goes and the label changes (FR-052).
- Hifz Sanad No → Sanad not required; Yes → it is (FR-059).
- Karachi Tamreen No → Reason becomes required (FR-081).
- Khidmat Type Sansta / Umoor / Both → the right name fields appear (FR-086).
- First Prefix None → no Prefix on Tab 2; Sheikh → it appears (FR-043).
- **Type into Tab 1, switch to Tab 7, come back → the text is still there** (FR-026).
- Try to leave with unsaved edits → warned (FR-027).
- Add three Titles, edit one, delete one, save → exactly the expected rows survive (FR-046).
- Set a visited place to 3 times with 2 years → refused, naming the place and both counts (FR-073).
- Open the Tab 9 Hijri year list → runs 1400 to the current Hijri year, no further (FR-076).
- Lists for Title, Sharaf, Halqa and Moze are empty → the tab explains it and the rest still saves (FR-095).
- Seeded values show as `DRAFT — NEEDS REVIEW` (FR-094).
- At 375px wide, every tab is usable and the tab strip stays reachable (FR-025).

---

## 7. Security checks

These are the ones worth being thorough about.

Every item below is also covered by an automated test, so this section is a way to confirm the
deployed instance behaves like the test suite — not the only place the property is checked. Run
`npm test` in `backend/` first; if any of these curl commands disagrees with the suite, the
environment differs from the test environment and that is the thing to investigate.

| Check | Automated by |
|---|---|
| Cross-member isolation | `memberProfile.test.ts` → "isolation between members" |
| Submitted `its_no` ignored | `memberProfile.test.ts` → "ignores a submitted ITS number" |
| Body cannot redirect to another member | `memberProfile.test.ts` → "cannot be redirected to another member by a body field" |
| Party token refused on member routes | `memberForcedPasswordChange.test.ts`, `memberPhoto.test.ts` |
| Member token refused on admin routes | `memberAdmin.test.ts`, `memberProvisioning.test.ts` |
| Unauthenticated photo access | `memberPhoto.test.ts` → "refuses an unauthenticated read" / "upload" |
| Magic-byte rejection | `memberPhoto.test.ts` (3 tests), `imageValidation.test.ts` |
| Oversize rejection (413) | `memberPhoto.test.ts` → "rejects an oversized image with 413" |
| Deactivated account indistinguishable | `memberAuth.test.ts`, `sensitiveOutput.test.ts` |
| Health and photos absent from exports | `memberHealthPrivacy.test.ts` (8 tests) |
| Nothing sensitive in an error or a log | `sensitiveOutput.test.ts` (15 tests) |

```bash
# Member A must not read member B's profile. No endpoint takes a member id, so the
# test is that the token alone decides whose data comes back (FR-097, FR-098).
curl http://localhost:4000/api/v1/members/me/profile -H "Authorization: Bearer $MEMBER_A_TOKEN"
curl http://localhost:4000/api/v1/members/me/profile -H "Authorization: Bearer $MEMBER_B_TOKEN"
# Two different profiles.

# Submitting someone else's ITS Number must be ignored, not honoured (FR-034).
curl -X PUT http://localhost:4000/api/v1/members/me/profile \
  -H "Authorization: Bearer $MEMBER_A_TOKEN" -H "Content-Type: application/json" \
  -d '{"its_no":"99999999","name":"Changed"}'
# A's profile updates; its_no is unchanged.

# A Party token must not reach member routes (FR-100). Expect 403.
curl -i http://localhost:4000/api/v1/members/me/profile -H "Authorization: Bearer $PARTY_TOKEN"

# A member token must not reach admin routes. Expect 403.
curl -i http://localhost:4000/api/v1/members -H "Authorization: Bearer $MEMBER_TOKEN"

# Photo must not be reachable unauthenticated (FR-090). Expect 401.
curl -i http://localhost:4000/api/v1/members/me/photo

# A non-image renamed to .jpg must be rejected on its magic bytes (FR-089). Expect 400.
printf 'not an image' | base64 | xargs -I{} curl -X PUT \
  http://localhost:4000/api/v1/members/me/photo \
  -H "Authorization: Bearer $MEMBER_TOKEN" -H "Content-Type: application/json" \
  -d '{"content_type":"image/jpeg","data_base64":"{}"}'

# Over 2MB must be rejected (FR-088). Expect 413.

# Deactivated account must be refused, with the SAME message as a wrong password,
# so account state is not disclosed (FR-007, FR-013).
```

```sql
-- Health values and photographs must not appear in any general export (FR-066, FR-101).
-- Run each existing export and grep the output:
--   height_cm, weight_kg, bmi, blood_group, image_data, password_hash
-- None may appear.

-- Passwords must never be exported readable (FR-015).
-- The members export follows the existing convention of emitting '' AS password.
```

Also confirm by inspection: no log line, error message or stack trace carries a password, a
health value or image bytes (FR-015, FR-066).

As of T112 this holds structurally rather than by care: **the backend makes no `console.*`
call at all** outside its tests, and `sensitiveOutput.test.ts` asserts that by walking `src/`.
Both the route handlers and the terminal error handler in `server.ts` return fixed strings.

That matters more than it first appears. `mysql2` interpolates named placeholders client-side,
so a failed query produces an error whose `sql` property contains the values being written —
health values included. Were such an error logged or returned, every guarantee about health
data would be void on exactly the request where something went wrong.

The trade-off is deliberate but worth stating: a production failure therefore leaves no
diagnostic trail. If logging is ever added, the test above fails and whoever adds it has to
decide explicitly what a log line is allowed to say.

---

## 8. Rollback

```bash
mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < membership_rollback.sql
```

Drops the 20 new tables and deletes `refresh_tokens` rows where `user_role = 'member'` — the
only statement in the whole set that touches an existing table, and it is scoped to rows this
module created.

**This deletes all member data.** Right while the data is test data; once real profiles exist,
prefer fixing forward.

**To disable the module without losing data**: remove `member` from the login page's
`roleOptions` and from the backend `Role` union. The module becomes unreachable, every row
survives, and it is reversible in one deploy.

**Order matters: roll the frontend back first, or at the same time.** Rehearsed on the local
copy (T119), and this is the one thing the rehearsal found. With the tables dropped but the
frontend still offering the Member option, a member signing in gets:

```
500  {"success":false,"message":"Login failed. Server error (check DB config)."}
```

The server stays up and every other role is unaffected, but that 500 is avoidable: ship the
frontend without the Member option before the database rollback, or do both in one window.

After rollback, re-run §1's counts and §2's tests. Everything must match the before-state.

### What the T119 rehearsal established

Run on the local production copy on 2026-10-30, with a `mysqldump` taken first.

| Check | Result |
|---|---|
| 20 module tables dropped | ✅ 33 tables → 13 |
| 13 pre-existing tables still present | ✅ including the dormant `members`, which the script does not touch |
| Exact `COUNT(*)` on all 13, before vs after | ✅ identical |
| `CHECKSUM TABLE` on all 13, before vs after | ✅ identical — so no row changed, not merely no row count |
| `refresh_tokens` | ✅ unchanged at 2367; there were no `user_role = 'member'` rows to delete, and the `DELETE` is the script's only non-`DROP` statement |
| Backend starts against the rolled-back database | ✅ `ensureSchema()` does not depend on any module table |
| Party and Admin sign-in | ✅ 401 on a wrong password, with the original message — not 500 |
| Re-apply `membership_schema.sql` + `membership_seed.sql` | ✅ 33 tables again, full suite green |

One limitation worth recording: **the automated suite cannot be run while the module is rolled
back.** `src/__tests__/globalSetup.ts` calls `ensureFixtures()`, which creates member fixtures
for the whole run, so with the tables gone the setup fails and no file executes — including the
regression files that have nothing to do with the module. That is why the checks above are
checksums and live endpoint calls rather than `npm test`. If the regression suite ever needs to
run against a rolled-back database, the member fixtures have to move out of `globalSetup` into
the member suites' own `beforeAll`.

---

## 9. Production release

Only after §4 and §7 pass against a restored copy, and after you have signed off the 18
assumptions in [spec.md](./spec.md#assumptions).

### Step 0 — rebuild the committed backend build artifact

**Do this first, and do not skip it.** `backend/dist` is a *committed* build artifact and
`npm start` runs `node dist/server.js`, so whatever is in `dist` at deploy time is what
production runs. The repository's own convention confirms it: commit `afe7463` updated
`src/config/env.ts` and `dist/config/env.js` together.

```bash
cd backend && npm run build     # tsc -p tsconfig.json; src/__tests__ is excluded
```

Then commit the result. Without this the deploy ships the previous build and **the entire
membership module is absent from production** — the login page would offer Member while every
`/api/v1/members` route returned 404, and `role: "member"` would fall through to the
venue/coordinator query.

Verify the artifact before trusting it:

```bash
node dist/server.js
curl -s -o /dev/null -w '%{http_code}
' localhost:4000/api/v1/members/lookups   # 401, not 404
```

401 means the route is mounted and the auth middleware ran. 404 means `dist` is stale.

The frontend needs no equivalent step: `frontend/dist` is gitignored and Vercel builds it.

### The sequence

1. Take a fresh production backup and **verify it restores**. An unverified backup is not a backup.
2. Record the §1 row counts from production.
3. Apply **`database/membership_live_update.sql`** during low usage — one script, both parts, with the verification built in:

   ```bash
   mysql -h <host> -u <user> -p <database> < database/membership_live_update.sql > run.log 2>&1
   ```

   Keep `run.log`. It contains a BEFORE and an AFTER table of every existing table's row
   count; they must match line for line. It also refuses to run at all unless `parties` and
   `zones` exist, so it cannot be pointed at the wrong database by mistake, and it is
   idempotent, so an interrupted run can simply be repeated.

   (`membership_schema.sql` and `membership_seed.sql` remain the maintained sources. The
   combined file is generated from them by `node database/build_live_update.mjs`, and a test
   fails if it is ever out of date.)
4. Re-run the §1 counts — identical.
5. Deploy backend, then frontend. The backend is backward compatible, so the order is not critical, but this way the API is ready before any UI calls it. (On the way *back*, the order does matter — see §8.)
6. **Immediately smoke-test Party login on production**, plus one Admin, Zonal Head and Coordinator sign-in. This is the regression that matters most and it takes two minutes.
7. Provision a small pilot roster, not the full list. Confirm first login, forced password change and a profile save end to end.
8. Then provision the rest.

**Before any of this, confirm how Render builds the backend.** If its build command does run
`npm run build`, step 0 is belt-and-braces. If it does not — which the committed `dist` implies —
step 0 is the difference between a working release and a silent no-op. This has not been
verified from the Render dashboard.

**Still outstanding from before this feature** (`CHANGELOG.md`, not caused by this module and
not fixed by it): the DB password, the admin password and the old `change_me` JWT secret remain
in git history and rotation has not been performed. Worth doing alongside this release.
