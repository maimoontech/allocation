"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ratingsRoutes = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const response_1 = require("../utils/response");
exports.ratingsRoutes = (0, express_1.Router)();
exports.ratingsRoutes.post("/", auth_1.requireAuth, (0, auth_1.requireRole)(["party"]), async (req, res) => {
    const user = req.user;
    const { schedule_id, score, comments } = req.body ?? {};
    const scheduleId = Number(schedule_id);
    const ratingScore = Number(score);
    if (!Number.isFinite(scheduleId) || !Number.isFinite(ratingScore))
        return (0, response_1.fail)(res, "Invalid request", 400);
    if (ratingScore < 1 || ratingScore > 10)
        return (0, response_1.fail)(res, "Score must be 1-10", 400);
    const [rows] = await pool_1.pool.query("SELECT id FROM schedules WHERE id = :id AND party_id = :party_id LIMIT 1", { id: scheduleId, party_id: user.partyId });
    if (!rows[0])
        return (0, response_1.fail)(res, "Forbidden", 403);
    await pool_1.pool.query(`INSERT INTO ratings (schedule_id, rater_role, rater_id, rating_score, comments, created_at)
     VALUES (:schedule_id, 'party', :rater_id, :rating_score, :comments, NOW())
     ON DUPLICATE KEY UPDATE rating_score = VALUES(rating_score), comments = VALUES(comments)`, { schedule_id: scheduleId, rater_id: user.partyId, rating_score: ratingScore, comments: comments ?? null });
    return (0, response_1.ok)(res, { success: true }, "Saved");
});
exports.ratingsRoutes.post("/performance", auth_1.requireAuth, (0, auth_1.requireRole)(["coordinator"]), async (req, res) => {
    const user = req.user;
    const { schedule_id, attended_properly, recitation, discipline, attendance, overall, comments } = req.body ?? {};
    const scheduleId = Number(schedule_id);
    if (!Number.isFinite(scheduleId))
        return (0, response_1.fail)(res, "Invalid request", 400);
    const scores = {
        recitation: Number(recitation),
        discipline: Number(discipline),
        attendance: Number(attendance),
        overall: Number(overall)
    };
    for (const k of Object.keys(scores)) {
        const v = scores[k];
        if (!Number.isFinite(v) || v < 1 || v > 10)
            return (0, response_1.fail)(res, `Invalid ${k} score`, 400);
    }
    const [rows] = await pool_1.pool.query(`SELECT s.id
     FROM schedules s
     JOIN venues v ON v.id = s.venue_id
     WHERE s.id = :id AND v.mohallah_id = :mohallah_id
     LIMIT 1`, { id: scheduleId, mohallah_id: user.mohallahId });
    if (!rows[0])
        return (0, response_1.fail)(res, "Forbidden", 403);
    try {
        await pool_1.pool.query(`INSERT INTO performance_ratings (schedule_id, coordinator_id, attended_properly, recitation_score, discipline_score, attendance_score, overall_score, comments, created_at)
       VALUES (:schedule_id, :coordinator_id, :attended_properly, :recitation, :discipline, :attendance, :overall, :comments, NOW())`, {
            schedule_id: scheduleId,
            coordinator_id: user.mohallahId,
            attended_properly: attended_properly ? 1 : 0,
            recitation: scores.recitation,
            discipline: scores.discipline,
            attendance: scores.attendance,
            overall: scores.overall,
            comments: comments ?? null
        });
    }
    catch (err) {
        if (err?.code === "ER_DUP_ENTRY" || err?.errno === 1062) {
            return res.status(409).json({
                success: false,
                message: "Already submitted. You can't change after submit."
            });
        }
        return (0, response_1.fail)(res, "Failed to save rating", 500);
    }
    return (0, response_1.ok)(res, { success: true }, "Saved");
});
