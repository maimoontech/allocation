# Local Development Database

How to get a working local MPSS environment with the Membership Module tables in place.

Two routes. **Route A** uses the sample data in this folder and works right now. **Route B**
exports your real production data — better fidelity, but it puts live personal data on your
laptop, so read the warning first.

Detected on this machine: **MySQL 8.0.46**, service `MySQL80`, running and listening on 3306.
Client at `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe` (not on `PATH` by default).

---

## Route A — sample data (recommended to start)

### 1. Put the MySQL client on PATH for this shell

```bash
export PATH="/c/Program Files/MySQL/MySQL Server 8.0/bin:$PATH"
```

PowerShell:

```powershell
$env:PATH = "C:\Program Files\MySQL\MySQL Server 8.0\bin;$env:PATH"
```

### 2. Run the setup script

```bash
cd database/local-dev
mysql -h 127.0.0.1 -u root -p < local_dev_setup.sql
```

It creates the database **`mpss_local`** — deliberately *not* `masjid_scheduling`, so it
cannot collide with a production copy restored onto the same server.

> **It begins with `DROP DATABASE IF EXISTS mpss_local`.** That is what makes it repeatable:
> run it again any time to get back to a clean state. It touches no other database.

Expect at the end:

| Check | Expected |
|---|---|
| Tables created | **33** (13 existing + 20 membership) |
| `bmi` column | `VIRTUAL GENERATED` |
| BMI for the sample member | about **23.95** (72.50 kg at 174 cm) |
| Tab 8 consistency | both rows `OK` |

### 3. Finish `backend/.env`

Already created for you, pointing at `mpss_local` with a freshly generated `JWT_SECRET`.
**One field is blank — `DB_PASS`.** Add your local MySQL root password.

Prefer a dedicated user over root:

```sql
CREATE USER 'mpss_local'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT ALL PRIVILEGES ON mpss_local.* TO 'mpss_local'@'localhost';
FLUSH PRIVILEGES;
```

then set `DB_USER=mpss_local` and `DB_PASS` to match.

### 4. Run it

```bash
npm run dev:backend    # http://localhost:4000  — check /health
npm run dev:frontend   # http://localhost:5173
```

`backend/src/config/env.ts` refuses to start and lists every missing variable, so a blank
`DB_PASS` fails loudly rather than mysteriously.

### 5. Sign in

All passwords are weak and published. **Local only.**

| Role | Role dropdown | Identifier | Password |
|---|---|---|---|
| Admin | Admin | `admin` | `Admin@1234` |
| Zonal Head | Zonal Head | `Karachi Central` or `1` | `Zone@1234` |
| Party | Party | `30100001` | `Party@1234` |
| Coordinator | Venue Coordinator | `Saifee Masjid Hall` or `1` | `Venue@1234` |
| Member | *Member* — not built yet | `30200001` | `Member@1234` |

**Member sign-in does not work yet.** The tables and accounts exist, but the `member` branch
in `authenticate()`, the `Role` union entry and the login-page option are tasks T044–T056, not
yet implemented. Until then, inspect member data with SQL.

---

## What the sample data gives you

| | |
|---|---|
| 3 zones, 6 mohallahs, 8 venues | one venue inactive, for filter testing |
| 11 parties | categories A, B, C and H; one inactive. H is excluded from auto-scheduling |
| 5 miqaats | every `hijri_date` produced by the project's own converter, so it is internally consistent |
| 7 schedule rows | mostly published, one unpublished, one manual — so Party and Coordinator screens are not empty |
| 5 member accounts | one per state the module must handle |

Member accounts and what each is for:

| ITS No | State | Tests |
|---|---|---|
| `30200001` | password change outstanding | the forced-change flow |
| `30200002` | password change outstanding | a second fresh account |
| `30200003` | settled, **full** profile across all 12 tabs | reads, repeatables, BMI, Hijri DOB |
| `30200004` | settled, **partial** profile (Tab 1 only) | that an incomplete profile saves and reloads |
| `30200005` | **deactivated** | that sign-in is refused, with the same message as a wrong password |

### The four placeholder lookups

`titles`, `sharafs`, `halqas` and `mozes` are seeded here with labels like
`LOCAL TEST Title A`, purely so Tabs 2, 7, 9 and 10 can be exercised.

The **production** seed (`database/membership_seed.sql`)
leaves those four tables **empty on purpose** — filling them would mean inventing Dawoodi Bohra
religious and organisational terms and presenting them as real. The labels here say
`LOCAL TEST` so they can never be mistaken for the genuine article.

Replace them with your authoritative values when you have them:

```sql
DELETE FROM titles WHERE title_name LIKE 'LOCAL TEST%';
INSERT INTO titles (title_name, display_order, is_active, is_draft)
VALUES ('<real value>', 1, 1, 0);
```

### Draft flags

Every seeded lookup value except the ten Sanads carries `is_draft = 1`, which the UI will
render as `DRAFT — NEEDS REVIEW`. The Sanads are `is_draft = 0` because those ten are named
verbatim in the requirement and are therefore authoritative. Clear a flag once reviewed:

```sql
UPDATE marital_statuses SET is_draft = 0;
```

---

## Route B — export your real production data

Higher fidelity, and the only way to test against real volumes and real edge cases.

> ⚠️ **This copies live personal data — names, contact numbers, ITS numbers, password hashes —
> onto your development machine.** Keep the dump off shared drives and out of git (`*.sql` in
> `database/local-dev/` is not currently gitignored; see below). Delete it when you are done.

### Option 1 — the application's own backup endpoint (easiest)

The project already has this, and it iterates `SHOW TABLES`, so it picks up new tables
automatically:

```bash
# Sign in as admin against production and keep the token
curl -s -X POST https://allocation-msl6.onrender.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin","password":"<your admin password>","role":"admin"}'

# Then, with the token from that response:
curl -H "Authorization: Bearer <token>" \
  https://allocation-msl6.onrender.com/api/v1/import-export/database-backup \
  -o prod-backup-$(date +%Y%m%d-%H%M%S).sql
```

It emits `SHOW CREATE TABLE` plus `INSERT` statements wrapped in
`SET FOREIGN_KEY_CHECKS=0/1`. No server access needed — just an admin account.

### Option 2 — `mysqldump` (if you have direct database access)

```bash
mysqldump \
  -h <prod-host> -P 3306 -u <prod-user> -p \
  --single-transaction --quick --routines --events \
  --default-character-set=utf8mb4 \
  --databases masjid_scheduling \
  > prod-backup-$(date +%Y%m%d-%H%M%S).sql
```

`--single-transaction` takes a consistent snapshot without locking InnoDB tables, so it is
safe against a live server.

**Schema only, no personal data** — useful if you want real structure without real people:

```bash
mysqldump -h <prod-host> -u <prod-user> -p --no-data \
  --databases masjid_scheduling > prod-schema-only.sql
```

### Restoring, then adding the Membership tables

```bash
# 1. Restore under a different name so it cannot be confused with mpss_local
mysql -h 127.0.0.1 -u root -p -e "CREATE DATABASE mpss_prodcopy CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
mysql -h 127.0.0.1 -u root -p mpss_prodcopy < prod-backup-YYYYMMDD-HHMMSS.sql

# 2. Record the before-state row counts (quickstart.md section 1) — needed to prove
#    the migration changed nothing

# 3. Apply the membership migration and seed
cd ..   # from database/local-dev up to database/
mysql -h 127.0.0.1 -u root -p mpss_prodcopy < membership_schema.sql
mysql -h 127.0.0.1 -u root -p mpss_prodcopy < membership_seed.sql

# 4. Re-run the row counts. Every existing number must be identical — the migration is
#    additive only, so any difference means something else ran.
```

Then point `DB_NAME=mpss_prodcopy` in `backend/.env`.

This path also completes tasks **T006, T007, T008, T014, T015 and T016** in
`specs/001-membership-module/tasks.md`, which is exactly where implementation is currently
blocked.

### Keep dumps out of git

`.gitignore` covers `.env` but not `*.sql`, and `database/` is a tracked folder. Before
putting a production dump here:

```bash
echo "database/local-dev/*-backup-*.sql" >> .gitignore
echo "database/local-dev/prod-*.sql" >> .gitignore
```

---

## Useful queries

```sql
USE mpss_local;

-- Every member account and whether it has a profile
SELECT ma.id, ma.its_no, ma.member_name, ma.must_change_password, ma.is_active,
       IF(mp.id IS NULL, 'no', 'yes') AS has_profile
FROM member_accounts ma
LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
ORDER BY ma.id;

-- The full sample profile, with the derived values
SELECT ma.its_no, mp.name, mp.surname, mp.dob_gregorian, mp.dob_hijri_text,
       mp.height_cm, mp.weight_kg, mp.bmi, z.zone_name, p.party_name, mp.hizb_role
FROM member_profiles mp
JOIN member_accounts ma ON ma.id = mp.member_account_id
LEFT JOIN zones z ON z.id = mp.zone_id
LEFT JOIN parties p ON p.id = mp.party_id;

-- BMI is generated: this must FAIL with
-- "The value specified for generated column 'bmi' ... is not allowed"
UPDATE member_profiles SET bmi = 99 WHERE member_account_id = 3;

-- Tab 3 dependent dropdown: parties available for each zone
SELECT z.zone_name, p.party_name, p.category
FROM zones z JOIN parties p ON p.zone_id = z.id
WHERE p.is_active = 1 ORDER BY z.id, p.party_name;

-- Which lookup values still need review
SELECT 'titles' AS lookup_table, COUNT(*) AS total, SUM(is_draft) AS draft FROM titles
UNION ALL SELECT 'sharafs', COUNT(*), SUM(is_draft) FROM sharafs
UNION ALL SELECT 'halqas', COUNT(*), SUM(is_draft) FROM halqas
UNION ALL SELECT 'mozes', COUNT(*), SUM(is_draft) FROM mozes
UNION ALL SELECT 'places', COUNT(*), SUM(is_draft) FROM places
UNION ALL SELECT 'sanads', COUNT(*), SUM(is_draft) FROM sanads
UNION ALL SELECT 'skills', COUNT(*), SUM(is_draft) FROM skills;
```

---

## Reset

```bash
mysql -h 127.0.0.1 -u root -p < local_dev_setup.sql
```

Idempotent by design: it drops and recreates `mpss_local` every time.

---

## Files

| File | Purpose |
|---|---|
| `local_dev_setup.sql` | Everything: schema + membership tables + sample data. Local only |
| `README.md` | This file |
| `../mpss_mysql.sql` | The production schema. Section 1 of the setup script matches it |
| `../../database/` | The real migration, seed and rollback scripts for production |
| `../../specs/001-membership-module/quickstart.md` | The full apply / verify / release runbook |
