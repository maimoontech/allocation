"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureSchema = ensureSchema;
const pool_1 = require("./pool");
async function ensureSchema() {
    const [schedulePublishColumnRows] = await pool_1.pool.query(`SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'schedules'
       AND COLUMN_NAME = 'is_published'`);
    if (Number(schedulePublishColumnRows[0]?.cnt ?? 0) === 0) {
        await pool_1.pool.query(`ALTER TABLE schedules
       ADD COLUMN is_published TINYINT(1) NOT NULL DEFAULT 0
       AFTER is_manual`);
    }
    const [venueAddressColumnRows] = await pool_1.pool.query(`SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'venues'
       AND COLUMN_NAME = 'address'`);
    if (Number(venueAddressColumnRows[0]?.cnt ?? 0) === 0) {
        await pool_1.pool.query(`ALTER TABLE venues ADD COLUMN address VARCHAR(255) NULL AFTER whatsapp_number`);
    }
    const [venueMapLinkColumnRows] = await pool_1.pool.query(`SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'venues'
       AND COLUMN_NAME = 'google_map_link'`);
    if (Number(venueMapLinkColumnRows[0]?.cnt ?? 0) === 0) {
        await pool_1.pool.query(`ALTER TABLE venues ADD COLUMN google_map_link VARCHAR(500) NULL AFTER address`);
    }
    await ensureAqaMoulaAsharaLookup();
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
    await pool_1.pool.query(`CREATE TABLE IF NOT EXISTS aqa_moula_asharas (
       id INT UNSIGNED NOT NULL AUTO_INCREMENT,
       aqa_moula_ashara_name VARCHAR(150) NOT NULL,
       display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
       is_active TINYINT(1) NOT NULL DEFAULT 1,
       is_draft TINYINT(1) NOT NULL DEFAULT 1,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       UNIQUE KEY uq_aqa_moula_asharas_name (aqa_moula_ashara_name)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);
    // Only meaningful once the membership module itself has been installed. On a database
    // without it there is no table to add a column to, and nothing that would read one.
    const [asharaTableRows] = await pool_1.pool.query(`SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_ashara_attendances'`);
    if (Number(asharaTableRows[0]?.cnt ?? 0) === 0)
        return;
    const [columnRows] = await pool_1.pool.query(`SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_ashara_attendances'
       AND COLUMN_NAME = 'aqa_moula_ashara_id'`);
    if (Number(columnRows[0]?.cnt ?? 0) === 0) {
        await pool_1.pool.query(`ALTER TABLE member_ashara_attendances
       ADD COLUMN aqa_moula_ashara_id INT UNSIGNED NULL AFTER mohallah_id`);
    }
    const [indexRows] = await pool_1.pool.query(`SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_ashara_attendances'
       AND INDEX_NAME = 'idx_member_ashara_aqa_moula'`);
    if (Number(indexRows[0]?.cnt ?? 0) === 0) {
        await pool_1.pool.query(`ALTER TABLE member_ashara_attendances
       ADD INDEX idx_member_ashara_aqa_moula (aqa_moula_ashara_id)`);
    }
    // Added last, and only once the column exists: a constraint on a missing column fails.
    const [fkRows] = await pool_1.pool.query(`SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'member_ashara_attendances'
       AND CONSTRAINT_NAME = 'fk_member_ashara_attendances_aqa_moula_ashara_id'`);
    if (Number(fkRows[0]?.cnt ?? 0) === 0) {
        await pool_1.pool.query(`ALTER TABLE member_ashara_attendances
       ADD CONSTRAINT fk_member_ashara_attendances_aqa_moula_ashara_id
         FOREIGN KEY (aqa_moula_ashara_id) REFERENCES aqa_moula_asharas(id) ON DELETE RESTRICT`);
    }
}
