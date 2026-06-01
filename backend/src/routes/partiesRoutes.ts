import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { fail, ok } from "../utils/response";
import { requireAuth, requireRole } from "../middleware/auth";

export const partiesRoutes = Router();

partiesRoutes.use(requireAuth, requireRole(["admin", "zonal_head"]));

partiesRoutes.get("/", async (req, res) => {
  const user = req.user!;
  const zoneId = user.role === "zonal_head" ? user.zoneId : req.query.zone_id ? Number(req.query.zone_id) : null;
  const where = Number.isFinite(zoneId) ? "WHERE p.zone_id = :zone_id" : "";
  const params = Number.isFinite(zoneId) ? { zone_id: zoneId } : {};

  const [rows] = await pool.query<any[]>(
    `SELECT p.id, p.its_no, p.leader_name, p.party_name, p.zone_id, z.zone_name, p.category, p.is_active, p.last_login_at, p.created_at
     FROM parties p
     JOIN zones z ON z.id = p.zone_id
     ${where}
     ORDER BY z.zone_name, p.party_name`,
    params
  );
  return ok(res, rows, "OK");
});

partiesRoutes.post("/", async (req, res) => {
  const user = req.user!;
  const { zone_id, its_no, leader_name, party_name, category, is_active, password } = req.body ?? {};
  const finalZoneId = user.role === "zonal_head" ? user.zoneId : zone_id;
  if (!finalZoneId || !its_no || !leader_name || !party_name || !category || !password) return fail(res, "Invalid request", 400);

  const password_hash = await bcrypt.hash(String(password), 10);
  await pool.query(
    "INSERT INTO parties (its_no, leader_name, party_name, zone_id, category, is_active, password_hash, created_at) VALUES (:its_no, :leader_name, :party_name, :zone_id, :category, :is_active, :password_hash, NOW())",
    {
      its_no,
      leader_name,
      party_name,
      zone_id: finalZoneId,
      category,
      is_active: is_active ?? 1,
      password_hash
    }
  );
  return ok(res, { success: true }, "Created");
});

partiesRoutes.put("/:id", async (req, res) => {
  const user = req.user!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, "Invalid ID", 400);

  const { zone_id, its_no, leader_name, party_name, category, is_active, password } = req.body ?? {};
  const finalZoneId = user.role === "zonal_head" ? user.zoneId : zone_id;
  if (!finalZoneId || !its_no || !leader_name || !party_name || !category) return fail(res, "Invalid request", 400);

  const params: any = { id, its_no, leader_name, zone_id: finalZoneId, party_name, category, is_active: is_active ?? 1 };
  let setPasswordSql = "";
  if (password) {
    params.password_hash = await bcrypt.hash(String(password), 10);
    setPasswordSql = ", password_hash = :password_hash";
  }

  const scopeSql = user.role === "zonal_head" ? " AND zone_id = :zone_id" : "";

  await pool.query(
    `UPDATE parties SET its_no = :its_no, leader_name = :leader_name, party_name = :party_name, zone_id = :zone_id, category = :category, is_active = :is_active${setPasswordSql} WHERE id = :id${scopeSql}`,
    params
  );
  return ok(res, { success: true }, "Updated");
});

partiesRoutes.delete("/:id", async (req, res) => {
  const user = req.user!;
  if (user.role !== "admin") return fail(res, "Forbidden", 403);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, "Invalid ID", 400);
  await pool.query("DELETE FROM parties WHERE id = :id", { id });
  return ok(res, { success: true }, "Deleted");
});
