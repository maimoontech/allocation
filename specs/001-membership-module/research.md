# Phase 0 Research — Membership Module

**Feature**: `001-membership-module` · **Date**: 2026-10-29 · **Spec**: [spec.md](./spec.md)

Every unknown carried in the Technical Context of [plan.md](./plan.md) is resolved here. Each
entry states the decision, why it was chosen, and what was rejected. Verified facts about the
existing system come from [PROJECT_AS_IS.md](../../PROJECT_AS_IS.md).

---

## R1 — Where member credentials live

**Decision**: A new `member_accounts` table, with `its_no` as a UNIQUE column that is
deliberately **not** a foreign key to `parties.its_no`.

**Rationale**: The system already stores each role's credentials in that role's own table
(`admins`, `zones`, `parties`, `venues`) and dispatches on role in `authenticate()`. A new table
for a new role is the pattern the codebase already uses, so it needs no architectural change.
Making `its_no` a plain UNIQUE column rather than an FK matters because a member is a *person*
and a party is a *group*: a given ITS Number may identify both, one, or neither. An FK would
wrongly require every member to already be a party leader, and FR-011/FR-012 require the two
credential sets to stay strictly separate.

The column is spelled `its_no` to match `parties.its_no`, not `its_number` as the dormant
`members` table spells it — one spelling across the schema is worth more than consistency with
a table nothing uses.

**Alternatives rejected**:
- *Extend the dormant `members` table* — it has `party_id NOT NULL`, which contradicts spec assumption 16 (a member need not belong to a party), no auth columns, and contents that cannot be verified from the repo. Altering a production table for no benefit.
- *One unified `users` table* — would mean migrating four live authentication paths. Explicitly forbidden by the no-regression requirement and by `ARCHITECTURE.md`'s change policy.
- *FK to `parties.its_no`* — see above.

---

## R2 — How "first login" is detected

**Decision**: An explicit `must_change_password TINYINT(1) NOT NULL DEFAULT 1` column on
`member_accounts`, plus `password_changed_at DATETIME NULL`.

**Rationale**: `last_login_at` cannot serve this purpose — `authenticate()` overwrites it on
every login (`authService.ts:100` and siblings), so it is never again NULL after the first
sign-in. An explicit flag is also what FR-005 needs: re-running a roster must not re-impose the
requirement on an account that has already satisfied it, which is a single `must_change_password`
check at provisioning time.

`password_changed_at` is separate because it does double duty for R3.

**Alternatives rejected**:
- *Infer from `last_login_at IS NULL`* — wrong after the first login, and would re-prompt nobody.
- *A sentinel password hash* — unreadable, and would require comparing against a known hash, which is a security smell.

---

## R3 — Invalidating sessions after a password change

**Decision**: A member-specific `requireMember` middleware that runs after `requireAuth`, reads
the member's account row, and rejects the request when the token predates the password change
(`token.iat < password_changed_at`), when the account is inactive, or when a password change is
still outstanding and the request is not the password-change call itself.

**Rationale**: FR-022 requires sessions established with the old password to stop working, and
JWTs are stateless — they cannot be revoked by deleting a row. Revoking the refresh token alone
leaves the access token valid for up to `JWT_EXPIRES_IN` (default 1 day).

The decisive point is that **a database read per member request is needed anyway**: FR-007
(deactivated accounts refused) and FR-018 (no profile access before the password change) both
require current account state, which a static token claim cannot provide. Once that read is
accepted, comparing `iat` against `password_changed_at` is free.

The cost is one primary-key lookup per member request. That is acceptable for a profile form
used occasionally by a few thousand people, and it is confined to the member role — the four
existing roles keep the current claims-only path untouched, which is what FR-103 demands.

**Alternatives rejected**:
- *Shorten the member token lifetime* — narrows the window without closing it, and makes the long 12-tab form worse.
- *A token denylist table* — more moving parts than the account read that is already required.
- *A `token_version` claim* — equivalent in effect, but needs its own column and still requires the same DB read.
- *Accept up-to-1-day stale tokens* — fails FR-022.

---

## R4 — Photograph storage

**Decision**: Image bytes in a dedicated `member_photos` table (`MEDIUMBLOB`), one row per
member, served through an authenticated endpoint. Accepted on upload as base64 inside the
existing JSON body. Capped at **2 MB** after client-side downscaling.

**Rationale**: Confirmed with the user. The backend has no static file serving, no upload
middleware and no storage SDK, and it runs on a PaaS whose filesystem is discarded on redeploy
(`server.ts:19-24` reads `RENDER_GIT_COMMIT` / `RAILWAY_GIT_COMMIT_SHA`), so disk writes would
not survive. A blob behind `requireMember` also gets FR-090's access control from the same
middleware as everything else, which a public URL would not.

Two specifics matter:

- **A separate table, not a column on `member_profiles`.** Profile reads happen on every form load; if the blob shared the row, `SELECT *` would drag megabytes. A separate table keeps profile queries cheap and makes `FR-091` (no earlier image retrievable) a plain `UPDATE` of a single row under a `UNIQUE` key.
- **Base64 in JSON needs no new dependency.** `express.json({ limit: "5mb" })` already exists (`server.ts:34`). Base64 inflates by about a third, so a 2 MB image arrives as roughly 2.7 MB — inside the existing limit with headroom. Adding `multer` would mean a new dependency and a new body-parsing path on a live server for no gain at this size.

Accepted types are JPEG, PNG and WebP, validated by **magic bytes** rather than the declared
content type or filename, as FR-089 requires.

**Alternatives rejected**:
- *External object storage (S3, Cloudinary)* — a third-party account, new credentials to rotate, and a new failure mode, for a few thousand small images.
- *Local disk plus `express.static`* — lost on every deploy unless a paid persistent disk is attached.
- *`multer` multipart* — a dependency and a new code path for no benefit at 2 MB.
- *`LONGBLOB`* — `MEDIUMBLOB` holds 16 MB, eight times the cap. `LONGBLOB` would only invite larger uploads.

---

## R5 — Getting a numeric Hijri year

**Decision**: Extend `frontend/src/utils/hijriDate.ts` with a new exported
`calculateHijriParts(value, adjustment)` returning `{ day, month, year, monthName, formatted }`,
leaving the existing `calculateHijriDate` signature and output untouched. Port the same function
to `backend/src/utils/hijriDate.ts` for server-side validation.

**Rationale**: FR-076 needs a Hijri *year* for the Tab 9 range, and FR-039 needs day, month and
year if the Hijri date of birth is to be stored as anything better than a display string. The
existing function computes all three internally (`im`, `id`, `iy` at `hijriDate.ts:107-109`) and
then discards them into a formatted string.

Adding a second export rather than changing the existing one is what keeps `MiqaatsPage.tsx:125`
— the only current caller — working unchanged, satisfying FR-105.

The backend copy is required because FR-028 forbids trusting a browser-computed value. The
arithmetic is pure and has no dependencies, so duplicating roughly 60 lines is cheaper than
introducing a shared package into a repo that has no workspace tooling. Both copies must be
covered by the same test vectors so they cannot drift.

`Documentation/HijriCalendar.php` is the reference: its `calendar()` already returns
`hijri_day`, `hijri_month` and `hijri_year`, confirming the intended shape. It is a PHP file in
a Node project, so it is a porting source, not a runtime dependency.

**Alternatives rejected**:
- *Parse the formatted string* — brittle, and depends on the ordinal suffix and month-name spelling.
- *Change `calculateHijriDate`'s return type* — breaks its existing caller.
- *A shared workspace package* — the repo has no npm workspaces and no root lockfile; adding that tooling is out of proportion to 60 lines.
- *`Intl.DateTimeFormat` with the islamic calendar* — would produce different dates from the system's existing arithmetic, so stored Miqaat Hijri dates and new member dates would disagree.

---

## R6 — Deriving BMI so it cannot be overwritten

**Decision**: A MySQL **virtual generated column** on `member_profiles`:

```sql
bmi DECIMAL(5,2) AS (
  IF(height_cm > 0 AND weight_kg > 0,
     ROUND(weight_kg / POW(height_cm / 100, 2), 2),
     NULL)
) VIRTUAL
```

**Rationale**: FR-064 requires BMI to be read-only and to disappear when either input is absent
or non-positive. A generated column makes that structurally true — MySQL rejects any attempt to
write it, so no API or UI mistake can corrupt it, and it cannot drift from the height and weight
it is derived from. `VIRTUAL` means no storage cost, which suits a value that is never filtered
or sorted on.

**Contingency**: generated columns need MySQL 5.7 or later. The server version cannot be
verified from the repo, so the migration guards it (R9) and the fallback is to drop the column
and compute BMI in the profile read, which satisfies FR-064 equally but relies on code
discipline rather than the engine.

**Alternatives rejected**:
- *Store a plain `bmi` column written by the API* — can drift from its inputs and can be overwritten by any future bug.
- *Compute only in the frontend* — fails FR-028, and a BMI shown but never checked server-side is not validated.
- *`STORED` instead of `VIRTUAL`* — costs row space to make a never-queried column indexable.

---

## R7 — Login throttling

**Decision**: A `member_login_attempts` table recording `its_no`, a salted SHA-256 hash of the
client IP, the timestamp and whether the attempt succeeded. Throttle on **both** the ITS Number
and the IP hash over a rolling window. Prune rows older than the retention window on write.

**Rationale**: FR-014 requires throttling, and the system has none today — `/auth/login` is
unthrottled while running bcrypt cost 10 per attempt, which is a denial-of-service lever as much
as a credential-stuffing one.

Database-backed rather than in-memory because the backend is on a PaaS that may run more than
one instance, and an in-memory counter is per-process — an attacker would simply be
load-balanced past it. It also gives the system its first failed-authentication audit trail,
which it currently lacks entirely.

The IP is **hashed with a secret, not stored raw**, because the raw address is personal data that
the throttle does not need: equality comparison is all that is required, and a hash supports it.

Throttling the ITS Number alone would let one attacker spray many accounts; the IP alone would
let a distributed attacker through. Both are needed.

The response must not reveal whether the account exists (FR-013, FR-014), so a throttled
request returns the same shape of refusal regardless.

**Alternatives rejected**:
- *`express-rate-limit`* — a new dependency, and the default memory store has the multi-instance problem. Worth revisiting if the project later adds Redis.
- *In-memory map* — per-process, lost on restart, no audit value.
- *An account lockout column* — turns a failed-login flood into a denial of service against real members.
- *Storing raw IPs* — collects personal data the feature does not need.

---

## R8 — Enforcing the Tab 8 count-versus-years rule

**Decision**: Enforce in the application inside the profile-save transaction, not in the schema.

**Rationale**: FR-073 requires `times_count` on a member's visited-place row to equal the number of
`member_place_visit_years` rows attached to it. That is a cross-row aggregate, and MySQL `CHECK`
constraints cannot contain subqueries, so the schema cannot express it. A trigger could, but the
codebase has no triggers and `ARCHITECTURE.md` requires a design discussion before introducing a
new mechanism — and a trigger would raise an error the API would then have to translate anyway.

The save is already a single transaction (FR-030), so the check sits naturally just before
commit, where it can produce the message FR-073 specifies, naming the place and both counts.

**Alternatives rejected**:
- *`CHECK` constraint* — cannot aggregate across rows.
- *A trigger* — a new mechanism, worse error messages, invisible to anyone reading the route.
- *Derive `times_count` from the row count* — tempting, but the request treats them as separate inputs and asks for disagreement to be flagged rather than silently reconciled.

---

## R9 — Applying the migration safely

**Decision**: One idempotent SQL script in `database/` (drafted under this spec and moved
there once approved, per T118), reviewed
and run by hand against a restored copy of production first. **Do not** extend
`backend/src/db/ensureSchema.ts`.

**Rationale**: `ensureSchema()` runs on every boot before `app.listen` and mutates the live
schema; a failed `ALTER` blocks startup. `DATABASE.md:98-102` explicitly says not to add
arbitrary schema changes there without design approval. Fourteen new tables at boot time, on a
live system, is exactly what that warning is about.

The script is idempotent — `CREATE TABLE IF NOT EXISTS`, seeds via `INSERT ... ON DUPLICATE KEY
UPDATE` — matching the style of `database/mpss_mysql.sql` rather than the unguarded
`database/add_*.sql` files, so a partial run can be repeated safely.

It is **additive only**: no `ALTER`, no `DROP`, no `UPDATE` or `DELETE` against any existing
table, which is how FR-106 is satisfied by construction and is also what makes rollback simple.

The script opens with a version probe for R6's generated column, so an older MySQL fails the
guard with a clear message rather than halfway through.

Drafts live under `specs/`, not `database/`, until approved, so nothing unapproved sits where it
looks runnable. On approval they move to `database/` under that directory's naming convention.

**Alternatives rejected**:
- *Extend `ensureSchema.ts`* — see above.
- *Put drafts straight into `database/`* — invites an accidental run before review.
- *A migration framework* — introducing one mid-feature on a live system is a separate project.

---

## R10 — Serving the 12 tabs over the API

**Decision**: One `GET` and one `PUT` for the whole profile, plus one `GET` returning every
lookup list at once. Photographs get their own endpoints.

**Rationale**: FR-030 requires a save to be all-or-nothing across sections, which a single `PUT`
inside one transaction gives directly; twelve per-tab endpoints would make partial saves the
default and the atomic case hard. FR-026 (tab switching must not lose edits) then becomes purely
client-side state, with no server round trip per tab.

One lookups call rather than ten keeps a form that needs Title, Sharaf, Halqa, Moze, Place,
type, Marital Status, Skills, two Tamreen lists, Sanad, Zones, Parties and Mohallahs from
issuing thirteen requests on open. Parties are returned with their `zone_id` so the Tab 3
dependent dropdown filters client-side with no second request, and the response carries the
current Hijri year so Tab 9 needs no extra call.

Photographs are separate because they are binary, cached differently, and must not be dragged
into every profile read.

**Alternatives rejected**:
- *An endpoint per tab* — twelve times the surface, and atomicity becomes the hard case.
- *`PATCH` per field* — many more requests, and FR-030 would be unreachable.
- *An endpoint per lookup* — thirteen requests to open a form.
- *The photo inside the profile payload* — megabytes on every read.

---

## R11 — Test harness

**Decision**: Vitest across both projects — `supertest` for backend HTTP tests, and
`@testing-library/react` for the frontend. **Write the Party-login regression tests before
touching `authService.ts`.**

**Rationale**: The repo has no runner, no test file and no CI, so the request's testing
requirement needs a harness before it can need tests. Vitest is the natural choice: the frontend
is already on Vite 8, so it shares the config and transform pipeline, and it runs TypeScript in
the backend without a separate `ts-jest` layer.

The sequencing is the important part. FR-102 says Party login must behave identically, and the
`member` branch is being inserted into the same function, two lines above the unguarded
fallthrough that currently catches coordinators. A regression test written *first* turns that
requirement from a promise into a check — it is the cheapest insurance in the whole plan, and
writing it afterwards proves nothing about what was there before.

**Alternatives rejected**:
- *Jest* — a second toolchain alongside Vite for no gain.
- *Manual testing only* — the request asks for automated regression tests, and manual checks do not survive the next change.
- *Tests after implementation* — would not establish the pre-change baseline, which is the whole point here.

---

## R12 — Member account provisioning

**Decision**: Add `members` as an entity to the existing
`POST /api/v1/import-export/:entity/import` switch, reusing its CSV parsing, transaction and
password-hashing path. Add a small admin list and an active/inactive toggle.

**Rationale**: Confirmed with the user. That route already accepts a plaintext `password` column
and bcrypt-hashes it on insert or update (`importExportRoutes.ts:379-419`), already runs inside
a transaction (`:333-634`), already reports per-row outcomes, and its export side deliberately
emits `'' AS password` so hashes never leave the system. Every element FR-001, FR-003 and FR-008
need already exists and is in production use.

New accounts are created with `must_change_password = 1`; existing rows have their password
updated **only when the row's member has not already set one** (`password_changed_at IS NULL`),
which is how FR-005 is met.

**Worth flagging**: this pattern carries plaintext passwords in spreadsheet files. That is
pre-existing operational behaviour for zones, parties and venues, and reusing it is the
smallest change — but it deserves a deliberate decision rather than inheritance by default.
Recorded as a risk in [plan.md](./plan.md).

**Alternatives rejected**:
- *A bespoke provisioning endpoint* — duplicates working, tested-in-production code.
- *Admin CRUD one member at a time* — unusable for a roster of thousands; retained only as the active/inactive toggle.
- *Self-registration* — diverges from the forced-first-change requirement, and was not chosen.
- *System-generated passwords mailed out* — there is no mail capability anywhere in the system.

---

## R13 — Unverifiable facts about the production database

These cannot be settled from the repository. Each is handled by a design that does not depend on
the answer, so none blocks the plan.

| Unknown | How the design copes |
|---|---|
| **MySQL server version** | Migration probes it before creating the generated column (R6, R9); documented fallback computes BMI in the API |
| **Whether the dormant `members` table holds rows** | It is never read, written or altered (R1) |
| **Whether more than one backend instance runs** | Throttling is database-backed, so per-process state is irrelevant (R7) |
| **Expected member count** | Design targets a few thousand. The only size-sensitive choice is the photo blob; at 2 MB capped and typically ~200 KB after downscaling, 5,000 members is roughly 1 GB — reviewed at provisioning time |
| **Existing row counts, for the before/after comparison SC-013 needs** | Captured as a pre-migration step in [quickstart.md](./quickstart.md), not assumed |

---

## Summary of decisions

| # | Area | Decision |
|---|---|---|
| R1 | Credentials | New `member_accounts`; `its_no` UNIQUE, no FK to `parties` |
| R2 | First login | Explicit `must_change_password` + `password_changed_at` |
| R3 | Session invalidation | `requireMember` middleware compares token `iat` to `password_changed_at` |
| R4 | Photographs | `MEDIUMBLOB` in a separate table, base64 in existing JSON body, 2 MB cap, magic-byte validation |
| R5 | Hijri | New `calculateHijriParts` export plus a backend port; existing function untouched |
| R6 | BMI | MySQL virtual generated column, with a documented fallback |
| R7 | Throttling | `member_login_attempts`, on ITS Number and hashed IP, database-backed |
| R8 | Tab 8 rule | Application check inside the save transaction |
| R9 | Migration | Idempotent, additive-only script under `specs/`; not `ensureSchema.ts` |
| R10 | API shape | One profile `GET`/`PUT`, one lookups `GET`, separate photo endpoints |
| R11 | Tests | Vitest + supertest + React Testing Library; Party-login regression first |
| R12 | Provisioning | Extend the existing import route with a `members` entity |
| R13 | Unknowns | Each handled by a design that does not depend on the answer |

**No NEEDS CLARIFICATION items remain.**
