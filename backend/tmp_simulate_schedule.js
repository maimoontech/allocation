const mysql = require("mysql2/promise");

function activeCategoryOrder() {
  return ["A", "B", "C"];
}

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
    `SELECT v.id, v.venue_name, v.min_parties, v.max_parties
     FROM venues v
     JOIN mohallahs m ON m.id = v.mohallah_id
     WHERE m.zone_id = ? AND v.is_active = 1
     ORDER BY v.venue_name`,
    [zoneId]
  );
  const venues = venueRows.map((r) => ({
    id: Number(r.id),
    venue_name: String(r.venue_name),
    min_parties: Number(r.min_parties),
    max_parties: Number(r.max_parties)
  }));

  const [partyRows] = await conn.query(
    `SELECT id, party_name, category
     FROM parties
     WHERE zone_id = ? AND is_active = 1 AND category <> 'H'
     ORDER BY FIELD(category, 'A', 'B', 'C'), id`,
    [zoneId]
  );
  const parties = partyRows.map((r) => ({
    id: Number(r.id),
    party_name: String(r.party_name),
    category: String(r.category)
  }));

  const [historyRows] = await conn.query(
    `SELECT party_id, venue_id, visit_count
     FROM party_venue_history
     WHERE party_id IN (${parties.map(() => "?").join(",")})
       AND venue_id IN (${venues.map(() => "?").join(",")})`,
    [...parties.map((p) => p.id), ...venues.map((v) => v.id)]
  );

  const pairVisitCounts = new Map();
  for (const r of historyRows) {
    pairVisitCounts.set(`${Number(r.party_id)}:${Number(r.venue_id)}`, Number(r.visit_count ?? 0));
  }

  const partiesByCategory = {
    A: parties.filter((p) => p.category === "A"),
    B: parties.filter((p) => p.category === "B"),
    C: parties.filter((p) => p.category === "C")
  };

  const assignedParty = new Set();
  const occupancy = new Map();
  for (const v of venues) occupancy.set(v.id, 0);
  const assignments = [];

  function canPlace(venueId) {
    const venue = venues.find((v) => v.id === venueId);
    return (occupancy.get(venueId) ?? 0) < venue.max_parties;
  }

  function visitCount(partyId, venueId) {
    return pairVisitCounts.get(`${partyId}:${venueId}`) ?? 0;
  }

  function hasCoveredAllActiveVenues(partyId) {
    for (const venueId of venues.map((v) => v.id)) {
      if (visitCount(partyId, venueId) === 0) return false;
    }
    return true;
  }

  function place(venueId, partyId) {
    assignments.push({ venueId, partyId });
    assignedParty.add(partyId);
    occupancy.set(venueId, (occupancy.get(venueId) ?? 0) + 1);
  }

  function pickParty(candidates, venueId) {
    const available = candidates.filter((p) => {
      if (assignedParty.has(p.id)) return false;
      const pairVisits = visitCount(p.id, venueId);
      if (pairVisits === 0) return true;
      return hasCoveredAllActiveVenues(p.id);
    });
    if (available.length === 0) return null;
    available.sort((a, b) => {
      const byPairVisits = visitCount(a.id, venueId) - visitCount(b.id, venueId);
      if (byPairVisits !== 0) return byPairVisits;
      return a.id - b.id;
    });
    return available[0] ?? null;
  }

  function pickByPriority(venueId) {
    for (const category of activeCategoryOrder()) {
      const picked = pickParty(partiesByCategory[category], venueId);
      if (picked) return picked;
    }
    return null;
  }

  function fillVenuesToTarget(targetForVenue) {
    let progress = true;
    while (progress) {
      progress = false;
      for (const venue of venues) {
        const target = Math.min(Math.max(0, targetForVenue(venue)), venue.max_parties);
        if ((occupancy.get(venue.id) ?? 0) >= target) continue;
        if (!canPlace(venue.id)) continue;
        const picked = pickByPriority(venue.id);
        if (!picked) continue;
        place(venue.id, picked.id);
        progress = true;
      }
    }
  }

  fillVenuesToTarget(() => 1);
  fillVenuesToTarget((venue) => Math.max(1, venue.min_parties));
  fillVenuesToTarget((venue) => Math.max(venue.min_parties, venue.max_parties));

  const partyById = new Map(parties.map((p) => [p.id, p]));
  const venueById = new Map(venues.map((v) => [v.id, v]));

  console.log("SIMULATED ASSIGNMENTS");
  for (const a of assignments) {
    const venue = venueById.get(a.venueId);
    const party = partyById.get(a.partyId);
    console.log(`${venue.venue_name} -> ${party.party_name} (${party.category}) [visits=${visitCount(a.partyId, a.venueId)}]`);
  }

  console.log("---");
  console.log("RULE CHECK");
  for (const a of assignments) {
    const pairVisits = visitCount(a.partyId, a.venueId);
    if (pairVisits > 0 && !hasCoveredAllActiveVenues(a.partyId)) {
      const venue = venueById.get(a.venueId);
      const party = partyById.get(a.partyId);
      console.log(`VIOLATION: ${party.party_name} -> ${venue.venue_name} [visits=${pairVisits}]`);
    }
  }

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
