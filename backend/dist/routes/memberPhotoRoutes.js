"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memberPhotoRoutes = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const requireMember_1 = require("../middleware/requireMember");
const imageValidation_1 = require("../utils/imageValidation");
const response_1 = require("../utils/response");
/**
 * A member's own photograph.
 *
 * Stored in the database and served through this authenticated route, never from a public
 * URL, so the same guard that protects the rest of the profile protects the image too
 * (FR-090). The bytes live in their own table, so reading a profile never drags them along.
 *
 * Uploads arrive base64-encoded in the JSON body. That needs no multipart dependency and
 * stays inside the existing `express.json({ limit: "5mb" })`: the 2 MB cap becomes roughly
 * 2.7 MB encoded.
 */
exports.memberPhotoRoutes = (0, express_1.Router)();
/**
 * Per-route guards, for the same reason as `memberProfileRoutes`: this router shares the
 * `/api/v1/members` mount with the admin router, which is registered afterwards. A router-wide
 * `requireMember()` would 403 the admin's member list before Express ever tried the admin
 * router's own paths.
 */
exports.memberPhotoRoutes.get("/me/photo", auth_1.requireAuth, (0, requireMember_1.requireMember)(), async (req, res) => {
    const memberId = req.user.memberId ?? req.user.id;
    try {
        const [rows] = await pool_1.pool.query(`SELECT content_type, image_data, sha256, byte_size
       FROM member_photos WHERE member_account_id = :id LIMIT 1`, { id: memberId });
        const photo = rows[0];
        if (!photo)
            return (0, response_1.fail)(res, "No photo set", 404);
        // `private` so no shared cache can hold a member's photograph (FR-090). The stored
        // digest doubles as the ETag, so an unchanged image is not re-sent.
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
exports.memberPhotoRoutes.put("/me/photo", auth_1.requireAuth, (0, requireMember_1.requireMember)(), async (req, res) => {
    const memberId = req.user.memberId ?? req.user.id;
    const { content_type, data_base64 } = (req.body ?? {});
    // The type is decided by the file's magic bytes, not by what the caller claimed
    // (FR-089). A mismatch between the two is itself a rejection.
    const validated = (0, imageValidation_1.validateImageUpload)({
        declaredContentType: content_type,
        dataBase64: data_base64
    });
    if (!validated.ok) {
        const status = validated.code === "TOO_LARGE" ? 413 : 400;
        return (0, response_1.fail)(res, validated.message, status, { code: validated.code });
    }
    try {
        // One row per member, enforced by a unique key, so replacing overwrites in place and
        // leaves no earlier image retrievable (FR-091).
        await pool_1.pool.query(`INSERT INTO member_photos
         (member_account_id, content_type, byte_size, width, height, sha256, image_data, approval_status)
       VALUES (:member_account_id, :content_type, :byte_size, :width, :height, :sha256, :image_data, 'pending')
       ON DUPLICATE KEY UPDATE
         content_type = VALUES(content_type),
         byte_size = VALUES(byte_size),
         width = VALUES(width),
         height = VALUES(height),
         sha256 = VALUES(sha256),
         image_data = VALUES(image_data),
         approval_status = 'pending',
         approved_by = NULL,
         approved_by_role = NULL,
         approved_at = NULL,
          rejection_reason = NULL`, {
            member_account_id: memberId,
            content_type: validated.contentType,
            byte_size: validated.byteSize,
            width: validated.width,
            height: validated.height,
            sha256: validated.sha256,
            image_data: validated.bytes
        });
        return (0, response_1.ok)(res, {
            content_type: validated.contentType,
            byte_size: validated.byteSize,
            width: validated.width,
            height: validated.height,
            sha256: validated.sha256,
            max_bytes: imageValidation_1.MAX_PHOTO_BYTES
        }, "Photo saved");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to save photo", 500);
    }
});
exports.memberPhotoRoutes.delete("/me/photo", auth_1.requireAuth, (0, requireMember_1.requireMember)(), async (req, res) => {
    const memberId = req.user.memberId ?? req.user.id;
    try {
        // Idempotent: removing a photo that is not there is a success, not a 404, so a retry
        // after a dropped connection behaves sensibly.
        await pool_1.pool.query("DELETE FROM member_photos WHERE member_account_id = :id", {
            id: memberId
        });
        return (0, response_1.ok)(res, { success: true }, "Photo removed");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to remove photo", 500);
    }
});
