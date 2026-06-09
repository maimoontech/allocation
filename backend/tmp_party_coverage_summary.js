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

  const [venueRows] = await conn.query(
    `SELECT v.id, v.venue_name
     FROM venues v
     JOIN mohallahs m ON m.id = v.mohallah_id
     WHERE m.zone_id = ? AND v.is_active = 1
     ORDER BY v.venue_name`,
    [zoneId]
  );
  const venueCount = venueRows.length;

  const [rows] = await conn.query(
    `SELECT p.id AS party_id, p.party_name, p.category,
            COUNT(s.id) AS assignment_count,
            COUNT(DISTINCT s.venue_id) AS distinct_venues,
            GROUP_CONCAT(DISTINCT v.venue_name ORDER BY v.venue_name SEPARATOR ' | ') AS venues
     FROM parties p
     LEFT JOIN schedules s ON s.party_id = p.id
     LEFT JOIN venues v ON v.id = s.venue_id
     LEFT JOIN mohallahs m ON m.id = v.mohallah_id
     WHERE p.zone_id = ? AND p.is_active = 1 AND p.category <> 'H'
       AND (m.zone_id = ? OR m.zone_id IS NULL)
     GROUP BY p.id, p.party_name, p.category
     ORDER BY FIELD(p.category, 'A', 'B', 'C'), p.party_name`,
    [zoneId, zoneId]
  );

  console.log(`ACTIVE VENUE COUNT: ${venueCount}`);
  for (const r of rows) {
    console.log(
      `${r.party_name} (${r.category}) -> assignments=${r.assignment_count}, distinct_venues=${r.distinct_venues}, full_coverage=${Number(r.distinct_venues) === venueCount ? "YES" : "NO"}`
    );
  }

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
