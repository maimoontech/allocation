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
  const [[miqaatRow]] = await conn.query(`SELECT DATE_FORMAT(english_date, '%Y-%m-%d') AS english_date FROM miqaats WHERE id = ? LIMIT 1`, [miqaatId]);
  const currentMiqaatDate = miqaatRow.english_date;
  const [venueRows] = await conn.query(`SELECT v.id, v.venue_name, v.min_parties, v.max_parties FROM venues v JOIN mohallahs m ON m.id=v.mohallah_id WHERE m.zone_id=? AND v.is_active=1 ORDER BY v.id`, [zoneId]);
  const venues = venueRows.map(r => ({id:Number(r.id), venue_name:String(r.venue_name), min_parties:Number(r.min_parties), max_parties:Number(r.max_parties)}));
  const [partyRows] = await conn.query(`SELECT id, party_name, category FROM parties WHERE zone_id=? AND is_active=1 AND category <> 'H' ORDER BY id`, [zoneId]);
  const parties = partyRows.map(r => ({id:Number(r.id), party_name:String(r.party_name), category:String(r.category)})).sort((a,b)=>categoryRank(a.category)-categoryRank(b.category)||a.id-b.id);
  const venueIds = venues.map(v=>v.id);
  const partyIds = parties.map(p=>p.id);
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
  const seatList=[]; const maxRounds=Math.max(...venues.map(v=>v.max_parties));
  for(let round=1; round<=maxRounds; round++) for(const venue of venues) if(round<=venue.max_parties) seatList.push({venueId:venue.id, round});
  const canAssign = (partyId, venueId) => !(currentCycleCoveredByParty.get(partyId)?.has(venueId));
  const partySeatIndexes = parties.map((party)=> seatList.map((seat,index)=>({seat,index})).filter(({seat})=>canAssign(party.id, seat.venueId)).map(({index})=>index));
  const seatToParty = Array(seatList.length).fill(-1);
  function dfs(partyIndex, seen){
    for(const seatIndex of partySeatIndexes[partyIndex]){
      if(seen.has(seatIndex)) continue;
      seen.add(seatIndex);
      if(seatToParty[seatIndex]===-1 || dfs(seatToParty[seatIndex], seen)) { seatToParty[seatIndex]=partyIndex; return true; }
    }
    return false;
  }
  let matched=0;
  for(let i=0;i<parties.length;i++) if(dfs(i,new Set())) matched++;
  console.log('Max feasible assignments ignoring category priorities =', matched);
  const assignedPartyIndexes = new Set(seatToParty.filter(i=>i>=0));
  const missing = parties.filter((_,i)=>!assignedPartyIndexes.has(i));
  console.log('Still impossible parties at max matching:', missing.map(p=>p.party_name));
  await conn.end();
})().catch(err=>{console.error(err);process.exit(1);});
