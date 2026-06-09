"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSchedule = generateSchedule;
const pool_1 = require("../db/pool");
function categoryRank(category) {
    if (category === "A")
        return 0;
    if (category === "B")
        return 1;
    if (category === "C")
        return 2;
    return 99;
}
function activeCategoryOrder() {
    return ["A", "B", "C"];
}
async function generateSchedule(params) {
    const { miqaatId, zoneId, overwrite, createdBy } = params;
    const connection = await pool_1.pool.getConnection();
    try {
        await connection.beginTransaction();
        const [venueRows] = await connection.query(`SELECT v.id, v.min_parties, v.max_parties
       FROM venues v
       JOIN mohallahs m ON m.id = v.mohallah_id
       WHERE m.zone_id = :zone_id AND v.is_active = 1`, { zone_id: zoneId });
        const venues = venueRows.map((r) => ({
            id: Number(r.id),
            min_parties: Number(r.min_parties),
            max_parties: Number(r.max_parties)
        }));
        const [partyRows] = await connection.query(`SELECT id, category
       FROM parties
       WHERE zone_id = :zone_id AND is_active = 1 AND category <> 'H'`, { zone_id: zoneId });
        const parties = partyRows.map((r) => ({ id: Number(r.id), category: r.category }));
        parties.sort((a, b) => categoryRank(a.category) - categoryRank(b.category));
        if (venues.length === 0)
            throw new Error("NO_VENUES");
        if (parties.length === 0)
            throw new Error("NO_PARTIES");
        const [existingRows] = await connection.query(`SELECT COUNT(*) AS cnt
       FROM schedules s
       JOIN venues v ON v.id = s.venue_id
       JOIN mohallahs m ON m.id = v.mohallah_id
       WHERE s.miqaat_id = :miqaat_id AND m.zone_id = :zone_id`, { miqaat_id: miqaatId, zone_id: zoneId });
        const existingCount = Number(existingRows[0]?.cnt ?? 0);
        if (existingCount > 0 && !overwrite) {
            const err = new Error("SCHEDULE_EXISTS");
            err.code = "SCHEDULE_EXISTS";
            throw err;
        }
        if (existingCount > 0 && overwrite) {
            await connection.query(`DELETE s FROM schedules s
         JOIN venues v ON v.id = s.venue_id
         JOIN mohallahs m ON m.id = v.mohallah_id
         WHERE s.miqaat_id = :miqaat_id AND m.zone_id = :zone_id`, { miqaat_id: miqaatId, zone_id: zoneId });
        }
        const venueIds = venues.map((v) => v.id);
        const partyIds = parties.map((p) => p.id);
        const pairVisitCounts = new Map();
        if (venueIds.length > 0 && partyIds.length > 0) {
            const [historyRows] = await connection.query(`SELECT party_id, venue_id, visit_count
         FROM party_venue_history
         WHERE party_id IN (${partyIds.map(() => "?").join(",")})
           AND venue_id IN (${venueIds.map(() => "?").join(",")})`, [...partyIds, ...venueIds]);
            for (const r of historyRows) {
                pairVisitCounts.set(`${Number(r.party_id)}:${Number(r.venue_id)}`, Number(r.visit_count ?? 0));
            }
            // #region debug-point B:history-snapshot
            void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "duplicate-assignment", runId: "pre-fix", hypothesisId: "B", location: "scheduleService.ts:84", msg: "[DEBUG] loaded party_venue_history snapshot", data: { miqaatId, zoneId, venueCount: venueIds.length, partyCount: partyIds.length, historyCount: historyRows.length, sample: historyRows.slice(0, 12).map((r) => ({ party_id: Number(r.party_id), venue_id: Number(r.venue_id), visit_count: Number(r.visit_count ?? 0) })) }, ts: Date.now() }) }).catch(() => { });
            // #endregion
        }
        const assignedParty = new Set();
        const occupancy = new Map();
        for (const v of venues)
            occupancy.set(v.id, 0);
        const assignments = [];
        function canPlace(venueId) {
            const v = venues.find((x) => x.id === venueId);
            return (occupancy.get(venueId) ?? 0) < v.max_parties;
        }
        function place(venueId, partyId) {
            assignments.push({ venueId, partyId, isManual: 0 });
            assignedParty.add(partyId);
            occupancy.set(venueId, (occupancy.get(venueId) ?? 0) + 1);
        }
        function visitCount(partyId, venueId) {
            return pairVisitCounts.get(`${partyId}:${venueId}`) ?? 0;
        }
        function hasCoveredAllActiveVenues(partyId) {
            for (const venueId of venueIds) {
                if (visitCount(partyId, venueId) === 0)
                    return false;
            }
            return true;
        }
        function pickParty(candidates, venueId) {
            const available = candidates.filter((p) => {
                if (assignedParty.has(p.id))
                    return false;
                const pairVisits = visitCount(p.id, venueId);
                if (pairVisits === 0)
                    return true;
                return hasCoveredAllActiveVenues(p.id);
            });
            if (available.length === 0)
                return null;
            available.sort((a, b) => {
                const byPairVisits = visitCount(a.id, venueId) - visitCount(b.id, venueId);
                if (byPairVisits !== 0)
                    return byPairVisits;
                return a.id - b.id;
            });
            // #region debug-point A:candidate-ranking
            void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "duplicate-assignment", runId: "pre-fix", hypothesisId: "A", location: "scheduleService.ts:118", msg: "[DEBUG] ranked candidates for venue", data: { miqaatId, zoneId, venueId, candidateCategory: candidates[0]?.category ?? null, selectedPartyId: available[0]?.id ?? null, topCandidates: available.slice(0, 5).map((p) => ({ partyId: p.id, visitCount: visitCount(p.id, venueId), category: p.category })) }, ts: Date.now() }) }).catch(() => { });
            // #endregion
            return available[0] ?? null;
        }
        const partiesByCategory = {
            A: parties.filter((p) => p.category === "A"),
            B: parties.filter((p) => p.category === "B"),
            C: parties.filter((p) => p.category === "C")
        };
        function pickByPriority(venueId) {
            for (const category of activeCategoryOrder()) {
                const picked = pickParty(partiesByCategory[category], venueId);
                if (picked)
                    return picked;
            }
            return null;
        }
        function fillVenuesToTarget(targetForVenue) {
            let progress = true;
            while (progress) {
                progress = false;
                for (const venue of venues) {
                    const target = Math.min(Math.max(0, targetForVenue(venue)), venue.max_parties);
                    if ((occupancy.get(venue.id) ?? 0) >= target)
                        continue;
                    if (!canPlace(venue.id))
                        continue;
                    const picked = pickByPriority(venue.id);
                    if (!picked)
                        continue;
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
        if (assignments.length === 0)
            throw new Error("NO_ASSIGNMENTS");
        // #region debug-point C:assignment-result
        void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "duplicate-assignment", runId: "pre-fix", hypothesisId: "C", location: "scheduleService.ts:157", msg: "[DEBUG] generated assignments before insert", data: { miqaatId, zoneId, assignmentCount: assignments.length, assignments: assignments.map((a) => ({ venueId: a.venueId, partyId: a.partyId, pairVisitCount: visitCount(a.partyId, a.venueId) })) }, ts: Date.now() }) }).catch(() => { });
        // #endregion
        for (const a of assignments) {
            await connection.query(`INSERT INTO schedules (miqaat_id, venue_id, party_id, is_manual, created_by_role, created_by_id, created_at)
         VALUES (:miqaat_id, :venue_id, :party_id, :is_manual, :created_by_role, :created_by_id, NOW())`, {
                miqaat_id: miqaatId,
                venue_id: a.venueId,
                party_id: a.partyId,
                is_manual: a.isManual,
                created_by_role: createdBy.role,
                created_by_id: createdBy.id
            });
            await connection.query(`INSERT INTO party_venue_history (party_id, venue_id, visit_count, first_visited_at, last_visited_at)
         VALUES (:party_id, :venue_id, 1, NOW(), NOW())
         ON DUPLICATE KEY UPDATE visit_count = visit_count + 1, last_visited_at = NOW()`, { party_id: a.partyId, venue_id: a.venueId });
        }
        await connection.commit();
        return { assignments };
    }
    catch (err) {
        await connection.rollback();
        throw err;
    }
    finally {
        connection.release();
    }
}
