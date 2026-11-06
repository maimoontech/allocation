"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.memberAdminRoutes = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const authService_1 = require("../services/authService");
const memberProfileService_1 = require("../services/memberProfileService");
const response_1 = require("../utils/response");
/**
 * Administrator and Zonal Head view of member ACCOUNTS (FR-006, FR-007).
 *
 * Shows account state plus the identifying details needed to recognise a person: name parts,
 * photograph, zone and party posting, and WhatsApp and mobile numbers. The LIST stays at
 * that: the twelve-tab answers are not in it, so a page of fifty members is not a page of
 * fifty medical records (FR-101).
 *
 * The full profile is a separate, deliberate request — `GET /:id/profile`, one member at a
 * time, which both roles may make and which does include the Tab 6 health values under
 * FR-065 as amended on 2026-11-06.
 *
 * Two roles reach this router and they see different things:
 *   - admin       every account, including those with no profile row yet
 *   - zonal_head  only accounts whose PROFILE places them in that head's own zone
 *
 * A Zonal Head's scope therefore depends on `member_profiles.zone_id`, the same source
 * memberPhotoApprovalRoutes already scopes by. One consequence is deliberate and is stated
 * in the UI: an account created here has no profile yet, so it is in NO zone, and a Zonal
 * Head cannot see it until the member chooses their zone in Tab 2. Scoping zone-less
 * accounts to whoever created them was rejected — it needs a column recording who
 * provisioned them, and showing every zone-less account to every Zonal Head would leak one
 * zone's new members into another zone's list.
 *
 * Single accounts are created here (ITS number, name, password); rosters still go through
 * the import route. Both hash with bcrypt cost 10 and both set `must_change_password`, so a
 * provisioned password is a one-time credential whichever way it was issued (FR-004, FR-015).
 */
exports.memberAdminRoutes = (0, express_1.Router)();
exports.memberAdminRoutes.use(auth_1.requireAuth, (0, auth_1.requireRole)(["admin", "zonal_head"]));
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;
const MAX_MEMBER_NAME = 150;
/**
 * The zone this request is confined to, or null for an administrator, who is not confined.
 *
 * `false` means the caller is a Zonal Head whose token carries no usable zone. That is a
 * broken token, not a "see everything" case, so callers refuse the request rather than fall
 * through to an unscoped query.
 */
function requestZoneScope(user) {
    if (user.role !== "zonal_head")
        return null;
    const zoneId = Number(user.zoneId);
    return Number.isInteger(zoneId) && zoneId > 0 ? zoneId : false;
}
exports.memberAdminRoutes.get("/", async (req, res) => {
    const scope = requestZoneScope(req.user);
    if (scope === false)
        return (0, response_1.fail)(res, "Forbidden", 403);
    const q = String(req.query.q ?? "").trim();
    const isActiveRaw = String(req.query.is_active ?? "").trim();
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.page_size ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));
    const conditions = [];
    const params = {};
    // A Zonal Head sees only their own zone. `mp.zone_id` sits on the LEFT JOINed profile, so
    // this also excludes accounts with no profile at all — which is correct: such an account
    // is in no zone, and claiming it for this zone would be a guess.
    if (scope !== null) {
        conditions.push("mp.zone_id = :scope_zone_id");
        params.scope_zone_id = scope;
    }
    if (q) {
        // Matches the ITS number, the roster name, or the full name stored on the profile.
        // `LIKE` with a leading wildcard cannot use the index, which is fine at this table's
        // size and keeps the search forgiving.
        conditions.push(`(ma.its_no LIKE :q
        OR ma.member_name LIKE :q
        OR CONCAT_WS(' ', mp.first_prefix, mp.name, mp.father_prefix, mp.father_name, mp.surname) LIKE :q)`);
        params.q = `%${q}%`;
    }
    if (isActiveRaw === "true" || isActiveRaw === "1") {
        conditions.push("ma.is_active = 1");
    }
    else if (isActiveRaw === "false" || isActiveRaw === "0") {
        conditions.push("ma.is_active = 0");
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
        const [countRows] = await pool_1.pool.query(`SELECT COUNT(*) AS total
       FROM member_accounts ma
       LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
       ${where}`, params);
        const total = Number(countRows[0]?.total ?? 0);
        const [rows] = await pool_1.pool.query(`SELECT ma.id,
              ma.its_no,
              ma.member_name,
              ma.must_change_password,
              ma.is_active,
              IF(mp.id IS NULL, 0, 1) AS has_profile,
              IF(ph.id IS NULL, 0, 1) AS has_photo,
              mp.first_prefix,
              mp.name,
              mp.father_prefix,
              mp.father_name,
              mp.surname,
              z.zone_name,
              p.party_name,
              mp.whatsapp_no_1,
              mp.whatsapp_no_2,
              mp.mobile_no_1,
              mp.mobile_no_2,
              ma.last_login_at,
              ma.created_at
       FROM member_accounts ma
       LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
       LEFT JOIN member_photos ph ON ph.member_account_id = ma.id
       LEFT JOIN zones z ON z.id = mp.zone_id
       LEFT JOIN parties p ON p.id = mp.party_id
       ${where}
       ORDER BY ma.its_no
       LIMIT :limit OFFSET :offset`, { ...params, limit: pageSize, offset: (page - 1) * pageSize });
        return (0, response_1.ok)(res, {
            items: rows.map((r) => ({
                id: Number(r.id),
                its_no: r.its_no,
                member_name: r.member_name,
                must_change_password: Boolean(r.must_change_password),
                is_active: Boolean(r.is_active),
                has_profile: Boolean(r.has_profile),
                has_photo: Boolean(r.has_photo),
                first_prefix: r.first_prefix,
                name: r.name,
                father_prefix: r.father_prefix,
                father_name: r.father_name,
                surname: r.surname,
                zone_name: r.zone_name,
                party_name: r.party_name,
                whatsapp_no_1: r.whatsapp_no_1,
                whatsapp_no_2: r.whatsapp_no_2,
                mobile_no_1: r.mobile_no_1,
                mobile_no_2: r.mobile_no_2,
                last_login_at: r.last_login_at,
                created_at: r.created_at
            })),
            total,
            page,
            page_size: pageSize
        }, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to list members", 500);
    }
});
/**
 * Creates ONE member account: the basic entry an Admin or Zonal Head needs so a person can
 * sign in and fill their own profile — ITS number, full name, password.
 *
 * Only those three. Zone, party and every profile answer belong to the member's own twelve
 * tabs, so nothing here pre-empts them.
 *
 * `member_name` is the roster name held on the ACCOUNT, which exists so a list reads
 * sensibly before Tab 1 is filled. It is not the profile's name parts and does not become
 * them: the member enters those, and the list prefers them once present.
 *
 * The password is checked against the member policy (FR-020, FR-021) even though it is
 * temporary. The member must replace it at first sign-in, and refusing a weak one here is
 * cheaper than the member meeting the same rule later with no idea why. It is hashed with
 * bcrypt cost 10 and never returned.
 */
exports.memberAdminRoutes.post("/", async (req, res) => {
    const scope = requestZoneScope(req.user);
    if (scope === false)
        return (0, response_1.fail)(res, "Forbidden", 403);
    const body = (req.body ?? {});
    const itsNo = String(body.its_no ?? "").trim();
    const memberName = String(body.member_name ?? "").trim();
    // Not trimmed and not coerced: a non-string password is absent, and trimming would accept
    // a password the member could never retype. The policy rejects outer spaces itself.
    const password = typeof body.password === "string" ? body.password : "";
    // ITS numbers are digits. Rejecting anything else keeps a mistyped field from silently
    // creating an unusable account (FR-008). Same rule as the import route.
    if (!/^\d{6,20}$/.test(itsNo)) {
        return (0, response_1.fail)(res, "ITS No must be 6 to 20 digits.", 400);
    }
    if (!memberName) {
        return (0, response_1.fail)(res, "Full name is required.", 400);
    }
    if (memberName.length > MAX_MEMBER_NAME) {
        return (0, response_1.fail)(res, `Full name must be ${MAX_MEMBER_NAME} characters or fewer.`, 400);
    }
    const policyError = (0, authService_1.validateMemberPassword)(password);
    if (policyError)
        return (0, response_1.fail)(res, policyError, 400);
    try {
        const password_hash = await bcryptjs_1.default.hash(password, 10);
        // must_change_password defaults to 1 in the schema and is set explicitly here so the
        // intent is visible at the call site (FR-004). password_changed_at stays NULL, which is
        // what marks this password as never having been the member's own (FR-005).
        const [result] = await pool_1.pool.query(`INSERT INTO member_accounts
         (its_no, member_name, password_hash, must_change_password, password_changed_at, is_active)
       VALUES (:its_no, :member_name, :password_hash, 1, NULL, 1)`, { its_no: itsNo, member_name: memberName, password_hash });
        return (0, response_1.ok)(res, {
            id: Number(result?.insertId ?? 0),
            its_no: itsNo,
            member_name: memberName,
            is_active: true,
            must_change_password: true
        }, `Member ${itsNo} created. They must change this password at first sign-in.`);
    }
    catch (err) {
        // uq_member_accounts_its_no. Named rather than generic so the operator knows the ITS
        // number is taken instead of retyping it expecting a different result.
        if (err?.code === "ER_DUP_ENTRY") {
            return (0, response_1.fail)(res, `ITS No ${itsNo} already has a member account.`, 409);
        }
        return (0, response_1.fail)(res, "Failed to create member", 500);
    }
});
/**
 * The member's current photograph, for the member list.
 *
 * Served as bytes behind the role guard rather than as a data URL in the list payload: a
 * list of fifty members would otherwise carry tens of megabytes. Approval status is not
 * filtered, because an administrator is the party that approves it.
 */
exports.memberAdminRoutes.get("/:id/photo", async (req, res) => {
    const scope = requestZoneScope(req.user);
    if (scope === false)
        return (0, response_1.fail)(res, "Forbidden", 403);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid request", 400);
    try {
        const [rows] = await pool_1.pool.query(`SELECT ph.content_type, ph.byte_size, ph.sha256, ph.image_data, mp.zone_id
       FROM member_photos ph
       LEFT JOIN member_profiles mp ON mp.member_account_id = ph.member_account_id
       WHERE ph.member_account_id = :id
       LIMIT 1`, { id });
        const photo = rows[0];
        if (!photo)
            return (0, response_1.fail)(res, "No photo set", 404);
        if (scope !== null && Number(photo.zone_id) !== scope)
            return (0, response_1.fail)(res, "Forbidden", 403);
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
 * Confirms the caller may act on this member, and returns their zone.
 *
 * One helper for both profile routes so the check cannot be written two slightly different
 * ways. It reads the zone BEFORE anything else happens, which is what stops a refusal from
 * following a completed read or write.
 */
async function assertMemberInScope(id, scope) {
    const [rows] = await pool_1.pool.query(`SELECT ma.id, mp.zone_id
     FROM member_accounts ma
     LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
     WHERE ma.id = :id
     LIMIT 1`, { id });
    const row = rows[0];
    if (!row)
        return "not_found";
    if (scope !== null && Number(row.zone_id) !== scope)
        return "forbidden";
    return "ok";
}
/**
 * One member's full twelve-tab profile, for an administrator or a Zonal Head.
 *
 * FR-047a, authorised 2026-11-06. This DOES include the Tab 6 health values. FR-065 already
 * allowed "explicitly authorised administrators" to read them; extending that to Zonal Heads
 * for their own zone is the new part, and it was authorised explicitly rather than inferred.
 *
 * A Zonal Head is confined to their own zone, derived from `member_profiles.zone_id` exactly
 * as the list and the photo endpoint derive it. A member with no profile row is therefore in
 * no zone and is invisible to every Zonal Head — the same consequence stated for FR-006a.
 */
exports.memberAdminRoutes.get("/:id/profile", async (req, res) => {
    const scope = requestZoneScope(req.user);
    if (scope === false)
        return (0, response_1.fail)(res, "Forbidden", 403);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid request", 400);
    try {
        const verdict = await assertMemberInScope(id, scope);
        if (verdict === "not_found")
            return (0, response_1.fail)(res, "Member not found", 404);
        if (verdict === "forbidden")
            return (0, response_1.fail)(res, "Forbidden", 403);
        const profile = await (0, memberProfileService_1.readMemberProfile)(id);
        if (!profile)
            return (0, response_1.fail)(res, "Member not found", 404);
        // Stated in the payload rather than re-derived in the browser, so the client cannot
        // enable editing for a Zonal Head by lying to itself. The server refuses regardless.
        return (0, response_1.ok)(res, { ...profile, can_edit: req.user.role === "admin" }, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to load profile", 500);
    }
});
/**
 * An administrator corrects one member's profile. ADMIN ONLY — a Zonal Head reads.
 *
 * Every edit writes a row to `member_profile_edits` naming the fields that changed, because
 * a value an administrator can change without trace is a value nobody can later defend. The
 * row holds field NAMES only: Tab 6 is medical data and FR-066 says health values appear in
 * no log, so copying them into an audit table would simply move the problem.
 */
exports.memberAdminRoutes.put("/:id/profile", (0, auth_1.requireRole)(["admin"]), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid request", 400);
    const payload = req.body;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return (0, response_1.fail)(res, "Invalid request", 400);
    }
    try {
        const verdict = await assertMemberInScope(id, null);
        if (verdict === "not_found")
            return (0, response_1.fail)(res, "Member not found", 404);
        const result = await (0, memberProfileService_1.saveMemberProfile)(id, payload);
        if (!result.ok && result.kind === "conflict") {
            return (0, response_1.fail)(res, "This profile was changed in another session. Reload it and apply your edits again.", 409);
        }
        if (!result.ok) {
            return (0, response_1.fail)(res, "Please correct the highlighted fields.", 400, { errors: result.errors });
        }
        // After the save, and only on success: an audit row for a write that did not happen
        // would be worse than none. `if_unmodified_since` is the concurrency stamp, not a
        // profile field, so it is not reported as a change.
        const changed = Object.keys(payload).filter((k) => k !== "if_unmodified_since");
        await pool_1.pool.query(`INSERT INTO member_profile_edits
         (member_account_id, edited_by_admin_id, edited_by_role, changed_fields)
       VALUES (:member_account_id, :admin_id, 'admin', :changed_fields)`, {
            member_account_id: id,
            admin_id: req.user.id,
            changed_fields: JSON.stringify(changed)
        });
        const profile = await (0, memberProfileService_1.readMemberProfile)(id);
        return (0, response_1.ok)(res, { ...profile, can_edit: true }, "Profile saved");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to save profile", 500);
    }
});
/**
 * Activates or deactivates one account.
 *
 * `is_active` is the ONLY field this accepts. A password cannot be changed here, so a member
 * who has chosen their own keeps it (FR-005); and nothing about the member's own profile is
 * touched, because FR-007 requires a withdrawn member's data to be retained, not removed.
 */
exports.memberAdminRoutes.patch("/:id", async (req, res) => {
    const scope = requestZoneScope(req.user);
    if (scope === false)
        return (0, response_1.fail)(res, "Forbidden", 403);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid request", 400);
    const { is_active } = (req.body ?? {});
    if (typeof is_active !== "boolean") {
        return (0, response_1.fail)(res, "is_active must be true or false", 400);
    }
    try {
        // Read first, for two reasons: a Zonal Head must be refused a member outside their zone
        // before anything is written, and `affectedRows` cannot tell "no such row" apart from
        // "the value was already what was asked for".
        const [existingRows] = await pool_1.pool.query(`SELECT ma.id, mp.zone_id
       FROM member_accounts ma
       LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
       WHERE ma.id = :id
       LIMIT 1`, { id });
        const existing = existingRows[0];
        if (!existing)
            return (0, response_1.fail)(res, "Member not found", 404);
        if (scope !== null && Number(existing.zone_id) !== scope) {
            return (0, response_1.fail)(res, "Forbidden", 403);
        }
        await pool_1.pool.query("UPDATE member_accounts SET is_active = :is_active WHERE id = :id", {
            is_active: is_active ? 1 : 0,
            id
        });
        // Deactivating does not revoke the member's refresh tokens here. It does not need to:
        // requireMember reads is_active on every request, so an open session stops working on
        // its next call (FR-007).
        return (0, response_1.ok)(res, { id, is_active }, is_active ? "Member activated" : "Member deactivated");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to update member", 500);
    }
});
