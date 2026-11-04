"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memberProfileRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const requireMember_1 = require("../middleware/requireMember");
const memberProfileService_1 = require("../services/memberProfileService");
const response_1 = require("../utils/response");
/**
 * A member's own profile.
 *
 * One GET and one PUT for all twelve tabs. That is what makes FR-030's all-or-nothing save
 * the natural case rather than the hard one, and it means switching tabs is client state
 * with no round trip (FR-026).
 *
 * Neither route takes a member identifier. The member is always the one in the token, so
 * there is no parameter to tamper with (FR-034, FR-097, FR-098).
 */
exports.memberProfileRoutes = (0, express_1.Router)();
/**
 * The guards are attached PER ROUTE, not with `router.use`.
 *
 * A router-wide `requireMember()` also runs for requests that match nothing in this router —
 * and because this router is mounted on `/api/v1/members` ahead of the admin router, it would
 * answer an admin's `GET /api/v1/members` with 403 before the admin router was ever consulted.
 * That is exactly the "no member data in the admin panel" failure. Per-route guards let an
 * unmatched path fall through to the next router while still refusing a non-member the moment
 * one of these paths is matched.
 */
exports.memberProfileRoutes.get("/me/profile", auth_1.requireAuth, (0, requireMember_1.requireMember)(), async (req, res) => {
    const memberId = req.user.memberId ?? req.user.id;
    try {
        const profile = await (0, memberProfileService_1.readMemberProfile)(memberId);
        if (!profile)
            return (0, response_1.fail)(res, "Member not found", 404);
        return (0, response_1.ok)(res, profile, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to load profile", 500);
    }
});
exports.memberProfileRoutes.put("/me/profile", auth_1.requireAuth, (0, requireMember_1.requireMember)(), async (req, res) => {
    const memberId = req.user.memberId ?? req.user.id;
    const payload = req.body;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return (0, response_1.fail)(res, "Invalid request", 400);
    }
    try {
        const result = await (0, memberProfileService_1.saveMemberProfile)(memberId, payload);
        if (!result.ok && result.kind === "conflict") {
            return (0, response_1.fail)(res, "This profile was changed in another session. Reload it and apply your edits again.", 409);
        }
        if (!result.ok) {
            // Nothing was written. The errors carry a tab number so the UI can open the right one
            // (FR-029).
            return (0, response_1.fail)(res, "Please correct the highlighted fields.", 400, {
                errors: result.errors
            });
        }
        // Returned so the client gets the derived values — the Hijri date of birth and the BMI —
        // without a second request.
        const profile = await (0, memberProfileService_1.readMemberProfile)(memberId);
        return (0, response_1.ok)(res, profile, "Profile saved");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to save profile", 500);
    }
});
