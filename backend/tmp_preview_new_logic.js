const mysql = require("mysql2/promise");
function categoryRank(category) {
  if (category === "A") return 0;
  if (category === "B") return 1;
  if (category === "C") return 2;
  return 99;
}
(async()=>{
  const zoneId = 2;
  const miqaatId = 9;
  const conn = await mysql.createConnection({host:"64.20.33.10",port:3306,user:"karachizakereen",password:"Kz@5253",database:"masjid_scheduling"});
  const [[miqaatRow]] = await conn.query(`SELECT DATE_FORMAT(english_date, '%Y-%m-%d') AS english_date, miqaat_name FROM miqaats WHERE id = ? LIMIT 1`, [miqaatId]);
  const currentMiqaatDate = miqaatRow.english_date;
  const [venueRows] = await conn.query(`SELECT v.id, v.venue_name, v.min_parties, v.max_parties FROM venues v JOIN mohallahs m ON m.id=v.mohallah_id WHERE m.zone_id=? AND v.is_active=1 ORDER BY v.id`, [zoneId]);
  const venues = venueRows.map(r => ({id:Number(r.id), venue_name:String(r.venue_name), min_parties:Number(r.min_parties), max_parties:Number(r.max_parties)}));
  const [partyRows] = await conn.query(`SELECT id, party_name, category FROM parties WHERE zone_id=? AND is_active=1 AND category <> 'H' ORDER BY id`, [zoneId]);
  const parties = partyRows.map(r => ({id:Number(r.id), party_name:String(r.party_name), category:String(r.category)})).sort((a,b)=>categoryRank(a.category)-categoryRank(b.category)||a.id-b.id);
  const venueIds = venues.map(v=>v.id);
  const partyIds = parties.map(p=>p.id);
  const [pairCountRows] = await conn.query(`SELECT s.party_id, s.venue_id, COUNT(*) AS visit_count FROM schedules s JOIN venues v ON v.id=s.venue_id JOIN mohallahs m ON m.id=v.mohallah_id WHERE m.zone_id=? AND s.party_id IN (${partyIds.map(()=>'?').join(',')}) AND s.venue_id IN (${venueIds.map(()=>'?').join(',')}) GROUP BY s.party_id, s.venue_id`, [zoneId, ...partyIds, ...venueIds]);
  const pairVisitCounts = new Map();
  for (const r of pairCountRows) pairVisitCounts.set(`${Number(r.party_id)}:${Number(r.venue_id)}`, Number(r.visit_count || 0));
  const [priorRows] = await conn.query(`SELECT s.party_id, s.venue_id, q.id AS prior_miqaat_id, DATE_FORMAT(q.english_date, '%Y-%m-%d') AS english_date, s.id FROM schedules s JOIN miqaats q ON q.id=s.miqaat_id JOIN venues v ON v.id=s.venue_id JOIN mohallahs m ON m.id=v.mohallah_id WHERE m.zone_id=? AND s.party_id IN (${partyIds.map(()=>'?').join(',')}) AND (q.english_date < ? OR (q.english_date = ? AND q.id < ?)) ORDER BY q.english_date, q.id, s.id`, [zoneId, ...partyIds, currentMiqaatDate, currentMiqaatDate, miqaatId]);
  const currentCycleCoveredByParty = new Map();
  for (const p of parties) currentCycleCoveredByParty.set(p.id, new Set());
  for (const row of priorRows) {
    const partyId = Number(row.party_id), venueId = Number(row.venue_id);
    const covered = currentCycleCoveredByParty.get(partyId) || new Set();
    covered.add(venueId);
    if (covered.size >= venueIds.length) currentCycleCoveredByParty.set(partyId, new Set());
    else currentCycleCoveredByParty.set(partyId, covered);
  }
  function canAssignPartyToVenue(partyId, venueId) {
    const covered = currentCycleCoveredByParty.get(partyId);
    return !covered?.has(venueId);
  }
  function visitCount(partyId, venueId) { return pairVisitCounts.get(`${partyId}:${venueId}`) || 0; }
  const seatList=[]; const maxRounds=Math.max(...venues.map(v=>v.max_parties));
  for(let round=1; round<=maxRounds; round++) for(const venue of venues) if(round<=venue.max_parties) seatList.push({venueId:venue.id, round, stage: round===1 ? 1 : round <= venue.min_parties ? 2 : 3});
  function buildMatchableParties(candidateParties, canUseSeat, preferUnvisited) {
    return candidateParties.map((party)=>{
      const seatIndexes = seatList.map((seat,index)=>({seat,index})).filter(({seat})=>canUseSeat(party.id, seat.venueId)).sort((a,b)=>{
        if (preferUnvisited) {
          const pa = canAssignPartyToVenue(party.id, a.seat.venueId) ? 0 : 1;
          const pb = canAssignPartyToVenue(party.id, b.seat.venueId) ? 0 : 1;
          if (pa !== pb) return pa - pb;
        }
        const byStage = a.seat.stage - b.seat.stage; if (byStage !== 0) return byStage;
        const byRound = a.seat.round - b.seat.round; if (byRound !== 0) return byRound;
        const byVisit = visitCount(party.id, a.seat.venueId) - visitCount(party.id, b.seat.venueId); if (byVisit !== 0) return byVisit;
        return a.seat.venueId - b.seat.venueId;
      }).map(({index})=>index);
      return {...party, seatIndexes};
    }).filter(p=>p.seatIndexes.length>0).sort((a,b)=>categoryRank(a.category)-categoryRank(b.category)||a.seatIndexes.length-b.seatIndexes.length||a.id-b.id);
  }
  function maximizeAssignments(matchableParties, allowedSeatIndexes) {
    const seatToPartyIndex = Array(seatList.length).fill(-1);
    const tryMatch = (partyIndex, seenSeats) => {
      for (const seatIndex of matchableParties[partyIndex].seatIndexes) {
        if (!allowedSeatIndexes.has(seatIndex) || seenSeats.has(seatIndex)) continue;
        seenSeats.add(seatIndex);
        const currentPartyIndex = seatToPartyIndex[seatIndex];
        if (currentPartyIndex === -1 || tryMatch(currentPartyIndex, seenSeats)) {
          seatToPartyIndex[seatIndex] = partyIndex;
          return true;
        }
      }
      return false;
    };
    for (let partyIndex = 0; partyIndex < matchableParties.length; partyIndex += 1) {
      if (seatToPartyIndex.includes(partyIndex)) continue;
      tryMatch(partyIndex, new Set());
    }
    return seatToPartyIndex;
  }
  const strictMatchable = buildMatchableParties(parties, canAssignPartyToVenue, false);
  const allSeatIndexes = new Set(seatList.map((_, index) => index));
  const strictSeatToPartyIndex = maximizeAssignments(strictMatchable, allSeatIndexes);
  const strictAssignedPartyIds = new Set();
  strictSeatToPartyIndex.forEach((partyIndex)=>{ if (partyIndex >= 0) strictAssignedPartyIds.add(strictMatchable[partyIndex].id); });
  const relaxedCandidateParties = parties.filter((party)=>!strictAssignedPartyIds.has(party.id));
  const remainingSeatIndexes = new Set(strictSeatToPartyIndex.map((partyIndex,index)=>partyIndex < 0 ? index : -1).filter((index)=>index >= 0));
  const relaxedMatchable = buildMatchableParties(relaxedCandidateParties, ()=>true, true);
  const relaxedSeatToPartyIndex = relaxedMatchable.length > 0 && remainingSeatIndexes.size > 0 ? maximizeAssignments(relaxedMatchable, remainingSeatIndexes) : Array(seatList.length).fill(-1);
  const assignedPartyIds = new Set();
  strictSeatToPartyIndex.forEach((partyIndex)=>{ if (partyIndex >= 0) assignedPartyIds.add(strictMatchable[partyIndex].id); });
  relaxedSeatToPartyIndex.forEach((partyIndex)=>{ if (partyIndex >= 0) assignedPartyIds.add(relaxedMatchable[partyIndex].id); });
  console.log('preview assignments=', assignedPartyIds.size);
  console.log('strict assigned=', strictAssignedPartyIds.size, 'relaxed extra=', assignedPartyIds.size - strictAssignedPartyIds.size);
  console.log('missing=', parties.filter(p=>!assignedPartyIds.has(p.id)).map(p=>`${p.party_name} (${p.category})`));
  await conn.end();
})().catch(err=>{console.error(err);process.exit(1);});
