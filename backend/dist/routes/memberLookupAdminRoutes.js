"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memberLookupAdminRoutes = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const response_1 = require("../utils/response");
const ENTITIES = {
    titles: {
        table: "titles",
        nameColumn: "title_name",
        label: "Titles",
        usedFor: "Member profile, Tab 2 — Title & Prefix. A member may hold several, each with a year.",
        references: [{ table: "member_titles", column: "title_id", label: "member titles" }]
    },
    sharafs: {
        table: "sharafs",
        nameColumn: "sharaf_name",
        label: "Sharaf",
        usedFor: "Member profile, Tab 7 — Sharaf. A member may hold several, each with a year.",
        references: [{ table: "member_sharafs", column: "sharaf_id", label: "member Sharaf entries" }]
    },
    halqas: {
        table: "halqas",
        nameColumn: "halqa_name",
        label: "Halqas",
        usedFor: "Member profile, Tab 10 — Asbaq.",
        references: [{ table: "member_profiles", column: "halqa_id", label: "member profiles" }]
    },
    mozes: {
        table: "mozes",
        nameColumn: "moze_name",
        label: "Mozes",
        usedFor: "Member profile, Tab 9 — Ashara Mubaraka.",
        references: [
            { table: "member_ashara_attendances", column: "moze_id", label: "Ashara Mubaraka records" }
        ]
    },
    places: {
        table: "places",
        nameColumn: "place_name",
        label: "Places Visited",
        usedFor: "Member profile, Tab 8 — Places Visited. Separate from the Miqaat scheduling calendar, which is a different thing entirely.",
        references: [{ table: "member_place_visits", column: "place_id", label: "member place visits" }]
    },
    sanads: {
        table: "sanads",
        nameColumn: "sanad_name",
        label: "Hifz Sanads",
        usedFor: "Member profile, Tab 5 — Education / Hifz, when Hifz Sanad is answered Yes.",
        references: [{ table: "member_profiles", column: "sanad_id", label: "member profiles" }]
    },
    marital_statuses: {
        table: "marital_statuses",
        nameColumn: "marital_status_name",
        label: "Marital Statuses",
        usedFor: "Member profile, Tab 1 — Personal Information.",
        references: [{ table: "member_profiles", column: "marital_status_id", label: "member profiles" }]
    },
    tamreen_frequencies: {
        table: "tamreen_frequencies",
        nameColumn: "tamreen_frequency_name",
        label: "Tamreen Frequencies",
        usedFor: "Member profile, Tab 11 — Tamreen. One shared list feeds both the Party and the Solo frequency questions.",
        references: [
            { table: "member_profiles", column: "party_tamreen_frequency_id", label: "Party frequency answers" },
            { table: "member_profiles", column: "solo_tamreen_frequency_id", label: "Solo frequency answers" }
        ]
    },
    tamreen_methods: {
        table: "tamreen_methods",
        nameColumn: "tamreen_method_name",
        label: "Tamreen Methods",
        usedFor: "Member profile, Tab 11 — Tamreen.",
        references: [{ table: "member_profiles", column: "tamreen_method_id", label: "member profiles" }]
    },
    skills: {
        table: "skills",
        nameColumn: "skill_name",
        label: "Skills",
        usedFor: "Member profile, Tab 4 — Occupation. Members pick any number of these.",
        references: [{ table: "member_skills", column: "skill_id", label: "member skills" }]
    }
};
const MAX_NAME_LENGTH = 150;
const MAX_DISPLAY_ORDER = 65535;
exports.memberLookupAdminRoutes = (0, express_1.Router)();
exports.memberLookupAdminRoutes.use(auth_1.requireAuth, (0, auth_1.requireRole)(["admin"]));
function entityOr404(slug) {
    return Object.prototype.hasOwnProperty.call(ENTITIES, slug) ? ENTITIES[slug] : null;
}
/**
 * How many member rows point at this lookup value, summed across every referencing column.
 *
 * This is the check that makes deletion safe, and it does not delegate to the database.
 * Five of the ten foreign keys are ON DELETE RESTRICT, which would refuse the delete — but
 * the other five are **ON DELETE SET NULL**, which would succeed and silently blank that
 * answer on every member who had chosen it. An admin pressing Delete cannot be expected to
 * know which kind they are looking at, so the API refuses either way and says how many rows
 * are affected.
 */
async function usageCount(entity, id) {
    let total = 0;
    for (const ref of entity.references) {
        const [rows] = await pool_1.pool.query(`SELECT COUNT(*) AS n FROM \`${ref.table}\` WHERE \`${ref.column}\` = :id`, { id });
        total += Number(rows[0]?.n ?? 0);
    }
    return total;
}
/** Usage for every row of one table in a single query per referencing column. */
async function usageByRow(entity) {
    const counts = new Map();
    for (const ref of entity.references) {
        const [rows] = await pool_1.pool.query(`SELECT \`${ref.column}\` AS id, COUNT(*) AS n
       FROM \`${ref.table}\`
       WHERE \`${ref.column}\` IS NOT NULL
       GROUP BY \`${ref.column}\``);
        for (const row of rows) {
            const id = Number(row.id);
            counts.set(id, (counts.get(id) ?? 0) + Number(row.n));
        }
    }
    return counts;
}
/** Reads name/display_order/is_active/is_draft from a body, validating each. */
function readFields(body, { requireName }) {
    const values = {};
    const hasName = Object.prototype.hasOwnProperty.call(body ?? {}, "name");
    if (requireName || hasName) {
        const raw = body?.name;
        if (typeof raw !== "string")
            return { values, error: "Name is required." };
        const name = raw.trim();
        if (!name)
            return { values, error: "Name is required." };
        if (name.length > MAX_NAME_LENGTH) {
            return { values, error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };
        }
        values.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(body ?? {}, "display_order")) {
        const order = Number(body.display_order);
        if (!Number.isInteger(order) || order < 0 || order > MAX_DISPLAY_ORDER) {
            return { values, error: `Display order must be a whole number between 0 and ${MAX_DISPLAY_ORDER}.` };
        }
        values.display_order = order;
    }
    for (const flag of ["is_active", "is_draft"]) {
        if (!Object.prototype.hasOwnProperty.call(body ?? {}, flag))
            continue;
        const raw = body[flag];
        // Accepts a boolean or 0/1, because the existing admin pages send 0/1.
        if (typeof raw === "boolean") {
            values[flag] = raw ? 1 : 0;
            continue;
        }
        if (raw === 0 || raw === 1 || raw === "0" || raw === "1") {
            values[flag] = Number(raw);
            continue;
        }
        return { values, error: `${flag} must be true or false.` };
    }
    return { values };
}
/**
 * Index: every list with its counts, so an admin can see at a glance which still need filling
 * in and which still carry draft values.
 */
exports.memberLookupAdminRoutes.get("/", async (_req, res) => {
    try {
        const out = [];
        for (const [slug, entity] of Object.entries(ENTITIES)) {
            const [rows] = await pool_1.pool.query(`SELECT COUNT(*) AS total,
                SUM(is_active = 1) AS active,
                SUM(is_draft = 1) AS draft
         FROM \`${entity.table}\``);
            out.push({
                entity: slug,
                label: entity.label,
                used_for: entity.usedFor,
                total: Number(rows[0]?.total ?? 0),
                active: Number(rows[0]?.active ?? 0),
                draft: Number(rows[0]?.draft ?? 0)
            });
        }
        return (0, response_1.ok)(res, out, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to load lookup lists", 500);
    }
});
exports.memberLookupAdminRoutes.get("/:entity", async (req, res) => {
    const entity = entityOr404(String(req.params.entity ?? ""));
    if (!entity)
        return (0, response_1.fail)(res, "Unknown lookup list", 404);
    try {
        const [rows] = await pool_1.pool.query(`SELECT id, \`${entity.nameColumn}\` AS name, display_order, is_active, is_draft
       FROM \`${entity.table}\`
       ORDER BY display_order, \`${entity.nameColumn}\``);
        const usage = await usageByRow(entity);
        return (0, response_1.ok)(res, {
            entity: req.params.entity,
            label: entity.label,
            used_for: entity.usedFor,
            rows: rows.map((r) => ({
                id: Number(r.id),
                name: String(r.name),
                display_order: Number(r.display_order),
                is_active: Number(r.is_active),
                is_draft: Number(r.is_draft),
                // Drives the UI's "in use" badge and whether Delete is offered at all.
                in_use: usage.get(Number(r.id)) ?? 0
            }))
        }, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to load that lookup list", 500);
    }
});
exports.memberLookupAdminRoutes.post("/:entity", async (req, res) => {
    const entity = entityOr404(String(req.params.entity ?? ""));
    if (!entity)
        return (0, response_1.fail)(res, "Unknown lookup list", 404);
    const { values, error } = readFields(req.body, { requireName: true });
    if (error)
        return (0, response_1.fail)(res, error, 400);
    try {
        // A new value entered by an admin is authoritative by definition, so is_draft defaults to
        // 0 here — unlike the seeded rows, which default to 1 because nobody had reviewed them.
        const [result] = await pool_1.pool.query(`INSERT INTO \`${entity.table}\`
         (\`${entity.nameColumn}\`, display_order, is_active, is_draft)
       VALUES (:name, :display_order, :is_active, :is_draft)`, {
            name: values.name,
            display_order: values.display_order ?? 0,
            is_active: values.is_active ?? 1,
            is_draft: values.is_draft ?? 0
        });
        return (0, response_1.ok)(res, { id: Number(result.insertId) }, "Created");
    }
    catch (err) {
        if (err?.code === "ER_DUP_ENTRY") {
            return (0, response_1.fail)(res, "That name is already in this list.", 409);
        }
        return (0, response_1.fail)(res, "Failed to create that value", 500);
    }
});
exports.memberLookupAdminRoutes.patch("/:entity/:id", async (req, res) => {
    const entity = entityOr404(String(req.params.entity ?? ""));
    if (!entity)
        return (0, response_1.fail)(res, "Unknown lookup list", 404);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid id", 400);
    const { values, error } = readFields(req.body, { requireName: false });
    if (error)
        return (0, response_1.fail)(res, error, 400);
    if (Object.keys(values).length === 0)
        return (0, response_1.fail)(res, "Nothing to update", 400);
    const assignments = Object.keys(values).map((key) => key === "name" ? `\`${entity.nameColumn}\` = :name` : `\`${key}\` = :${key}`);
    try {
        const [result] = await pool_1.pool.query(`UPDATE \`${entity.table}\` SET ${assignments.join(", ")} WHERE id = :id`, { ...values, id });
        if (result.affectedRows === 0)
            return (0, response_1.fail)(res, "That value no longer exists", 404);
        return (0, response_1.ok)(res, { success: true }, "Updated");
    }
    catch (err) {
        if (err?.code === "ER_DUP_ENTRY") {
            return (0, response_1.fail)(res, "That name is already in this list.", 409);
        }
        return (0, response_1.fail)(res, "Failed to update that value", 500);
    }
});
exports.memberLookupAdminRoutes.delete("/:entity/:id", async (req, res) => {
    const entity = entityOr404(String(req.params.entity ?? ""));
    if (!entity)
        return (0, response_1.fail)(res, "Unknown lookup list", 404);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return (0, response_1.fail)(res, "Invalid id", 400);
    try {
        const inUse = await usageCount(entity, id);
        if (inUse > 0) {
            // Refused for ALL ten lists, not only the RESTRICT ones. See usageCount.
            return (0, response_1.fail)(res, `This value is used by ${inUse} member ${inUse === 1 ? "record" : "records"}. ` +
                `Deleting it would change their answers. Set it to Inactive instead — it then ` +
                `disappears from the form for new entries while existing answers are kept.`, 409, { in_use: inUse });
        }
        const [result] = await pool_1.pool.query(`DELETE FROM \`${entity.table}\` WHERE id = :id`, {
            id
        });
        if (result.affectedRows === 0)
            return (0, response_1.fail)(res, "That value no longer exists", 404);
        return (0, response_1.ok)(res, { success: true }, "Deleted");
    }
    catch (err) {
        // Belt and braces: if a new reference is added and this file is not updated, the database
        // still refuses and the admin gets this rather than a bare 500.
        if (err?.code === "ER_ROW_IS_REFERENCED_2" || err?.code === "ER_ROW_IS_REFERENCED") {
            return (0, response_1.fail)(res, "This value is in use and cannot be deleted. Set it to Inactive instead.", 409);
        }
        return (0, response_1.fail)(res, "Failed to delete that value", 500);
    }
});
