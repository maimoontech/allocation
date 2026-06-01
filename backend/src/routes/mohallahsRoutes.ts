import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { fail, ok } from "../utils/response";
import { requireAuth, requireRole } from "../middleware/auth";

export const mohallahsRoutes = Router();

mohallahsRoutes.use(requireAuth, requireRole(["admin"]));

mohallahsRoutes.get("/", async (req, res) => {
  const zoneId = req.query.zone_id ? Number(req.query.zone_id) : null;
  const where = Number.isFinite(zoneId) ? "WHERE m.zone_id = :zone_id" : "";
  const params = Number.isFinite(zoneId) ? { zone_id: zoneId } : {};

  const [rows] = await pool.query<any[]>(
    `SELECT m.id, m.zone_id, z.zone_name, m.mohallah_name, m.coordinator_name, m.contact_number, m.whatsapp_number, m.last_login_at, m.created_at
     FROM mohallahs m
     JOIN zones z ON z.id = m.zone_id
     ${where}
     ORDER BY z.zone_name, m.mohallah_name`,
    params
  );
  return ok(res, rows, "OK");
});

mohallahsRoutes.post("/", async (req, res) => {
  const { zone_id, mohallah_name, coordinator_name, contact_number, whatsapp_number, password } = req.body ?? {};
  if (!zone_id || !mohallah_name || !coordinator_name || !password) return fail(res, "Invalid request", 400);

  const password_hash = await bcrypt.hash(String(password), 10);
  await pool.query(
    "INSERT INTO mohallahs (zone_id, mohallah_name, coordinator_name, contact_number, whatsapp_number, password_hash, created_at) VALUES (:zone_id, :mohallah_name, :coordinator_name, :contact_number, :whatsapp_number, :password_hash, NOW())",
    {
      zone_id,
      mohallah_name,
      coordinator_name,
      contact_number: contact_number ?? null,
      whatsapp_number: whatsapp_number ?? null,
      password_hash
    }
  );
  return ok(res, { success: true }, "Created");
});

mohallahsRoutes.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, "Invalid ID", 400);

  const { zone_id, mohallah_name, coordinator_name, contact_number, whatsapp_number, password } = req.body ?? {};
  if (!zone_id || !mohallah_name || !coordinator_name) return fail(res, "Invalid request", 400);

  const params: any = {
    id,
    zone_id,
    mohallah_name,
    coordinator_name,
    contact_number: contact_number ?? null,
    whatsapp_number: whatsapp_number ?? null
  };
  let setPasswordSql = "";
  if (password) {
    params.password_hash = await bcrypt.hash(String(password), 10);
    setPasswordSql = ", password_hash = :password_hash";
  }

  await pool.query(
    `UPDATE mohallahs SET zone_id = :zone_id, mohallah_name = :mohallah_name, coordinator_name = :coordinator_name, contact_number = :contact_number, whatsapp_number = :whatsapp_number${setPasswordSql} WHERE id = :id`,
    params
  );
  return ok(res, { success: true }, "Updated");
});

mohallahsRoutes.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, "Invalid ID", 400);
  await pool.query("DELETE FROM mohallahs WHERE id = :id", { id });
  return ok(res, { success: true }, "Deleted");
});

