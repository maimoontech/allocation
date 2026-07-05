import { pool } from "./pool";

export async function ensureSchema() {
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
}
