const mysql = require("mysql2/promise");

const { env } = require("./dist/config/env");
const { generateSchedule } = require("./dist/services/scheduleService");

function getArg(name, fallback = null) {
  const ix = process.argv.indexOf(`--${name}`);
  if (ix === -1) return fallback;
  const value = process.argv[ix + 1];
  return value ?? fallback;
}

async function main() {
  const miqaatId = Number(getArg("miqaat_id"));
  const zoneId = Number(getArg("zone_id"));
  if (!Number.isFinite(miqaatId) || !Number.isFinite(zoneId)) {
    throw new Error("Usage: node tmp_dry_run_generate_zone.js --miqaat_id <id> --zone_id <id>");
  }

  const result = await generateSchedule({
    miqaatId,
    zoneId,
    overwrite: true,
    dryRun: true,
    createdBy: { role: "admin", id: 0 }
  });

  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.pass,
    database: env.db.name
  });

  const venueIds = Array.from(new Set(result.assignments.map((a) => a.venueId)));
  const partyIds = Array.from(new Set(result.assignments.map((a) => a.partyId)));

  const [venueRows] = venueIds.length
    ? await conn.query(
        `SELECT v.id, z.zone_name, m.mohallah_name, v.venue_name, v.min_parties, v.max_parties
         FROM venues v
         JOIN mohallahs m ON m.id = v.mohallah_id
         JOIN zones z ON z.id = m.zone_id
         WHERE v.id IN (${venueIds.map(() => "?").join(",")})`,
        venueIds
      )
    : [[]];

  const [partyRows] = partyIds.length
    ? await conn.query(
        `SELECT id, party_name, category
         FROM parties
         WHERE id IN (${partyIds.map(() => "?").join(",")})`,
        partyIds
      )
    : [[]];

  const venueById = new Map(venueRows.map((r) => [Number(r.id), r]));
  const partyById = new Map(partyRows.map((r) => [Number(r.id), r]));

  const byVenue = new Map();
  for (const a of result.assignments) {
    const v = venueById.get(a.venueId);
    const p = partyById.get(a.partyId);
    if (!v || !p) continue;
    const key = `${v.zone_name} | ${v.mohallah_name} | ${v.venue_name}`;
    const cur = byVenue.get(key) || { total: 0, A: 0, B: 0, C: 0 };
    cur.total += 1;
    if (p.category === "A") cur.A += 1;
    if (p.category === "B") cur.B += 1;
    if (p.category === "C") cur.C += 1;
    byVenue.set(key, cur);
  }

  const summary = Array.from(byVenue.entries())
    .map(([k, v]) => ({ venue: k, ...v }))
    .sort((a, b) => String(a.venue).localeCompare(String(b.venue)));

  console.log(JSON.stringify({ assignmentCount: result.assignments.length, summary }, null, 2));

  await conn.end();
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});

