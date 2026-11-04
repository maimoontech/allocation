# Database — MPSS

## Engine

MySQL.

Connection implementation:
- `backend/src/db/pool.ts`

## Migration scripts

**`database/README.md` is the index — it answers "which file do I run?" in its first line.**
Read it before touching a live database.

Against a live database there is **exactly one file to run**:

```bash
mysql -h <host> -u <user> -p <database> < database/MEMBERSHIP_LIVE_INSTALL.sql > run.log 2>&1
```

It is self-contained — a pre-flight that aborts unless this is the MPSS schema, the 20 tables,
the seed, and BEFORE/AFTER row counts of every pre-existing table. Idempotent, so an
interrupted run can be repeated. Use the `mysql` CLI, not a driver: it contains `DELIMITER`.

Everything else in `database/` is a source, history, or the rollback:

- `database/sources/membership_schema.sql` — the 20 tables
- `database/sources/membership_seed.sql` — the ten lookup lists

  These two are the maintained source of truth. `MEMBERSHIP_LIVE_INSTALL.sql` is **generated**
  from them by `node database/build_live_update.mjs`; it records each source's SHA-256 and a
  test fails if they drift. Note that `--check` verifies *freshness, not correctness*: it
  compares the generated file against these sources, so two equally stale sources still report
  "current". Diffing against a real database is the only check with authority.

- `database/already-applied/` — changes applied to live long ago, kept as a record. Not
  pending work, and re-running them now fails with error 1060 (`ADD COLUMN` has no
  `IF NOT EXISTS` in MySQL). Includes the superseded
  `membership_schema_update_photo_approval.sql`, the standalone `ALTER` whose existence is why
  the dev database and the migration source drifted apart.

- `database/membership_rollback.sql` — drops the 20 tables and the module's refresh tokens.
  Destructive, and the frontend must be rolled back first or at the same time.

- `database/mpss_mysql.sql` — the original pre-membership schema, for reference. **Never run
  it against live:** it resets the admin password, and it declares the database as
  `utf8mb4_unicode_ci` when every live table is actually `utf8mb4_general_ci`.

- `database/local-dev/` — builds a local database from nothing. Local machines only.

## Core Tables

The current application references these core domains:
- admins
- zones
- mohallahs
- parties
- venues
- miqaats
- schedules
- schedule_edits
- performance_ratings
- refresh_tokens

Additional tables/columns may exist in the SQL schema and should be checked before database work.

## Membership Module Tables

Twenty tables, all **added**; nothing existing was altered or dropped. The module reuses
`zones`, `parties` and `mohallahs` as they are.

Accounts and profile:
- `member_accounts` — sign-in by `its_no`, with `password_hash`, `must_change_password` and
  `password_changed_at`. Separate from `parties` so Member login cannot affect Party login.
- `member_profiles` — the single-entry fields of all twelve tabs, one row per account
- `member_photos` — image bytes as a BLOB, served only through an authenticated endpoint.
  Also carries the approval workflow: `approval_status` (`pending`/`approved`/`rejected`),
  `approved_by` + `approved_by_role`, `approved_at` and `rejection_reason`. An uploaded
  photograph stays `pending` — visible to its owner only — until an admin or the member's
  own Zonal Head approves it. `approved_by` is deliberately **not** a foreign key: the
  approver is a row in `admins` or a Zonal Head, which are different tables, so the pair
  `(approved_by, approved_by_role)` identifies them and no single FK can.

Repeatable sections, each owned by `member_accounts` (**not** by `member_profiles` — a member
can have titles before they have a profile row):
- `member_titles`, `member_sharafs`, `member_skills`
- `member_place_visits` and `member_place_visit_years`
- `member_ashara_attendances`

Lookups — all ten are seeded with reviewed values (`is_draft = 0`):
- `titles` (2), `sharafs` (3), `halqas` (2), `mozes` (5), `places` (5) — the domain lists.
  These shipped **empty** originally, because inventing Dawoodi Bohra religious and
  organisational terms would have been worse than an empty list. They have since been
  supplied and reviewed, and `database/sources/membership_seed.sql` now carries them.
- `sanads` (10), `marital_statuses` (4), `tamreen_frequencies` (6), `skills` (45) — proposed
  and accepted unchanged.
- `tamreen_methods` (4) — `Self`, `With Party`, `With an Ustad`, `SatulIman`. The seven
  values originally proposed here were **not** adopted; only `With an Ustad` survived. A
  database that received the old seed keeps those six rows with `is_active = 0`, so members
  no longer see them while any profile that referenced one stays readable.

`is_draft` still governs anything added **later**: a value an admin creates defaults to
`is_draft = 1` and displays as `DRAFT — NEEDS REVIEW` until signed off.

Throttling:
- `member_login_attempts` — per-account and per-IP failed sign-ins, IP stored as a salted
  SHA-256 hash, never in the clear

Two conventions that are easy to get wrong here:

- **Collation.** Every one of the 20 tables declares `COLLATE=utf8mb4_general_ci` explicitly. The database default is `utf8mb4_0900_ai_ci` while all 13 pre-existing tables are `utf8mb4_general_ci`, so a table that inherits the default throws error 1267 the first time an `its_no` is compared across the two.
- **`member_profiles.bmi` is a VIRTUAL generated column.** MySQL rejects any write to it (error 3105), which is why the API ignores a client-supplied BMI rather than validating it.

**None of this is in `ensureSchema.ts`.** The module's schema is applied by running the
scripts above, deliberately: boot-time `ALTER TABLE` on twenty new tables in a live system is
not a risk worth taking for a one-time change.

## Key Relationships

```text
zones
  |
  +--> mohallahs
          |
          +--> venues

zones
  |
  +--> parties

miqaats
  |
  +--> schedules <--> venues
             |
             +------> parties

schedules
  |
  +--> performance_ratings
  |
  +--> schedule_edits
```

## Authentication Data

Role-specific login data is stored in:
- `admins`
- `zones`
- `parties`
- `venues`
- `member_accounts`

Passwords use `password_hash` and are verified with bcrypt.

Refresh sessions use:
- `refresh_tokens.token_hash`
- user role/id
- expiry
- revocation timestamp

`refresh_tokens.user_role` now also takes `'member'`. A member's password change revokes
their refresh tokens, so an old session cannot be silently re-granted (FR-022).

## Schedule Data

`schedules` contains assignment records linking:
- Miqaat
- venue
- party

Important flags include:
- `is_manual`
- `is_published`

## Scheduling History

`schedule_edits` stores manual assignment changes for audit/history.

## Ratings

`performance_ratings` stores coordinator-side performance/attendance information and is associated with schedule rows and coordinator identity.

Party mic/audio ratings are handled through the ratings domain; verify exact columns/contracts in `ratingsRoutes.ts` and the schema before making changes.

## Schema Initialization

`backend/src/db/ensureSchema.ts` checks for selected columns and adds them when missing.

This means startup can mutate the database schema. Treat this as an existing mechanism, but do not add arbitrary schema changes there without explicit design approval.

## Database Change Rules

Before any DB change:
1. inspect `database/mpss_mysql.sql`
2. inspect incremental SQL files
3. inspect all code references
4. determine existing data impact
5. create a migration/update script
6. document rollback considerations
7. test against a safe database

Do not assume inferred relationships are foreign keys until confirmed in schema.
