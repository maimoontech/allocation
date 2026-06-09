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
        const [[miqaatRow]] = await connection.query(`SELECT english_date
       FROM miqaats
       WHERE id = :miqaat_id
       LIMIT 1`, { miqaat_id: miqaatId });
        const currentMiqaatDate = String(miqaatRow?.english_date ?? "");
        if (!currentMiqaatDate)
            throw new Error("INVALID_MIQAAT");
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
        const currentCycleCoveredByParty = new Map();
        if (venueIds.length > 0 && partyIds.length > 0) {
            const [historyRows] = await connection.query(`SELECT party_id, venue_id, visit_count
         FROM party_venue_history
         WHERE party_id IN (${partyIds.map(() => "?").join(",")})
           AND venue_id IN (${venueIds.map(() => "?").join(",")})`, [...partyIds, ...venueIds]);
            for (const r of historyRows) {
                pairVisitCounts.set(`${Number(r.party_id)}:${Number(r.venue_id)}`, Number(r.visit_count ?? 0));
            }
            const [priorScheduleRows] = await connection.query(`SELECT s.party_id, s.venue_id, q.english_date, q.id AS prior_miqaat_id, s.id
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
         ORDER BY q.english_date, q.id, s.id`, [zoneId, ...partyIds, currentMiqaatDate, currentMiqaatDate, miqaatId]);
            for (const party of parties)
                currentCycleCoveredByParty.set(party.id, new Set());
            for (const row of priorScheduleRows) {
                const partyId = Number(row.party_id);
                const venueId = Number(row.venue_id);
                const covered = currentCycleCoveredByParty.get(partyId) ?? new Set();
                covered.add(venueId);
                if (covered.size >= venueIds.length) {
                    currentCycleCoveredByParty.set(partyId, new Set());
                }
                else {
                    currentCycleCoveredByParty.set(partyId, covered);
                }
            }
            // #region debug-point B:history-snapshot
            void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "duplicate-assignment", runId: "post-fix", hypothesisId: "B", location: "scheduleService.ts:84", msg: "[DEBUG] loaded history and derived current cycle coverage", data: { miqaatId, zoneId, venueCount: venueIds.length, partyCount: partyIds.length, historyCount: historyRows.length, priorScheduleCount: priorScheduleRows.length, sampleCycleCoverage: Array.from(currentCycleCoveredByParty.entries()).slice(0, 8).map(([partyId, covered]) => ({ partyId, coveredVenueIds: Array.from(covered.values()) })) }, ts: Date.now() }) }).catch(() => { });
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
        const partiesByCategory = {
            A: parties.filter((p) => p.category === "A"),
            B: parties.filter((p) => p.category === "B"),
            C: parties.filter((p) => p.category === "C")
        };
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
                if (byRound !== 0)
                    return byRound;
                const byVisit = visitCount(party.id, a.seat.venueId) - visitCount(party.id, b.seat.venueId);
                if (byVisit !== 0)
                    return byVisit;
                return a.seat.venueId - b.seat.venueId;
            })
                .map(({ index }) => index);
            return {
                ...party,
                seatIndexes
            };
        })
            .filter((party) => party.seatIndexes.length > 0)
            .sort((a, b) => {
            const byCategory = categoryRank(a.category) - categoryRank(b.category);
            if (byCategory !== 0)
                return byCategory;
            const byOptions = a.seatIndexes.length - b.seatIndexes.length;
            if (byOptions !== 0)
                return byOptions;
            return a.id - b.id;
        });
        // #region debug-point A:candidate-ranking
        void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "duplicate-assignment", runId: "post-fix", hypothesisId: "A", location: "scheduleService.ts:118", msg: "[DEBUG] built global party-seat graph", data: { miqaatId, zoneId, partyCount: matchableParties.length, seatCount: seatList.length, sample: matchableParties.slice(0, 8).map((party) => ({ partyId: party.id, category: party.category, options: party.seatIndexes.length })) }, ts: Date.now() }) }).catch(() => { });
        // #endregion
        const seatToPartyIndex = Array(seatList.length).fill(-1);
        const tryMatch = (partyIndex, seenSeats, allowedSeatIndexes) => {
            for (const seatIndex of matchableParties[partyIndex].seatIndexes) {
                if (!allowedSeatIndexes.has(seatIndex))
                    continue;
                if (seenSeats.has(seatIndex))
                    continue;
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
                if (seatToPartyIndex.includes(partyIndex))
                    continue;
                tryMatch(partyIndex, new Set(), allowedSeatIndexes);
            }
        };
        const roundOneSeats = new Set(seatList
            .map((seat, index) => ({ seat, index }))
            .filter(({ seat }) => seat.round === 1)
            .map(({ index }) => index));
        const minimumFillSeats = new Set(seatList
            .map((seat, index) => ({ seat, index }))
            .filter(({ seat }) => {
            const venue = venues.find((v) => v.id === seat.venueId);
            return seat.round > 1 && seat.round <= venue.min_parties;
        })
            .map(({ index }) => index));
        const categoryIndexes = {
            A: matchableParties.map((party, index) => ({ party, index })).filter(({ party }) => party.category === "A").map(({ index }) => index),
            B: matchableParties.map((party, index) => ({ party, index })).filter(({ party }) => party.category === "B").map(({ index }) => index),
            C: matchableParties.map((party, index) => ({ party, index })).filter(({ party }) => party.category === "C").map(({ index }) => index)
        };
        for (const category of activeCategoryOrder())
            matchSubset(categoryIndexes[category], roundOneSeats);
        for (const category of activeCategoryOrder())
            matchSubset(categoryIndexes[category], minimumFillSeats);
        const remainingSeats = new Set(seatList.map((_seat, index) => index).filter((index) => seatToPartyIndex[index] < 0));
        for (let partyIndex = 0; partyIndex < matchableParties.length; partyIndex += 1) {
            if (seatToPartyIndex.includes(partyIndex))
                continue;
            tryMatch(partyIndex, new Set(), remainingSeats);
        }
        seatToPartyIndex.forEach((partyIndex, seatIndex) => {
            if (partyIndex < 0)
                return;
            place(seatList[seatIndex].venueId, matchableParties[partyIndex].id);
        });
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
