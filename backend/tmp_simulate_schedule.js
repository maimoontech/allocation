const mysql = require("mysql2/promise");

function activeCategoryOrder() {
  return ["A", "B", "C"];
}

class MaxFlow {
  constructor(n) {
    this.n = n;
    this.g = Array.from({ length: n }, () => []);
  }

  addEdge(from, to, cap) {
    const forward = { to, rev: this.g[to].length, cap, originalCap: cap };
    const backward = { to: from, rev: this.g[from].length, cap: 0, originalCap: 0 };
    this.g[from].push(forward);
    this.g[to].push(backward);
  }

  edgesFrom(node) {
    return this.g[node];
  }

  run(source, sink) {
    let flow = 0;
    while (true) {
      const level = Array(this.n).fill(-1);
      const queue = [source];
      level[source] = 0;
      for (let i = 0; i < queue.length; i += 1) {
        const node = queue[i];
        for (const edge of this.g[node]) {
          if (edge.cap > 0 && level[edge.to] < 0) {
            level[edge.to] = level[node] + 1;
            queue.push(edge.to);
          }
        }
      }
      if (level[sink] < 0) break;
      const it = Array(this.n).fill(0);
      const dfs = (node, pushed) => {
        if (node === sink) return pushed;
        for (; it[node] < this.g[node].length; it[node] += 1) {
          const edge = this.g[node][it[node]];
          if (edge.cap <= 0 || level[node] + 1 !== level[edge.to]) continue;
          const next = dfs(edge.to, Math.min(pushed, edge.cap));
          if (next <= 0) continue;
          edge.cap -= next;
          this.g[edge.to][edge.rev].cap += next;
          return next;
        }
        return 0;
      };
      while (true) {
        const pushed = dfs(source, Number.MAX_SAFE_INTEGER);
        if (pushed <= 0) break;
        flow += pushed;
      }
    }
    return flow;
  }
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

  function canAssignPartyToVenue(partyId, venueId) {
    const pairVisits = visitCount(partyId, venueId);
    if (pairVisits === 0) return true;
    return hasCoveredAllActiveVenues(partyId);
  }

  function assignCategoryToTargets(category, targetForVenue) {
    const availableParties = partiesByCategory[category]
      .filter((party) => !assignedParty.has(party.id))
      .map((party) => ({
        ...party,
        allowedVenueIds: venues
          .filter((venue) => {
            const target = Math.min(Math.max(0, targetForVenue(venue)), venue.max_parties);
            if ((occupancy.get(venue.id) ?? 0) >= target) return false;
            return canAssignPartyToVenue(party.id, venue.id);
          })
          .map((venue) => venue.id)
          .sort((a, b) => {
            const byVisit = visitCount(party.id, a) - visitCount(party.id, b);
            if (byVisit !== 0) return byVisit;
            return a - b;
          })
      }))
      .filter((party) => party.allowedVenueIds.length > 0)
      .sort((a, b) => {
        const byOptions = a.allowedVenueIds.length - b.allowedVenueIds.length;
        if (byOptions !== 0) return byOptions;
        return a.id - b.id;
      });

    if (availableParties.length === 0) return 0;

    const venueSeatCounts = venues.map((venue) => {
      const target = Math.min(Math.max(0, targetForVenue(venue)), venue.max_parties);
      return Math.max(0, target - (occupancy.get(venue.id) ?? 0));
    });

    const source = 0;
    const partyStart = 1;
    const venueStart = partyStart + availableParties.length;
    const sink = venueStart + venues.length;
    const flow = new MaxFlow(sink + 1);

    availableParties.forEach((_party, index) => {
      flow.addEdge(source, partyStart + index, 1);
    });
    venues.forEach((venue, index) => {
      if (venueSeatCounts[index] > 0) {
        flow.addEdge(venueStart + index, sink, venueSeatCounts[index]);
      }
    });
    availableParties.forEach((party, partyIndex) => {
      party.allowedVenueIds.forEach((venueId) => {
        const venueIndex = venues.findIndex((venue) => venue.id === venueId);
        if (venueIndex >= 0 && venueSeatCounts[venueIndex] > 0) {
          flow.addEdge(partyStart + partyIndex, venueStart + venueIndex, 1);
        }
      });
    });

    flow.run(source, sink);

    let assignedCount = 0;
    availableParties.forEach((party, partyIndex) => {
      const matched = flow
        .edgesFrom(partyStart + partyIndex)
        .find((edge) => edge.to >= venueStart && edge.to < sink && edge.originalCap === 1 && edge.cap === 0);
      if (!matched) return;
      const venue = venues[matched.to - venueStart];
      place(venue.id, party.id);
      assignedCount += 1;
    });
    return assignedCount;
  }

  function fillVenuesToTarget(targetForVenue) {
    let progress = true;
    while (progress) {
      progress = false;
      for (const category of activeCategoryOrder()) {
        const count = assignCategoryToTargets(category, targetForVenue);
        if (count > 0) progress = true;
      }
    }
  }

  function fillRemainingPartiesWithinMax() {
    for (const category of activeCategoryOrder()) {
      assignCategoryToTargets(category, (venue) => venue.max_parties);
    }
  }

  fillVenuesToTarget(() => 1);
  fillVenuesToTarget((venue) => Math.max(1, venue.min_parties));
  fillRemainingPartiesWithinMax();

  const partyById = new Map(parties.map((p) => [p.id, p]));
  const venueById = new Map(venues.map((v) => [v.id, v]));

  console.log("SIMULATED ASSIGNMENTS");
  for (const a of assignments) {
    const venue = venueById.get(a.venueId);
    const party = partyById.get(a.partyId);
    console.log(`${venue.venue_name} -> ${party.party_name} (${party.category}) [visits=${visitCount(a.partyId, a.venueId)}]`);
  }

  console.log("---");
  console.log(`ASSIGNED COUNT: ${assignments.length}`);
  console.log(`UNASSIGNED COUNT: ${parties.length - assignments.length}`);
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
