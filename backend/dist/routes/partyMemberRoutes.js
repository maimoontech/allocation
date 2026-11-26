"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.partyMemberRoutes = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const memberCompletionQuery_1 = require("../services/memberCompletionQuery");
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
 *
 * TWO FACTS ABOUT THE PROFILE WITHOUT ANY OF ITS CONTENT (FR-112c)
 *   How much of the form the member has filled in, and when they last saved it. Both are
 *   about the profile rather than from it: the completion figure is computed from PRESENCE -
 *   whether each box holds something, never what - and `updated_at` is a timestamp. The
 *   presence columns are consumed in this file and left out of the response.
 *
 *   It belongs here because the party is who does the chasing. A Zonal Head sees a zone and
 *   an administrator sees everybody, but the person who can ring a member and ask them to
 *   finish their form is the one running their Hizb.
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
        /**
         * NOTHING BUT SQL INSIDE THIS TEMPLATE LITERAL - no `--` comment, however useful. The
         * pool runs with `namedPlaceholders`, so every query passes through a tokeniser that does
         * not know what an SQL comment is and reads the prose as SQL. See the member list route,
         * where learning that cost two deploys.
         *
         * `mp` is INNER JOINed here, where `memberCompletionQuery` describes it as LEFT JOINed.
         * That is correct for this query and not a loosening of the contract: the party
         * association IS `member_profiles.party_id`, so a member with no profile row has no party
         * and cannot appear in a party roster at all. There is no 0%-with-no-profile case to
         * preserve. `ph` is LEFT JOINed as the fragment requires, and is UNIQUE on
         * `member_account_id`, so it cannot fan a member out into duplicate rows.
         *
         * `updated_at` moves on any successful save of the profile, including one that changed
         * only a repeatable section such as Skills - `saveMemberProfile` touches it deliberately
         * for that reason. It also moves when an administrator corrects the profile under
         * FR-047a, which is why the page calls the column "last saved" rather than attributing it
         * to the member.
         */
        const [rows] = await pool_1.pool.query(`SELECT ma.id,
              ma.its_no,
              mp.first_prefix,
              mp.name,
              mp.father_prefix,
              mp.father_name,
              mp.surname,
              IF(ph.id IS NULL, 0, 1) AS has_photo,
              mp.updated_at AS profile_updated_at,
              ${memberCompletionQuery_1.COMPLETION_SELECT}
       FROM member_profiles mp
       JOIN member_accounts ma ON ma.id = mp.member_account_id
       LEFT JOIN member_photos ph ON ph.member_account_id = ma.id
       ${where}
       ORDER BY mp.name, mp.surname, ma.its_no
       LIMIT :limit OFFSET :offset`, { ...params, limit: pageSize, offset: (page - 1) * pageSize });
        return (0, response_1.ok)(res, {
            items: rows.map((r) => {
                // FR-112c. The same measure the administrator's list shows and the dashboard
                // averages, computed by the same code, so the three cannot disagree about one
                // member. The presence columns it reads stay in this function.
                const completion = (0, memberCompletionQuery_1.completionFor)(r);
                return {
                    id: Number(r.id),
                    its_no: r.its_no,
                    first_prefix: r.first_prefix ?? null,
                    name: r.name ?? null,
                    father_prefix: r.father_prefix ?? null,
                    father_name: r.father_name ?? null,
                    surname: r.surname ?? null,
                    has_photo: Boolean(r.has_photo),
                    profile_updated_at: r.profile_updated_at ?? null,
                    completion_percent: completion.percent,
                    completion_answered: completion.answered,
                    completion_asked: completion.asked
                };
            }),
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
