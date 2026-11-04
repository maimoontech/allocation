# Before-State Baseline — local `masjid_scheduling`

**Captured**: 2026-10-29 · **Host**: `127.0.0.1:3306` · **MySQL**: 8.0.46 · **Database**: `masjid_scheduling`

This is task **T008** in [tasks.md](../../specs/001-membership-module/tasks.md). It records the
state of the local production copy **before** the Membership Module migration is applied, so
FR-106 ("no existing record altered or removed") and SC-013 can be verified rather than
asserted.

Re-run the query at the bottom after applying `membership_schema.sql` and
`membership_seed.sql`. **Every number below must be identical.** The migration is
additive only — it contains no `ALTER`, `DROP`, `UPDATE` or `DELETE` against an existing
table — so any difference means something else ran.

---

## Row counts

| Table | Rows |
|---|---|
| `admins` | 1 |
| `zones` | 2 |
| `mohallahs` | 18 |
| `parties` | 80 |
| `venues` | 51 |
| `miqaats` | 19 |
| `schedules` | 651 |
| `schedule_edits` | 349 |
| `ratings` | 29 |
| `performance_ratings` | 0 |
| `party_venue_history` | 491 |
| `refresh_tokens` | 2343 |
| `members` *(dormant)* | **0** |

13 tables. **0 of the 20 membership tables exist yet.**

## Character set and collation

| Scope | Value |
|---|---|
| Database default | `utf8mb4` / **`utf8mb4_0900_ai_ci`** |
| All 13 tables | `utf8mb4` / **`utf8mb4_general_ci`** |
| `parties.its_no` | `varchar(20)` / `utf8mb4_general_ci` |
| `members.its_number` | `varchar(20)` / `utf8mb4_general_ci` |

**This is why the migration declares `COLLATE=utf8mb4_general_ci` explicitly on all 20 new
tables.** Without it they would inherit the database default, `utf8mb4_0900_ai_ci`, and any
comparison between a new VARCHAR column and an existing one — `member_accounts.its_no` against
`parties.its_no` most obviously — would fail with error 1267, "Illegal mix of collations".

It also means `database/mpss_mysql.sql` is **wrong**: it declares the database as
`utf8mb4_unicode_ci`, which is not what the live schema uses. Trust the database, not that
file.

## Facts that confirm design decisions

| Finding | Confirms |
|---|---|
| **`members` holds 0 rows** | [research R1](../../specs/001-membership-module/research.md#r1--where-member-credentials-live) — leaving the dormant table untouched costs nothing, because there is nothing in it |
| `parties`: 80 rows, **0 missing `its_no`**, 0 missing `password_hash`, 57 active | Party login by ITS Number works on this copy, so the Phase 3 regression tests can run against real data |
| `miqaats` holds 19 rows across repeating names | The `places` seed, which derives `SELECT DISTINCT miqaat_name`, has real input |
| 2 zones: *City Saddar*, *Hyderi* | The Tab 3 Zone to Party dependent dropdown has genuine data to filter |
| `admins`: 1 row, username `admin`, 60-char `$2b$` hash, last login 2026-10-25 | Admin sign-in is available for the provisioning tasks |
| **No category `H` parties** — all 80 are A, B or C | `BUSINESS_RULES.md` says `H` is excluded from auto-scheduling; this copy has none, so that path is untested here |
| `refresh_tokens`: 2343 rows | Matches the finding in [PROJECT_AS_IS.md §9](../../PROJECT_AS_IS.md#9-pre-existing-issues-noted-during-inspection) that logout never revokes tokens, so they accumulate |

## Parties by zone and category

| Zone | A | B | C |
|---|---|---|---|
| City Saddar | 19 | 14 | 21 |
| Hyderi | 10 | 8 | 8 |

---

## Re-run this after the migration

```sql
USE masjid_scheduling;

SELECT 'admins' AS tbl, COUNT(*) AS exact_rows FROM admins
UNION ALL SELECT 'zones', COUNT(*) FROM zones
UNION ALL SELECT 'mohallahs', COUNT(*) FROM mohallahs
UNION ALL SELECT 'parties', COUNT(*) FROM parties
UNION ALL SELECT 'venues', COUNT(*) FROM venues
UNION ALL SELECT 'miqaats', COUNT(*) FROM miqaats
UNION ALL SELECT 'schedules', COUNT(*) FROM schedules
UNION ALL SELECT 'schedule_edits', COUNT(*) FROM schedule_edits
UNION ALL SELECT 'ratings', COUNT(*) FROM ratings
UNION ALL SELECT 'performance_ratings', COUNT(*) FROM performance_ratings
UNION ALL SELECT 'party_venue_history', COUNT(*) FROM party_venue_history
UNION ALL SELECT 'refresh_tokens', COUNT(*) FROM refresh_tokens
UNION ALL SELECT 'members', COUNT(*) FROM members;

-- And confirm the new tables landed with the RIGHT collation:
SELECT TABLE_COLLATION, COUNT(*) AS n
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
GROUP BY TABLE_COLLATION;
-- Expected: one row only — utf8mb4_general_ci, 33 tables.
-- Two rows means a new table inherited the database default and will break joins.
```

> **Update, 2026-10-30 (T119 rollback rehearsal).** This count drifted to 2368 over 25 test
> runs. The cause was a test-harness leak, not the module: `destroyFixtures` deleted test
> refresh tokens by `(user_role, user_id)`, which missed the token that
> `authCoordinatorFallthrough.test.ts` deliberately mints under `role: "not_a_real_role"` to
> document the pre-existing unguarded fallthrough. Those 25 rows have been removed and the
> teardown now also clears any role outside the five the application issues — precise, because
> such a row can only be a test artefact, and safe, because deleting by `user_id` alone could
> take a real user's session. Verified: a full 391-test run now leaves the count at exactly
> 2343.
>
> `refresh_tokens` is the one table whose count may legitimately differ, since signing in
> during testing inserts rows. Compare it before and after the migration *itself*, not across
> a testing session.

---

# POST-MIGRATION VERIFICATION — 2026-10-29

Both scripts applied to this database. Results below.

| Check | Expected | Actual |
|---|---|---|
| Tables | 33 | **33** ✅ |
| New tables created | 20 | **20** ✅ |
| **Distinct table collations** | **1** | **1 — `utf8mb4_general_ci` across all 33** ✅ |
| `member_profiles.bmi` | `VIRTUAL GENERATED` | **`VIRTUAL GENERATED`** ✅ |
| Direct write to `bmi` | rejected | **error 3105, rejected** ✅ |
| `bmi` computed | 23.95 at 174cm/72.5kg | **23.95** ✅ |
| `its_no` cross-table join | executes | **executes, no error 1267** ✅ |
| Every existing row count | unchanged | **all 12 identical** ✅ |
| `ensureSchema` columns | already present | **all 3 present, startup is a no-op** ✅ |
| Backend starts | `/health` ok | **ok, `db_name: masjid_scheduling`** ✅ |

The collation row is the one that matters: before the fix, new tables would have inherited the
database default `utf8mb4_0900_ai_ci` and that join would have failed with error 1267.

Lookups seeded: `sanads` 10 (authoritative, `is_draft = 0`), `marital_statuses` 4,
`tamreen_frequencies` 6, `tamreen_methods` 7, `skills` 45 — all draft except the Sanads.
`titles`, `sharafs`, `halqas`, `mozes`, `places` intentionally **0**.

---

## ⚠️ Correction: Tab 8 is places visited, and the derived list was wrong

The seed originally built the Tab 8 list from `SELECT DISTINCT miqaat_name FROM miqaats`. On
real data that produced **19 types from 19 rows — nothing collapsed**, which exposed what
`miqaats` actually holds:

```
All Waaz
2nd Day | 3ji Raat Majlis        ... through ...  9th Day | Ashura Raat Majlis
Syedna Hatim Bin Syedna Ibrahim (R.A.)
Syedi Hasanfeer Shaheed (A.Q.)
Syedi Fakhruddin Shaheed (A.Q.)
16mi Raat - Safar-ul-Muzaffar 1448H     <-- a Hijri YEAR inside the name
Chehlum Raat: Imam Hussain (S.A.)
Shahadat Raat: Imam Hasan (S.A.)
Milad Raat: Imam-uz-Zaman (S.A.)
Shahadat Raat: Moulatona Fatema (S.A.)
16mi Raat - Rabi-ul-Akhar
16mi Raat - Jamadil Awwal
```

Every row is dated between 2026-06-16 and 2026-10-25, and 18 of 19 are `is_active = 0`. So
`miqaats` is **the majlis schedule for a single Hijri year (1448H)** — individual sessions on a
calendar.

**The project owner then clarified what Tab 8 actually means**: the existing `miqaats` table is
for *scheduling*, while Tab 8's Miqaat is **the places a member has visited**, with how many
times and in which years.

That makes the derivation wrong in **kind**, not merely too granular. A majlis session is not a
place, so no amount of pruning would have turned that list into the right one. The design was
right to refuse to reuse `miqaats`; it was wrong to then borrow its *values*.

What changed as a result:

The word "Miqaat" was then dropped from the member module altogether, so nothing in it can be
confused with the scheduling table of the same name:

| Originally | Now |
|---|---|
| `miqaat_types` | **`places`** |
| `miqaat_type_name` / `miqaat_type_id` | `place_name` / `place_id` |
| `member_miqaats` | **`member_place_visits`** |
| `member_miqaat_years` | **`member_place_visit_years`** |
| `attended_year` | `visited_year` |
| Tab 8 titled "Miqaat" | Tab 8 titled **"Places Visited"** |
| seeded with 19 derived rows | **empty — awaiting your list** |

The existing `miqaats` table and everything in the scheduling module are untouched.

The rename was free because the tables were empty and no code referenced them; it would not
have been later.

To populate it:

```sql
INSERT INTO places (place_name, display_order, is_active, is_draft)
VALUES ('<place>', 1, 1, 0);
```

> **Still open**: Tab 9 (Ashara Mubaraka) has its own `Moze` field, which is also a place. If
> `mozes` and `places` are the same set, the two lookups should be merged into one. They
> are separate for now only because the requirement lists them as separate fields.

## Rollback

`membership_rollback.sql` drops the 20 new tables and deletes
`refresh_tokens` rows where `user_role = 'member'`. Nothing else is touched. A full dump of
this database was taken before the migration and is in `dumps/` (gitignored).
