"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memberPhotoApprovalRoutes = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const response_1 = require("../utils/response");
exports.memberPhotoApprovalRoutes = (0, express_1.Router)();
exports.memberPhotoApprovalRoutes.use(auth_1.requireAuth, (0, auth_1.requireRole)(["admin", "zonal_head"]));
/**
 * Get all photos pending approval
 * Admin can see all, Zonal Head can only see photos of members in their zone
 */
exports.memberPhotoApprovalRoutes.get("/", async (req, res) => {
    const user = req.user;
    try {
        let query = `
      SELECT 
        mp.id,
        mp.member_account_id,
        mp.content_type,
        mp.byte_size,
        mp.width,
        mp.height,
        mp.approval_status,
        mp.created_at,
        mp.updated_at,
        ma.its_no,
        ma.member_name,
        mpr.zone_id,
        z.zone_name
      FROM member_photos mp
      JOIN member_accounts ma ON ma.id = mp.member_account_id
      LEFT JOIN member_profiles mpr ON mpr.member_account_id = mp.member_account_id
      LEFT JOIN zones z ON z.id = mpr.zone_id
      WHERE mp.approval_status = 'pending'
    `;
        const params = {};
        if (user.role === "zonal_head") {
            query += ` AND mpr.zone_id = :zoneId`;
            params.zoneId = user.zoneId;
        }
        query += ` ORDER BY mp.created_at DESC`;
        const [rows] = await pool_1.pool.query(query, params);
        return (0, response_1.ok)(res, rows.map(r => ({
            id: r.id,
            member_account_id: r.member_account_id,
            its_no: r.its_no,
            member_name: r.member_name,
            zone_id: r.zone_id,
            zone_name: r.zone_name,
            content_type: r.content_type,
            byte_size: r.byte_size,
            width: r.width,
            height: r.height,
            approval_status: r.approval_status,
            created_at: r.created_at,
            updated_at: r.updated_at
        })), "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to fetch pending photos", 500);
    }
});
/**
 * Get photo for viewing (for approval)
 */
exports.memberPhotoApprovalRoutes.get("/:photoId/image", async (req, res) => {
    const user = req.user;
    const photoId = Number(req.params.photoId);
    if (!Number.isInteger(photoId) || photoId <= 0) {
        return (0, response_1.fail)(res, "Invalid request", 400);
    }
    try {
        let query = `
      SELECT mp.content_type, mp.image_data, mp.byte_size, mp.sha256, mp.member_account_id, mpr.zone_id
      FROM member_photos mp
      LEFT JOIN member_profiles mpr ON mpr.member_account_id = mp.member_account_id
      WHERE mp.id = :photoId
    `;
        const params = { photoId };
        const [rows] = await pool_1.pool.query(query, params);
        const photo = rows[0];
        if (!photo) {
            return (0, response_1.fail)(res, "Photo not found", 404);
        }
        if (user.role === "zonal_head" && photo.zone_id !== user.zoneId) {
            return (0, response_1.fail)(res, "Forbidden", 403);
        }
        res.setHeader("Content-Type", photo.content_type);
        res.setHeader("Content-Length", String(photo.byte_size));
        res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
        res.setHeader("ETag", `"${photo.sha256}"`);
        if (req.headers["if-none-match"] === `"${photo.sha256}"`) {
            return res.status(304).end();
        }
        return res.status(200).end(photo.image_data);
    }
    catch {
        return (0, response_1.fail)(res, "Failed to load photo", 500);
    }
});
/**
 * Approve a photo
 */
exports.memberPhotoApprovalRoutes.post("/:photoId/approve", async (req, res) => {
    const user = req.user;
    const photoId = Number(req.params.photoId);
    if (!Number.isInteger(photoId) || photoId <= 0) {
        return (0, response_1.fail)(res, "Invalid request", 400);
    }
    try {
        const [photoRows] = await pool_1.pool.query(`SELECT mp.id, mp.member_account_id, mpr.zone_id
      FROM member_photos mp
      LEFT JOIN member_profiles mpr ON mpr.member_account_id = mp.member_account_id
      WHERE mp.id = :photoId`, { photoId });
        const photo = photoRows[0];
        if (!photo) {
            return (0, response_1.fail)(res, "Photo not found", 404);
        }
        if (user.role === "zonal_head" && photo.zone_id !== user.zoneId) {
            return (0, response_1.fail)(res, "Forbidden", 403);
        }
        await pool_1.pool.query(`UPDATE member_photos 
       SET approval_status = 'approved', 
           approved_by = :approvedBy, 
           approved_by_role = :approvedByRole, 
           approved_at = NOW(),
           rejection_reason = NULL
       WHERE id = :photoId`, {
            approvedBy: user.id,
            approvedByRole: user.role,
            photoId
        });
        return (0, response_1.ok)(res, { success: true }, "Photo approved");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to approve photo", 500);
    }
});
/**
 * Reject a photo
 */
exports.memberPhotoApprovalRoutes.post("/:photoId/reject", async (req, res) => {
    const user = req.user;
    const photoId = Number(req.params.photoId);
    const { reason } = req.body;
    if (!Number.isInteger(photoId) || photoId <= 0) {
        return (0, response_1.fail)(res, "Invalid request", 400);
    }
    try {
        const [photoRows] = await pool_1.pool.query(`SELECT mp.id, mp.member_account_id, mpr.zone_id
      FROM member_photos mp
      LEFT JOIN member_profiles mpr ON mpr.member_account_id = mp.member_account_id
      WHERE mp.id = :photoId`, { photoId });
        const photo = photoRows[0];
        if (!photo) {
            return (0, response_1.fail)(res, "Photo not found", 404);
        }
        if (user.role === "zonal_head" && photo.zone_id !== user.zoneId) {
            return (0, response_1.fail)(res, "Forbidden", 403);
        }
        await pool_1.pool.query(`UPDATE member_photos 
       SET approval_status = 'rejected', 
           approved_by = :approvedBy, 
           approved_by_role = :approvedByRole, 
           approved_at = NOW(),
           rejection_reason = :reason
       WHERE id = :photoId`, {
            approvedBy: user.id,
            approvedByRole: user.role,
            reason: reason || null,
            photoId
        });
        return (0, response_1.ok)(res, { success: true }, "Photo rejected");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to reject photo", 500);
    }
});
