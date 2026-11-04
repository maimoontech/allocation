"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const express_1 = require("express");
const authService_1 = require("../services/authService");
const loginThrottleService_1 = require("../services/loginThrottleService");
const auth_1 = require("../middleware/auth");
const response_1 = require("../utils/response");
exports.authRoutes = (0, express_1.Router)();
exports.authRoutes.post("/login", async (req, res) => {
    const { identifier, password, role } = (req.body ?? {});
    if (!identifier || !password || !role)
        return (0, response_1.fail)(res, "Invalid request", 400);
    // Throttling applies to the MEMBER role only (FR-014). The four existing roles are
    // unthrottled today, and throttling them here would change their behaviour, which
    // FR-102 to FR-104 forbid. Extending it to them is a separate, deliberate change.
    const isMember = role === "member";
    const ipHash = isMember ? (0, loginThrottleService_1.hashClientIp)((0, loginThrottleService_1.clientIpFrom)(req)) : null;
    const itsNo = identifier.trim();
    if (isMember) {
        const decision = await (0, loginThrottleService_1.evaluateMemberLoginThrottle)({ itsNo, ipHash });
        if (decision.throttled) {
            res.setHeader("Retry-After", String(decision.retryAfterSeconds));
            // Deliberately the same shape as any other refusal, and it says nothing about whether
            // the account exists (FR-013, FR-014).
            return (0, response_1.fail)(res, "Too many attempts. Please try again later.", 429);
        }
    }
    try {
        const result = await (0, authService_1.authenticate)({ identifier, password, role });
        if (isMember)
            await (0, loginThrottleService_1.recordMemberLoginAttempt)({ itsNo, ipHash, succeeded: true });
        return (0, response_1.ok)(res, { token: result.token, refresh_token: result.refreshToken, user: result.user }, "OK");
    }
    catch (err) {
        if (err?.message === "INVALID_CREDENTIALS") {
            if (isMember)
                await (0, loginThrottleService_1.recordMemberLoginAttempt)({ itsNo, ipHash, succeeded: false });
            return (0, response_1.fail)(res, "Invalid credentials", 401);
        }
        return (0, response_1.fail)(res, "Login failed. Server error (check DB config).", 500);
    }
});
exports.authRoutes.post("/refresh", async (req, res) => {
    const { refresh_token } = (req.body ?? {});
    if (!refresh_token)
        return (0, response_1.fail)(res, "Invalid request", 400);
    try {
        const data = await (0, authService_1.refreshAccessToken)(refresh_token);
        return (0, response_1.ok)(res, data, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Invalid refresh token", 401);
    }
});
exports.authRoutes.post("/logout", async (req, res) => {
    const { refresh_token } = (req.body ?? {});
    if (refresh_token) {
        try {
            await (0, authService_1.revokeRefreshToken)(refresh_token);
        }
        catch {
            return (0, response_1.ok)(res, { success: true }, "OK");
        }
    }
    return (0, response_1.ok)(res, { success: true }, "OK");
});
exports.authRoutes.post("/change-password", auth_1.requireAuth, (0, auth_1.requireRole)(["zonal_head", "party", "coordinator", "member"]), async (req, res) => {
    const { current_password, new_password, confirm_password } = (req.body ?? {});
    if (!current_password || !new_password)
        return (0, response_1.fail)(res, "Invalid request", 400);
    // MEMBER path. Handled first and separately so the existing three roles below are
    // reached by exactly the code they were before: same checks, same messages, same
    // response shape (FR-104).
    //
    // This is also the ONE member route that works while a forced change is outstanding
    // (FR-018) — hence no requireMember guard here; changeMemberPassword does its own
    // account checks.
    if (req.user.role === "member") {
        try {
            const result = await (0, authService_1.changeMemberPassword)({
                memberId: req.user.memberId ?? req.user.id,
                currentPassword: current_password,
                newPassword: new_password,
                confirmPassword: confirm_password
            });
            // A fresh pair, because the member's existing token predates the change and is now
            // rejected by requireMember's staleness check. Without this they would be bounced
            // to the login screen immediately after succeeding.
            return (0, response_1.ok)(res, {
                success: true,
                token: result.token,
                refresh_token: result.refreshToken,
                user: result.user
            }, "Password changed");
        }
        catch (err) {
            switch (err?.message) {
                case "INVALID_PASSWORD_CHANGE":
                    return (0, response_1.fail)(res, "Current password is incorrect", 400);
                case "PASSWORD_CONFIRMATION_MISMATCH":
                    return (0, response_1.fail)(res, "New password and confirmation do not match", 400);
                case "PASSWORD_POLICY":
                    // Names the rule that failed, as FR-020 requires.
                    return (0, response_1.fail)(res, err.detail ?? "Password does not meet the required rules", 400);
                case "PASSWORD_REUSED":
                    return (0, response_1.fail)(res, "New password must be different from your current password", 400);
                default:
                    return (0, response_1.fail)(res, "Failed to change password", 500);
            }
        }
    }
    try {
        await (0, authService_1.changePassword)({
            role: req.user.role,
            id: req.user.id,
            currentPassword: current_password,
            newPassword: new_password
        });
        return (0, response_1.ok)(res, { success: true }, "Password changed");
    }
    catch (err) {
        if (err?.message === "INVALID_PASSWORD_CHANGE") {
            return (0, response_1.fail)(res, "Current password is incorrect", 400);
        }
        return (0, response_1.fail)(res, "Failed to change password", 500);
    }
});
