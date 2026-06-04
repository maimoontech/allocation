"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mohallahsRoutes = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const response_1 = require("../utils/response");
const auth_1 = require("../middleware/auth");
exports.mohallahsRoutes = (0, express_1.Router)();
exports.mohallahsRoutes.use(auth_1.requireAuth, (0, auth_1.requireRole)(["admin"]));
exports.mohallahsRoutes.get("/", async (req, res) => {
    const zoneId = req.query.zone_id ? Number(req.query.zone_id) : null;
    const where = Number.isFinite(zoneId) ? "WHERE m.zone_id = :zone_id" : "";
    const params = Number.isFinite(zoneId) ? { zone_id: zoneId } : {};
    const [rows] = await pool_1.pool.query(`SELECT m.id, m.zone_id, z.zone_name, m.mohallah_name, m.coordinator_name, m.contact_number, m.whatsapp_number, m.last_login_at, m.created_at
     FROM mohallahs m
     JOIN zones z ON z.id = m.zone_id
     ${where}
     ORDER BY z.zone_name, m.mohallah_name`, params);
    return (0, response_1.ok)(res, rows, "OK");
});
exports.mohallahsRoutes.post("/", async (req, res) => {
    const { zone_id, mohallah_name, coordinator_name, contact_number, whatsapp_number } = req.body ?? {};
    if (!zone_id || !mohallah_name || !coordinator_name)
        return (0, response_1.fail)(res, "Invalid request", 400);
    await pool_1.pool.query("INSERT INTO mohallahs (zone_id, mohallah_name, coordinator_name, contact_number, whatsapp_number, created_at) VALUES (:zone_id, :mohallah_name, :coordinator_name, :contact_number, :whatsapp_number, NOW())", {
        zone_id,
        mohallah_name,
        coordinator_name,
        contact_number: contact_number ?? null,
        whatsapp_number: whatsapp_number ?? null
    });
    return (0, response_1.ok)(res, { success: true }, "Created");
});
exports.mohallahsRoutes.put("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
        return (0, response_1.fail)(res, "Invalid ID", 400);
    const { zone_id, mohallah_name, coordinator_name, contact_number, whatsapp_number } = req.body ?? {};
    if (!zone_id || !mohallah_name || !coordinator_name)
        return (0, response_1.fail)(res, "Invalid request", 400);
    await pool_1.pool.query(`UPDATE mohallahs
     SET zone_id = :zone_id, mohallah_name = :mohallah_name, coordinator_name = :coordinator_name,
         contact_number = :contact_number, whatsapp_number = :whatsapp_number
     WHERE id = :id`, {
        id,
        zone_id,
        mohallah_name,
        coordinator_name,
        contact_number: contact_number ?? null,
        whatsapp_number: whatsapp_number ?? null
    });
    return (0, response_1.ok)(res, { success: true }, "Updated");
});
exports.mohallahsRoutes.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
        return (0, response_1.fail)(res, "Invalid ID", 400);
    await pool_1.pool.query("DELETE FROM mohallahs WHERE id = :id", { id });
    return (0, response_1.ok)(res, { success: true }, "Deleted");
});
