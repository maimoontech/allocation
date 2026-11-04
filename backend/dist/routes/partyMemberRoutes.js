"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.partyMemberRoutes = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const response_1 = require("../utils/response");
/**
 * A party's own members.
 *
 * This is the one place outside the member themselves and the explicitly authorised
 * administrators where a photograph is served (FR-090). The narrowing is the point: the token
 * carries the party's id, every read is filtered by `member_profiles.party_id` against that id,
 * and the party id is never accepted from the request. A member of another party is therefore
 * not merely filtered out of the list — their photo request is answered exactly like a member
 * with no photograph, so nothing is revealed about whether they exist.
 *
 * Account state, contact details, health values and the twelve-tab profile stay out of the
 * response. The party sees who is in it and what they look like; FR-065 and FR-101 still hold.
 */
exports.partyMemberRoutes = (0, express_1.Router)();
exports.partyMemberRoutes.use(auth_1.requireAuth, (0, auth_1.requireRole)(["party"]));
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;
exports.partyMemberRoutes.get("/", async (req, res) => {
    const partyId = req.user.partyId;
    if (!partyId)
        return (0, response_1.fail)(res, "Unauthorized", 401);
    const q = String(req.query.q ?? "").trim();
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.page_size ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));
    // The join to `member_profiles` is the association itself; a member with no profile has no
    // party yet and cannot appear.
    const conditions = ["mp.party_id = :partyId", "ma.is_active = 1"];
    const params = { partyId };
    if (q) {
        // Each word must match somewhere, so "party member" finds a member whose first name and
        // surname are those words even though they are not adjacent in the concatenation.
        q.split(/\s+/)
            .filter(Boolean)
            .slice(0, 5)
            .forEach((token, index) => {
            const key = `q${index}`;
            conditions.push(`(ma.its_no LIKE :${key}
            OR CONCAT_WS(' ', mp.first_prefix, mp.name, mp.father_prefix, mp.father_name, mp.surname) LIKE :${key}
            OR ma.member_name LIKE :${key})`);
            params[key] = `%${token}%`;
        });
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    try {
        const [countRows] = await pool_1.pool.query(`SELECT COUNT(*) AS total
       FROM member_profiles mp
       JOIN member_accounts ma ON ma.id = mp.member_account_id
       ${where}`, params);
        const [rows] = await pool_1.pool.query(`SELECT ma.id,
              ma.its_no,
              mp.first_prefix,
              mp.name,
              mp.father_prefix,
              mp.father_name,
              mp.surname,
              IF(ph.id IS NULL, 0, 1) AS has_photo
       FROM member_profiles mp
       JOIN member_accounts ma ON ma.id = mp.member_account_id
       LEFT JOIN member_photos ph ON ph.member_account_id = ma.id
       ${where}
       ORDER BY mp.name, mp.surname, ma.its_no
       LIMIT :limit OFFSET :offset`, { ...params, limit: pageSize, offset: (page - 1) * pageSize });
        return (0, response_1.ok)(res, {
            items: rows.map((r) => ({
                id: Number(r.id),
                its_no: r.its_no,
                first_prefix: r.first_prefix ?? null,
                name: r.name ?? null,
                father_prefix: r.father_prefix ?? null,
                father_name: r.father_name ?? null,
                surname: r.surname ?? null,
                has_photo: Boolean(r.has_photo)
            })),
            total: Number(countRows[0]?.total ?? 0),
            page,
            page_size: pageSize
        }, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to list party members", 500);
    }
});
exports.partyMemberRoutes.get("/:memberId/photo", async (req, res) => {
    const partyId = req.user.partyId;
    if (!partyId)
        return (0, response_1.fail)(res, "Unauthorized", 401);
    const memberId = Number(req.params.memberId);
    if (!Number.isInteger(memberId) || memberId <= 0)
        return (0, response_1.fail)(res, "No photo set", 404);
    try {
        const [rows] = await pool_1.pool.query(`SELECT ph.content_type, ph.image_data, ph.sha256, ph.byte_size
       FROM member_photos ph
       JOIN member_profiles mp ON mp.member_account_id = ph.member_account_id
       JOIN member_accounts ma ON ma.id = ph.member_account_id
       WHERE ph.member_account_id = :memberId
         AND mp.party_id = :partyId
         AND ma.is_active = 1
       LIMIT 1`, { memberId, partyId });
        const photo = rows[0];
        // Same answer for "not in my party" and "has no photo" on purpose.
        if (!photo)
            return (0, response_1.fail)(res, "No photo set", 404);
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
