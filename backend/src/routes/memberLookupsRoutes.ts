import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requireMember } from "../middleware/requireMember";
import { currentHijriYear } from "../utils/hijriDate";
import { fail, ok } from "../utils/response";

/**
 * Every selectable value the twelve-tab form needs, in ONE response.
 *
 * Fourteen lists plus a derived year. Served together because a form that needed them
 * separately would fire thirteen requests on open, and because several of them are tiny.
 *
 * Two details carry requirements:
 *
 *   - Parties include `zone_id`, so Tab 3's dependent dropdown filters client-side with no
 *     second request (FR-048).
 *   - `current_hijri_year` is computed on the server, so a client cannot widen the Tab 9
 *     range by changing its own clock (FR-076).
 *
 * `is_draft` is returned with every lookup value. The UI shows those as
 * "DRAFT - NEEDS REVIEW", which is how FR-094 is met without baking the values into code.
 * Only active values are returned, and an empty list comes back as `[]` rather than being
 * omitted, so the form can explain itself instead of breaking (FR-095).
 */

export const memberLookupsRoutes = Router();

memberLookupsRoutes.use(requireAuth, requireMember());

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
} as const;

memberLookupsRoutes.get("/", async (_req, res) => {
  try {
    const data: Record<string, unknown> = {};

    for (const [table, nameColumn] of Object.entries(LOOKUP_TABLES)) {
      // Table and column names come only from the constant above, never from input.
      const [rows] = await pool.query<any[]>(
        `SELECT id, ${nameColumn} AS name, is_draft
         FROM ${table}
         WHERE is_active = 1
         ORDER BY display_order, ${nameColumn}`
      );
      data[table] = rows.map((r) => ({
        id: Number(r.id),
        name: r.name,
        is_draft: Boolean(r.is_draft)
      }));
    }

    // Existing master data, used as-is. No copy of it is kept (FR-092).
    const [zones] = await pool.query<any[]>(
      "SELECT id, zone_name AS name FROM zones ORDER BY zone_name"
    );
    const [parties] = await pool.query<any[]>(
      `SELECT id, party_name AS name, zone_id
       FROM parties
       WHERE is_active = 1
       ORDER BY party_name`
    );
    const [mohallahs] = await pool.query<any[]>(
      "SELECT id, mohallah_name AS name, zone_id FROM mohallahs ORDER BY mohallah_name"
    );

    data.zones = zones.map((z) => ({ id: Number(z.id), name: z.name, is_draft: false }));
    data.parties = parties.map((p) => ({
      id: Number(p.id),
      name: p.name,
      zone_id: Number(p.zone_id)
    }));
    data.mohallahs = mohallahs.map((m) => ({
      id: Number(m.id),
      name: m.name,
      zone_id: Number(m.zone_id),
      is_draft: false
    }));

    data.current_hijri_year = currentHijriYear();

    return ok(res, data, "OK");
  } catch {
    return fail(res, "Failed to load lookups", 500);
  }
});
