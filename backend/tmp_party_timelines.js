const mysql = require("mysql2/promise");

(async () => {
  const zoneId = 2;
  const names = [
    "Hizbe Zainy B",
    "Hizbe Ammar",
    "Hizbe Hasani",
    "Hizbe Abedeen",
    "Hizbe Fatemi B",
    "Mudreka - Aziz"
  ];

  const conn = await mysql.createConnection({
    host: "64.20.33.10",
    port: 3306,
    user: "karachizakereen",
    password: "Kz@5253",
    database: "masjid_scheduling"
  });

  for (const name of names) {
    const [rows] = await conn.query(
      `SELECT p.party_name, q.id AS miqaat_id, q.miqaat_name, DATE_FORMAT(q.english_date, '%Y-%m-%d') AS english_date,
              v.venue_name, s.created_at
       FROM schedules s
       JOIN parties p ON p.id = s.party_id
       JOIN miqaats q ON q.id = s.miqaat_id
       JOIN venues v ON v.id = s.venue_id
       JOIN mohallahs m ON m.id = v.mohallah_id
       WHERE m.zone_id = ? AND p.party_name = ?
       ORDER BY q.english_date, q.id, s.id`,
      [zoneId, name]
    );
    console.log(`PARTY ${name}`);
    for (const r of rows) {
      console.log(`${r.english_date} [${r.miqaat_id}] ${r.miqaat_name} -> ${r.venue_name}`);
    }
    console.log("---");
  }

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
