"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PASSWORD_CHANGE_REQUIRED = void 0;
exports.requireMember = requireMember;
const pool_1 = require("../db/pool");
const response_1 = require("../utils/response");
/**
 * Guards member-only routes. Runs AFTER `requireAuth`, which verifies the token.
 *
 * It reads the member's account row on every request, which the four existing roles do not
 * do. That cost is accepted because three requirements all need the account's CURRENT state,
 * which a token minted earlier cannot carry:
 *
 *   FR-007  a withdrawn account must be refused, even mid-session
 *   FR-018  no profile data before the forced password change is done
 *   FR-022  a token issued before a password change must stop working
 *
 * Once that read is unavoidable, the staleness comparison is free.
 *
 * Kept in its own file, and mounted only on member routes, so this query never lands on the
 * path the existing roles take — which is how FR-103 holds by construction rather than by
 * care.
 */
exports.PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";
function requireMember(options = {}) {
    return async (req, res, next) => {
        const claims = req.user;
        if (!claims)
            return (0, response_1.fail)(res, "Unauthorized", 401);
        // A non-member token must not reach member data, whatever else it is allowed to do
        // (FR-100, FR-107).
        if (claims.role !== "member")
            return (0, response_1.fail)(res, "Forbidden", 403);
        const memberId = claims.memberId ?? claims.id;
        if (!memberId)
            return (0, response_1.fail)(res, "Unauthorized", 401);
        let account;
        try {
            // UNIX_TIMESTAMP is computed by MySQL rather than converting a DATETIME in the driver,
            // which avoids a timezone mismatch between the server and the database making the
            // staleness check wrong by hours.
            const [rows] = await pool_1.pool.query(`SELECT id, must_change_password, is_active,
                UNIX_TIMESTAMP(password_changed_at) AS password_changed_epoch
         FROM member_accounts
         WHERE id = :id
         LIMIT 1`, { id: memberId });
            account = rows[0];
        }
        catch (err) {
            // Handed to the terminal handler in server.ts rather than answered here, so this 500
            // carries a reference and leaves one narrow log line like every other 500. Returning a
            // bare string here was the opaque dead end behind an "Internal server error" report
            // that could not be traced to a route.
            return next(err);
        }
        // The account was removed after the token was issued.
        if (!account)
            return (0, response_1.fail)(res, "Unauthorized", 401);
        if (!account.is_active) {
            return (0, response_1.fail)(res, "This account is no longer active.", 403);
        }
        // FR-022. Access tokens are stateless and cannot be deleted, so a token minted before
        // the password changed is rejected here instead. `changeMemberPassword` issues a fresh
        // pair carrying the new stamp, so the member who just changed their own password is
        // unaffected.
        //
        // Compared for EQUALITY against the stamp the token carries, not by ordering against
        // `iat`. `iat` has one-second resolution, so a token issued in the same second as the
        // change would compare as "not older" and survive — narrow, but a real hole. The stamp
        // either matches the current value or it does not.
        const currentStamp = account.password_changed_epoch == null ? null : Number(account.password_changed_epoch);
        const tokenStamp = claims.pwdAt === undefined ? null : claims.pwdAt;
        if (currentStamp !== tokenStamp) {
            return (0, response_1.fail)(res, "Session expired. Please sign in again.", 401);
        }
        if (account.must_change_password && !options.allowPasswordChangePending) {
            return (0, response_1.fail)(res, "You must change your password before continuing.", 403, {
                code: exports.PASSWORD_CHANGE_REQUIRED
            });
        }
        return next();
    };
}
