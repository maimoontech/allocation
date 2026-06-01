"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const response_1 = require("../utils/response");
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
        return (0, response_1.fail)(res, "Unauthorized", 401);
    const token = header.slice("Bearer ".length);
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.env.jwt.secret);
        req.user = decoded;
        return next();
    }
    catch {
        return (0, response_1.fail)(res, "Unauthorized", 401);
    }
}
function requireRole(roles) {
    return (req, res, next) => {
        const role = req.user?.role;
        if (!role)
            return (0, response_1.fail)(res, "Unauthorized", 401);
        if (!roles.includes(role))
            return (0, response_1.fail)(res, "Forbidden", 403);
        return next();
    };
}
