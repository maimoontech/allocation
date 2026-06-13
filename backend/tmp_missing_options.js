const mysql = require("mysql2/promise");
(async()=>{
  const zoneId = 2;
  const miqaatIds = [9,10];
  const conn = await mysql.createConnection({host:"64.20.33.10",port:3306,user:"karachizakereen",password:"Kz@5253",database:"masjid_scheduling"});
  const [venueRows] = await conn.query(`SELECT v.id, v.venue_name FROM venues v JOIN mohallahs m ON m.id=v.mohallah_id WHERE m.zone_id=? AND v.is_active=1 ORDER BY v.id`, [zoneId]);
  const venueIds = venueRows.map(v => Number(v.id));
  const venueById = new Map(venueRows.map(v => [Number(v.id), String(v.venue_name)]));
  const [partyRows] = await conn.query(`SELECT id, party_name, category FROM parties WHERE zone_id=? AND is_active=1 AND category <> 'H' ORDER BY id`, [zoneId]);
  const targetNames = new Set(["Hizbe Moiz","Hizbe Abedeen"]);
  const targets = partyRows.filter(p => targetNames.has(String(p.party_name)));
  for (const miqaatId of miqaatIds) {
    const [[m]] = await conn.query(`SELECT DATE_FORMAT(english_date, '%Y-%m-%d') AS english_date, miqaat_name FROM miqaats WHERE id=?`, [miqaatId]);
    const currentMiqaatDate = m.english_date;
    console.log(`MIQAAT ${miqaatId} ${m.miqaat_name} (${currentMiqaatDate})`);
    for (const p of targets) {
      const [priorRows] = await conn.query(
        `SELECT s.venue_id, q.id AS prior_miqaat_id, DATE_FORMAT(q.english_date, '%Y-%m-%d') AS english_date
         FROM schedules s
         JOIN miqaats q ON q.id = s.miqaat_id
         JOIN venues v ON v.id = s.venue_id
         JOIN mohallahs mh ON mh.id = v.mohallah_id
         WHERE mh.zone_id = ?
           AND s.party_id = ?
           AND (q.english_date < ? OR (q.english_date = ? AND q.id < ?))
         ORDER BY q.english_date, q.id, s.id`,
        [zoneId, p.id, currentMiqaatDate, currentMiqaatDate, miqaatId]
      );
      let covered = new Set();
      for (const row of priorRows) {
        covered.add(Number(row.venue_id));
        if (covered.size >= venueIds.length) covered = new Set();
      }
      const allowed = venueIds.filter(id => !covered.has(id));
      console.log(`- ${p.party_name}: covered=${JSON.stringify(Array.from(covered).map(id=>venueById.get(id)))}`);
      console.log(`  allowed=${JSON.stringify(allowed.map(id=>venueById.get(id)))}`);
    }
  }
  await conn.end();
})().catch(err=>{console.error(err);process.exit(1);});
