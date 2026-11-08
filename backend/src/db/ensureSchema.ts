import { pool } from "./pool";

export async function ensureSchema() {
  // FIRST, before anything that alters member_profiles. See repairBmiColumn: until this has
  // run, any ALTER on that table rebuilds it, materialises the virtual bmi column, and dies
  // on the first row whose height makes bmi overflow. That is what took the server down on
  // 2026-11-07, and the repair has to come before the ALTERs that trip it.
  await repairBmiColumn();

  const [schedulePublishColumnRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'schedules'
       AND COLUMN_NAME = 'is_published'`
  );

  if (Number(schedulePublishColumnRows[0]?.cnt ?? 0) === 0) {
    await pool.query(
      `ALTER TABLE schedules
       ADD COLUMN is_published TINYINT(1) NOT NULL DEFAULT 0
       AFTER is_manual`
    );
  }

  const [venueAddressColumnRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'venues'
       AND COLUMN_NAME = 'address'`
  );
  if (Number(venueAddressColumnRows[0]?.cnt ?? 0) === 0) {
    await pool.query(`ALTER TABLE venues ADD COLUMN address VARCHAR(255) NULL AFTER whatsapp_number`);
  }

  const [venueMapLinkColumnRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'venues'
       AND COLUMN_NAME = 'google_map_link'`
  );
  if (Number(venueMapLinkColumnRows[0]?.cnt ?? 0) === 0) {
    await pool.query(`ALTER TABLE venues ADD COLUMN google_map_link VARCHAR(500) NULL AFTER address`);
  }

  await ensureAqaMoulaAsharaLookup();
  await ensureZikrEHussainColumn();
  await ensureAsharaVenueColumn();
  await ensureProfileEditAudit();
  await ensurePersonalTabColumns();
  await ensureHizbTabColumns();
}

/**
 * Tab 3's Idarat registration and the 5 Kalam upload note (FR-049b, FR-049c).
 *
 * Here for the same reason as the rest of this file: the backend has shipped ahead of its
 * migration before, and a form field whose column does not exist fails on save.
 */
async function ensureHizbTabColumns() {
  const columns: Array<[string, string]> = [
    [
      "registered_with_idaratuz_zakereen",
      "ALTER TABLE member_profiles ADD COLUMN registered_with_idaratuz_zakereen TINYINT(1) NULL AFTER zikr_e_hussain_since_year"
    ],
    [
      "five_kalam_uploaded_when",
      "ALTER TABLE member_profiles ADD COLUMN five_kalam_uploaded_when VARCHAR(150) NULL AFTER registered_with_idaratuz_zakereen"
    ]
  ];

  for (const [column, alter] of columns) {
    const [rows] = await pool.query<any[]>(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'member_profiles'
         AND COLUMN_NAME = :column`,
      { column }
    );
    if (Number(rows[0]?.cnt ?? 0) === 0) await pool.query(alter);
  }
}

/**
 * Widens and guards the generated `bmi` column.
 *
 * WHAT WENT WRONG. `bmi` is VIRTUAL, so it is computed on read and never stored. A member
 * who typed their height in METRES — 1.75 rather than 175 — saved without complaint, because
 * nothing evaluated bmi at write time. The stored row was fine; the derived value was
 * 70 / (0.0175^2) = 228,571, against a DECIMAL(5,2) ceiling of 999.99.
 *
 * It stayed invisible until an ALTER TABLE on member_profiles rebuilt the table, which
 * materialises every virtual column for every row. The rebuild failed, `ensureSchema` threw,
 * and the server would not boot at all — one member's typo, surfaced months later by an
 * unrelated migration.
 *
 * THE FIX IS THE EXPRESSION, NOT THE WIDTH. Widening alone does not close it: at the limits
 * the old expression still allowed (height 0.01cm, weight 999.99kg) bmi reaches 1e11, which
 * overflows any sane column. So the expression now yields NULL unless BOTH inputs are
 * plausible for a person. Within those bounds the largest possible value is 500 / 0.5^2 =
 * 2000.00, which is why DECIMAL(6,2) is enough and not merely bigger.
 *
 * Idempotent on the precision: once the column is DECIMAL(6,2) this does nothing. It runs
 * before every other ALTER in this file, because those are what trigger the rebuild.
 */
async function repairBmiColumn() {
  const [rows] = await pool.query<any[]>(
    `SELECT NUMERIC_PRECISION AS precision_digits
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_profiles'
       AND COLUMN_NAME = 'bmi'`
  );
  // No column, no profiles table yet: a fresh database gets the right definition from the
  // CREATE TABLE and needs nothing here.
  if (rows.length === 0) return;
  if (Number(rows[0]?.precision_digits ?? 0) === 6) return;

  await pool.query(
    `ALTER TABLE member_profiles
     MODIFY COLUMN bmi DECIMAL(6,2) AS (
       IF(height_cm BETWEEN 50 AND 300 AND weight_kg BETWEEN 2 AND 500,
          ROUND(weight_kg / POW(height_cm / 100, 2), 2),
          NULL)
     ) VIRTUAL COMMENT 'FR-064. Generated, so no write can reach it. NULL unless both inputs are plausible for a person - an implausible height is a typo, and a BMI derived from one is worse than no BMI.'`
  );
}

/**
 * Tab 1's Nationality and Mohallah (FR-040a, FR-040b).
 *
 * Here for the same reason as everything else in this file: the backend has shipped ahead of
 * its migration before, and a form field whose column does not exist fails on save with
 * nothing useful to show the member.
 */
async function ensurePersonalTabColumns() {
  const [nationality] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_profiles'
       AND COLUMN_NAME = 'nationality'`
  );
  if (Number(nationality[0]?.cnt ?? 0) === 0) {
    await pool.query(
      "ALTER TABLE member_profiles ADD COLUMN nationality VARCHAR(100) NULL AFTER marital_status_id"
    );
  }

  const [mohallah] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_profiles'
       AND COLUMN_NAME = 'mohallah_id'`
  );
  if (Number(mohallah[0]?.cnt ?? 0) === 0) {
    await pool.query(
      "ALTER TABLE member_profiles ADD COLUMN mohallah_id INT UNSIGNED NULL AFTER residence_address"
    );
  }

  // Last, and only once the column exists: a constraint on a missing column fails the boot.
  const [fk] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_profiles'
       AND CONSTRAINT_NAME = 'fk_member_profiles_mohallah_id'`
  );
  if (Number(fk[0]?.cnt ?? 0) === 0) {
    await pool.query(
      `ALTER TABLE member_profiles
       ADD CONSTRAINT fk_member_profiles_mohallah_id
         FOREIGN KEY (mohallah_id) REFERENCES mohallahs(id) ON DELETE RESTRICT`
    );
  }
}

/**
 * FR-047a. Who changed a member's profile, when, and which fields.
 *
 * Field NAMES only — never the values. Tab 6 holds medical data and FR-066 says health
 * values must appear in no log line, so an audit row records that `blood_group` changed
 * without copying the blood group into a second table that would then need protecting just
 * as carefully.
 */
async function ensureProfileEditAudit() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS member_profile_edits (
       id INT UNSIGNED NOT NULL AUTO_INCREMENT,
       member_account_id INT UNSIGNED NOT NULL,
       edited_by_admin_id INT UNSIGNED NOT NULL,
       edited_by_role ENUM('admin') NOT NULL,
       changed_fields TEXT NOT NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       KEY idx_member_profile_edits_member (member_account_id, created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
  );
}

/**
 * Tab 3's "Since when have you been doing Zikr e Hussain AS?" (FR-049a).
 *
 * Here for the same reason as the lookup below it: the backend has been released ahead of its
 * migration once already, and a form field whose column does not exist fails on save with
 * nothing useful to show the member.
 */
async function ensureZikrEHussainColumn() {
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_profiles'
       AND COLUMN_NAME = 'zikr_e_hussain_since_year'`
  );
  if (Number(rows[0]?.cnt ?? 0) === 0) {
    await pool.query(
      `ALTER TABLE member_profiles
       ADD COLUMN zikr_e_hussain_since_year SMALLINT UNSIGNED NULL AFTER hizb_role`
    );
  }
}

/**
 * Tab 9's Venue (FR-077c), which replaced Mohallah.
 *
 * `venues` is one of the 13 pre-existing tables. This adds a foreign key FROM a module table
 * TO it and never alters it, so FR-106 holds. The constraint goes on last and only once the
 * column is there, because a constraint on a missing column fails the whole boot.
 */
async function ensureAsharaVenueColumn() {
  const [tableRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_ashara_attendances'`
  );
  if (Number(tableRows[0]?.cnt ?? 0) === 0) return;

  const [columnRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_ashara_attendances'
       AND COLUMN_NAME = 'venue_id'`
  );
  if (Number(columnRows[0]?.cnt ?? 0) === 0) {
    await pool.query(
      `ALTER TABLE member_ashara_attendances
       ADD COLUMN venue_id INT UNSIGNED NULL AFTER mohallah_id`
    );
  }

  const [indexRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_ashara_attendances'
       AND INDEX_NAME = 'idx_member_ashara_venue'`
  );
  if (Number(indexRows[0]?.cnt ?? 0) === 0) {
    await pool.query(
      `ALTER TABLE member_ashara_attendances ADD INDEX idx_member_ashara_venue (venue_id)`
    );
  }

  const [fkRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_ashara_attendances'
       AND CONSTRAINT_NAME = 'fk_member_ashara_attendances_venue_id'`
  );
  if (Number(fkRows[0]?.cnt ?? 0) === 0) {
    await pool.query(
      `ALTER TABLE member_ashara_attendances
       ADD CONSTRAINT fk_member_ashara_attendances_venue_id
         FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT`
    );
  }
}

/**
 * The "Ashara with Aqa Moula" lookup and the Tab 9 column that points at it.
 *
 * This is here because of a deploy-ordering hazard that already bit once: the backend was
 * released with `aqa_moula_asharas` in its lookup registry before the migration had been run,
 * so the admin Dropdown Lists index queried a table that did not exist and the whole page
 * failed with "Could not load the lists" — all eleven lists, not just the new one.
 *
 * Running it at boot means the code can never be ahead of its own schema. It does the same
 * work as section 4b of MEMBERSHIP_LIVE_INSTALL.sql and is idempotent in the same way, so
 * whichever runs first makes the other a no-op.
 *
 * COLLATE is explicit and not negotiable. The live database defaults to utf8mb3_general_ci
 * while every table the application uses is utf8mb4_general_ci; a table created without it
 * would inherit utf8mb3 and fail every join against the rest of the schema.
 */
async function ensureAqaMoulaAsharaLookup() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS aqa_moula_asharas (
       id INT UNSIGNED NOT NULL AUTO_INCREMENT,
       aqa_moula_ashara_name VARCHAR(150) NOT NULL,
       hijri_year SMALLINT UNSIGNED NULL,
       display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
       is_active TINYINT(1) NOT NULL DEFAULT 1,
       is_draft TINYINT(1) NOT NULL DEFAULT 1,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       UNIQUE KEY uq_aqa_moula_asharas_year (hijri_year)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
  );

  // FR-077b. A table created before the year column existed is skipped by the CREATE above,
  // so the column and its unique key are added here if missing — before the early return
  // below, because the lookup routes read this column whether or not Tab 9's table exists.
  const [yearColumnRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'aqa_moula_asharas'
       AND COLUMN_NAME = 'hijri_year'`
  );
  if (Number(yearColumnRows[0]?.cnt ?? 0) === 0) {
    await pool.query(
      `ALTER TABLE aqa_moula_asharas
       ADD COLUMN hijri_year SMALLINT UNSIGNED NULL AFTER aqa_moula_ashara_name`
    );
  }

  const [yearIndexRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'aqa_moula_asharas'
       AND INDEX_NAME = 'uq_aqa_moula_asharas_year'`
  );
  if (Number(yearIndexRows[0]?.cnt ?? 0) === 0) {
    await pool.query(
      `ALTER TABLE aqa_moula_asharas
       ADD UNIQUE KEY uq_aqa_moula_asharas_year (hijri_year)`
    );
  }

  // FR-077c. The same place may be entered for more than one year, so the name is no longer
  // unique. A table created before this still has the key; dropping it removes no data.
  const [nameIndexRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'aqa_moula_asharas'
       AND INDEX_NAME = 'uq_aqa_moula_asharas_name'`
  );
  if (Number(nameIndexRows[0]?.cnt ?? 0) > 0) {
    await pool.query(`ALTER TABLE aqa_moula_asharas DROP INDEX uq_aqa_moula_asharas_name`);
  }

  // Only meaningful once the membership module itself has been installed. On a database
  // without it there is no table to add a column to, and nothing that would read one.
  const [asharaTableRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_ashara_attendances'`
  );
  if (Number(asharaTableRows[0]?.cnt ?? 0) === 0) return;

  const [columnRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_ashara_attendances'
       AND COLUMN_NAME = 'aqa_moula_ashara_id'`
  );
  if (Number(columnRows[0]?.cnt ?? 0) === 0) {
    await pool.query(
      `ALTER TABLE member_ashara_attendances
       ADD COLUMN aqa_moula_ashara_id INT UNSIGNED NULL AFTER mohallah_id`
    );
  }

  const [indexRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_ashara_attendances'
       AND INDEX_NAME = 'idx_member_ashara_aqa_moula'`
  );
  if (Number(indexRows[0]?.cnt ?? 0) === 0) {
    await pool.query(
      `ALTER TABLE member_ashara_attendances
       ADD INDEX idx_member_ashara_aqa_moula (aqa_moula_ashara_id)`
    );
  }

  // Added last, and only once the column exists: a constraint on a missing column fails.
  const [fkRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_ashara_attendances'
       AND CONSTRAINT_NAME = 'fk_member_ashara_attendances_aqa_moula_ashara_id'`
  );
  if (Number(fkRows[0]?.cnt ?? 0) === 0) {
    await pool.query(
      `ALTER TABLE member_ashara_attendances
       ADD CONSTRAINT fk_member_ashara_attendances_aqa_moula_ashara_id
         FOREIGN KEY (aqa_moula_ashara_id) REFERENCES aqa_moula_asharas(id) ON DELETE RESTRICT`
    );
  }
}
