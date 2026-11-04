# Data Model — Membership Module

**Feature**: `001-membership-module` · **Date**: 2026-10-29 · **Engine**: MySQL 8 / InnoDB / `utf8mb4` / **`utf8mb4_general_ci`**

This is the database design deliverable. It states every new table, its columns and
constraints, how it relates to the existing schema, and which requirement each rule serves.
Draft SQL implementing it is in [migrations/](./migrations/) — **not executed**.

Conventions followed throughout, taken from `database/mpss_mysql.sql` and recorded in
[PROJECT_AS_IS.md](../../PROJECT_AS_IS.md#database-conventions-to-follow-for-new-tables):
`snake_case`, plural table names, `id INT UNSIGNED NOT NULL AUTO_INCREMENT` primary keys,
`fk_<table>_<column>` / `uq_<table>_<cols>` / `idx_<table>_<cols>` naming, `is_*` booleans as
`TINYINT(1)`, `password_hash VARCHAR(255)`, and `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`.

Two deliberate departures from existing practice, both justified:

1. **Every new table carries `updated_at`.** Most existing tables do not (only `admins` and `zones`). Member-maintained data is edited repeatedly by its owner, so knowing when is worth the column.
2. **Lookup values live in tables, not inline `ENUM`s**, wherever the request says the list must be maintainable (FR-093). Closed sets fixed by the request — blood groups, prefixes, education levels, roles — stay as inline `ENUM`s, matching `parties.category ENUM('A','B','C','H')`.

---

## 1. Relationship overview

```text
                 EXISTING (read-only to this module)
                 ───────────────────────────────────
                 zones ──┬──> mohallahs            parties.its_no  (UNIQUE)
                         └──> parties                    ·
                                 ·                       · no FK: a member is a person,
  miqaats (scheduling calendar — NOT used, NOT related to Tab 8)      · a party is a group
                                                          ·
                 NEW                                      ·
                 ───                                      ·
  member_accounts ◄─────────────────────────────── its_no (UNIQUE, plain column)
     │  (id, its_no, password_hash, must_change_password, password_changed_at, is_active)
     │
     ├─1:1─> member_profiles ──┬──> zones          (SET NULL)
     │                         ├──> parties        (SET NULL)
     │                         ├──> marital_statuses
     │                         ├──> sanads
     │                         ├──> halqas
     │                         ├──> tamreen_frequencies  (×2: party, solo)
     │                         └──> tamreen_methods
     │
     ├─1:1─> member_photos                     (MEDIUMBLOB, kept off the profile row)
     │
     ├─1:N─> member_titles ─────────> titles
     ├─1:N─> member_sharafs ────────> sharafs
     ├─1:N─> member_skills ─────────> skills
     ├─1:N─> member_place_visits ────────> places
     │          └─1:N─> member_place_visit_years
     └─1:N─> member_ashara_attendances ──┬──> mozes
                                         └──> mohallahs   (SET NULL, optional)

  member_login_attempts        (its_no + hashed IP, no FK — records attempts on absent accounts too)
  refresh_tokens               EXISTING, reused unchanged (polymorphic by user_role string)
```

---

## 2. Mapping to the existing schema

| Need | Existing table | How it is used | Changed? |
|---|---|---|---|
| Tab 3 Zone | `zones` | FK target from `member_profiles.zone_id` | **No** |
| Tab 3 Party | `parties` | FK target from `member_profiles.party_id`; `parties.zone_id` drives the dependent dropdown | **No** |
| Tab 9 Mohallah | `mohallahs` | FK target, optional | **No** |
| Member sessions | `refresh_tokens` | `user_role = 'member'`, `user_id = member_accounts.id`. Polymorphic by string with no FK, so it already accepts a new role | **No** |
| Tab 8 Miqaat | `miqaats` | **Not used, and not related.** `miqaats` is the *scheduling calendar* — individual majlis sessions of one Hijri year. Tab 8 records the **places a member has visited**, which is a different kind of thing entirely. New `places` table — see §5 | **No** |
| Dormant member table | `members` | **Not read, written or altered.** See [research R1](./research.md#r1--where-member-credentials-live) | **No** |

**No existing table is altered, and no existing row is read for write purposes.** That is how
FR-106 is satisfied by construction, and it is what makes rollback a matter of dropping new
tables.

---

## 3. Authentication tables

### `member_accounts`

The member's credential record. One row per person who can sign in as a member.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `INT UNSIGNED` AI | no | PK |
| `its_no` | `VARCHAR(20)` | no | `uq_member_accounts_its_no`. Spelled to match `parties.its_no` |
| `member_name` | `VARCHAR(150)` | yes | From the provisioning roster, so an admin list is readable before the member fills Tab 1 |
| `password_hash` | `VARCHAR(255)` | no | bcrypt, cost 10 — matches every existing role |
| `must_change_password` | `TINYINT(1)` | no | default `1` · FR-004, FR-017, FR-018 |
| `password_changed_at` | `DATETIME` | yes | `NULL` until the member sets their own. Drives FR-005 and FR-022 |
| `is_active` | `TINYINT(1)` | no | default `1` · FR-006, FR-007 |
| `last_login_at` | `DATETIME` | yes | Matches the existing role tables |
| `created_at` / `updated_at` | `DATETIME` | no | `CURRENT_TIMESTAMP` / `ON UPDATE CURRENT_TIMESTAMP` |

**Requirements served**: FR-002 (`uq_member_accounts_its_no` makes duplicate ITS Numbers
impossible at the engine level, not just in code), FR-004, FR-005, FR-007, FR-015.

`password_changed_at` carries two jobs and both matter:

- **FR-005** — re-running a roster updates the password only where this is `NULL`, so a member who has already chosen one is never reset.
- **FR-022** — `requireMember` rejects any token whose `iat` is earlier than this timestamp, which is how a session established with the old password stops working. See [research R3](./research.md#r3--invalidating-sessions-after-a-password-change).

`its_no` is **not** a foreign key to `parties.its_no`. A given ITS Number may identify a member,
a party, both or neither; an FK would require every member to be a party leader and would
couple the two credential sets that FR-011 and FR-012 require to stay separate.

### `member_login_attempts`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `INT UNSIGNED` AI | no | PK |
| `its_no` | `VARCHAR(20)` | no | Recorded as submitted — **no FK**, because attempts against non-existent accounts must also be throttled |
| `ip_hash` | `CHAR(64)` | yes | Salted SHA-256 of the client address. The raw address is never stored |
| `attempted_at` | `DATETIME` | no | default `CURRENT_TIMESTAMP` |
| `succeeded` | `TINYINT(1)` | no | default `0` |

Indexes: `idx_member_login_attempts_its (its_no, attempted_at)`,
`idx_member_login_attempts_ip (ip_hash, attempted_at)`.

**Requirements served**: FR-014. Also gives the system its first failed-authentication audit
trail — it has none today.

Deliberately **no foreign key**: throttling must work for ITS Numbers that have no account, and
an FK would make recording those impossible. Combined with FR-013, this is also why the refusal
message cannot vary by whether the account exists.

The address is hashed because equality is all the throttle needs, and the raw value is personal
data the feature does not require. Rows older than the retention window are pruned on write, so
the table cannot grow without bound.

---

## 4. Profile tables

### `member_profiles`

One row per account, holding every field that occurs once per member — Tab 1, the Tab 2 prefix
year, and Tabs 3, 4, 5, 6, 10, 11 and 12.

`member_account_id` is `NOT NULL UNIQUE` with `ON DELETE CASCADE`, which is what makes the
relationship exactly one-to-one.

**Almost every field is nullable**, by design: FR-033 requires a member to be able to save a
partially completed profile and come back to it. Only the conditional rules in §7 can refuse a
save, and they are enforced in the application where they can produce a message naming the
field and the tab (FR-029).

#### Tab 1 — Personal Information

| Column | Type | Notes |
|---|---|---|
| `first_prefix` | `ENUM('None','Sheikh','Mulla')` | default `'None'` · FR-035. Also gates Tab 2's prefix display (FR-043) |
| `name`, `father_name`, `surname` | `VARCHAR(100)` | FR-036 |
| `father_prefix` | `ENUM('None','Sheikh','Mulla')` | default `'None'` · FR-035 |
| `dob_gregorian` | `DATE` | FR-038 |
| `dob_hijri_day` | `TINYINT UNSIGNED` | FR-039 |
| `dob_hijri_month` | `TINYINT UNSIGNED` | FR-039 |
| `dob_hijri_year` | `SMALLINT UNSIGNED` | FR-039 |
| `dob_hijri_text` | `VARCHAR(50)` | The formatted display string, e.g. `9th Moharram-ul-Haram 1447 AH` |
| `marital_status_id` | `INT UNSIGNED` | FK → `marital_statuses` (`SET NULL`) · FR-040 |
| `residence_address` | `TEXT` | FR-041 |
| `phone_no`, `mobile_no_1`, `mobile_no_2`, `whatsapp_no_1`, `whatsapp_no_2` | `VARCHAR(25)` | FR-041. 25 characters holds `+92 300 1234567` and international forms |
| `email` | `VARCHAR(190)` | FR-042. 190 keeps it indexable under `utf8mb4` if that is ever wanted |

The Hijri date of birth is stored **four ways on purpose**: the three numeric parts make it
sortable and filterable, and `dob_hijri_text` preserves exactly what the member was shown, so
the display can never disagree with the record. All four are derived server-side from
`dob_gregorian` (FR-028) and are never accepted from the client (FR-039).

`its_no` is **not** duplicated here — it lives on `member_accounts` and is read through the
join, so FR-034's read-only guarantee has one source of truth rather than two that can diverge.

#### Tab 2 — `prefix_year SMALLINT UNSIGNED`

One per member, so it belongs on the profile; the Titles themselves repeat and live in
`member_titles` (§6). Range 1950–2026 is checked in the application (FR-044).

#### Tab 3 — Hizb

| Column | Type | Notes |
|---|---|---|
| `zone_id` | `INT UNSIGNED` | FK → `zones` (`SET NULL`) · FR-047 |
| `party_id` | `INT UNSIGNED` | FK → `parties` (`SET NULL`) · FR-048 |
| `hizb_role` | `ENUM('Leader','Side Lead','Member')` | FR-049 |

`ON DELETE SET NULL`, **not** `CASCADE`, which is the one place this design departs from the
schema's blanket `ON DELETE CASCADE` habit — and it must. Cascading would delete a member's
entire profile because their Zone or Party was removed. Setting the reference to null loses the
affiliation and keeps the person.

FR-048 also requires the Party to belong to the selected Zone. No FK can express that, so it is
checked in the application against `parties.zone_id` (§7).

#### Tab 4 — Occupation

| Column | Type | Notes |
|---|---|---|
| `occupation_type` | `ENUM('Job','Business')` | FR-050 |
| `organisation_name` | `VARCHAR(150)` | FR-051. One column; the *label* changes with the type, not the storage |
| `designation` | `VARCHAR(150)` | FR-052 — only meaningful when `occupation_type = 'Job'` |
| `occupation_since_year` | `SMALLINT UNSIGNED` | FR-053 |
| `work_address` | `TEXT` | FR-054 |
| `work_phone_no` | `VARCHAR(25)` | FR-054 |

Skills repeat, so they are in `member_skills` (§6).

#### Tab 5 — Education and Hifz

| Column | Type | Notes |
|---|---|---|
| `education_level` | `ENUM('Primary','Middle','Secondary','Intermediate','Bachelors','Masters','PhD')` | FR-056 |
| `major_subjects` | `VARCHAR(255)` | FR-057 |
| `education_status` | `ENUM('Complete','Ongoing')` | FR-057 |
| `has_hifz_sanad` | `TINYINT(1)` | FR-058 |
| `sanad_id` | `INT UNSIGNED` | FK → `sanads` (`SET NULL`) · FR-059 |
| `hifz_current_surah` | `VARCHAR(100)` | FR-060 |
| `hifz_current_ayyah` | `VARCHAR(50)` | FR-060. Text, not numeric — members may write a range |
| `hifz_last_update` | `DATE` | FR-060 |

Sanad is a lookup table despite being a closed list of ten in the request, because those ten are
domain-specific religious qualifications that are more likely to need correcting than a blood
group is.

#### Tab 6 — Health and Fitness

| Column | Type | Notes |
|---|---|---|
| `blood_group` | `ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-')` | FR-061. A genuinely fixed medical standard — inline `ENUM` is right |
| `is_regular_donor` | `TINYINT(1)` | FR-062 |
| `last_donation_date` | `DATE` | FR-062 |
| `height_cm` | `DECIMAL(5,2)` | FR-063 — centimetres, per spec assumption 10 |
| `weight_kg` | `DECIMAL(5,2)` | FR-063 — kilograms |
| `bmi` | `DECIMAL(5,2)` **generated, virtual** | FR-064 |

```sql
bmi DECIMAL(5,2) AS (
  IF(height_cm > 0 AND weight_kg > 0,
     ROUND(weight_kg / POW(height_cm / 100, 2), 2),
     NULL)
) VIRTUAL
```

A generated column makes FR-064 structurally true rather than merely intended: MySQL **rejects**
any write to it, so no API or UI bug can overwrite it, and it can never drift from the height and
weight it comes from. It also returns `NULL` exactly when either input is absent or
non-positive, which is the second half of what FR-064 asks for. `VIRTUAL` costs no storage, which
suits a value never filtered or sorted on. Needs MySQL 5.7+; see
[research R6](./research.md#r6--deriving-bmi-so-it-cannot-be-overwritten) for the guard and the
fallback.

`DECIMAL`, not `FLOAT`, so a weight of 72.5 is stored as 72.5.

**Access control (FR-065, FR-066)**: these columns are returned only to the owning member and to
explicitly authorised administrators, and are excluded from every existing export. That is
enforced in the API and the import/export entity list, not in the schema — noted here so it is
not overlooked, and covered by a test in [quickstart.md](./quickstart.md).

#### Tab 10 — Asbaq

| Column | Type | Notes |
|---|---|---|
| `asbaq_level` | `ENUM('Zaher','Taweel','Haqiqat')` | FR-078 |
| `halqa_id` | `INT UNSIGNED` | FK → `halqas` (`SET NULL`) · FR-079 |
| `asbaq_ustad` | `VARCHAR(150)` | FR-079. Free text — no Ustad lookup exists |

#### Tab 11 — Tamreen

| Column | Type | Notes |
|---|---|---|
| `attends_karachi_tamreen` | `TINYINT(1)` | FR-080 |
| `tamreen_absence_reason` | `TEXT` | FR-081 — required when the above is `0` |
| `party_tamreen_frequency_id` | `INT UNSIGNED` | FK → `tamreen_frequencies` (`SET NULL`) · FR-082 |
| `solo_tamreen_frequency_id` | `INT UNSIGNED` | FK → `tamreen_frequencies` (`SET NULL`) · FR-082 |
| `tamreen_method_id` | `INT UNSIGNED` | FK → `tamreen_methods` (`SET NULL`) · FR-083 |
| `takes_ustad_assistance` | `TINYINT(1)` | FR-084 |
| `uses_idaratuz_zakereen_books` | `TINYINT(1)` | FR-084 |

Both frequency columns point at the same `tamreen_frequencies` table — the two questions share
one list of answers, so one table with two foreign keys is correct.

#### Tab 12 — Other Sansta Khidmat

| Column | Type | Notes |
|---|---|---|
| `khidmat_type` | `ENUM('Sansta','Umoor','Both')` | FR-085 |
| `sansta_name` | `VARCHAR(150)` | FR-086 |
| `umoor_name` | `VARCHAR(150)` | FR-086 |
| `khidmat_designation` | `VARCHAR(150)` | FR-087 |
| `khidmat_since_year` | `SMALLINT UNSIGNED` | FR-087 — a year, per spec assumption 8 |

Indexes on `member_profiles`: `uq_member_profiles_account (member_account_id)`,
`idx_member_profiles_zone (zone_id)`, `idx_member_profiles_party (party_id)`.

### `member_photos`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `INT UNSIGNED` AI | no | PK |
| `member_account_id` | `INT UNSIGNED` | no | `uq_member_photos_account`, FK `CASCADE` — one photo per member |
| `content_type` | `VARCHAR(50)` | no | `image/jpeg`, `image/png` or `image/webp` only |
| `byte_size` | `INT UNSIGNED` | no | Recorded so the cap can be audited after the fact |
| `width`, `height` | `SMALLINT UNSIGNED` | yes | From the decoded header |
| `sha256` | `CHAR(64)` | no | Lets an unchanged re-upload be detected without comparing blobs |
| `image_data` | `MEDIUMBLOB` | no | FR-037 |
| `created_at` / `updated_at` | `DATETIME` | no | |

**A separate table, not a column on `member_profiles`** — the single most consequential choice
here. Profile reads happen on every form load; sharing the row would drag megabytes into each
one. Keeping the blob apart means profile queries stay cheap, and the `UNIQUE` key makes FR-091
("no previously stored image retrievable") a plain `UPDATE` of one row — there is nowhere for an
old image to survive.

`MEDIUMBLOB` holds 16 MB against a 2 MB cap. `LONGBLOB` would only invite larger uploads.

**Requirements served**: FR-037, FR-088 (`content_type` and `byte_size` validated before
insert), FR-090 (reachable only through an authenticated endpoint), FR-091.

---

## 5. New lookup tables

Ten tables, all the same shape. These are the lists the system does not have today (FR-093).

| Table | Name column | Serves | Seeded? |
|---|---|---|---|
| `sanads` | `sanad_name` | Tab 5 · FR-059 | ✅ 10 values, **authoritative** — named verbatim in the request, so `is_draft = 0` |
| `places` | `place_name` | Tab 8 · FR-070 | ❌ **empty — you supply** |
| `marital_statuses` | `marital_status_name` | Tab 1 · FR-040 | ✅ 4 values, draft — spec assumption 15 |
| `tamreen_frequencies` | `tamreen_frequency_name` | Tab 11 · FR-082 | ✅ 6 values, draft — spec assumption 6 |
| `tamreen_methods` | `tamreen_method_name` | Tab 11 · FR-083 | ✅ 7 values, draft — spec assumption 7 |
| `skills` | `skill_name` | Tab 4 · FR-055 | ✅ 45 generic categories, draft — spec assumption 14; **no external source claimed** (FR-096) |
| `titles` | `title_name` | Tab 2 · FR-045 | ❌ **empty — you supply** |
| `sharafs` | `sharaf_name` | Tab 7 · FR-067 | ❌ **empty — you supply** |
| `halqas` | `halqa_name` | Tab 10 · FR-079 | ❌ **empty — you supply** |
| `mozes` | `moze_name` | Tab 9 · FR-077 | ❌ **empty — you supply** |

**Why five lists are left empty.** `titles`, `sharafs`, `halqas` and `mozes` hold Dawoodi
Bohra religious and organisational terms, and `places` holds the places members visit.
Seeding any of them would mean inventing those names and presenting them as real, which the
request explicitly forbids and which is worse than an empty list — a plausible-looking wrong
value gets selected and stored, and is then indistinguishable from a correct one. FR-095 covers
the consequence: a tab whose list is empty explains itself and still allows the rest of the
profile to be saved.

**`places` was briefly seeded from `miqaats` and that was wrong.** An earlier draft
derived it with `SELECT DISTINCT miqaat_name FROM miqaats`, on the reasoning that the
scheduling table was at least a real source. Running it against live data showed why that
fails: `miqaats` holds the individual majlis sessions of one Hijri year — `2nd Day | 3ji Raat
Majlis`, `Chehlum Raat: Imam Hussain (S.A.)`, even `16mi Raat - Safar-ul-Muzaffar 1448H` with
the year inside the name. Those are occasions on a calendar, not places anyone visits. The
derivation was wrong in **kind**, not merely too granular, so the list is now empty like the
other four.

> **Open question for you.** Tab 9 (Ashara Mubaraka) has its own `Moze` field, which is also a
> place. If `mozes` and `places` draw on the same real-world set, the two lookups should
> be merged into one; if they are genuinely distinct, both stay. They are kept separate here
> only because the requirement lists them as separate fields.

Shared shape:

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `INT UNSIGNED` AI | no | PK |
| `<noun>_name` | `VARCHAR(150)` | no | `uq_<table>_name` |
| `display_order` | `SMALLINT UNSIGNED` | no | default `0` — control order without relying on insertion order or alphabetisation |
| `is_active` | `TINYINT(1)` | no | default `1` — retire a value without breaking rows that reference it |
| `is_draft` | `TINYINT(1)` | no | default `1` — **FR-094** |
| `created_at` / `updated_at` | `DATETIME` | no | |

`is_draft` is how FR-094 is met. Every seeded value starts at `1`, the API returns the flag, and
the UI shows those values as `DRAFT — NEEDS REVIEW`. Clearing the flag is a data edit, not a
code change — which is the point: the five rows marked ⚠️ above hold religious and
organisational terms that must not be presented as authoritative until you have confirmed them.

`is_active` exists separately because retiring a value and reviewing a value are different
actions. A Sharaf no longer conferred should stop appearing in the dropdown while remaining
readable on the profiles that already reference it, which is also why these are referenced with
`ON DELETE SET NULL` or `RESTRICT` rather than `CASCADE` (§6).

**`places`, not the existing `miqaats`** — see §2. The two have nothing to do with each
other beyond the shared word. `miqaats` is the scheduling module's calendar: dated majlis
sessions driving `schedules`, with no unique key on name. Tab 8 records the **places a member
has visited**, how many times, and in which years. Pointing Tab 8 at `miqaats` would attach
member history to rows the scheduling module rewrites every year, for data that is not even the
same kind of thing.

**No new Zone, Party or Mohallah table** (FR-092) — those exist and are used directly.

---

## 6. Repeatable record tables

Each hangs off `member_accounts` with `ON DELETE CASCADE`, so withdrawing an account removes its
records cleanly, and each references its lookup with `ON DELETE RESTRICT` so a lookup value
still in use cannot be deleted out from under a member's profile.

### `member_titles` — FR-046

`member_account_id` (FK CASCADE) · `title_id` (FK → `titles`, RESTRICT) · `title_year SMALLINT UNSIGNED NOT NULL`

`uq_member_titles (member_account_id, title_id, title_year)` — the same title in the same year
cannot be recorded twice, while the same title in different years is legitimate and allowed.

### `member_sharafs` — FR-068

`member_account_id` (CASCADE) · `sharaf_id` (FK → `sharafs`, RESTRICT) · `sharaf_year SMALLINT UNSIGNED NOT NULL`

`uq_member_sharafs (member_account_id, sharaf_id, sharaf_year)`.

### `member_skills` — FR-055

`member_account_id` (CASCADE) · `skill_id` (FK → `skills`, RESTRICT)

`uq_member_skills (member_account_id, skill_id)` — a pure junction; a skill is either claimed or
not.

### `member_place_visits` + `member_place_visit_years` — FR-070 to FR-073

**Tab 8 records the places a member has visited**, with how many times and in which years.
Two tables, because several years attach to each place.

**`member_place_visits`**: `member_account_id` (CASCADE) · `place_id` (FK → `places`,
RESTRICT) · `times_count SMALLINT UNSIGNED NOT NULL`

`uq_member_place_visits (member_account_id, place_id)` — one row per place per member,
which is what makes "how many times, in which years" a single coherent record rather than
scattered duplicates.

**`member_place_visit_years`**: `member_place_visit_id` (FK → `member_place_visits`, CASCADE) ·
`visited_year SMALLINT UNSIGNED NOT NULL`

`uq_member_place_visit_years (member_place_visit_id, visited_year)` — the same year cannot be
listed twice for one place, which is exactly the duplicate that would make FR-073's count check
pass while the data is wrong.

**FR-073 is enforced in the application**, inside the save transaction:
`times_count` must equal `COUNT(*)` of the attached years. MySQL `CHECK` constraints cannot
contain subqueries, so the schema cannot express it; the transaction can, and it can produce the
message FR-073 specifies, naming the place and both counts. See
[research R8](./research.md#r8--enforcing-the-tab-8-count-versus-years-rule).

### `member_ashara_attendances` — FR-074 to FR-077

| Column | Type | Null | Notes |
|---|---|---|---|
| `member_account_id` | `INT UNSIGNED` | no | FK CASCADE |
| `attended_with` | `ENUM('With Aqa Moula TUS','With Aamil')` | no | FR-075 |
| `hijri_year` | `SMALLINT UNSIGNED` | no | FR-076 — 1400 to the current Hijri year |
| `moze_id` | `INT UNSIGNED` | yes | FK → `mozes` (RESTRICT) · FR-077 |
| `mohallah_id` | `INT UNSIGNED` | yes | FK → **existing** `mohallahs` (`SET NULL`) — optional, FR-077 |

`uq_member_ashara (member_account_id, hijri_year)` — one Ashara Mubaraka is observed once a year,
so one record per member per Hijri year. This catches an accidental double entry at the engine
level.

`mohallah_id` is `SET NULL` rather than `RESTRICT` because `mohallahs` belongs to another module
that may legitimately remove a row; the attendance should survive with the place unknown.

The 1400-to-current range is checked in the application, since the upper bound moves with the
calendar and no constraint can express it.

---

## 7. Validation rules that live in the application

The schema enforces everything it can — uniqueness, referential integrity, closed `ENUM` sets,
and a derived BMI that cannot be written. The rules below cannot be expressed as constraints and
are enforced server-side in the profile save, inside the transaction, each producing a message
that names the field and tab (FR-029).

| Rule | Requirement | Why not a constraint |
|---|---|---|
| Party must belong to the selected Zone | FR-048 | Needs a lookup against `parties.zone_id` |
| `times_count` equals the attached year count | FR-073 | Cross-row aggregate; `CHECK` cannot subquery |
| Hijri year between 1400 and the current Hijri year | FR-076 | Upper bound moves with the calendar |
| Title and Prefix years within 1950–2026 | FR-044, FR-046 | A fixed range could be a `CHECK`, but is kept with its siblings for one consistent error path |
| Sanad required when `has_hifz_sanad = 1` | FR-059 | Conditional on another column |
| Reason required when `attends_karachi_tamreen = 0` | FR-081 | Conditional |
| Sansta and/or Umoor name required per `khidmat_type` | FR-086 | Conditional |
| Designation only when `occupation_type = 'Job'` | FR-052 | Conditional |
| Hidden conditional fields cleared on save | FR-052, FR-081, FR-086, and story 5 scenario 6 | Application must decide what "hidden" means |
| Date of birth not future, not implausibly old | FR-038 | Relative to now |
| Donation date not future | FR-062 | Relative to now |
| Since-years not future, not before birth year | FR-053, FR-087 | Relative to now and to another column |
| Email well-formed | FR-042 | Beyond column typing |
| Phone numbers match the accepted format | FR-041 | Beyond column typing |
| Height and weight positive | FR-063, FR-064 | `CHECK` is possible; kept with the others for one error path. The generated column already yields `NULL` for non-positive input |
| Photo is a real image of an accepted type, within the cap | FR-088, FR-089 | Magic-byte inspection |
| ITS Number in a submission ignored | FR-034, FR-098 | Taken from the token, never the body |
| Derived Hijri values ignored if submitted | FR-039 | Computed server-side |

---

## 8. Entity-to-requirement coverage

| Spec entity | Tables |
|---|---|
| Member Account | `member_accounts` (+ `member_login_attempts`, `refresh_tokens`) |
| Member Profile | `member_profiles` |
| Member Photograph | `member_photos` |
| Member Title | `member_titles` → `titles` |
| Member Sharaf | `member_sharafs` → `sharafs` |
| Member Place Visit | `member_place_visits` + `member_place_visit_years` → `places` |
| Member Ashara Attendance | `member_ashara_attendances` → `mozes`, `mohallahs` |
| Member Skill | `member_skills` → `skills` |
| Maintained List | `titles`, `sharafs`, `halqas`, `mozes`, `places`, `sanads`, `marital_statuses`, `skills`, `tamreen_frequencies`, `tamreen_methods` |
| Existing Master Data | `zones`, `parties`, `mohallahs` — referenced, never modified |

**20 new tables, 0 altered, 0 dropped:**

| Group | Count | Tables |
|---|---|---|
| Authentication | 2 | `member_accounts`, `member_login_attempts` |
| Profile | 2 | `member_profiles`, `member_photos` |
| Repeatable records | 6 | `member_titles`, `member_sharafs`, `member_skills`, `member_place_visits`, `member_place_visit_years`, `member_ashara_attendances` |
| Lookups | 10 | `titles`, `sharafs`, `halqas`, `mozes`, `places`, `sanads`, `marital_statuses`, `skills`, `tamreen_frequencies`, `tamreen_methods` |

---

## 9. Retention and sensitivity

Flagged because the spec lists it as a dependency and no position exists yet.

| Data | Sensitivity | Handling |
|---|---|---|
| `password_hash` | Credential | bcrypt cost 10; never returned by any endpoint, never exported (FR-015) |
| Health columns, `member_photos` | Sensitive personal | Owner and authorised admins only; excluded from logs, error messages and general exports (FR-065, FR-066, FR-090, FR-101) |
| Contact details | Personal | Excluded from existing exports unless separately authorised (FR-101) |
| `member_login_attempts.ip_hash` | Pseudonymised | Salted hash, never the raw address; pruned on write |
| Withdrawn member | Personal | `is_active = 0`; profile **retained, not deleted** (FR-007) |

**Open**: a retention period for the profile of a member who has left. Needs your decision
before real data is collected.
