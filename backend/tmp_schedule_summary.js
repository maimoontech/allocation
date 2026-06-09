const mysql = require("mysql2/promise");

(async () => {
  const zoneId = 2;
  const conn = await mysql.createConnection({
    host: "64.20.33.10",
    port: 3306,
    user: "karachizakereen",
    password: "Kz@5253",
    database: "masjid_scheduling"
  });

  const [rows] = await conn.query(
    `SELECT q.id AS miqaat_id, q.miqaat_name, DATE_FORMAT(q.english_date, '%Y-%m-%d') AS english_date,
            COUNT(*) AS assignments,
            COUNT(DISTINCT s.party_id) AS unique_parties,
            SUM(CASE WHEN p.category='A' THEN 1 ELSE 0 END) AS a_count,
            SUM(CASE WHEN p.category='B' THEN 1 ELSE 0 END) AS b_count,
            SUM(CASE WHEN p.category='C' THEN 1 ELSE 0 END) AS c_count,
            MIN(s.created_at) AS first_created,
            MAX(s.created_at) AS last_created
     FROM schedules s
     JOIN miqaats q ON q.id = s.miqaat_id
     JOIN venues v ON v.id = s.venue_id
     JOIN mohallahs m ON m.id = v.mohallah_id
     JOIN parties p ON p.id = s.party_id
     WHERE m.zone_id = ?
     GROUP BY q.id, q.miqaat_name, q.english_date
     ORDER BY q.english_date, q.id`,
    [zoneId]
  );

  console.log("SCHEDULE SUMMARY");
  console.log(JSON.stringify(rows, null, 2));

  const [roundOneRows] = await conn.query(
    `SELECT q.id AS miqaat_id, q.miqaat_name, DATE_FORMAT(q.english_date, '%Y-%m-%d') AS english_date,
            v.venue_name, p.party_name, p.category
     FROM schedules s
     JOIN miqaats q ON q.id = s.miqaat_id
     JOIN venues v ON v.id = s.venue_id
     JOIN mohallahs m ON m.id = v.mohallah_id
     JOIN parties p ON p.id = s.party_id
     WHERE m.zone_id = ?
       AND s.id IN (
         SELECT picked.id
         FROM (
           SELECT MIN(s2.id) AS id
           FROM schedules s2
           JOIN venues v2 ON v2.id = s2.venue_id
           JOIN mohallahs m2 ON m2.id = v2.mohallah_id
           WHERE m2.zone_id = ?
           GROUP BY s2.miqaat_id, s2.venue_id
         ) picked
       )
     ORDER BY q.english_date, q.id, v.venue_name`,
    [zoneId, zoneId]
  );

  console.log("ROUND ONE");
  console.log(JSON.stringify(roundOneRows, null, 2));

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
