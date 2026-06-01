"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.refreshAccessToken = refreshAccessToken;
exports.revokeRefreshToken = revokeRefreshToken;
exports.changePassword = changePassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const pool_1 = require("../db/pool");
const env_1 = require("../config/env");
function isNumericId(value) {
    return /^\d+$/.test(value.trim());
}
function hashRefreshToken(token) {
    return crypto_1.default.createHash("sha256").update(token).digest("hex");
}
function randomRefreshToken() {
    return crypto_1.default.randomBytes(48).toString("base64url");
}
function tableForSelfServiceRole(role) {
    if (role === "zonal_head")
        return "zones";
    if (role === "party")
        return "parties";
    return "mohallahs";
}
async function authenticate(params) {
    const { identifier, password, role } = params;
    const idOrName = identifier.trim();
    if (!idOrName || !password)
        throw new Error("INVALID_CREDENTIALS");
    if (role === "admin") {
        const [rows] = await pool_1.pool.query("SELECT id, username, admin_name, password_hash, last_login_at FROM admins WHERE username = :username LIMIT 1", { username: idOrName });
        const admin = rows[0];
        if (!admin)
            throw new Error("INVALID_CREDENTIALS");
        const ok = await bcryptjs_1.default.compare(password, admin.password_hash);
        if (!ok)
            throw new Error("INVALID_CREDENTIALS");
        await pool_1.pool.query("UPDATE admins SET last_login_at = NOW() WHERE id = :id", { id: admin.id });
        const user = {
            role,
            id: admin.id,
            displayName: admin.admin_name ?? admin.username,
            lastLoginAt: admin.last_login_at
        };
        return issueTokens(user);
    }
    if (role === "zonal_head") {
        const query = isNumericId(idOrName)
            ? "SELECT id, zone_name, password_hash, last_login_at FROM zones WHERE id = :id LIMIT 1"
            : "SELECT id, zone_name, password_hash, last_login_at FROM zones WHERE zone_name = :name LIMIT 1";
        const lookup = isNumericId(idOrName) ? { id: Number(idOrName) } : { name: idOrName };
        const [rows] = await pool_1.pool.query(query, lookup);
        const zone = rows[0];
        if (!zone)
            throw new Error("INVALID_CREDENTIALS");
        const ok = await bcryptjs_1.default.compare(password, zone.password_hash);
        if (!ok)
            throw new Error("INVALID_CREDENTIALS");
        await pool_1.pool.query("UPDATE zones SET last_login_at = NOW() WHERE id = :id", { id: zone.id });
        const user = {
            role,
            id: zone.id,
            displayName: zone.zone_name,
            zoneId: zone.id,
            lastLoginAt: zone.last_login_at
        };
        return issueTokens(user);
    }
    if (role === "party") {
        const [rows] = await pool_1.pool.query("SELECT id, its_no, party_name, zone_id, password_hash, last_login_at FROM parties WHERE its_no = :its_no LIMIT 1", { its_no: idOrName });
        const party = rows[0];
        if (!party)
            throw new Error("INVALID_CREDENTIALS");
        const ok = await bcryptjs_1.default.compare(password, party.password_hash);
        if (!ok)
            throw new Error("INVALID_CREDENTIALS");
        await pool_1.pool.query("UPDATE parties SET last_login_at = NOW() WHERE id = :id", { id: party.id });
        const user = {
            role,
            id: party.id,
            displayName: party.party_name,
            zoneId: party.zone_id,
            partyId: party.id,
            lastLoginAt: party.last_login_at
        };
        return issueTokens(user);
    }
    const query = isNumericId(idOrName)
        ? "SELECT id, mohallah_name, zone_id, password_hash, last_login_at FROM mohallahs WHERE id = :id LIMIT 1"
        : "SELECT id, mohallah_name, zone_id, password_hash, last_login_at FROM mohallahs WHERE mohallah_name = :name LIMIT 1";
    const lookup = isNumericId(idOrName) ? { id: Number(idOrName) } : { name: idOrName };
    const [rows] = await pool_1.pool.query(query, lookup);
    const mohallah = rows[0];
    if (!mohallah)
        throw new Error("INVALID_CREDENTIALS");
    const ok = await bcryptjs_1.default.compare(password, mohallah.password_hash);
    if (!ok)
        throw new Error("INVALID_CREDENTIALS");
    await pool_1.pool.query("UPDATE mohallahs SET last_login_at = NOW() WHERE id = :id", { id: mohallah.id });
    const user = {
        role,
        id: mohallah.id,
        displayName: mohallah.mohallah_name,
        zoneId: mohallah.zone_id,
        mohallahId: mohallah.id,
        lastLoginAt: mohallah.last_login_at
    };
    return issueTokens(user);
}
async function issueTokens(user) {
    const claims = {
        sub: `${user.role}:${user.id}`,
        role: user.role,
        id: user.id,
        zoneId: user.zoneId,
        partyId: user.partyId,
        mohallahId: user.mohallahId
    };
    const token = jsonwebtoken_1.default.sign(claims, env_1.env.jwt.secret, { expiresIn: env_1.env.jwt.expiresIn });
    const refreshToken = randomRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + env_1.env.jwt.refreshExpiresInDays * 24 * 60 * 60 * 1000);
    await pool_1.pool.query("INSERT INTO refresh_tokens (token_hash, user_role, user_id, expires_at, created_at) VALUES (:token_hash, :user_role, :user_id, :expires_at, NOW())", {
        token_hash: refreshTokenHash,
        user_role: user.role,
        user_id: user.id,
        expires_at: expiresAt
    });
    return { user, token, refreshToken };
}
async function refreshAccessToken(refreshToken) {
    const tokenHash = hashRefreshToken(refreshToken);
    const [rows] = await pool_1.pool.query("SELECT id, user_role, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = :token_hash LIMIT 1", { token_hash: tokenHash });
    const row = rows[0];
    if (!row)
        throw new Error("INVALID_REFRESH");
    if (row.revoked_at)
        throw new Error("INVALID_REFRESH");
    if (new Date(row.expires_at).getTime() < Date.now())
        throw new Error("INVALID_REFRESH");
    const role = row.user_role;
    const userId = Number(row.user_id);
    const user = await loadUser(role, userId);
    const claims = {
        sub: `${user.role}:${user.id}`,
        role: user.role,
        id: user.id,
        zoneId: user.zoneId,
        partyId: user.partyId,
        mohallahId: user.mohallahId
    };
    const token = jsonwebtoken_1.default.sign(claims, env_1.env.jwt.secret, { expiresIn: env_1.env.jwt.expiresIn });
    return { token };
}
async function revokeRefreshToken(refreshToken) {
    const tokenHash = hashRefreshToken(refreshToken);
    await pool_1.pool.query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = :token_hash AND revoked_at IS NULL", { token_hash: tokenHash });
}
async function changePassword(params) {
    const { role, id, currentPassword, newPassword } = params;
    const current = currentPassword.trim();
    const next = newPassword.trim();
    if (!current || !next)
        throw new Error("INVALID_PASSWORD_CHANGE");
    const table = tableForSelfServiceRole(role);
    const [rows] = await pool_1.pool.query(`SELECT password_hash FROM ${table} WHERE id = :id LIMIT 1`, { id });
    const account = rows[0];
    if (!account)
        throw new Error("INVALID_PASSWORD_CHANGE");
    const ok = await bcryptjs_1.default.compare(currentPassword, account.password_hash);
    if (!ok)
        throw new Error("INVALID_PASSWORD_CHANGE");
    const password_hash = await bcryptjs_1.default.hash(newPassword, 10);
    const updatedAtSql = table === "zones" ? ", updated_at = NOW()" : "";
    await pool_1.pool.query(`UPDATE ${table} SET password_hash = :password_hash${updatedAtSql} WHERE id = :id`, {
        id,
        password_hash
    });
}
async function loadUser(role, id) {
    if (role === "admin") {
        const [rows] = await pool_1.pool.query("SELECT id, username, admin_name, last_login_at FROM admins WHERE id = :id LIMIT 1", { id });
        const admin = rows[0];
        if (!admin)
            throw new Error("INVALID_REFRESH");
        return {
            role,
            id: admin.id,
            displayName: admin.admin_name ?? admin.username,
            lastLoginAt: admin.last_login_at
        };
    }
    if (role === "zonal_head") {
        const [rows] = await pool_1.pool.query("SELECT id, zone_name, last_login_at FROM zones WHERE id = :id LIMIT 1", { id });
        const zone = rows[0];
        if (!zone)
            throw new Error("INVALID_REFRESH");
        return {
            role,
            id: zone.id,
            displayName: zone.zone_name,
            zoneId: zone.id,
            lastLoginAt: zone.last_login_at
        };
    }
    if (role === "party") {
        const [rows] = await pool_1.pool.query("SELECT id, party_name, zone_id, last_login_at FROM parties WHERE id = :id LIMIT 1", { id });
        const party = rows[0];
        if (!party)
            throw new Error("INVALID_REFRESH");
        return {
            role,
            id: party.id,
            displayName: party.party_name,
            zoneId: party.zone_id,
            partyId: party.id,
            lastLoginAt: party.last_login_at
        };
    }
    const [rows] = await pool_1.pool.query("SELECT id, mohallah_name, zone_id, last_login_at FROM mohallahs WHERE id = :id LIMIT 1", { id });
    const mohallah = rows[0];
    if (!mohallah)
        throw new Error("INVALID_REFRESH");
    return {
        role,
        id: mohallah.id,
        displayName: mohallah.mohallah_name,
        zoneId: mohallah.zone_id,
        mohallahId: mohallah.id,
        lastLoginAt: mohallah.last_login_at
    };
}
