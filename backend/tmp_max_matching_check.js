const mysql = require("mysql2/promise");

class Dinic {
  constructor(n) {
    this.n = n;
    this.g = Array.from({ length: n }, () => []);
  }

  addEdge(v, to, cap) {
    const fwd = { to, rev: this.g[to].length, cap, originalCap: cap };
    const rev = { to: v, rev: this.g[v].length, cap: 0, originalCap: 0 };
    this.g[v].push(fwd);
    this.g[to].push(rev);
  }

  maxFlow(s, t) {
    let flow = 0;
    while (true) {
      const level = Array(this.n).fill(-1);
      const q = [s];
      level[s] = 0;
      for (let qi = 0; qi < q.length; qi += 1) {
        const v = q[qi];
        for (const e of this.g[v]) {
          if (e.cap > 0 && level[e.to] < 0) {
            level[e.to] = level[v] + 1;
            q.push(e.to);
          }
        }
      }
      if (level[t] < 0) break;
      const it = Array(this.n).fill(0);
      const dfs = (v, f) => {
        if (v === t) return f;
        for (; it[v] < this.g[v].length; it[v] += 1) {
          const e = this.g[v][it[v]];
          if (e.cap <= 0 || level[v] + 1 !== level[e.to]) continue;
          const pushed = dfs(e.to, Math.min(f, e.cap));
          if (pushed > 0) {
            e.cap -= pushed;
            this.g[e.to][e.rev].cap += pushed;
            return pushed;
          }
        }
        return 0;
      };
      while (true) {
        const pushed = dfs(s, Number.MAX_SAFE_INTEGER);
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
    `SELECT v.id, v.venue_name, v.max_parties
     FROM venues v
     JOIN mohallahs m ON m.id = v.mohallah_id
     WHERE m.zone_id = ? AND v.is_active = 1
     ORDER BY v.venue_name`,
    [zoneId]
  );
  const venues = venueRows.map((r) => ({
    id: Number(r.id),
    name: String(r.venue_name),
    max: Number(r.max_parties)
  }));

  const [partyRows] = await conn.query(
    `SELECT id, party_name, category
     FROM parties
     WHERE zone_id = ? AND is_active = 1 AND category <> 'H'
     ORDER BY FIELD(category, 'A', 'B', 'C'), party_name`,
    [zoneId]
  );
  const parties = partyRows.map((r) => ({
    id: Number(r.id),
    name: String(r.party_name),
    category: String(r.category)
  }));

  const [historyRows] = await conn.query(
    `SELECT party_id, venue_id, visit_count
     FROM party_venue_history
     WHERE party_id IN (${parties.map(() => "?").join(",")})
       AND venue_id IN (${venues.map(() => "?").join(",")})`,
    [...parties.map((p) => p.id), ...venues.map((v) => v.id)]
  );

  const visitCounts = new Map();
  for (const r of historyRows) {
    visitCounts.set(`${Number(r.party_id)}:${Number(r.venue_id)}`, Number(r.visit_count ?? 0));
  }

  const venueIds = venues.map((v) => v.id);
  function visitCount(partyId, venueId) {
    return visitCounts.get(`${partyId}:${venueId}`) ?? 0;
  }
  function hasCoveredAll(partyId) {
    return venueIds.every((venueId) => visitCount(partyId, venueId) > 0);
  }
  function canUse(partyId, venueId) {
    const count = visitCount(partyId, venueId);
    if (count === 0) return true;
    return hasCoveredAll(partyId);
  }

  const source = 0;
  const partyStart = 1;
  const venueStart = partyStart + parties.length;
  const sink = venueStart + venues.length;
  const dinic = new Dinic(sink + 1);

  parties.forEach((p, idx) => {
    dinic.addEdge(source, partyStart + idx, 1);
  });
  venues.forEach((v, idx) => {
    dinic.addEdge(venueStart + idx, sink, v.max);
  });
  parties.forEach((p, pIdx) => {
    venues.forEach((v, vIdx) => {
      if (canUse(p.id, v.id)) {
        dinic.addEdge(partyStart + pIdx, venueStart + vIdx, 1);
      }
    });
  });

  const max = dinic.maxFlow(source, sink);
  console.log(`PARTIES=${parties.length}`);
  console.log(`VENUES=${venues.length}`);
  console.log(`MAX_CAPACITY=${venues.reduce((sum, v) => sum + v.max, 0)}`);
  console.log(`MAX_MATCHING=${max}`);

  function categorySequentialMax() {
    const assigned = new Set();
    const remainingCaps = new Map(venues.map((v) => [v.id, v.max]));
    let total = 0;
    for (const category of ["A", "B", "C"]) {
      const categoryParties = parties.filter((p) => p.category === category && !assigned.has(p.id));
      const source = 0;
      const partyStart = 1;
      const venueStart = partyStart + categoryParties.length;
      const sink = venueStart + venues.length;
      const flow = new Dinic(sink + 1);
      categoryParties.forEach((_p, idx) => flow.addEdge(source, partyStart + idx, 1));
      venues.forEach((v, idx) => {
        const cap = remainingCaps.get(v.id) ?? 0;
        if (cap > 0) flow.addEdge(venueStart + idx, sink, cap);
      });
      categoryParties.forEach((p, pIdx) => {
        venues.forEach((v, vIdx) => {
          if (canUse(p.id, v.id) && (remainingCaps.get(v.id) ?? 0) > 0) {
            flow.addEdge(partyStart + pIdx, venueStart + vIdx, 1);
          }
        });
      });
      flow.maxFlow(source, sink);
      categoryParties.forEach((p, pIdx) => {
        const matched = flow
          .g[partyStart + pIdx]
          .find((edge) => edge.to >= venueStart && edge.to < sink && edge.originalCap === 1 && edge.cap === 0);
        if (!matched) return;
        const venue = venues[matched.to - venueStart];
        assigned.add(p.id);
        remainingCaps.set(venue.id, (remainingCaps.get(venue.id) ?? 0) - 1);
        total += 1;
      });
    }
    return total;
  }

  console.log(`CATEGORY_SEQUENTIAL_MAX=${categorySequentialMax()}`);
  if (max < parties.length) {
    const blocked = [];
    for (const p of parties) {
      const allowed = venues.filter((v) => canUse(p.id, v.id));
      if (allowed.length === 0) {
        blocked.push(`${p.name} (${p.category})`);
      }
    }
    console.log("PARTIES WITH NO ALLOWED VENUE:");
    console.log(blocked.join(", "));
  }

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
