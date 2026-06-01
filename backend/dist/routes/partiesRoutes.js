"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.partiesRoutes = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const pool_1 = require("../db/pool");
const response_1 = require("../utils/response");
const auth_1 = require("../middleware/auth");
exports.partiesRoutes = (0, express_1.Router)();
exports.partiesRoutes.use(auth_1.requireAuth, (0, auth_1.requireRole)(["admin", "zonal_head"]));
exports.partiesRoutes.get("/", async (req, res) => {
    const user = req.user;
    const zoneId = user.role === "zonal_head" ? user.zoneId : req.query.zone_id ? Number(req.query.zone_id) : null;
    const where = Number.isFinite(zoneId) ? "WHERE p.zone_id = :zone_id" : "";
    const params = Number.isFinite(zoneId) ? { zone_id: zoneId } : {};
    const [rows] = await pool_1.pool.query(`SELECT p.id, p.party_name, p.zone_id, z.zone_name, p.category, p.is_active, p.last_login_at, p.created_at
     FROM parties p
     JOIN zones z ON z.id = p.zone_id
     ${where}
     ORDER BY z.zone_name, p.party_name`, params);
    return (0, response_1.ok)(res, rows, "OK");
});
exports.partiesRoutes.post("/", async (req, res) => {
    const user = req.user;
    const { zone_id, party_name, category, is_active, password } = req.body ?? {};
    const finalZoneId = user.role === "zonal_head" ? user.zoneId : zone_id;
    if (!finalZoneId || !party_name || !category || !password)
        return (0, response_1.fail)(res, "Invalid request", 400);
    const password_hash = await bcryptjs_1.default.hash(String(password), 10);
    await pool_1.pool.query("INSERT INTO parties (party_name, zone_id, category, is_active, password_hash, created_at) VALUES (:party_name, :zone_id, :category, :is_active, :password_hash, NOW())", {
        party_name,
        zone_id: finalZoneId,
        category,
        is_active: is_active ?? 1,
        password_hash
    });
    return (0, response_1.ok)(res, { success: true }, "Created");
});
exports.partiesRoutes.put("/:id", async (req, res) => {
    const user = req.user;
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
        return (0, response_1.fail)(res, "Invalid ID", 400);
    const { zone_id, party_name, category, is_active, password } = req.body ?? {};
    const finalZoneId = user.role === "zonal_head" ? user.zoneId : zone_id;
    if (!finalZoneId || !party_name || !category)
        return (0, response_1.fail)(res, "Invalid request", 400);
    const params = { id, zone_id: finalZoneId, party_name, category, is_active: is_active ?? 1 };
    let setPasswordSql = "";
    if (password) {
        params.password_hash = await bcryptjs_1.default.hash(String(password), 10);
        setPasswordSql = ", password_hash = :password_hash";
    }
    const scopeSql = user.role === "zonal_head" ? " AND zone_id = :zone_id" : "";
    await pool_1.pool.query(`UPDATE parties SET party_name = :party_name, zone_id = :zone_id, category = :category, is_active = :is_active${setPasswordSql} WHERE id = :id${scopeSql}`, params);
    return (0, response_1.ok)(res, { success: true }, "Updated");
});
exports.partiesRoutes.delete("/:id", async (req, res) => {
    const user = req.user;
    if (user.role !== "admin")
        return (0, response_1.fail)(res, "Forbidden", 403);
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
        return (0, response_1.fail)(res, "Invalid ID", 400);
    await pool_1.pool.query("DELETE FROM parties WHERE id = :id", { id });
    return (0, response_1.ok)(res, { success: true }, "Deleted");
});
