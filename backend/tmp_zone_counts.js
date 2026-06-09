const mysql = require("mysql2/promise");

(async () => {
  const conn = await mysql.createConnection({
    host: "64.20.33.10",
    port: 3306,
    user: "karachizakereen",
    password: "Kz@5253",
    database: "masjid_scheduling"
  });

  const [rows] = await conn.query(
    `SELECT z.id AS zone_id, z.zone_name,
            SUM(CASE WHEN v.is_active = 1 THEN 1 ELSE 0 END) AS active_venues,
            SUM(CASE WHEN v.is_active = 1 THEN v.min_parties ELSE 0 END) AS total_min,
            SUM(CASE WHEN v.is_active = 1 THEN v.max_parties ELSE 0 END) AS total_max,
            SUM(CASE WHEN p.is_active = 1 AND p.category <> 'H' THEN 1 ELSE 0 END) AS active_parties,
            SUM(CASE WHEN p.is_active = 1 AND p.category = 'A' THEN 1 ELSE 0 END) AS cat_a,
            SUM(CASE WHEN p.is_active = 1 AND p.category = 'B' THEN 1 ELSE 0 END) AS cat_b,
            SUM(CASE WHEN p.is_active = 1 AND p.category = 'C' THEN 1 ELSE 0 END) AS cat_c
     FROM zones z
     LEFT JOIN mohallahs m ON m.zone_id = z.id
     LEFT JOIN venues v ON v.mohallah_id = m.id
     LEFT JOIN parties p ON p.zone_id = z.id
     GROUP BY z.id, z.zone_name
     ORDER BY z.zone_name`,
  );

  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
