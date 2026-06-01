"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const express_1 = require("express");
const authService_1 = require("../services/authService");
const response_1 = require("../utils/response");
exports.authRoutes = (0, express_1.Router)();
exports.authRoutes.post("/login", async (req, res) => {
    const { identifier, password, role } = (req.body ?? {});
    if (!identifier || !password || !role)
        return (0, response_1.fail)(res, "Invalid request", 400);
    try {
        const result = await (0, authService_1.authenticate)({ identifier, password, role });
        return (0, response_1.ok)(res, { token: result.token, refresh_token: result.refreshToken, user: result.user }, "OK");
    }
    catch (err) {
        if (err?.message === "INVALID_CREDENTIALS")
            return (0, response_1.fail)(res, "Invalid credentials", 401);
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
