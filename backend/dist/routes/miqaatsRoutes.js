"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.miqaatsRoutes = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const response_1 = require("../utils/response");
const auth_1 = require("../middleware/auth");
exports.miqaatsRoutes = (0, express_1.Router)();
exports.miqaatsRoutes.get("/", auth_1.requireAuth, async (_req, res) => {
    const [rows] = await pool_1.pool.query("SELECT id, miqaat_name, english_date, hijri_date, is_active FROM miqaats ORDER BY english_date DESC");
    return (0, response_1.ok)(res, rows, "OK");
});
exports.miqaatsRoutes.post("/", auth_1.requireAuth, (0, auth_1.requireRole)(["admin"]), async (req, res) => {
    const { miqaat_name, english_date, hijri_date, is_active } = req.body ?? {};
    if (!miqaat_name || !english_date)
        return (0, response_1.fail)(res, "Invalid request", 400);
    await pool_1.pool.query("INSERT INTO miqaats (miqaat_name, english_date, hijri_date, is_active) VALUES (:miqaat_name, :english_date, :hijri_date, :is_active)", { miqaat_name, english_date, hijri_date: hijri_date ?? null, is_active: is_active ?? 1 });
    return (0, response_1.ok)(res, { success: true }, "Created");
});
exports.miqaatsRoutes.put("/:id", auth_1.requireAuth, (0, auth_1.requireRole)(["admin"]), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
        return (0, response_1.fail)(res, "Invalid ID", 400);
    const { miqaat_name, english_date, hijri_date, is_active } = req.body ?? {};
    if (!miqaat_name || !english_date)
        return (0, response_1.fail)(res, "Invalid request", 400);
    await pool_1.pool.query("UPDATE miqaats SET miqaat_name = :miqaat_name, english_date = :english_date, hijri_date = :hijri_date, is_active = :is_active WHERE id = :id", { id, miqaat_name, english_date, hijri_date: hijri_date ?? null, is_active: is_active ?? 1 });
    return (0, response_1.ok)(res, { success: true }, "Updated");
});
exports.miqaatsRoutes.delete("/:id", auth_1.requireAuth, (0, auth_1.requireRole)(["admin"]), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
        return (0, response_1.fail)(res, "Invalid ID", 400);
    await pool_1.pool.query("DELETE FROM miqaats WHERE id = :id", { id });
    return (0, response_1.ok)(res, { success: true }, "Deleted");
});
