const mysql = require("mysql2/promise");
const { env } = require("./dist/config/env");
(async()=>{
  const zoneId = 2;
  const miqaatIds = [9,10];
  const conn = await mysql.createConnection({host:env.db.host,port:env.db.port,user:env.db.user,password:env.db.pass,database:env.db.name});
  const [partyRows] = await conn.query(`SELECT id, party_name, category FROM parties WHERE zone_id=? AND is_active=1 AND category <> 'H' ORDER BY category, party_name`, [zoneId]);
  for (const miqaatId of miqaatIds) {
    const [assignedRows] = await conn.query(`SELECT p.party_name, p.category FROM schedules s JOIN parties p ON p.id=s.party_id JOIN venues v ON v.id=s.venue_id JOIN mohallahs m ON m.id=v.mohallah_id WHERE s.miqaat_id=? AND m.zone_id=? ORDER BY p.category, p.party_name`, [miqaatId, zoneId]);
    const assigned = new Set(assignedRows.map(r => r.party_name));
    const missing = partyRows.filter(p => !assigned.has(p.party_name));
    console.log(`MIQAAT ${miqaatId} missing parties:`);
    for (const p of missing) console.log(`- ${p.party_name} (${p.category})`);
  }
  await conn.end();
})().catch(err=>{console.error(err);process.exit(1);});
