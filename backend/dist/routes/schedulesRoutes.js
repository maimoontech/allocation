"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedulesRoutes = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const response_1 = require("../utils/response");
const scheduleService_1 = require("../services/scheduleService");
exports.schedulesRoutes = (0, express_1.Router)();
exports.schedulesRoutes.use(auth_1.requireAuth);
exports.schedulesRoutes.get("/", async (req, res) => {
    const user = req.user;
    const miqaatId = req.query.miqaat_id ? Number(req.query.miqaat_id) : null;
    const zoneId = user.role === "zonal_head"
        ? user.zoneId
        : req.query.zone_id
            ? Number(req.query.zone_id)
            : null;
    const conditions = [];
    const params = {};
    params.coordinator_id = user.role === "coordinator" ? user.mohallahId : 0;
    if (Number.isFinite(miqaatId)) {
        conditions.push("s.miqaat_id = :miqaat_id");
        params.miqaat_id = miqaatId;
    }
    if (user.role === "party") {
        conditions.push("s.party_id = :party_id");
        params.party_id = user.partyId;
    }
    else if (user.role === "coordinator") {
        conditions.push("m.id = :mohallah_id");
        params.mohallah_id = user.mohallahId;
    }
    else if (Number.isFinite(zoneId)) {
        conditions.push("m.zone_id = :zone_id");
        params.zone_id = zoneId;
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [rows] = await pool_1.pool.query(`SELECT s.id, s.miqaat_id, q.miqaat_name, q.english_date, s.venue_id, v.venue_name, v.mohallah_id, m.mohallah_name, m.zone_id, z.zone_name,
            s.party_id, p.party_name, p.category, s.is_manual, s.created_at,
            CASE WHEN pr.id IS NULL THEN 0 ELSE 1 END AS performance_submitted,
            pr.attended_properly,
            pr.recitation_score,
            pr.discipline_score,
            pr.attendance_score,
            pr.overall_score,
            pr.comments AS performance_comments
     FROM schedules s
     JOIN miqaats q ON q.id = s.miqaat_id
     JOIN venues v ON v.id = s.venue_id
     JOIN mohallahs m ON m.id = v.mohallah_id
     JOIN zones z ON z.id = m.zone_id
     JOIN parties p ON p.id = s.party_id
     LEFT JOIN performance_ratings pr ON pr.schedule_id = s.id AND pr.coordinator_id = :coordinator_id
     ${whereSql}
     ORDER BY q.english_date DESC, z.zone_name, m.mohallah_name, v.venue_name, p.party_name`, params);
    return (0, response_1.ok)(res, rows, "OK");
});
exports.schedulesRoutes.post("/generate", (0, auth_1.requireRole)(["admin", "zonal_head"]), async (req, res) => {
    const user = req.user;
    const { miqaat_id, zone_id, overwrite } = req.body ?? {};
    const miqaatId = Number(miqaat_id);
    const zoneId = user.role === "zonal_head" ? Number(user.zoneId) : Number(zone_id);
    const overwriteFlag = Boolean(overwrite);
    if (!Number.isFinite(miqaatId) || !Number.isFinite(zoneId))
        return (0, response_1.fail)(res, "Invalid request", 400);
    try {
        const result = await (0, scheduleService_1.generateSchedule)({
            miqaatId,
            zoneId,
            overwrite: overwriteFlag,
            createdBy: { role: user.role, id: user.id }
        });
        return (0, response_1.ok)(res, { assignments: result.assignments }, "OK");
    }
    catch (err) {
        if (err?.code === "SCHEDULE_EXISTS" || err?.message === "SCHEDULE_EXISTS") {
            return res.status(409).json({ success: false, conflict: true, message: "Schedule exists" });
        }
        if (err?.message === "NO_VENUES")
            return (0, response_1.fail)(res, "No active venues found for zone", 400);
        if (err?.message === "NO_PARTIES")
            return (0, response_1.fail)(res, "No active parties found for zone", 400);
        return (0, response_1.fail)(res, "Failed to generate schedule", 500);
    }
});
exports.schedulesRoutes.delete("/", (0, auth_1.requireRole)(["admin", "zonal_head"]), async (req, res) => {
    const user = req.user;
    const miqaatId = Number(req.query.miqaat_id);
    const zoneId = user.role === "zonal_head" ? Number(user.zoneId) : Number(req.query.zone_id);
    if (!Number.isFinite(miqaatId) || !Number.isFinite(zoneId))
        return (0, response_1.fail)(res, "Invalid request", 400);
    const [result] = await pool_1.pool.query(`DELETE s FROM schedules s
     JOIN venues v ON v.id = s.venue_id
     JOIN mohallahs m ON m.id = v.mohallah_id
     WHERE s.miqaat_id = :miqaat_id AND m.zone_id = :zone_id`, { miqaat_id: miqaatId, zone_id: zoneId });
    return (0, response_1.ok)(res, { success: true, deleted: Number(result.affectedRows ?? 0) }, "Deleted");
});
exports.schedulesRoutes.put("/:id", (0, auth_1.requireRole)(["admin", "zonal_head"]), async (req, res) => {
    const user = req.user;
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
        return (0, response_1.fail)(res, "Invalid ID", 400);
    const { venue_id, party_id } = req.body ?? {};
    const venueId = Number(venue_id);
    const partyId = Number(party_id);
    if (!Number.isFinite(venueId) || !Number.isFinite(partyId))
        return (0, response_1.fail)(res, "Invalid request", 400);
    const [rows] = await pool_1.pool.query(`SELECT s.id, s.venue_id, s.party_id, m.zone_id
     FROM schedules s
     JOIN venues v ON v.id = s.venue_id
     JOIN mohallahs m ON m.id = v.mohallah_id
     WHERE s.id = :id`, { id });
    const current = rows[0];
    if (!current)
        return (0, response_1.fail)(res, "Not found", 404);
    if (user.role === "zonal_head" && current.zone_id !== user.zoneId)
        return (0, response_1.fail)(res, "Forbidden", 403);
    await pool_1.pool.query("UPDATE schedules SET venue_id = :venue_id, party_id = :party_id, is_manual = 1 WHERE id = :id", {
        id,
        venue_id: venueId,
        party_id: partyId
    });
    await pool_1.pool.query(`INSERT INTO schedule_edits (schedule_id, old_venue_id, old_party_id, new_venue_id, new_party_id, edited_by_role, edited_by_id, edited_at)
     VALUES (:schedule_id, :old_venue_id, :old_party_id, :new_venue_id, :new_party_id, :edited_by_role, :edited_by_id, NOW())`, {
        schedule_id: id,
        old_venue_id: current.venue_id,
        old_party_id: current.party_id,
        new_venue_id: venueId,
        new_party_id: partyId,
        edited_by_role: user.role,
        edited_by_id: user.id
    });
    return (0, response_1.ok)(res, { success: true }, "Updated");
});
exports.schedulesRoutes.delete("/:id", (0, auth_1.requireRole)(["admin", "zonal_head"]), async (req, res) => {
    const user = req.user;
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
        return (0, response_1.fail)(res, "Invalid ID", 400);
    const [rows] = await pool_1.pool.query(`SELECT s.id, m.zone_id
     FROM schedules s
     JOIN venues v ON v.id = s.venue_id
     JOIN mohallahs m ON m.id = v.mohallah_id
     WHERE s.id = :id`, { id });
    const current = rows[0];
    if (!current)
        return (0, response_1.fail)(res, "Not found", 404);
    if (user.role === "zonal_head" && current.zone_id !== user.zoneId)
        return (0, response_1.fail)(res, "Forbidden", 403);
    await pool_1.pool.query("DELETE FROM schedules WHERE id = :id", { id });
    return (0, response_1.ok)(res, { success: true }, "Deleted");
});
exports.schedulesRoutes.get("/history", async (req, res) => {
    const user = req.user;
    const partyId = req.query.party_id ? Number(req.query.party_id) : user.partyId;
    if (!Number.isFinite(partyId))
        return (0, response_1.fail)(res, "Invalid request", 400);
    if (user.role === "party" && partyId !== user.partyId)
        return (0, response_1.fail)(res, "Forbidden", 403);
    if (user.role === "coordinator")
        return (0, response_1.fail)(res, "Forbidden", 403);
    const [rows] = await pool_1.pool.query(`SELECT h.venue_id, v.venue_name, h.visit_count, h.first_visited_at, h.last_visited_at
     FROM party_venue_history h
     JOIN venues v ON v.id = h.venue_id
     WHERE h.party_id = :party_id
     ORDER BY h.last_visited_at DESC`, { party_id: partyId });
    return (0, response_1.ok)(res, rows, "OK");
});
