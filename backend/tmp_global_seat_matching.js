const mysql = require("mysql2/promise");

function categoryRank(category) {
  if (category === "A") return 0;
  if (category === "B") return 1;
  if (category === "C") return 2;
  return 99;
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
    name: String(r.venue_name),
    min: Number(r.min_parties),
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
  console.log(`COUNTS venues=${venues.length} min=${venues.reduce((s, v) => s + v.min, 0)} max=${venues.reduce((s, v) => s + v.max, 0)}`);
  console.log(
    `COUNTS parties=${parties.length} A=${parties.filter((p) => p.category === "A").length} B=${parties.filter((p) => p.category === "B").length} C=${parties.filter((p) => p.category === "C").length}`
  );

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

  function visitCount(partyId, venueId) {
    return visitCounts.get(`${partyId}:${venueId}`) ?? 0;
  }

  function hasCoveredAllActiveVenues(partyId) {
    return venues.every((venue) => visitCount(partyId, venue.id) > 0);
  }

  function canAssign(partyId, venueId) {
    const count = visitCount(partyId, venueId);
    if (count === 0) return true;
    return hasCoveredAllActiveVenues(partyId);
  }

  const seats = [];
  const maxRound = Math.max(...venues.map((v) => v.max));
  for (let round = 1; round <= maxRound; round += 1) {
    for (const venue of venues) {
      if (round <= venue.max) seats.push({ venueId: venue.id, venueName: venue.name, round });
    }
  }

  const partyPrefs = parties
    .map((party) => ({
      ...party,
      seats: seats
        .map((seat, index) => ({ seat, index }))
        .filter(({ seat }) => canAssign(party.id, seat.venueId))
        .sort((a, b) => {
          const byRound = a.seat.round - b.seat.round;
          if (byRound !== 0) return byRound;
          const byVisit = visitCount(party.id, a.seat.venueId) - visitCount(party.id, b.seat.venueId);
          if (byVisit !== 0) return byVisit;
          return a.seat.venueId - b.seat.venueId;
        })
        .map(({ index }) => index)
    }))
    .sort((a, b) => {
      const byCategory = categoryRank(a.category) - categoryRank(b.category);
      if (byCategory !== 0) return byCategory;
      const byOptions = a.seats.length - b.seats.length;
      if (byOptions !== 0) return byOptions;
      return a.id - b.id;
    });

  function tryMatch(partyIndex, seen, seatToParty, allowedSeatIndexes) {
    for (const seatIndex of partyPrefs[partyIndex].seats) {
      if (!allowedSeatIndexes.has(seatIndex)) continue;
      if (seen.has(seatIndex)) continue;
      seen.add(seatIndex);
      const currentPartyIndex = seatToParty[seatIndex];
      if (currentPartyIndex === -1 || tryMatch(currentPartyIndex, seen, seatToParty, allowedSeatIndexes)) {
        seatToParty[seatIndex] = partyIndex;
        return true;
      }
    }
    return false;
  }

  function matchSubset(partyIndexes, allowedSeatIndexes, seatToParty) {
    let matched = 0;
    for (const partyIndex of partyIndexes) {
      if (tryMatch(partyIndex, new Set(), seatToParty, allowedSeatIndexes)) matched += 1;
    }
    return matched;
  }

  const roundOneSeats = new Set(seats.map((seat, index) => ({ seat, index })).filter((x) => x.seat.round === 1).map((x) => x.index));
  const minFillSeats = new Set(
    seats
      .map((seat, index) => ({ seat, index }))
      .filter(({ seat }) => {
        const venue = venues.find((v) => v.id === seat.venueId);
        return seat.round > 1 && seat.round <= venue.min;
      })
      .map((x) => x.index)
  );
  const categoryIndexes = {
    A: partyPrefs.map((p, i) => ({ p, i })).filter((x) => x.p.category === "A").map((x) => x.i),
    B: partyPrefs.map((p, i) => ({ p, i })).filter((x) => x.p.category === "B").map((x) => x.i),
    C: partyPrefs.map((p, i) => ({ p, i })).filter((x) => x.p.category === "C").map((x) => x.i)
  };

  const seatToParty = Array(seats.length).fill(-1);
  let matched = 0;
  matched += matchSubset(categoryIndexes.A, roundOneSeats, seatToParty);
  matched += matchSubset(categoryIndexes.B.filter((i) => !seatToParty.includes(i)), roundOneSeats, seatToParty);
  matched += matchSubset(categoryIndexes.C.filter((i) => !seatToParty.includes(i)), roundOneSeats, seatToParty);
  matched += matchSubset(categoryIndexes.A.filter((i) => !seatToParty.includes(i)), minFillSeats, seatToParty);
  matched += matchSubset(categoryIndexes.B.filter((i) => !seatToParty.includes(i)), minFillSeats, seatToParty);
  matched += matchSubset(categoryIndexes.C.filter((i) => !seatToParty.includes(i)), minFillSeats, seatToParty);
  const remainingSeats = new Set(seats.map((_s, i) => i).filter((i) => seatToParty[i] === -1));
  for (let partyIndex = 0; partyIndex < partyPrefs.length; partyIndex += 1) {
    if (seatToParty.includes(partyIndex)) continue;
    if (tryMatch(partyIndex, new Set(), seatToParty, remainingSeats)) matched += 1;
  }

  const assignments = [];
  seatToParty.forEach((partyIndex, seatIndex) => {
    if (partyIndex === -1) return;
    assignments.push({
      seat: seats[seatIndex],
      party: partyPrefs[partyIndex]
    });
  });
  assignments.sort((a, b) => {
    const byRound = a.seat.round - b.seat.round;
    if (byRound !== 0) return byRound;
    return a.seat.venueId - b.seat.venueId;
  });

  console.log(`ASSIGNED=${matched}`);
  console.log(`UNASSIGNED=${parties.length - matched}`);
  for (const a of assignments) {
    console.log(`R${a.seat.round} ${a.seat.venueName} -> ${a.party.name} (${a.party.category}) visits=${visitCount(a.party.id, a.seat.venueId)}`);
  }

  console.log("---");
  console.log("RULE CHECK");
  for (const a of assignments) {
    const pairVisits = visitCount(a.party.id, a.seat.venueId);
    if (pairVisits > 0 && !hasCoveredAllActiveVenues(a.party.id)) {
      console.log(`VIOLATION ${a.party.name} -> ${a.seat.venueName} [${pairVisits}]`);
    }
  }

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
