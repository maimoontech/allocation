"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memberLookupsRoutes = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const requireMember_1 = require("../middleware/requireMember");
const hijriDate_1 = require("../utils/hijriDate");
const response_1 = require("../utils/response");
/**
 * Every selectable value the twelve-tab form needs, in ONE response.
 *
 * Fourteen lists plus a derived year. Served together because a form that needed them
 * separately would fire thirteen requests on open, and because several of them are tiny.
 *
 * Two details carry requirements:
 *
 *   - Parties include `zone_id`, so Tab 3's dependent dropdown filters client-side with no
 *     second request (FR-048), and `is_active`, because Tab 3 offers inactive Hizbs too and
 *     marks them (FR-048a).
 *   - `current_hijri_year` is computed on the server, so a client cannot widen the Tab 9
 *     range by changing its own clock (FR-076).
 *
 * `is_draft` is returned with every lookup value. The UI shows those as
 * "DRAFT - NEEDS REVIEW", which is how FR-094 is met without baking the values into code.
 * Only active values are returned, and an empty list comes back as `[]` rather than being
 * omitted, so the form can explain itself instead of breaking (FR-095).
 */
exports.memberLookupsRoutes = (0, express_1.Router)();
exports.memberLookupsRoutes.use(auth_1.requireAuth, (0, requireMember_1.requireMember)());
/** table -> the column holding its display name. */
const LOOKUP_TABLES = {
    titles: "title_name",
    sharafs: "sharaf_name",
    halqas: "halqa_name",
    mozes: "moze_name",
    places: "place_name",
    sanads: "sanad_name",
    marital_statuses: "marital_status_name",
    skills: "skill_name",
    tamreen_frequencies: "tamreen_frequency_name",
    tamreen_methods: "tamreen_method_name",
    aqa_moula_asharas: "aqa_moula_ashara_name"
};
exports.memberLookupsRoutes.get("/", async (_req, res) => {
    try {
        const data = {};
        for (const [table, nameColumn] of Object.entries(LOOKUP_TABLES)) {
            // Table and column names come only from the constant above, never from input.
            const [rows] = await pool_1.pool.query(`SELECT id, ${nameColumn} AS name, is_draft
         FROM ${table}
         WHERE is_active = 1
         ORDER BY display_order, ${nameColumn}`);
            data[table] = rows.map((r) => ({
                id: Number(r.id),
                name: r.name,
                is_draft: Boolean(r.is_draft)
            }));
        }
        // Existing master data, used as-is. No copy of it is kept (FR-092).
        const [zones] = await pool_1.pool.query("SELECT id, zone_name AS name FROM zones ORDER BY zone_name");
        // ALL parties, active and inactive. A member's own Hizb may have been deactivated, and
        // filtering it out here would drop their saved value from the list: the Party select
        // would render blank and the save would be refused with nothing on screen to explain it.
        // `is_active` travels with each row so the form can mark the inactive ones rather than
        // presenting them as ordinary choices.
        const [parties] = await pool_1.pool.query(`SELECT id, party_name AS name, zone_id, is_active
       FROM parties
       ORDER BY party_name`);
        const [mohallahs] = await pool_1.pool.query("SELECT id, mohallah_name AS name, zone_id FROM mohallahs ORDER BY mohallah_name");
        data.zones = zones.map((z) => ({ id: Number(z.id), name: z.name, is_draft: false }));
        data.parties = parties.map((p) => ({
            id: Number(p.id),
            name: p.name,
            zone_id: Number(p.zone_id),
            is_active: Boolean(p.is_active)
        }));
        data.mohallahs = mohallahs.map((m) => ({
            id: Number(m.id),
            name: m.name,
            zone_id: Number(m.zone_id),
            is_draft: false
        }));
        data.current_hijri_year = (0, hijriDate_1.currentHijriYear)();
        return (0, response_1.ok)(res, data, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to load lookups", 500);
    }
});
