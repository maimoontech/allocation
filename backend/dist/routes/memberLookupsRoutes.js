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
 * Fifteen lists plus a derived year. Served together because a form that needed them
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
/**
 * Member, administrator or Zonal Head.
 *
 * These are reference lists — zones, parties, titles, venues — and an administrator reading
 * a member's twelve tabs (FR-047a) needs exactly the same lists to render exactly the same
 * form. Leaving this member-only was the defect behind "Could not load this profile": the
 * profile itself returned fine and the dropdowns behind it did not.
 *
 * The two paths are kept apart deliberately. A member goes through `requireMember()`, which
 * reads their account row to enforce FR-007, FR-018 and FR-022. An administrator must NOT
 * take that path: it queries `member_accounts` for an id they do not have, and FR-103 keeps
 * that query off the existing roles' routes by construction. So the role is checked first
 * and only a member reaches the member guard.
 */
const memberGuard = (0, requireMember_1.requireMember)();
exports.memberLookupsRoutes.use(auth_1.requireAuth, (req, res, next) => {
    const role = req.user?.role;
    if (role === "admin" || role === "zonal_head")
        return next();
    return memberGuard(req, res, next);
});
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
        // FR-077b. Each Aqa Moula place carries the year it answers, so Tab 9 can show the place
        // for a year instead of asking for it. A second small query rather than widening the
        // loop above, which serves ten lists that have no such column.
        const [aqaMoulaYears] = await pool_1.pool.query("SELECT id, hijri_year FROM aqa_moula_asharas WHERE is_active = 1");
        const yearById = new Map(aqaMoulaYears.map((r) => [Number(r.id), r.hijri_year == null ? null : Number(r.hijri_year)]));
        data.aqa_moula_asharas = data.aqa_moula_asharas.map((r) => ({
            ...r,
            hijri_year: yearById.get(r.id) ?? null
        }));
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
        // FR-077c. Tab 9's Venue, which replaced Mohallah.
        //
        // ALL venues, active and inactive, each carrying the flag so the form can mark the
        // inactive ones — a member recording an Ashara from years ago may well name a venue that
        // has since been retired, and filtering it out would leave them unable to answer.
        //
        // The column list is explicit and MUST stay that way. `venues` holds `password_hash` and
        // `last_login_at`: venues sign in to this system. A `SELECT *` here would publish both to
        // every member (FR-101).
        const [venues] = await pool_1.pool.query(`SELECT id, venue_name AS name, mohallah_id, is_active
       FROM venues
       ORDER BY venue_name`);
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
        data.venues = venues.map((v) => ({
            id: Number(v.id),
            name: v.name,
            mohallah_id: Number(v.mohallah_id),
            is_active: Boolean(v.is_active)
        }));
        data.current_hijri_year = (0, hijriDate_1.currentHijriYear)();
        return (0, response_1.ok)(res, data, "OK");
    }
    catch {
        return (0, response_1.fail)(res, "Failed to load lookups", 500);
    }
});
