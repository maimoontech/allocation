const mysql = require("mysql2/promise");

function categoryRank(category) {
  if (category === "A") return 0;
  if (category === "B") return 1;
  if (category === "C") return 2;
  return 99;
}

(async () => {
  const zoneId = 2;
  const miqaatId = 3;
  const conn = await mysql.createConnection({
    host: "64.20.33.10",
    port: 3306,
    user: "karachizakereen",
    password: "Kz@5253",
    database: "masjid_scheduling"
  });

  const [[miqaatRow]] = await conn.query(
    `SELECT english_date FROM miqaats WHERE id = ? LIMIT 1`,
    [miqaatId]
  );
  const currentMiqaatDate = String(miqaatRow?.english_date ?? "");

  const [venueRows] = await conn.query(
    `SELECT v.id, v.venue_name, v.min_parties, v.max_parties
     FROM venues v
     JOIN mohallahs m ON m.id = v.mohallah_id
     WHERE m.zone_id = ? AND v.is_active = 1
     ORDER BY v.id`,
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
     ORDER BY id`,
    [zoneId]
  );
  const parties = partyRows
    .map((r) => ({ id: Number(r.id), party_name: String(r.party_name), category: String(r.category) }))
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.id - b.id);

  const venueIds = venues.map((v) => v.id);
  const partyIds = parties.map((p) => p.id);

  const [historyRows] = await conn.query(
    `SELECT party_id, venue_id, visit_count
     FROM party_venue_history
     WHERE party_id IN (${partyIds.map(() => "?").join(",")})
       AND venue_id IN (${venueIds.map(() => "?").join(",")})`,
    [...partyIds, ...venueIds]
  );
  const pairVisitCounts = new Map();
  for (const r of historyRows) {
    pairVisitCounts.set(`${Number(r.party_id)}:${Number(r.venue_id)}`, Number(r.visit_count ?? 0));
  }

  const [priorScheduleRows] = await conn.query(
    `SELECT s.party_id, s.venue_id, q.english_date, q.id AS prior_miqaat_id, s.id
     FROM schedules s
     JOIN miqaats q ON q.id = s.miqaat_id
     JOIN venues v ON v.id = s.venue_id
     JOIN mohallahs m ON m.id = v.mohallah_id
     WHERE m.zone_id = ?
       AND s.party_id IN (${partyIds.map(() => "?").join(",")})
       AND (
         q.english_date < ? OR
         (q.english_date = ? AND q.id < ?)
       )
     ORDER BY q.english_date, q.id, s.id`,
    [zoneId, ...partyIds, currentMiqaatDate, currentMiqaatDate, miqaatId]
  );

  const currentCycleCoveredByParty = new Map();
  for (const party of parties) currentCycleCoveredByParty.set(party.id, new Set());
  for (const row of priorScheduleRows) {
    const partyId = Number(row.party_id);
    const venueId = Number(row.venue_id);
    const covered = currentCycleCoveredByParty.get(partyId) ?? new Set();
    covered.add(venueId);
    if (covered.size >= venueIds.length) {
      currentCycleCoveredByParty.set(partyId, new Set());
    } else {
      currentCycleCoveredByParty.set(partyId, covered);
    }
  }

  function canAssignPartyToVenue(partyId, venueId) {
    const covered = currentCycleCoveredByParty.get(partyId);
    return !covered?.has(venueId);
  }

  const seatList = [];
  const maxRounds = Math.max(...venues.map((venue) => venue.max_parties));
  for (let round = 1; round <= maxRounds; round += 1) {
    for (const venue of venues) {
      if (round <= venue.max_parties) {
        seatList.push({ venueId: venue.id, round });
      }
    }
  }

  const matchableParties = parties
    .map((party) => {
      const seatIndexes = seatList
        .map((seat, index) => ({ seat, index }))
        .filter(({ seat }) => canAssignPartyToVenue(party.id, seat.venueId))
        .sort((a, b) => {
          const byRound = a.seat.round - b.seat.round;
          if (byRound !== 0) return byRound;
          const byVisit = (pairVisitCounts.get(`${party.id}:${a.seat.venueId}`) ?? 0) - (pairVisitCounts.get(`${party.id}:${b.seat.venueId}`) ?? 0);
          if (byVisit !== 0) return byVisit;
          return a.seat.venueId - b.seat.venueId;
        })
        .map(({ index }) => index);
      return { ...party, seatIndexes };
    })
    .filter((party) => party.seatIndexes.length > 0)
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.seatIndexes.length - b.seatIndexes.length || a.id - b.id);

  const seatToPartyIndex = Array(seatList.length).fill(-1);
  const tryMatch = (partyIndex, seenSeats, allowedSeatIndexes) => {
    for (const seatIndex of matchableParties[partyIndex].seatIndexes) {
      if (!allowedSeatIndexes.has(seatIndex)) continue;
      if (seenSeats.has(seatIndex)) continue;
      seenSeats.add(seatIndex);
      const currentPartyIndex = seatToPartyIndex[seatIndex];
      if (currentPartyIndex === -1 || tryMatch(currentPartyIndex, seenSeats, allowedSeatIndexes)) {
        seatToPartyIndex[seatIndex] = partyIndex;
        return true;
      }
    }
    return false;
  };
  const matchSubset = (partyIndexes, allowedSeatIndexes) => {
    for (const partyIndex of partyIndexes) {
      if (seatToPartyIndex.includes(partyIndex)) continue;
      tryMatch(partyIndex, new Set(), allowedSeatIndexes);
    }
  };

  const roundOneSeats = new Set(seatList.map((seat, index) => ({ seat, index })).filter(({ seat }) => seat.round === 1).map(({ index }) => index));
  const minimumFillSeats = new Set(
    seatList
      .map((seat, index) => ({ seat, index }))
      .filter(({ seat }) => {
        const venue = venues.find((v) => v.id === seat.venueId);
        return seat.round > 1 && seat.round <= venue.min_parties;
      })
      .map(({ index }) => index)
  );
  const categoryIndexes = {
    A: matchableParties.map((party, index) => ({ party, index })).filter(({ party }) => party.category === "A").map(({ index }) => index),
    B: matchableParties.map((party, index) => ({ party, index })).filter(({ party }) => party.category === "B").map(({ index }) => index),
    C: matchableParties.map((party, index) => ({ party, index })).filter(({ party }) => party.category === "C").map(({ index }) => index)
  };

  for (const category of ["A", "B", "C"]) matchSubset(categoryIndexes[category], roundOneSeats);
  for (const category of ["A", "B", "C"]) matchSubset(categoryIndexes[category], minimumFillSeats);
  const remainingSeats = new Set(seatList.map((_seat, index) => index).filter((index) => seatToPartyIndex[index] < 0));
  for (let partyIndex = 0; partyIndex < matchableParties.length; partyIndex += 1) {
    if (seatToPartyIndex.includes(partyIndex)) continue;
    tryMatch(partyIndex, new Set(), remainingSeats);
  }

  const venueById = new Map(venues.map((v) => [v.id, v]));
  console.log("PREVIEW FOR MIQAAT 3");
  seatToPartyIndex.forEach((partyIndex, seatIndex) => {
    if (partyIndex < 0) return;
    const party = matchableParties[partyIndex];
    const seat = seatList[seatIndex];
    console.log(`${venueById.get(seat.venueId).venue_name} -> ${party.party_name} (${party.category})`);
  });

  const targetNames = ["Hizbe Fatemi B", "Mudreka - Aziz", "Hizbe Zainy B"];
  console.log("---");
  for (const name of targetNames) {
    const party = parties.find((p) => p.party_name === name);
    if (!party) continue;
    const covered = Array.from(currentCycleCoveredByParty.get(party.id) ?? []);
    console.log(`${name} covered before miqaat ${miqaatId}: ${covered.map((id) => venueById.get(id)?.venue_name).join(", ")}`);
  }

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
