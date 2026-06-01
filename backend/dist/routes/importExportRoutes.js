"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importExportRoutes = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const mysql2_1 = __importDefault(require("mysql2"));
const env_1 = require("../config/env");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const response_1 = require("../utils/response");
function normalizeHeader(h) {
    return h.replace(/^\uFEFF/, "").trim().toLowerCase();
}
function parseCsv(input) {
    const text = String(input ?? "");
    const rows = [];
    let row = [];
    let field = "";
    let i = 0;
    let inQuotes = false;
    const pushField = () => {
        row.push(field);
        field = "";
    };
    const pushRow = () => {
        const hasAny = row.some((c) => String(c).trim() !== "");
        if (hasAny)
            rows.push(row);
        row = [];
    };
    while (i < text.length) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                const next = text[i + 1];
                if (next === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i += 1;
                continue;
            }
            field += ch;
            i += 1;
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            i += 1;
            continue;
        }
        if (ch === ",") {
            pushField();
            i += 1;
            continue;
        }
        if (ch === "\r") {
            if (text[i + 1] === "\n")
                i += 1;
            pushField();
            pushRow();
            i += 1;
            continue;
        }
        if (ch === "\n") {
            pushField();
            pushRow();
            i += 1;
            continue;
        }
        field += ch;
        i += 1;
    }
    pushField();
    pushRow();
    return rows;
}
function escapeCsvField(value) {
    const s = value === null || value === undefined ? "" : String(value);
    if (/[",\r\n]/.test(s))
        return `"${s.replaceAll('"', '""')}"`;
    return s;
}
function toCsv(rows, headers) {
    const lines = [];
    lines.push(headers.map(escapeCsvField).join(","));
    for (const r of rows) {
        lines.push(headers.map((h) => escapeCsvField(r[h])).join(","));
    }
    return lines.join("\r\n");
}
function asBool01(v) {
    const s = String(v ?? "").trim().toLowerCase();
    if (!s)
        return null;
    if (["1", "true", "yes", "y"].includes(s))
        return 1;
    if (["0", "false", "no", "n"].includes(s))
        return 0;
    return null;
}
function asInt(v) {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : null;
}
function required(v) {
    const s = String(v ?? "").trim();
    return s ? s : null;
}
function csvResponse(res, filename, csv) {
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="${filename}"`);
    res.status(200).send(csv);
}
function sqlResponse(res, filename, sql) {
    res.setHeader("content-type", "application/sql; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="${filename}"`);
    res.status(200).send(sql);
}
function timestampForFilename(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}
async function buildDatabaseBackupSql() {
    const [tableRows] = await pool_1.pool.query("SHOW TABLES");
    const tableNames = tableRows
        .map((row) => String(Object.values(row)[0] ?? "").trim())
        .filter(Boolean);
    const lines = [
        `-- MPSS database backup`,
        `-- Database: ${env_1.env.db.name}`,
        `-- Generated at: ${new Date().toISOString()}`,
        "",
        "SET FOREIGN_KEY_CHECKS=0;",
        ""
    ];
    for (const tableName of tableNames) {
        const escapedTableName = mysql2_1.default.escapeId(tableName);
        const [createRows] = await pool_1.pool.query(`SHOW CREATE TABLE ${escapedTableName}`);
        const createSql = String(createRows[0]?.["Create Table"] ?? "");
        if (!createSql)
            continue;
        lines.push(`-- Table: ${tableName}`);
        lines.push(`DROP TABLE IF EXISTS ${escapedTableName};`);
        lines.push(`${createSql};`);
        const [rows] = await pool_1.pool.query(`SELECT * FROM ${escapedTableName}`);
        if (rows.length > 0) {
            const columns = Object.keys(rows[0]).map((column) => mysql2_1.default.escapeId(column)).join(", ");
            const valueLines = rows.map((row) => {
                const values = Object.keys(row).map((column) => mysql2_1.default.escape(row[column])).join(", ");
                return `(${values})`;
            });
            lines.push(`INSERT INTO ${escapedTableName} (${columns}) VALUES`);
            lines.push(`${valueLines.join(",\n")};`);
        }
        lines.push("");
    }
    lines.push("SET FOREIGN_KEY_CHECKS=1;");
    lines.push("");
    return lines.join("\n");
}
const entityConfig = {
    zones: {
        templateHeaders: ["zone_name", "coordinator_name", "contact_number", "whatsapp_number", "password"],
        exportHeaders: ["zone_name", "coordinator_name", "contact_number", "whatsapp_number", "password"]
    },
    mohallahs: {
        templateHeaders: ["zone_name", "mohallah_name", "coordinator_name", "contact_number", "whatsapp_number", "password"],
        exportHeaders: ["zone_name", "mohallah_name", "coordinator_name", "contact_number", "whatsapp_number", "password"]
    },
    parties: {
        templateHeaders: ["zone_name", "its_no", "leader_name", "party_name", "category", "is_active", "password"],
        exportHeaders: ["zone_name", "its_no", "leader_name", "party_name", "category", "is_active", "password"]
    },
    venues: {
        templateHeaders: ["zone_name", "mohallah_name", "venue_name", "min_parties", "max_parties", "is_active"],
        exportHeaders: ["zone_name", "mohallah_name", "venue_name", "min_parties", "max_parties", "is_active"]
    },
    miqaats: {
        templateHeaders: ["miqaat_name", "english_date", "hijri_date", "is_active"],
        exportHeaders: ["miqaat_name", "english_date", "hijri_date", "is_active"]
    }
};
exports.importExportRoutes = (0, express_1.Router)();
exports.importExportRoutes.use(auth_1.requireAuth, (0, auth_1.requireRole)(["admin"]));
exports.importExportRoutes.get("/database-backup", async (_req, res) => {
    try {
        const sql = await buildDatabaseBackupSql();
        const filename = `database_backup_${timestampForFilename()}.sql`;
        return sqlResponse(res, filename, sql);
    }
    catch {
        return (0, response_1.fail)(res, "Failed to generate database backup", 500);
    }
});
exports.importExportRoutes.get("/:entity/template", async (req, res) => {
    const entity = String(req.params.entity ?? "");
    const cfg = entityConfig[entity];
    if (!cfg)
        return (0, response_1.fail)(res, "Invalid entity", 400);
    const csv = toCsv([], cfg.templateHeaders);
    return csvResponse(res, `${entity}_template.csv`, csv);
});
exports.importExportRoutes.get("/:entity/export", async (req, res) => {
    const entity = String(req.params.entity ?? "");
    const cfg = entityConfig[entity];
    if (!cfg)
        return (0, response_1.fail)(res, "Invalid entity", 400);
    if (entity === "zones") {
        const [rows] = await pool_1.pool.query("SELECT zone_name, coordinator_name, contact_number, whatsapp_number, '' AS password FROM zones ORDER BY zone_name");
        return csvResponse(res, "zones.csv", toCsv(rows, cfg.exportHeaders));
    }
    if (entity === "mohallahs") {
        const [rows] = await pool_1.pool.query(`SELECT z.zone_name, m.mohallah_name, m.coordinator_name, m.contact_number, m.whatsapp_number, '' AS password
       FROM mohallahs m JOIN zones z ON z.id = m.zone_id
       ORDER BY z.zone_name, m.mohallah_name`);
        return csvResponse(res, "mohallahs.csv", toCsv(rows, cfg.exportHeaders));
    }
    if (entity === "parties") {
        const [rows] = await pool_1.pool.query(`SELECT z.zone_name, p.its_no, p.leader_name, p.party_name, p.category, p.is_active, '' AS password
       FROM parties p JOIN zones z ON z.id = p.zone_id
       ORDER BY z.zone_name, p.party_name`);
        return csvResponse(res, "parties.csv", toCsv(rows, cfg.exportHeaders));
    }
    if (entity === "venues") {
        const [rows] = await pool_1.pool.query(`SELECT z.zone_name, m.mohallah_name, v.venue_name, v.min_parties, v.max_parties, v.is_active
       FROM venues v
       JOIN mohallahs m ON m.id = v.mohallah_id
       JOIN zones z ON z.id = m.zone_id
       ORDER BY z.zone_name, m.mohallah_name, v.venue_name`);
        return csvResponse(res, "venues.csv", toCsv(rows, cfg.exportHeaders));
    }
    if (entity === "miqaats") {
        const [rows] = await pool_1.pool.query(`SELECT miqaat_name, DATE_FORMAT(english_date, '%Y-%m-%d') AS english_date, hijri_date, is_active
       FROM miqaats ORDER BY english_date DESC`);
        return csvResponse(res, "miqaats.csv", toCsv(rows, cfg.exportHeaders));
    }
    return (0, response_1.fail)(res, "Invalid entity", 400);
});
exports.importExportRoutes.post("/:entity/import", async (req, res) => {
    const entity = String(req.params.entity ?? "");
    const cfg = entityConfig[entity];
    if (!cfg)
        return (0, response_1.fail)(res, "Invalid entity", 400);
    const csvText = String(req.body?.csv ?? "");
    if (!csvText.trim())
        return (0, response_1.fail)(res, "csv is required", 400);
    const table = parseCsv(csvText);
    if (table.length < 2)
        return (0, response_1.fail)(res, "CSV must include header and at least one row", 400);
    const headers = table[0].map((h) => normalizeHeader(h));
    const headerIndex = {};
    headers.forEach((h, idx) => {
        if (h)
            headerIndex[h] = idx;
    });
    const requiredHeaders = cfg.templateHeaders.map((h) => normalizeHeader(h));
    for (const h of requiredHeaders) {
        if (!(h in headerIndex))
            return (0, response_1.fail)(res, `Missing column: ${h}`, 400);
    }
    const dataRows = table.slice(1);
    const result = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    const conn = await pool_1.pool.getConnection();
    try {
        await conn.beginTransaction();
        const [zones] = await conn.query("SELECT id, zone_name FROM zones");
        const zoneByName = new Map();
        for (const z of zones)
            zoneByName.set(String(z.zone_name).trim(), Number(z.id));
        const [mohallahs] = await conn.query(`SELECT m.id, m.mohallah_name, z.zone_name
       FROM mohallahs m JOIN zones z ON z.id = m.zone_id`);
        const mohallahByKey = new Map();
        for (const m of mohallahs) {
            const key = `${String(m.zone_name).trim()}||${String(m.mohallah_name).trim()}`;
            mohallahByKey.set(key, Number(m.id));
        }
        const [parties] = await conn.query(`SELECT p.id, p.party_name, z.zone_name
       FROM parties p JOIN zones z ON z.id = p.zone_id`);
        const partyByKey = new Map();
        for (const p of parties) {
            const key = `${String(p.zone_name).trim()}||${String(p.party_name).trim()}`;
            partyByKey.set(key, Number(p.id));
        }
        const [miqaats] = await conn.query("SELECT id, miqaat_name, DATE_FORMAT(english_date, '%Y-%m-%d') AS english_date FROM miqaats");
        const miqaatByKey = new Map();
        for (const m of miqaats) {
            const key = `${String(m.english_date).trim()}||${String(m.miqaat_name).trim()}`;
            miqaatByKey.set(key, Number(m.id));
        }
        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const rowNumber = i + 2;
            const get = (k) => String(row[headerIndex[normalizeHeader(k)]] ?? "").trim();
            try {
                if (entity === "zones") {
                    const zone_name = required(get("zone_name"));
                    const coordinator_name = required(get("coordinator_name"));
                    const password = get("password");
                    if (!zone_name || !coordinator_name)
                        throw new Error("zone_name and coordinator_name are required");
                    const existingId = zoneByName.get(zone_name) ?? null;
                    if (existingId) {
                        const params = {
                            id: existingId,
                            coordinator_name,
                            contact_number: get("contact_number") || null,
                            whatsapp_number: get("whatsapp_number") || null
                        };
                        let passwordSql = "";
                        if (password) {
                            params.password_hash = await bcryptjs_1.default.hash(String(password), 10);
                            passwordSql = ", password_hash = :password_hash";
                        }
                        const [r] = await conn.query(`UPDATE zones
               SET coordinator_name = :coordinator_name,
                   contact_number = :contact_number,
                   whatsapp_number = :whatsapp_number,
                   updated_at = NOW()
                   ${passwordSql}
               WHERE id = :id`, params);
                        const affected = Number(r.affectedRows ?? 0);
                        if (affected === 1)
                            result.updated += 1;
                        else
                            result.skipped += 1;
                    }
                    else {
                        if (!password)
                            throw new Error("password is required for new zone");
                        const password_hash = await bcryptjs_1.default.hash(String(password), 10);
                        const [r] = await conn.query(`INSERT INTO zones (zone_name, coordinator_name, contact_number, whatsapp_number, password_hash, created_at, updated_at)
               VALUES (:zone_name, :coordinator_name, :contact_number, :whatsapp_number, :password_hash, NOW(), NOW())`, {
                            zone_name,
                            coordinator_name,
                            contact_number: get("contact_number") || null,
                            whatsapp_number: get("whatsapp_number") || null,
                            password_hash
                        });
                        result.inserted += 1;
                        const insertId = Number(r.insertId ?? 0);
                        if (Number.isFinite(insertId) && insertId > 0)
                            zoneByName.set(zone_name, insertId);
                    }
                    continue;
                }
                if (entity === "mohallahs") {
                    const zone_name = required(get("zone_name"));
                    const mohallah_name = required(get("mohallah_name"));
                    const coordinator_name = required(get("coordinator_name"));
                    const password = get("password");
                    if (!zone_name || !mohallah_name || !coordinator_name) {
                        throw new Error("zone_name, mohallah_name and coordinator_name are required");
                    }
                    const zone_id = zoneByName.get(zone_name);
                    if (!zone_id)
                        throw new Error(`Zone not found: ${zone_name}`);
                    const key = `${zone_name}||${mohallah_name}`;
                    const existingId = mohallahByKey.get(key) ?? null;
                    if (existingId) {
                        const params = {
                            id: existingId,
                            coordinator_name,
                            contact_number: get("contact_number") || null,
                            whatsapp_number: get("whatsapp_number") || null
                        };
                        let passwordSql = "";
                        if (password) {
                            params.password_hash = await bcryptjs_1.default.hash(String(password), 10);
                            passwordSql = ", password_hash = :password_hash";
                        }
                        const [r] = await conn.query(`UPDATE mohallahs
               SET coordinator_name = :coordinator_name,
                   contact_number = :contact_number,
                   whatsapp_number = :whatsapp_number
                   ${passwordSql}
               WHERE id = :id`, params);
                        const affected = Number(r.affectedRows ?? 0);
                        if (affected === 1)
                            result.updated += 1;
                        else
                            result.skipped += 1;
                    }
                    else {
                        if (!password)
                            throw new Error("password is required for new mohallah");
                        const password_hash = await bcryptjs_1.default.hash(String(password), 10);
                        const [r] = await conn.query(`INSERT INTO mohallahs (zone_id, mohallah_name, coordinator_name, contact_number, whatsapp_number, password_hash, created_at)
               VALUES (:zone_id, :mohallah_name, :coordinator_name, :contact_number, :whatsapp_number, :password_hash, NOW())`, {
                            zone_id,
                            mohallah_name,
                            coordinator_name,
                            contact_number: get("contact_number") || null,
                            whatsapp_number: get("whatsapp_number") || null,
                            password_hash
                        });
                        result.inserted += 1;
                        const insertId = Number(r.insertId ?? 0);
                        if (Number.isFinite(insertId) && insertId > 0)
                            mohallahByKey.set(key, insertId);
                    }
                    continue;
                }
                if (entity === "parties") {
                    const zone_name = required(get("zone_name"));
                    const its_no = required(get("its_no"));
                    const leader_name = required(get("leader_name"));
                    const party_name = required(get("party_name"));
                    const category = required(get("category"));
                    const is_active = asBool01(get("is_active"));
                    const password = get("password");
                    if (!zone_name || !its_no || !leader_name || !party_name || !category) {
                        throw new Error("zone_name, its_no, leader_name, party_name and category are required");
                    }
                    if (!["A", "B", "C", "H"].includes(category))
                        throw new Error("category must be A, B, C or H");
                    const zone_id = zoneByName.get(zone_name);
                    if (!zone_id)
                        throw new Error(`Zone not found: ${zone_name}`);
                    const key = `${zone_name}||${party_name}`;
                    const existingId = partyByKey.get(key) ?? null;
                    if (existingId) {
                        const params = { id: existingId, its_no, leader_name, category, is_active: is_active ?? 1 };
                        let passwordSql = "";
                        if (password) {
                            params.password_hash = await bcryptjs_1.default.hash(String(password), 10);
                            passwordSql = ", password_hash = :password_hash";
                        }
                        const [r] = await conn.query(`UPDATE parties
               SET its_no = :its_no,
                   leader_name = :leader_name,
                   category = :category,
                   is_active = :is_active
                   ${passwordSql}
               WHERE id = :id`, params);
                        const affected = Number(r.affectedRows ?? 0);
                        if (affected === 1)
                            result.updated += 1;
                        else
                            result.skipped += 1;
                    }
                    else {
                        if (!password)
                            throw new Error("password is required for new party");
                        const password_hash = await bcryptjs_1.default.hash(String(password), 10);
                        const [r] = await conn.query(`INSERT INTO parties (its_no, leader_name, party_name, zone_id, category, is_active, password_hash, created_at)
               VALUES (:its_no, :leader_name, :party_name, :zone_id, :category, :is_active, :password_hash, NOW())`, { its_no, leader_name, party_name, zone_id, category, is_active: is_active ?? 1, password_hash });
                        result.inserted += 1;
                        const insertId = Number(r.insertId ?? 0);
                        if (Number.isFinite(insertId) && insertId > 0)
                            partyByKey.set(key, insertId);
                    }
                    continue;
                }
                if (entity === "venues") {
                    const zone_name = required(get("zone_name"));
                    const mohallah_name = required(get("mohallah_name"));
                    const venue_name = required(get("venue_name"));
                    const min_parties = asInt(get("min_parties"));
                    const max_parties = asInt(get("max_parties"));
                    const is_active = asBool01(get("is_active"));
                    if (!zone_name || !mohallah_name || !venue_name)
                        throw new Error("zone_name, mohallah_name and venue_name are required");
                    const mohallah_id = mohallahByKey.get(`${zone_name}||${mohallah_name}`);
                    if (!mohallah_id)
                        throw new Error(`Mohallah not found: ${zone_name} / ${mohallah_name}`);
                    const [r] = await conn.query(`INSERT INTO venues (venue_name, mohallah_id, min_parties, max_parties, is_active, created_at)
             VALUES (:venue_name, :mohallah_id, :min_parties, :max_parties, :is_active, NOW())
             ON DUPLICATE KEY UPDATE
               min_parties = VALUES(min_parties),
               max_parties = VALUES(max_parties),
               is_active = VALUES(is_active)`, {
                        venue_name,
                        mohallah_id,
                        min_parties: min_parties ?? 1,
                        max_parties: max_parties ?? 5,
                        is_active: is_active ?? 1
                    });
                    const affected = Number(r.affectedRows ?? 0);
                    if (affected === 1)
                        result.inserted += 1;
                    else if (affected === 2)
                        result.updated += 1;
                    else
                        result.skipped += 1;
                    continue;
                }
                if (entity === "miqaats") {
                    const miqaat_name = required(get("miqaat_name"));
                    const english_date = required(get("english_date"));
                    const hijri_date = get("hijri_date") || null;
                    const is_active = asBool01(get("is_active"));
                    if (!miqaat_name || !english_date)
                        throw new Error("miqaat_name and english_date are required");
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(english_date))
                        throw new Error("english_date must be YYYY-MM-DD");
                    const key = `${english_date}||${miqaat_name}`;
                    const existingId = miqaatByKey.get(key);
                    if (existingId) {
                        const [r] = await conn.query(`UPDATE miqaats
               SET hijri_date = :hijri_date, is_active = :is_active
               WHERE id = :id`, { id: existingId, hijri_date, is_active: is_active ?? 1 });
                        const affected = Number(r.affectedRows ?? 0);
                        if (affected === 1)
                            result.updated += 1;
                        else
                            result.skipped += 1;
                    }
                    else {
                        const [r] = await conn.query(`INSERT INTO miqaats (miqaat_name, english_date, hijri_date, is_active)
               VALUES (:miqaat_name, :english_date, :hijri_date, :is_active)`, { miqaat_name, english_date, hijri_date, is_active: is_active ?? 1 });
                        const affected = Number(r.affectedRows ?? 0);
                        if (affected === 1)
                            result.inserted += 1;
                        else
                            result.skipped += 1;
                    }
                    continue;
                }
            }
            catch (err) {
                result.errors.push({ row: rowNumber, message: String(err?.message ?? err) });
            }
        }
        await conn.commit();
    }
    catch (err) {
        await conn.rollback();
        return (0, response_1.fail)(res, "Import failed", 500);
    }
    finally {
        conn.release();
    }
    return (0, response_1.ok)(res, result, "OK");
});
