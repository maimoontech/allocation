import { pool } from "../db/pool";

type Party = { id: number; category: "A" | "B" | "C" | "H" };
type Venue = { id: number; min_parties: number; max_parties: number };
type ActiveCategory = "A" | "B" | "C";

function categoryRank(category: Party["category"]) {
  if (category === "A") return 0;
  if (category === "B") return 1;
  if (category === "C") return 2;
  return 99;
}

function activeCategoryOrder(): ActiveCategory[] {
  return ["A", "B", "C"];
}

export async function generateSchedule(params: {
  miqaatId: number;
  zoneId: number;
  overwrite: boolean;
  createdBy: { role: string; id: number };
}) {
  const { miqaatId, zoneId, overwrite, createdBy } = params;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [venueRows] = await connection.query<any[]>(
      `SELECT v.id, v.min_parties, v.max_parties
       FROM venues v
       JOIN mohallahs m ON m.id = v.mohallah_id
       WHERE m.zone_id = :zone_id AND v.is_active = 1`,
      { zone_id: zoneId }
    );
    const venues: Venue[] = venueRows.map((r) => ({
      id: Number(r.id),
      min_parties: Number(r.min_parties),
      max_parties: Number(r.max_parties)
    }));

    const [partyRows] = await connection.query<any[]>(
      `SELECT id, category
       FROM parties
       WHERE zone_id = :zone_id AND is_active = 1 AND category <> 'H'`,
      { zone_id: zoneId }
    );
    const parties: Party[] = partyRows.map((r) => ({ id: Number(r.id), category: r.category }));
    parties.sort((a, b) => categoryRank(a.category) - categoryRank(b.category));

    if (venues.length === 0) throw new Error("NO_VENUES");
    if (parties.length === 0) throw new Error("NO_PARTIES");

    const [existingRows] = await connection.query<any[]>(
      `SELECT COUNT(*) AS cnt
       FROM schedules s
       JOIN venues v ON v.id = s.venue_id
       JOIN mohallahs m ON m.id = v.mohallah_id
       WHERE s.miqaat_id = :miqaat_id AND m.zone_id = :zone_id`,
      { miqaat_id: miqaatId, zone_id: zoneId }
    );
    const existingCount = Number(existingRows[0]?.cnt ?? 0);
    if (existingCount > 0 && !overwrite) {
      const err: any = new Error("SCHEDULE_EXISTS");
      err.code = "SCHEDULE_EXISTS";
      throw err;
    }

    if (existingCount > 0 && overwrite) {
      await connection.query(
        `DELETE s FROM schedules s
         JOIN venues v ON v.id = s.venue_id
         JOIN mohallahs m ON m.id = v.mohallah_id
         WHERE s.miqaat_id = :miqaat_id AND m.zone_id = :zone_id`,
        { miqaat_id: miqaatId, zone_id: zoneId }
      );
    }

    const venueIds = venues.map((v) => v.id);
    const partyIds = parties.map((p) => p.id);

    const pairVisitCounts = new Map<string, number>();
    if (venueIds.length > 0 && partyIds.length > 0) {
      const [historyRows] = await connection.query<any[]>(
        `SELECT party_id, venue_id, visit_count
         FROM party_venue_history
         WHERE party_id IN (${partyIds.map(() => "?").join(",")})
           AND venue_id IN (${venueIds.map(() => "?").join(",")})`,
        [...partyIds, ...venueIds]
      );
      for (const r of historyRows) {
        pairVisitCounts.set(`${Number(r.party_id)}:${Number(r.venue_id)}`, Number(r.visit_count ?? 0));
      }
    }

    const assignedParty = new Set<number>();
    const occupancy = new Map<number, number>();
    for (const v of venues) occupancy.set(v.id, 0);

    const assignments: { venueId: number; partyId: number; isManual: 0 | 1 }[] = [];

    function canPlace(venueId: number) {
      const v = venues.find((x) => x.id === venueId)!;
      return (occupancy.get(venueId) ?? 0) < v.max_parties;
    }

    function place(venueId: number, partyId: number) {
      assignments.push({ venueId, partyId, isManual: 0 });
      assignedParty.add(partyId);
      occupancy.set(venueId, (occupancy.get(venueId) ?? 0) + 1);
    }

    function visitCount(partyId: number, venueId: number) {
      return pairVisitCounts.get(`${partyId}:${venueId}`) ?? 0;
    }

    function pickParty(candidates: Party[], venueId: number) {
      const available = candidates.filter((p) => !assignedParty.has(p.id));
      if (available.length === 0) return null;

      available.sort((a, b) => {
        const byPairVisits = visitCount(a.id, venueId) - visitCount(b.id, venueId);
        if (byPairVisits !== 0) return byPairVisits;
        return a.id - b.id;
      });

      return available[0] ?? null;
    }

    const partiesByCategory: Record<ActiveCategory, Party[]> = {
      A: parties.filter((p) => p.category === "A"),
      B: parties.filter((p) => p.category === "B"),
      C: parties.filter((p) => p.category === "C")
    };

    function pickByPriority(venueId: number) {
      for (const category of activeCategoryOrder()) {
        const picked = pickParty(partiesByCategory[category], venueId);
        if (picked) return picked;
      }
      return null;
    }

    function fillVenuesToTarget(targetForVenue: (venue: Venue) => number) {
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

    // First ensure each active venue gets a first assignment, preferring A then B then C.
    fillVenuesToTarget(() => 1);

    // Then honor venue minimum capacity before filling additional optional capacity.
    fillVenuesToTarget((venue) => Math.max(1, venue.min_parties));
    fillVenuesToTarget((venue) => Math.max(venue.min_parties, venue.max_parties));

    if (assignments.length === 0) throw new Error("NO_ASSIGNMENTS");

    for (const a of assignments) {
      await connection.query(
        `INSERT INTO schedules (miqaat_id, venue_id, party_id, is_manual, created_by_role, created_by_id, created_at)
         VALUES (:miqaat_id, :venue_id, :party_id, :is_manual, :created_by_role, :created_by_id, NOW())`,
        {
          miqaat_id: miqaatId,
          venue_id: a.venueId,
          party_id: a.partyId,
          is_manual: a.isManual,
          created_by_role: createdBy.role,
          created_by_id: createdBy.id
        }
      );

      await connection.query(
        `INSERT INTO party_venue_history (party_id, venue_id, visit_count, first_visited_at, last_visited_at)
         VALUES (:party_id, :venue_id, 1, NOW(), NOW())
         ON DUPLICATE KEY UPDATE visit_count = visit_count + 1, last_visited_at = NOW()`,
        { party_id: a.partyId, venue_id: a.venueId }
      );
    }

    await connection.commit();
    return { assignments };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
