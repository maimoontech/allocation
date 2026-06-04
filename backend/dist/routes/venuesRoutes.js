"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.venuesRoutes = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const pool_1 = require("../db/pool");
const response_1 = require("../utils/response");
const auth_1 = require("../middleware/auth");
exports.venuesRoutes = (0, express_1.Router)();
exports.venuesRoutes.use(auth_1.requireAuth, (0, auth_1.requireRole)(["admin", "zonal_head"]));
exports.venuesRoutes.get("/", async (req, res) => {
    const user = req.user;
    const zoneId = user.role === "zonal_head" ? user.zoneId : req.query.zone_id ? Number(req.query.zone_id) : null;
    const where = Number.isFinite(zoneId) ? "WHERE m.zone_id = :zone_id" : "";
    const params = Number.isFinite(zoneId) ? { zone_id: zoneId } : {};
    const [rows] = await pool_1.pool.query(`SELECT v.id, v.venue_name, v.mohallah_id, m.mohallah_name, m.zone_id, z.zone_name,
            v.coordinator_name, v.contact_number, v.whatsapp_number,
            v.min_parties, v.max_parties, v.is_active, v.created_at
     FROM venues v
     JOIN mohallahs m ON m.id = v.mohallah_id
     JOIN zones z ON z.id = m.zone_id
     ${where}
     ORDER BY z.zone_name, m.mohallah_name, v.venue_name`, params);
    return (0, response_1.ok)(res, rows, "OK");
});
exports.venuesRoutes.post("/", async (req, res) => {
    const user = req.user;
    const { venue_name, mohallah_id, coordinator_name, contact_number, whatsapp_number, password, min_parties, max_parties, is_active } = req.body ?? {};
    if (!venue_name || !mohallah_id || !password)
        return (0, response_1.fail)(res, "Invalid request", 400);
    if (user.role === "zonal_head") {
        const [rows] = await pool_1.pool.query("SELECT zone_id FROM mohallahs WHERE id = :id LIMIT 1", { id: mohallah_id });
        if (!rows[0] || rows[0].zone_id !== user.zoneId)
            return (0, response_1.fail)(res, "Forbidden", 403);
    }
    const password_hash = await bcryptjs_1.default.hash(String(password), 10);
    await pool_1.pool.query(`INSERT INTO venues
      (venue_name, mohallah_id, coordinator_name, contact_number, whatsapp_number, password_hash, min_parties, max_parties, is_active, created_at)
     VALUES
      (:venue_name, :mohallah_id, :coordinator_name, :contact_number, :whatsapp_number, :password_hash, :min_parties, :max_parties, :is_active, NOW())`, {
        venue_name,
        mohallah_id,
        coordinator_name: coordinator_name || null,
        contact_number: contact_number || null,
        whatsapp_number: whatsapp_number || null,
        password_hash,
        min_parties: min_parties ?? 1,
        max_parties: max_parties ?? 5,
        is_active: is_active ?? 1
    });
    return (0, response_1.ok)(res, { success: true }, "Created");
});
exports.venuesRoutes.put("/:id", async (req, res) => {
    const user = req.user;
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
        return (0, response_1.fail)(res, "Invalid ID", 400);
    const { venue_name, mohallah_id, coordinator_name, contact_number, whatsapp_number, password, min_parties, max_parties, is_active } = req.body ?? {};
    if (!venue_name || !mohallah_id)
        return (0, response_1.fail)(res, "Invalid request", 400);
    if (user.role === "zonal_head") {
        const [rows] = await pool_1.pool.query("SELECT zone_id FROM mohallahs WHERE id = :id LIMIT 1", { id: mohallah_id });
        if (!rows[0] || rows[0].zone_id !== user.zoneId)
            return (0, response_1.fail)(res, "Forbidden", 403);
    }
    const params = {
        id,
        venue_name,
        mohallah_id,
        coordinator_name: coordinator_name || null,
        contact_number: contact_number || null,
        whatsapp_number: whatsapp_number || null,
        min_parties: min_parties ?? 1,
        max_parties: max_parties ?? 5,
        is_active: is_active ?? 1
    };
    let passwordSql = "";
    if (password) {
        params.password_hash = await bcryptjs_1.default.hash(String(password), 10);
        passwordSql = ", password_hash = :password_hash";
    }
    await pool_1.pool.query(`UPDATE venues
     SET venue_name = :venue_name,
         mohallah_id = :mohallah_id,
         coordinator_name = :coordinator_name,
         contact_number = :contact_number,
         whatsapp_number = :whatsapp_number,
         ${passwordSql ? "password_hash = :password_hash," : ""}
         min_parties = :min_parties,
         max_parties = :max_parties,
         is_active = :is_active
     WHERE id = :id`, params);
    return (0, response_1.ok)(res, { success: true }, "Updated");
});
exports.venuesRoutes.delete("/:id", async (req, res) => {
    const user = req.user;
    if (user.role !== "admin")
        return (0, response_1.fail)(res, "Forbidden", 403);
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
        return (0, response_1.fail)(res, "Invalid ID", 400);
    await pool_1.pool.query("DELETE FROM venues WHERE id = :id", { id });
    return (0, response_1.ok)(res, { success: true }, "Deleted");
});
