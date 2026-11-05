# `database/` — which file do I run?

## Against the LIVE database: exactly one file

```
database/MEMBERSHIP_LIVE_INSTALL.sql
```

```bash
mysql -h <host> -u <user> -p <database> < database/MEMBERSHIP_LIVE_INSTALL.sql > run.log 2>&1
```

That is the whole migration. It is self-contained — the schema and the seed are both inside
it, in the right order, with the verification built in. **Nothing else in this folder needs
to be run.** There is no second step and no ordering to get right.

Use the `mysql` command-line client, not a GUI or a driver: the file contains `DELIMITER`,
which is a client instruction that drivers do not understand and will choke on.

**Keep `run.log`.** It holds the BEFORE and AFTER row counts of every pre-existing table.
Comparing those two blocks line by line is your proof that nothing existing was touched —
every number must match. Also check, near the end:

| Check | Expected |
|---|---|
| `new_tables_created` | 21 |
| `approval_columns_present` | 5 |
| `approval_indexes_present` | 2 |
| `still_draft` (all ten SEEDED lookup lists) | 0 |

Before you run it: take a backup **and verify it restores** — an unverified backup is not a
backup — and apply it to a restored copy first.

It is safe to re-run. `CREATE TABLE IF NOT EXISTS` throughout, `ON DUPLICATE KEY` in the
seed, and the approval backfill adds each column only if absent. An interrupted run can
simply be repeated. It also refuses to run against the wrong database: a pre-flight aborts
with SQLSTATE 45000 unless `parties` and `zones` exist, before creating anything.

---

## Everything else, and why it is not what you run

This folder used to hold `membership_live_update.sql` beside `membership_schema.sql`,
`membership_seed.sql` and `membership_rollback.sql` — four names differing by a single word,
only one of which should ever reach production. That was a genuine hazard, and it is why the
layout below exists.

### `sources/` — maintained, but never run directly

- `sources/membership_schema.sql` — the 21 tables
- `sources/membership_seed.sql` — the ten lookup lists

These are the real source of truth for the schema. `MEMBERSHIP_LIVE_INSTALL.sql` is
**generated** from them:

```bash
node database/build_live_update.mjs           # rebuild after editing a source
node database/build_live_update.mjs --check   # verify it is current (exit 1 if not)
```

The generated file records each source's SHA-256, and
`backend/src/__tests__/liveUpdateScript.test.ts` fails if they drift — so the convenience of
one file cannot quietly become a second, stale source of truth.

> **`--check` verifies freshness, not correctness.** It compares the generated file against
> these two sources. If both sources are wrong in the same way, it still reports "current" —
> which is exactly what happened with the photo approval columns. The only check with real
> authority is diffing the result against a database the application actually runs against.

### `already-applied/` — history. Do not run these.

Changes that were applied to the live database long ago, kept as a record of how its schema
came to be. They are **not** pending work, and re-running them now would fail: `ADD COLUMN`
has no `IF NOT EXISTS` in MySQL, so each would abort with error 1060, duplicate column name.

- `add_party_its_no.sql`, `add_party_contact_numbers.sql` — `parties.its_no`, `leader_name`,
  `contact_number`, `whatsapp_number`. Party sign-in by ITS Number depends on these and is
  live, so they are certainly applied.
- `add_venue_contact_fields.sql`, `add_venue_location_fields.sql` — the `venues` coordinator,
  contact, address and map columns.
- `membership_schema_update_photo_approval.sql` — **superseded.** This was a standalone
  `ALTER` that added the photo approval workflow to the development database without
  updating the migration source, which is how the two drifted apart and how
  `MEMBERSHIP_LIVE_INSTALL.sql` came to be missing five columns the application needs. That
  gap is closed: the columns are declared in `sources/membership_schema.sql` and backfilled
  there for any database that created `member_photos` before they existed.

### `membership_rollback.sql` — the undo. Destructive.

**Drops all 20 module tables and every member account, profile and photograph.** It is
rehearsed and it works, which is precisely why it must not be run by accident. Roll the
frontend back before or at the same time: with the tables gone but Member still offered on
the login page, a member signing in gets a 500.

If members have real data and you only need to disable the module, do **not** run this —
remove `member` from the login page's role options instead. That leaves every row intact and
is reversible in one deploy.

### `mpss_mysql.sql` — the original schema baseline. Never run against live.

The pre-membership schema, kept for reference. Running it against a live database would
recreate tables and **reset the admin password**, because it seeds `username = 'admin'` under
`ON DUPLICATE KEY UPDATE ... password_hash = VALUES(password_hash)`.

It also declares the database as `utf8mb4_unicode_ci`, which the real database is not — every
live table is `utf8mb4_general_ci`. Trust the live schema over this file. That collation
mismatch is why every table in `sources/membership_schema.sql` states its collation
explicitly rather than inheriting the database default.

### `local-dev/` — standing up a local database

`local-dev/local_dev_setup.sql` builds a complete local environment from nothing, schema and
sample data together, as database `mpss_local`. It **drops and recreates** that database and
seeds accounts with known weak passwords, so it is local-only. `local-dev/README.md` has the
walkthrough; `local-dev/dumps/` is git-ignored because it holds real personal data.

---

## `convert_profile_years_to_hijri.sql` — a one-off data fix, already applied to live

Five profile year fields are Hijri (AH): Prefix Year, Title Year, Sharaf Year, Place Visited
Year and the Other Sansta "Since" year. They were offered as Gregorian 1950–2026 until
2026-11-04, so anything entered before then is in the wrong calendar.

This converts only values that are unambiguously Gregorian (`>= 1900`), using the standard
mid-year approximation `FLOOR((g - 622) * 33 / 32)` — checked against the application's own
converter in `backend/src/utils/hijriDate.ts`. `occupation_since_year` is deliberately **not**
touched: it is still Gregorian, and the server validates it against the member's Gregorian
year of birth.

Applied to live on 2026-11-04. It converted two values — `prefix_year` 2006 → 1427 and a
`title_year` 2005 → 1426 — and the log is kept beside the backup it was taken with.

Unlike the files in `already-applied/`, this one is **safe to re-run**: the `>= 1900` guard
means a converted value is never converted twice, which is why it stays here rather than
moving into that folder. Run it against any other environment that predates the change.

There is no rollback — the original cannot be recovered from the converted value — so take a
backup first. The script prints every row it will change before it changes it.

---

## Quick reference

| File | Run it? |
|---|---|
| `MEMBERSHIP_LIVE_INSTALL.sql` | **Yes — this is the one.** |
| `convert_profile_years_to_hijri.sql` | Already applied to live. Re-runnable; run it on any other environment. |
| `sources/*.sql` | No. Edit these, then regenerate. |
| `already-applied/*.sql` | No. History; would error. |
| `membership_rollback.sql` | Only to undo, deliberately. Destroys member data. |
| `mpss_mysql.sql` | Never against live. |
| `local-dev/local_dev_setup.sql` | Local machines only. |
