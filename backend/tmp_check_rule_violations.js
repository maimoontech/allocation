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

  const [venues] = await conn.query(
    `SELECT v.id, v.venue_name
     FROM venues v
     JOIN mohallahs m ON m.id = v.mohallah_id
     WHERE m.zone_id = ? AND v.is_active = 1
     ORDER BY v.venue_name`,
    [zoneId]
  );

  const [parties] = await conn.query(
    `SELECT id, party_name, category
     FROM parties
     WHERE zone_id = ? AND is_active = 1 AND category <> 'H'
     ORDER BY FIELD(category, 'A', 'B', 'C'), party_name`,
    [zoneId]
  );

  const [history] = await conn.query(
    `SELECT h.party_id, h.venue_id, h.visit_count, p.party_name, p.category, v.venue_name
     FROM party_venue_history h
     JOIN parties p ON p.id = h.party_id
     JOIN venues v ON v.id = h.venue_id
     JOIN mohallahs m ON m.id = v.mohallah_id
     WHERE p.zone_id = ? AND m.zone_id = ?`,
    [zoneId, zoneId]
  );

  const venueIds = venues.map((v) => Number(v.id));
  const byParty = new Map();
  for (const p of parties) byParty.set(Number(p.id), { name: p.party_name, category: p.category, visits: new Map() });
  for (const h of history) {
    const row = byParty.get(Number(h.party_id));
    if (!row) continue;
    row.visits.set(Number(h.venue_id), Number(h.visit_count));
  }

  const violations = [];
  for (const [partyId, info] of byParty.entries()) {
    const zeroVenues = venueIds.filter((id) => (info.visits.get(id) ?? 0) === 0);
    const repeatedVenues = venueIds.filter((id) => (info.visits.get(id) ?? 0) > 1);
    if (zeroVenues.length > 0 && repeatedVenues.length > 0) {
      violations.push({
        partyId,
        partyName: info.name,
        category: info.category,
        unvisitedVenues: zeroVenues.map((id) => venues.find((v) => Number(v.id) === id)?.venue_name),
        repeatedVenues: repeatedVenues.map((id) => ({
          venue: venues.find((v) => Number(v.id) === id)?.venue_name,
          count: info.visits.get(id)
        }))
      });
    }
  }

  console.log(`ACTIVE VENUES: ${venues.length}`);
  console.log(`ACTIVE PARTIES: ${parties.length}`);
  console.log(`RULE VIOLATIONS: ${violations.length}`);
  for (const v of violations.slice(0, 30)) {
    console.log(`PARTY ${v.partyName} (${v.category})`);
    console.log(`  repeated: ${v.repeatedVenues.map((x) => `${x.venue}=${x.count}`).join(", ")}`);
    console.log(`  unvisited: ${v.unvisitedVenues.join(", ")}`);
  }

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
