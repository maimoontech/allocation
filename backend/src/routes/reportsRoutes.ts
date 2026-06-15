import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { fail, ok } from "../utils/response";

export const reportsRoutes = Router();

reportsRoutes.use(requireAuth, requireRole(["admin", "zonal_head"]));

function getZoneScope(user: any, rawZoneId: unknown) {
  if (user.role === "zonal_head") return user.zoneId;
  const zoneId = rawZoneId ? Number(rawZoneId) : null;
  return Number.isFinite(zoneId) ? zoneId : null;
}

function completedPartyMiqaatJoin(scheduleAlias: string) {
  return `JOIN (
    SELECT s2.party_id, s2.miqaat_id
    FROM schedules s2
    LEFT JOIN performance_ratings pr2 ON pr2.schedule_id = s2.id
    GROUP BY s2.party_id, s2.miqaat_id
    HAVING COUNT(DISTINCT s2.id) = COUNT(DISTINCT pr2.schedule_id)
  ) completed_pairs
    ON completed_pairs.party_id = ${scheduleAlias}.party_id
   AND completed_pairs.miqaat_id = ${scheduleAlias}.miqaat_id`;
}

reportsRoutes.get("/status-summary", async (req, res) => {
  const user = req.user!;
  const zoneId = getZoneScope(user, req.query.zone_id);
  const zoneWhere = Number.isFinite(zoneId) ? "WHERE zone_id = :zone_id" : "";
  const params = Number.isFinite(zoneId) ? { zone_id: zoneId } : {};

  const [[partyCounts]] = await pool.query<any[]>(
    `SELECT
       SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_parties,
       SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive_parties
     FROM parties
     ${zoneWhere}`,
    params
  );

  const [[venueCounts]] = await pool.query<any[]>(
    `SELECT
       SUM(CASE WHEN v.is_active = 1 THEN 1 ELSE 0 END) AS active_venues,
       SUM(CASE WHEN v.is_active = 0 THEN 1 ELSE 0 END) AS inactive_venues
     FROM venues v
     JOIN mohallahs m ON m.id = v.mohallah_id
     ${Number.isFinite(zoneId) ? "WHERE m.zone_id = :zone_id" : ""}`,
    params
  );

  return ok(
    res,
    {
      parties: { active: Number(partyCounts?.active_parties ?? 0), inactive: Number(partyCounts?.inactive_parties ?? 0) },
      venues: { active: Number(venueCounts?.active_venues ?? 0), inactive: Number(venueCounts?.inactive_venues ?? 0) }
    },
    "OK"
  );
});

reportsRoutes.get("/zone-schedule", async (req, res) => {
  const user = req.user!;
  const miqaatId = req.query.miqaat_id ? Number(req.query.miqaat_id) : null;
  if (!Number.isFinite(miqaatId)) return fail(res, "miqaat_id is required", 400);

  const zoneId = getZoneScope(user, req.query.zone_id);
  const params: any = { miqaat_id: miqaatId };
  let zoneSql = "";
  if (Number.isFinite(zoneId)) {
    zoneSql = " AND m.zone_id = :zone_id";
    params.zone_id = zoneId;
  }

  const [rows] = await pool.query<any[]>(
    `SELECT z.zone_name, m.mohallah_name, v.venue_name,
            COUNT(*) AS total_parties,
            SUM(CASE WHEN p.category = 'A' THEN 1 ELSE 0 END) AS cat_a,
            SUM(CASE WHEN p.category = 'B' THEN 1 ELSE 0 END) AS cat_b,
            SUM(CASE WHEN p.category = 'C' THEN 1 ELSE 0 END) AS cat_c,
            SUM(CASE WHEN s.is_manual = 1 THEN 1 ELSE 0 END) AS manual_count
     FROM schedules s
     JOIN venues v ON v.id = s.venue_id
     JOIN mohallahs m ON m.id = v.mohallah_id
     JOIN zones z ON z.id = m.zone_id
     JOIN parties p ON p.id = s.party_id
     WHERE s.miqaat_id = :miqaat_id${zoneSql}
     GROUP BY z.zone_name, m.mohallah_name, v.venue_name
     ORDER BY z.zone_name, m.mohallah_name, v.venue_name`,
    params
  );

  return ok(res, rows, "OK");
});

reportsRoutes.get("/party-history", async (req, res) => {
  const user = req.user!;
  const partyId = req.query.party_id ? Number(req.query.party_id) : null;
  if (!Number.isFinite(partyId)) return fail(res, "party_id is required", 400);

  if (user.role === "zonal_head") {
    const [rows] = await pool.query<any[]>("SELECT zone_id FROM parties WHERE id = :id LIMIT 1", { id: partyId });
    if (!rows[0] || rows[0].zone_id !== user.zoneId) return fail(res, "Forbidden", 403);
  }

  const [rows] = await pool.query<any[]>(
    `SELECT h.venue_id, v.venue_name, h.visit_count, h.first_visited_at, h.last_visited_at
     FROM party_venue_history h
     JOIN venues v ON v.id = h.venue_id
     WHERE h.party_id = :party_id
     ORDER BY h.last_visited_at DESC`,
    { party_id: partyId }
  );
  return ok(res, rows, "OK");
});

reportsRoutes.get("/miqaat-schedule", async (req, res) => {
  const user = req.user!;
  const miqaatId = req.query.miqaat_id ? Number(req.query.miqaat_id) : null;
  if (!Number.isFinite(miqaatId)) return fail(res, "miqaat_id is required", 400);

  const zoneId = getZoneScope(user, req.query.zone_id);
  const params: any = { miqaat_id: miqaatId };
  let zoneSql = "";
  if (Number.isFinite(zoneId)) {
    zoneSql = " AND m.zone_id = :zone_id";
    params.zone_id = zoneId;
  }

  const [rows] = await pool.query<any[]>(
    `SELECT s.id, z.zone_name, m.mohallah_name, v.venue_name, p.party_name, p.category, p.its_no, p.leader_name,
            p.contact_number, p.whatsapp_number, s.is_manual
     FROM schedules s
     JOIN venues v ON v.id = s.venue_id
     JOIN mohallahs m ON m.id = v.mohallah_id
     JOIN zones z ON z.id = m.zone_id
     JOIN parties p ON p.id = s.party_id
     WHERE s.miqaat_id = :miqaat_id${zoneSql}
     ORDER BY z.zone_name, m.mohallah_name, v.venue_name, p.party_name`,
    params
  );
  return ok(res, rows, "OK");
});

reportsRoutes.get("/attendance", async (req, res) => {
  const user = req.user!;
  const miqaatId = req.query.miqaat_id ? Number(req.query.miqaat_id) : null;
  if (!Number.isFinite(miqaatId)) return fail(res, "miqaat_id is required", 400);

  const zoneId = getZoneScope(user, req.query.zone_id);
  const params: any = { miqaat_id: miqaatId, coordinator_id: user.role === "zonal_head" ? 0 : 0 };
  let zoneSql = "";
  if (Number.isFinite(zoneId)) {
    zoneSql = " AND m.zone_id = :zone_id";
    params.zone_id = zoneId;
  }

  const [rows] = await pool.query<any[]>(
    `SELECT s.id AS schedule_id, z.zone_name, m.mohallah_name, v.venue_name, p.party_name, p.category,
            pr.coordinator_id, pr.attended_properly, pr.recitation_score, pr.discipline_score, pr.attendance_score, pr.overall_score, pr.comments, pr.created_at
     FROM schedules s
     JOIN venues v ON v.id = s.venue_id
     JOIN mohallahs m ON m.id = v.mohallah_id
     JOIN zones z ON z.id = m.zone_id
     JOIN parties p ON p.id = s.party_id
     ${completedPartyMiqaatJoin("s")}
     LEFT JOIN performance_ratings pr ON pr.schedule_id = s.id
     WHERE s.miqaat_id = :miqaat_id${zoneSql}
     ORDER BY z.zone_name, m.mohallah_name, v.venue_name, p.party_name`,
    params
  );
  return ok(res, rows, "OK");
});

reportsRoutes.get("/performance", async (req, res) => {
  const user = req.user!;
  const partyId = req.query.party_id ? Number(req.query.party_id) : null;
  const zoneId = getZoneScope(user, req.query.zone_id);

  const params: any = {};
  let zoneSql = "";
  if (Number.isFinite(zoneId)) {
    zoneSql = " AND p.zone_id = :zone_id";
    params.zone_id = zoneId;
  }

  if (Number.isFinite(partyId)) {
    if (user.role === "zonal_head") {
      const [rows] = await pool.query<any[]>("SELECT zone_id FROM parties WHERE id = :id LIMIT 1", { id: partyId });
      if (!rows[0] || rows[0].zone_id !== user.zoneId) return fail(res, "Forbidden", 403);
    }

    const [trend] = await pool.query<any[]>(
      `SELECT q.id AS miqaat_id, q.miqaat_name, q.english_date,
              AVG(pr.overall_score) AS avg_overall,
              AVG(pr.recitation_score) AS avg_recitation,
              AVG(pr.discipline_score) AS avg_discipline,
              AVG(pr.attendance_score) AS avg_attendance,
              SUM(CASE WHEN pr.attended_properly = 1 THEN 1 ELSE 0 END) AS attended_count,
              COUNT(pr.id) AS rated_count
       FROM performance_ratings pr
       JOIN schedules s ON s.id = pr.schedule_id
       ${completedPartyMiqaatJoin("s")}
       JOIN miqaats q ON q.id = s.miqaat_id
       WHERE s.party_id = :party_id
       GROUP BY q.id, q.miqaat_name, q.english_date
       ORDER BY q.english_date DESC`,
      { party_id: partyId }
    );

    const [mic] = await pool.query<any[]>(
      `SELECT q.id AS miqaat_id, q.miqaat_name, q.english_date,
              AVG(r.rating_score) AS avg_mic,
              COUNT(r.id) AS rated_count
       FROM ratings r
       JOIN schedules s ON s.id = r.schedule_id
       JOIN miqaats q ON q.id = s.miqaat_id
       WHERE r.rater_role = 'party' AND s.party_id = :party_id
       GROUP BY q.id, q.miqaat_name, q.english_date
       ORDER BY q.english_date DESC`,
      { party_id: partyId }
    );

    return ok(res, { performance_trend: trend, mic_trend: mic }, "OK");
  }

  const [rows] = await pool.query<any[]>(
    `SELECT p.id AS party_id, p.party_name, p.category, z.zone_name,
            AVG(pr.overall_score) AS avg_overall,
            COUNT(pr.id) AS ratings_count
     FROM performance_ratings pr
     JOIN schedules s ON s.id = pr.schedule_id
     ${completedPartyMiqaatJoin("s")}
     JOIN parties p ON p.id = s.party_id
     JOIN zones z ON z.id = p.zone_id
     WHERE 1=1${zoneSql}
     GROUP BY p.id, p.party_name, p.category, z.zone_name
     ORDER BY avg_overall DESC`,
    params
  );

  return ok(res, rows, "OK");
});

reportsRoutes.get("/quarterly", async (req, res) => {
  const user = req.user!;
  const year = Number(req.query.year);
  const quarter = Number(req.query.quarter);
  if (!Number.isFinite(year) || !Number.isFinite(quarter) || quarter < 1 || quarter > 4) {
    return fail(res, "year and quarter (1-4) are required", 400);
  }

  const startMonth = (quarter - 1) * 3 + 1;
  const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const endMonth = startMonth + 2;
  const end = `${year}-${String(endMonth).padStart(2, "0")}-31`;

  const zoneId = getZoneScope(user, req.query.zone_id);
  const params: any = { start, end };
  let zoneSql = "";
  if (Number.isFinite(zoneId)) {
    zoneSql = " AND p.zone_id = :zone_id";
    params.zone_id = zoneId;
  }

  const [rows] = await pool.query<any[]>(
    `SELECT p.id AS party_id, p.party_name, p.category, z.zone_name,
            AVG(pr.overall_score) AS avg_overall,
            COUNT(pr.id) AS ratings_count
     FROM performance_ratings pr
     JOIN schedules s ON s.id = pr.schedule_id
     JOIN miqaats q ON q.id = s.miqaat_id
     ${completedPartyMiqaatJoin("s")}
     JOIN parties p ON p.id = s.party_id
     JOIN zones z ON z.id = p.zone_id
     WHERE q.english_date BETWEEN :start AND :end${zoneSql}
     GROUP BY p.id, p.party_name, p.category, z.zone_name
     HAVING ratings_count > 0
     ORDER BY avg_overall DESC`,
    params
  );

  const best = rows.slice(0, 10);
  const worst = rows.slice().reverse().slice(0, 10);
  return ok(res, { best, worst }, "OK");
});

reportsRoutes.get("/manually-edited", async (req, res) => {
  const user = req.user!;
  const zoneId = getZoneScope(user, req.query.zone_id);
  const miqaatId = req.query.miqaat_id ? Number(req.query.miqaat_id) : null;

  const params: any = {};
  let whereSql = "WHERE 1=1";

  if (Number.isFinite(miqaatId)) {
    whereSql += " AND s.miqaat_id = :miqaat_id";
    params.miqaat_id = miqaatId;
  }
  if (Number.isFinite(zoneId)) {
    whereSql += " AND m.zone_id = :zone_id";
    params.zone_id = zoneId;
  }

  const [rows] = await pool.query<any[]>(
    `SELECT e.id AS edit_id, e.schedule_id, e.edited_by_role, e.edited_by_id, e.edited_at,
            q.miqaat_name, q.english_date,
            z.zone_name, m.mohallah_name,
            v_old.venue_name AS old_venue_name, p_old.party_name AS old_party_name,
            v_new.venue_name AS new_venue_name, p_new.party_name AS new_party_name
     FROM schedule_edits e
     JOIN schedules s ON s.id = e.schedule_id
     JOIN miqaats q ON q.id = s.miqaat_id
     JOIN venues v ON v.id = s.venue_id
     JOIN mohallahs m ON m.id = v.mohallah_id
     JOIN zones z ON z.id = m.zone_id
     JOIN venues v_old ON v_old.id = e.old_venue_id
     JOIN parties p_old ON p_old.id = e.old_party_id
     JOIN venues v_new ON v_new.id = e.new_venue_id
     JOIN parties p_new ON p_new.id = e.new_party_id
     ${whereSql}
     ORDER BY e.edited_at DESC`,
    params
  );

  return ok(res, rows, "OK");
});
