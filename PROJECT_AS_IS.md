# Project As-Is — MPSS / Zakereen Allocation

**Inspected**: 2026-10-29 · **Branch at inspection**: `master` @ `afe7463` · **Purpose**: establish the verified current state before the Membership Module (`specs/001-membership-module/`) is designed.

This document records what the live system actually contains, with file and line references,
and specifically where that **differs from the assumptions in the Membership Module request**
(`Documentation/claude_membership_module_prompt.md`).

`ARCHITECTURE.md`, `DATABASE.md`, `API_DOCUMENTATION.md` and `BUSINESS_RULES.md` were checked
against the source and are accurate. This document does not restate them; it adds the
membership-relevant findings and the integration points.

Nothing under `backend/`, `frontend/` or `database/` was modified in producing it.

---

## 1. Headline findings

| # | Finding | Consequence for the Membership Module |
|---|---|---|
| 1 | The login page **already has a role dropdown** with four options | "Member" is one entry plus a redirect branch, not a new page |
| 2 | `authenticate()` is an if-chain that **falls through to the coordinator query** with no role check | A `member` branch must be inserted *before* the fallthrough |
| 3 | A `members` table exists but **no application code references it** | Decided: leave untouched, create new tables |
| 4 | **Sharaf, Asbaq/Halqa, Moze and Title tables do not exist** | Four "reuse the existing table" requirements are unimplementable as written |
| 5 | `miqaats` is the **scheduling calendar** — majlis sessions of one Hijri year | Tab 8 records *places visited* and is unrelated to it; the two share only a word |
| 6 | Hijri conversion is **frontend-only and returns a display string** | Hijri DOB storage, the Tab 9 year range and server-side validation all need numeric parts |
| 7 | **No photo upload capability of any kind**, and the host filesystem is ephemeral | Decided: image bytes in MySQL behind an authenticated endpoint |
| 8 | **No `password_change_required` flag** anywhere; `last_login_at` is rewritten every login | Forced first-login change needs a new explicit flag |
| 9 | **No rate limiting, no password policy, no test infrastructure** | Three of the request's security/testing asks are greenfield |
| 10 | The UI kit is **four components** | Tabs, textarea, radio, yes/no, multi-select, date picker, image upload and row editors are all net-new |

---

## 2. Stack and conventions

| Layer | Detail |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Redux Toolkit (RTK Query) + React Router 6 + Tailwind 3. Pure client-side SPA — one HTML file, no server-rendered templates |
| Backend | Express 5 + TypeScript (CommonJS), `mysql2/promise`, `jsonwebtoken`, `bcryptjs`. No ORM; raw SQL inlined per route |
| Database | MySQL 8, InnoDB, `utf8mb4`. **Tables are `utf8mb4_general_ci`**, not the `utf8mb4_unicode_ci` that `database/mpss_mysql.sql` declares — verified against a live restore, see §5 |
| Deployment | Frontend on Vercel, backend on Render, MySQL external |

Repo is two npm projects driven by prefix scripts from the root `package.json`; there is no
workspaces field and no root lockfile.

### Database conventions to follow for new tables

From `database/mpss_mysql.sql`:

- `snake_case` throughout; **plural** table names; no table prefixes.
- PK is always `id INT UNSIGNED NOT NULL AUTO_INCREMENT`. No composite PKs.
- Display-name columns are prefixed with the entity noun: `zone_name`, `party_name`, `member_name`.
- FK column `<singular>_id`; constraint `fk_<table>_<column>`; always `ON DELETE CASCADE`.
- Index naming `uq_<table>_<cols>` and `idx_<table>_<cols>`.
- Booleans are `TINYINT(1) NOT NULL DEFAULT 0|1`, named `is_*`.
- Small enumerations are inline MySQL `ENUM(...)`, **not** lookup tables — e.g. `parties.category ENUM('A','B','C','H')`.
- Credentials are `password_hash VARCHAR(255)` plus `last_login_at DATETIME NULL`.
- Every table ends `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;` with no per-table COLLATE.
- **Most tables have no `updated_at`** — only `admins` and `zones` do. Worth deciding explicitly for new tables.

### Frontend design tokens

`frontend/tailwind.config.cjs` — reuse these rather than raw hex:

- Colours: `primary` `#1E3A5F`, `secondary` `#2E75B6`, `accent` `#7C3AED`, `success` `#059669`, `warning` `#D97706`, `danger` `#DC2626`, `surface` `#F8FAFC`, `border` `#E2E8F0`, `textPrimary` `#1F2937`, `textMuted` `#6B7280`
- Radii: `card` 12px, `button` 8px, `input` 6px · Shadow: `shadow-card`

`frontend/src/App.css` is unimported Vite starter CSS — dead file, ignore it.

---

## 3. Authentication, and the integration points

### The login page already has the dropdown

[frontend/src/pages/LoginPage.tsx:12-17](frontend/src/pages/LoginPage.tsx#L12-L17):

```tsx
const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "zonal_head", label: "Zonal Head" },
  { value: "party", label: "Party" },
  { value: "coordinator", label: "Venue Coordinator" }
];
```

The form is three controls and a submit ([:81-103](frontend/src/pages/LoginPage.tsx#L81-L103)).
The identifier label and helper text are already role-dependent
([:37-42](frontend/src/pages/LoginPage.tsx#L37-L42)) — party reads "Use your ITS No as User ID",
so Member can follow the same pattern. Post-login redirect is
`defaultPathByRole` ([:19-23](frontend/src/pages/LoginPage.tsx#L19-L23)). The footer says
"Forgot password? Contact Admin / Zonal Head." — there is no self-service reset.

### The fallthrough in `authenticate()`

[backend/src/services/authService.ts:36-142](backend/src/services/authService.ts#L36-L142)
handles `admin` ([:46](backend/src/services/authService.ts#L46)), `zonal_head`
([:67](backend/src/services/authService.ts#L67)) and `party`
([:90](backend/src/services/authService.ts#L90)) as explicit `if` blocks, then **drops through**
to the venue/coordinator query at [:113](backend/src/services/authService.ts#L113) with no
`if (role === "coordinator")` guard.

A `member` branch must therefore be added **before** line 113. The same hazard exists in
`tableForSelfServiceRole` ([:30-34](backend/src/services/authService.ts#L30-L34)), which returns
`"venues"` as its default.

Party login is self-contained at [:90-111](backend/src/services/authService.ts#L90-L111) and is
untouched by adding a sibling branch — this is what makes the no-regression requirement
achievable by construction.

### Per-role credential lookup

| Role | Table | Identifier | Line |
|---|---|---|---|
| `admin` | `admins` | `username` | [:47-50](backend/src/services/authService.ts#L47-L50) |
| `zonal_head` | `zones` | `id` if all digits, else `zone_name` | [:68-72](backend/src/services/authService.ts#L68-L72) |
| `party` | `parties` | `its_no` **only** | [:91-94](backend/src/services/authService.ts#L91-L94) |
| `coordinator` | `venues` JOIN `mohallahs` | `v.id` if all digits, else `v.venue_name` | [:113-125](backend/src/services/authService.ts#L113-L125) |

All queries use `mysql2` named placeholders — parameterised, never concatenated. Hashing is
bcrypt via `bcryptjs`, cost **10**. No plaintext comparison anywhere.

### Tokens and sessions

Stateless JWT; no server sessions, no cookies, no `express-session`.

- Claims — [backend/src/middleware/auth.ts:8-15](backend/src/middleware/auth.ts#L8-L15): `{ sub: "role:id", role, id, zoneId?, partyId?, venueId? }`.
- Access token `JWT_EXPIRES_IN`, default `1d`; refresh `REFRESH_TOKEN_EXPIRES_IN_DAYS`, default `7` ([backend/src/config/env.ts](backend/src/config/env.ts)).
- Refresh tokens are 48 random bytes stored only as a SHA-256 hex digest in `refresh_tokens.token_hash` ([authService.ts:22-28](backend/src/services/authService.ts#L22-L28), insert at [:160-168](backend/src/services/authService.ts#L160-L168)). `refresh_tokens` is **polymorphic by `user_role` string with no FK** — it extends to a new role with no schema change.
- Client state: `localStorage` keys `mpss.token`, `mpss.refresh_token`, `mpss.user` ([frontend/src/utils/storage.ts](frontend/src/utils/storage.ts)), rehydrated at store init.

### Places `Role` must change

| What | Where |
|---|---|
| Backend union | [backend/src/middleware/auth.ts:6](backend/src/middleware/auth.ts#L6) |
| Frontend union | [frontend/src/types.ts:1](frontend/src/types.ts#L1) |
| Login options + redirect | [frontend/src/pages/LoginPage.tsx:12,19](frontend/src/pages/LoginPage.tsx#L12-L23) |
| Navigation map | `AppShell.tsx` — `navByRole: Record<Role, NavItem[]>` |
| Route guards | [frontend/src/router/AppRoutes.tsx](frontend/src/router/AppRoutes.tsx) |
| Password-change guard | [backend/src/routes/authRoutes.ts:51](backend/src/routes/authRoutes.ts#L51) |

The two `Role` unions are **duplicated and must be kept in sync by hand**. One mitigation is
already built in: because `navByRole` is typed `Record<Role, NavItem[]>`, adding a member to the
union makes the compiler demand a nav entry.

### Enforcement model

`requireAuth` + `requireRole` — [backend/src/middleware/auth.ts:23-43](backend/src/middleware/auth.ts#L23-L43).
Row-level scoping is always derived from JWT claims, never from client input. The pattern to
copy for member isolation, from [backend/src/routes/schedulesRoutes.ts:41-45](backend/src/routes/schedulesRoutes.ts#L41-L45):

```ts
if (user.role === "party") {
  conditions.push("s.party_id = :party_id");
  conditions.push("s.is_published = 1");
  params.party_id = user.partyId;
}
```

On the frontend, [ProtectedRoute.tsx](frontend/src/router/ProtectedRoute.tsx) gates on the
*presence* of the user object in `localStorage`, not on token validity — an expired JWT still
renders the shell and only fails at the API layer. Role access is encoded in **three** places
(`navByRole`, `AppRoutes` guards, backend `requireRole`); only the third is authoritative, and
the first two drift silently.

### Password change as it exists today

[backend/src/routes/authRoutes.ts:51-72](backend/src/routes/authRoutes.ts#L51-L72) →
`changePassword()` at [authService.ts:208-233](backend/src/services/authService.ts#L208-L233).
Guarded for `["zonal_head", "party", "coordinator"]` — **admin is excluded** and can only be
changed directly in the database. Verifies the current password, re-hashes at cost 10, updates
by `req.user.id` from the token, so there is no IDOR. UI is
[frontend/src/pages/ChangePasswordPage.tsx](frontend/src/pages/ChangePasswordPage.tsx).

---

## 4. Gaps relative to the request

### No forced-first-login mechanism

No `password_change_required`, `must_change_password` or equivalent column exists on any
account table. `last_login_at` is overwritten on **every** login
(e.g. [authService.ts:100](backend/src/services/authService.ts#L100)), so it cannot stand in for
"first login". An explicit flag is required.

### No password policy

`changePassword` only does `.trim()` non-empty
([authService.ts:215-217](backend/src/services/authService.ts#L215-L217)). No length, no
complexity, no reuse check. It also **does not revoke sessions** after a change — existing JWTs
and refresh rows stay valid until they expire.

### No rate limiting or lockout

No `express-rate-limit`, no attempt counter, no lockout column, no CAPTCHA, no failure delay.
`POST /auth/login` ([authRoutes.ts:9](backend/src/routes/authRoutes.ts#L9)) is unthrottled while
running bcrypt cost 10 per attempt. No `helmet`. No failed-attempt logging. CORS is an explicit
allowlist, but requests with **no** Origin header are allowed
([backend/src/server.ts:29](backend/src/server.ts#L29)).

### No photo upload, and an ephemeral filesystem

- No `express.static`, no `multer` or any multipart middleware, no storage SDK.
- No `uploads/`, `storage/` or media directory; no BLOB, `photo` or `*_path` column in any table.
- The only file input in the app is CSV, and it never leaves the browser as a file — it is read to text client-side and POSTed as a JSON string ([frontend/src/pages/modules/ImportExportPage.tsx:232](frontend/src/pages/modules/ImportExportPage.tsx#L232), parsed by a hand-rolled `parseCsv` in `importExportRoutes.ts`).
- The only size limit anywhere is `express.json({ limit: "5mb" })` ([server.ts:34](backend/src/server.ts#L34)) — relevant if photos are submitted base64-encoded.
- `server.ts` reads `RENDER_GIT_COMMIT` / `RAILWAY_GIT_COMMIT_SHA` ([:19-24](backend/src/server.ts#L19-L24)), i.e. a PaaS host. Local-disk writes would not survive a redeploy.

### No test infrastructure at all

No vitest, jest, supertest or testing-library in any `package.json`; no test or spec file
anywhere; no CI config. The frontend has ESLint only. The request's "add tests … and Party
Login regression" therefore requires standing up a harness first — a prerequisite task, not a
line item.

### The UI kit is four components

`frontend/src/components/ui/` — `Button.tsx`, `Card.tsx`, `Input.tsx`, `Select.tsx`. Layout is
`components/layout/AppShell.tsx` (sidebar + header + `<Outlet/>` + mobile bottom nav) and
`RoleAvatar.tsx`.

A 12-tab form needs, as net-new primitives: a tab container, textarea, radio group, yes/no
toggle, multi-select, date picker, image upload with preview, and a repeatable-row editor.

### No project principles to check against

`.specify/memory/constitution.md` is still an unfilled `[PRINCIPLE_N_NAME]` template. The
`specs/` and `history/` directories referenced by `CLAUDE.md` did not exist before this feature.

---

## 5. Current schema

`database/mpss_mysql.sql` — 13 tables, one seed row. Four login identities each carry their own
`password_hash` + `last_login_at`: `admins`, `zones` (zonal_head), `parties`, `venues`
(coordinator). `mohallahs` also has `password_hash` but **no login path exists for it** — legacy.

| Table | Membership relevance |
|---|---|
| `zones` | ✅ Tab 3 Zone source. `id`, `zone_name` UNIQUE |
| `parties` | ✅ Tab 3 Party source. `its_no` VARCHAR(20) NOT NULL UNIQUE, `zone_id` FK → `zones`, `party_name`, `category`, `is_active` |
| `mohallahs` | ✅ Tab 9 Mohallah source. `zone_id` FK, UNIQUE `(zone_id, mohallah_name)` |
| `miqaats` | ⚠️ see below |
| `members` | ⚠️ see below |
| `refresh_tokens` | ✅ extends to a `member` role with no schema change |
| `admins`, `venues`, `schedules`, `schedule_edits`, `ratings`, `performance_ratings`, `party_venue_history` | Not used by this module; must remain untouched |

### The dormant `members` table

[database/mpss_mysql.sql:70-81](database/mpss_mysql.sql#L70-L81):

```sql
CREATE TABLE IF NOT EXISTS members (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  party_id INT UNSIGNED NOT NULL,
  member_name VARCHAR(100) NOT NULL,
  its_number VARCHAR(20) NULL,
  member_type ENUM('Leader','Co-Leader','Member') NOT NULL DEFAULT 'Member',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_members_its_number (its_number),
  KEY idx_members_party_id (party_id),
  CONSTRAINT fk_members_party_id FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

A case-insensitive grep for `member` across `backend/src` and `frontend/src` returns **zero
hits**: no route, no service, no UI, no export. Three problems with reusing it:

1. **No auth columns** — no `password_hash`, no `last_login_at`, no change-required flag.
2. **`party_id` is NOT NULL**, which forces every member into a party at creation time. Tab 3 has the member choosing their own Zone and Party, and `/sp.specify` assumption 16 allows a member to belong to none.
3. **`its_number` here vs `its_no` on `parties`** — two spellings for the same concept, and the `members` one is *nullable* UNIQUE, so multiple NULLs are permitted.

**Decision taken: leave it untouched and create new tables.** Its contents in production cannot
be verified from the repo, so altering it carries risk for no benefit.

### `miqaats` is the scheduling calendar, and is unrelated to Tab 8

[database/mpss_mysql.sql:104-112](database/mpss_mysql.sql#L104-L112) — `miqaat_name`,
`english_date DATE NOT NULL`, `hijri_date VARCHAR(50) NULL`, `is_active`. Rows are *dated
occurrences* used by `schedules`, with `idx_miqaats_date(english_date)` and **no unique key on
name or date** (the CSV importer dedupes by name+date in application code, not by constraint).

Tab 8 records the **places a member has visited**, with how many times and in which years —
confirmed by the project owner. That is a different kind of thing from a dated majlis session,
so the two are unrelated and Tab 8 gets its own `places` lookup.

For what the rows actually look like, see
[database/local-dev/before-state-baseline.md](database/local-dev/before-state-baseline.md).

Also note `hijri_date` is **free-text and user-editable** in the UI
([frontend/src/pages/modules/MiqaatsPage.tsx:163](frontend/src/pages/modules/MiqaatsPage.tsx#L163)
— "Hijri Date (editable)"), so it is not a reliable sort or filter key, and no numeric Hijri
year, month or day is stored anywhere in the system.

### Tables the request assumed exist

Verified absent — no table, no column, no code reference:

| Assumed | Request reference |
|---|---|
| Sharaf | "the existing Sharaf table" |
| Asbaq / Halqa | "the existing Asbaq table" |
| Moze | "text or existing lookup, if available" |
| Title | the request already asks for this one to be created |
| Tamreen, Ashara, Hizb | not referenced as existing, and do not exist |

"Hizb" appears in the repo only inside party *name* strings.

---

## 6. Hijri date conversion

### The live implementation

[frontend/src/utils/hijriDate.ts:56](frontend/src/utils/hijriDate.ts#L56):

```ts
export function calculateHijriDate(value: string, adjustment = 0) {
```

The return type is inferred rather than declared, and it is `string`.

- Input must be exactly `YYYY-MM-DD` (regex-validated at [:17](frontend/src/utils/hijriDate.ts#L17)); returns `""` on invalid input.
- `adjustment` is a ±days offset for moon-sighting correction.
- Returns a **formatted display string** — `"9th Moharram-ul-Haram 1447 AH"` — not a structured value.
- Algorithm: Gregorian → Julian Day (with 1582 reform handling) → arithmetic/tabular Islamic calendar (`iyear = 10631/30`, `epochastro = 1948084`, `shift1 = 8.01/60`). No Umm al-Qura table, no `Intl` calendar.
- Month names are the Dawoodi Bohra forms ([:1-14](frontend/src/utils/hijriDate.ts#L1-L14)).

Its only caller is
[frontend/src/pages/modules/MiqaatsPage.tsx:125](frontend/src/pages/modules/MiqaatsPage.tsx#L125),
and the result lands in an editable field. **The backend never computes a Hijri date** — it only
stores and echoes the string.

### What the module needs that this does not provide

- **A numeric Hijri year**, for the Tab 9 "1400 AH → current Hijri year" range (FR-076).
- **Structured day/month/year**, if the Hijri date of birth is to be stored as anything other than a display string (FR-039).
- **A backend copy**, because the derived values must be validated server-side (FR-028) rather than trusted from the browser.

### The porting source

[Documentation/HijriCalendar.php](Documentation/HijriCalendar.php) (175 lines) is the legacy PHP
original and **does** expose what is missing — its `calendar()` returns
`day, month, year, julian_day, weekday, hijri_day, hijri_month, hijri_year`, with accessors
`getDay()`, `getMonth($bName)`, `getYear()`, `getFullDate()`, `getWeekDay($bName)`. The
TypeScript port dropped the structured accessors and kept only the formatted output.

There is no PHP runtime in this project, so the file is a reference for porting, not something
to call. The arithmetic is identical, so extending `hijriDate.ts` to return components
alongside the existing string is a backward-compatible change.

---

## 7. Patterns worth reusing

| Need | Reuse |
|---|---|
| A new CRUD router | [backend/src/routes/miqaatsRoutes.ts](backend/src/routes/miqaatsRoutes.ts) — the cleanest template at 45 lines |
| Response envelope | [backend/src/utils/response.ts](backend/src/utils/response.ts) — `ok()` → `{success, data, message}`, `fail()` → `{success:false, data:null, message}` |
| Role + row scoping | [schedulesRoutes.ts:41-45](backend/src/routes/schedulesRoutes.ts#L41-L45) |
| Bulk provisioning with hashed passwords | `POST /api/v1/import-export/:entity/import` — already accepts a plaintext `password` column and bcrypt-hashes it on insert/update ([importExportRoutes.ts:379-419](backend/src/routes/importExportRoutes.ts#L379-L419), [:487-507](backend/src/routes/importExportRoutes.ts#L487-L507)); exports deliberately emit `'' AS password` so hashes never leave |
| Transactions | `pool.getConnection()` + `beginTransaction`/`commit`/`rollback` — [scheduleService.ts:27-366](backend/src/services/scheduleService.ts#L27-L366) and [importExportRoutes.ts:333-634](backend/src/routes/importExportRoutes.ts#L333-L634) |
| Rollback / backup | `GET /api/v1/import-export/database-backup` ([importExportRoutes.ts:236](backend/src/routes/importExportRoutes.ts#L236)) iterates `SHOW TABLES`, so it picks up new tables automatically |
| Safe identifier interpolation | `mysql.escapeId` / `mysql.escape` — [importExportRoutes.ts:160-173](backend/src/routes/importExportRoutes.ts#L160-L173) |
| Frontend data layer | One `createApi` base in [frontend/src/features/api/api.ts](frontend/src/features/api/api.ts), per-domain slices injecting endpoints, cache tags per entity |

Note: the plaintext `password` column in the CSV templates
([importExportRoutes.ts:190-221](backend/src/routes/importExportRoutes.ts#L190-L221)) means
passwords travel through spreadsheet files operationally. That is the existing provisioning
pattern the Membership Module reuses, and it is worth a deliberate decision about handling.

---

## 8. Migration mechanism

There is **no migration framework** — no migrations folder, no version table, no CLI, no down
scripts, no ordering convention. Two mechanisms coexist and partly overlap.

**Hand-run SQL.** `database/mpss_mysql.sql` is idempotent via `CREATE TABLE IF NOT EXISTS`. The
four `database/add_*.sql` files are **not** idempotent — bare `ALTER TABLE ... ADD COLUMN` with
no guard — and must be applied by hand in an order you can only infer from their contents.
`add_party_its_no.sql` even leaves follow-up steps as SQL comments.

**Boot-time patching.** [backend/src/db/ensureSchema.ts](backend/src/db/ensureSchema.ts), called
at [server.ts:66](backend/src/server.ts#L66) **before** `app.listen`, probes
`INFORMATION_SCHEMA.COLUMNS` and issues `ALTER TABLE` for exactly three columns:
`schedules.is_published`, `venues.address`, `venues.google_map_link`. So **startup can mutate the
production schema**, and a failed ALTER blocks startup. It duplicates
`add_venue_location_fields.sql`.

`DATABASE.md:98-102` warns: *"do not add arbitrary schema changes there without explicit design
approval."* The Membership Module should therefore ship a reviewed, idempotent SQL script rather
than extend `ensureSchema.ts`.

---

## 9. Pre-existing issues noted during inspection

Found while inspecting; **none is caused by the Membership Module** and none is in its scope.
Recorded so they are not mistaken for new regressions.

1. **Party login does not check `parties.is_active`** — compare [authService.ts:91-94](backend/src/services/authService.ts#L91-L94) with the column at [mpss_mysql.sql:58](database/mpss_mysql.sql#L58). A deactivated party can still sign in. FR-007 requires the member equivalent to be checked, which will make the two roles behave differently until this is addressed.
2. **`admins.password_hash` is nullable** ([mpss_mysql.sql:11](database/mpss_mysql.sql#L11)) but the admin branch passes it straight to `bcrypt.compare` ([authService.ts:53](backend/src/services/authService.ts#L53)). A NULL hash throws, yielding a 500 "Login failed. Server error" instead of a 401. Only the coordinator branch null-guards ([:127](backend/src/services/authService.ts#L127)).
3. **`/auth/refresh` is dead code from the UI's side.** The endpoint and `useRefreshMutation` exist, but a repo-wide search finds **zero call sites**, and there is no 401 interceptor in `api.ts`. With a 1-day token, a user silently receives 401s until they sign in again. This matters for a long 12-tab form, and is why FR-032 requires unsaved entries to survive a lapsed session.
4. **Logout never revokes the refresh token.** `AppShell.tsx` clears local state and navigates away without calling `POST /auth/logout`, so the `refresh_tokens` row stays valid. Refresh tokens are also not rotated on use.
5. **Re-running the schema file resets the admin password.** [mpss_mysql.sql:208-210](database/mpss_mysql.sql#L208-L210) seeds `username = 'admin'` with a committed bcrypt hash under `ON DUPLICATE KEY UPDATE ... password_hash = VALUES(password_hash)`.
6. **Credential rotation is still outstanding.** `CHANGELOG.md` records that hardcoded DB credentials and a `change_me` JWT secret were removed from `env.ts` on 2026-09-13, but that the old values remain in git history and rotation has not been performed.
7. **Production URLs hardcoded in source** — the Render API base in [frontend/src/features/api/api.ts](frontend/src/features/api/api.ts) and the CORS allowlist default in [backend/src/config/env.ts](backend/src/config/env.ts).
8. **`backend/tmp_*.js`** — 14 committed ad-hoc debug scripts that open their own MySQL connection via `require("./dist/config/env")`, i.e. against whatever `backend/.env` points at. Read-only analysis scripts, but live DB clients sitting in the repo.
9. **Committed build output** — `backend/dist/` is tracked (18 files) and must be rebuilt in lockstep with `src/`; the repository's own convention confirms it, since commit `afe7463` updated `src/config/env.ts` and `dist/config/env.js` together. `npm start` runs `node dist/server.js`, so **`dist` is what production runs**: a deploy without a rebuild ships the previous build. *Corrected 2026-10-30:* an earlier version of this line also listed `frontend/dist/`, which is wrong — it is gitignored (`frontend/.gitignore:11`) and has no tracked files, because Vercel builds it. Verified at inspection that `backend/dist/services/authService.js` matches the source semantics.
10. **`Documentation/MPSS_Software_Process_Guide.md` is stale** — it describes a Prisma stack. There is no Prisma in the code; `ARCHITECTURE.md` already flags this drift.

---

## 10. Verification of this document

- `git diff master -- backend frontend database` was empty after the inspection: no application, frontend or schema file was touched.
- Every file path and line reference above was resolved against the working tree at `afe7463`.
- Absence claims (Sharaf, Asbaq, Moze, Title, Tamreen, Hifz, Sansta, Umoor, and any reference to `members`) were established by case-insensitive recursive search across `*.ts`, `*.tsx`, `*.sql`, `*.js` and `*.md`, excluding `node_modules` and `dist`.
