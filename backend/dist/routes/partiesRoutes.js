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
function handlePartyDbError(res, err) {
    const code = String(err?.code ?? "");
    if (code === "ER_DUP_ENTRY") {
        const msg = String(err?.sqlMessage ?? err?.message ?? "");
        if (msg.includes("uq_parties_its_no"))
            return (0, response_1.fail)(res, "ITS No already exists", 409);
        if (msg.includes("uq_parties_zone_name"))
            return (0, response_1.fail)(res, "Party name already exists in this zone", 409);
        return (0, response_1.fail)(res, "Duplicate entry", 409);
    }
    return (0, response_1.fail)(res, "Database error", 500);
}
exports.partiesRoutes.get("/", async (req, res) => {
    const user = req.user;
    const zoneId = user.role === "zonal_head" ? user.zoneId : req.query.zone_id ? Number(req.query.zone_id) : null;
    const where = Number.isFinite(zoneId) ? "WHERE p.zone_id = :zone_id" : "";
    const params = Number.isFinite(zoneId) ? { zone_id: zoneId } : {};
    const [rows] = await pool_1.pool.query(`SELECT p.id, p.its_no, p.leader_name, p.contact_number, p.whatsapp_number, p.party_name, p.zone_id, z.zone_name, p.category, p.is_active, p.last_login_at, p.created_at
     FROM parties p
     JOIN zones z ON z.id = p.zone_id
     ${where}
     ORDER BY z.zone_name, p.party_name`, params);
    return (0, response_1.ok)(res, rows, "OK");
});
exports.partiesRoutes.post("/", async (req, res) => {
    const user = req.user;
    const { zone_id, its_no, leader_name, contact_number, whatsapp_number, party_name, category, is_active, password } = req.body ?? {};
    const finalZoneId = user.role === "zonal_head" ? user.zoneId : zone_id;
    if (!finalZoneId || !its_no || !leader_name || !party_name || !category || !password)
        return (0, response_1.fail)(res, "Invalid request", 400);
    try {
        const password_hash = await bcryptjs_1.default.hash(String(password), 10);
        await pool_1.pool.query("INSERT INTO parties (its_no, leader_name, contact_number, whatsapp_number, party_name, zone_id, category, is_active, password_hash, created_at) VALUES (:its_no, :leader_name, :contact_number, :whatsapp_number, :party_name, :zone_id, :category, :is_active, :password_hash, NOW())", {
            its_no,
            leader_name,
            contact_number: String(contact_number ?? "").trim() || null,
            whatsapp_number: String(whatsapp_number ?? "").trim() || null,
            party_name,
            zone_id: finalZoneId,
            category,
            is_active: is_active ?? 1,
            password_hash
        });
        return (0, response_1.ok)(res, { success: true }, "Created");
    }
    catch (err) {
        return handlePartyDbError(res, err);
    }
});
exports.partiesRoutes.put("/:id", async (req, res) => {
    const user = req.user;
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
        return (0, response_1.fail)(res, "Invalid ID", 400);
    const { zone_id, its_no, leader_name, contact_number, whatsapp_number, party_name, category, is_active, password } = req.body ?? {};
    const finalZoneId = user.role === "zonal_head" ? user.zoneId : zone_id;
    if (!finalZoneId || !its_no || !leader_name || !party_name || !category)
        return (0, response_1.fail)(res, "Invalid request", 400);
    const params = {
        id,
        its_no,
        leader_name,
        contact_number: String(contact_number ?? "").trim() || null,
        whatsapp_number: String(whatsapp_number ?? "").trim() || null,
        zone_id: finalZoneId,
        party_name,
        category,
        is_active: is_active ?? 1
    };
    let setPasswordSql = "";
    if (password) {
        params.password_hash = await bcryptjs_1.default.hash(String(password), 10);
        setPasswordSql = ", password_hash = :password_hash";
    }
    const scopeSql = user.role === "zonal_head" ? " AND zone_id = :zone_id" : "";
    try {
        await pool_1.pool.query(`UPDATE parties SET its_no = :its_no, leader_name = :leader_name, contact_number = :contact_number, whatsapp_number = :whatsapp_number, party_name = :party_name, zone_id = :zone_id, category = :category, is_active = :is_active${setPasswordSql} WHERE id = :id${scopeSql}`, params);
        return (0, response_1.ok)(res, { success: true }, "Updated");
    }
    catch (err) {
        return handlePartyDbError(res, err);
    }
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
