const mysql = require("mysql2/promise");

const { env } = require("./dist/config/env");

function getArg(name, fallback = null) {
  const ix = process.argv.indexOf(`--${name}`);
  if (ix === -1) return fallback;
  const value = process.argv[ix + 1];
  return value ?? fallback;
}

function normalize(v) {
  return String(v ?? "").trim();
}

async function main() {
  const miqaatIdArg = getArg("miqaat_id");
  const miqaatNameLike = getArg("miqaat_like", "test");
  const listVenuesLike = getArg("list_venues_like");
  const venueNames = (getArg("venues", "Ibrahim Masjid (Ibrahim),Saleh Masjid (Saleh)") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.pass,
    database: env.db.name
  });

  if (listVenuesLike) {
    const [rows] = await conn.query(
      `SELECT id, venue_name
       FROM venues
       WHERE LOWER(venue_name) LIKE CONCAT('%', LOWER(?), '%')
       ORDER BY venue_name`,
      [listVenuesLike]
    );
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    await conn.end();
    return;
  }

  let miqaatId = miqaatIdArg ? Number(miqaatIdArg) : null;
  if (!Number.isFinite(miqaatId)) {
    const [rows] = await conn.query(
      `SELECT id, miqaat_name, DATE_FORMAT(english_date, '%Y-%m-%d') AS english_date
       FROM miqaats
       WHERE LOWER(miqaat_name) LIKE CONCAT('%', LOWER(?), '%')
       ORDER BY english_date DESC, id DESC
       LIMIT 1`,
      [miqaatNameLike]
    );
    if (!rows[0]) {
      throw new Error(`No miqaat found matching: ${miqaatNameLike}`);
    }
    miqaatId = Number(rows[0].id);
    process.stdout.write(`miqaat_id=${miqaatId} ${rows[0].english_date} ${rows[0].miqaat_name}\n`);
  }

  const [summaryRows] = await conn.query(
    `SELECT z.zone_name, m.mohallah_name, v.venue_name, v.min_parties, v.max_parties,
            COUNT(*) AS schedule_rows,
            COUNT(DISTINCT s.party_id) AS distinct_parties,
            SUM(CASE WHEN TRIM(UPPER(p.category)) = 'A' THEN 1 ELSE 0 END) AS cat_a,
            SUM(CASE WHEN TRIM(UPPER(p.category)) = 'B' THEN 1 ELSE 0 END) AS cat_b,
            SUM(CASE WHEN TRIM(UPPER(p.category)) = 'C' THEN 1 ELSE 0 END) AS cat_c
     FROM schedules s
     JOIN parties p ON p.id = s.party_id
     JOIN venues v ON v.id = s.venue_id
     JOIN mohallahs m ON m.id = v.mohallah_id
     JOIN zones z ON z.id = m.zone_id
     WHERE s.miqaat_id = ?
       AND v.venue_name IN (${venueNames.map(() => "?").join(",")})
     GROUP BY z.zone_name, m.mohallah_name, v.venue_name, v.min_parties, v.max_parties
     ORDER BY z.zone_name, m.mohallah_name, v.venue_name`,
    [miqaatId, ...venueNames]
  );

  process.stdout.write(JSON.stringify({ venues: venueNames, summaryRows }, null, 2) + "\n");

  const [detailRows] = await conn.query(
    `SELECT v.venue_name, s.id AS schedule_id, s.party_id, p.party_name, p.category
     FROM schedules s
     JOIN parties p ON p.id = s.party_id
     JOIN venues v ON v.id = s.venue_id
     WHERE s.miqaat_id = ?
       AND v.venue_name IN (${venueNames.map(() => "?").join(",")})
     ORDER BY v.venue_name, p.party_name, s.id`,
    [miqaatId, ...venueNames]
  );

  const normalized = detailRows.map((r) => ({
    venue_name: r.venue_name,
    schedule_id: r.schedule_id,
    party_id: r.party_id,
    party_name: r.party_name,
    category_raw: r.category,
    category_norm: normalize(r.category).toUpperCase()
  }));

  process.stdout.write(JSON.stringify({ normalized }, null, 2) + "\n");

  await conn.end();
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});

