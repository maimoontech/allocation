import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { fail, ok } from "../utils/response";
import { requireAuth, requireRole } from "../middleware/auth";

export const zonesRoutes = Router();

zonesRoutes.use(requireAuth, requireRole(["admin"]));

zonesRoutes.get("/", async (_req, res) => {
  const [rows] = await pool.query<any[]>(
    "SELECT id, zone_name, coordinator_name, contact_number, whatsapp_number, last_login_at, created_at, updated_at FROM zones ORDER BY zone_name"
  );
  return ok(res, rows, "OK");
});

zonesRoutes.post("/", async (req, res) => {
  const { zone_name, coordinator_name, contact_number, whatsapp_number, password } = req.body ?? {};
  if (!zone_name || !coordinator_name || !password) return fail(res, "Invalid request", 400);

  const password_hash = await bcrypt.hash(String(password), 10);
  await pool.query(
    "INSERT INTO zones (zone_name, coordinator_name, contact_number, whatsapp_number, password_hash, created_at, updated_at) VALUES (:zone_name, :coordinator_name, :contact_number, :whatsapp_number, :password_hash, NOW(), NOW())",
    { zone_name, coordinator_name, contact_number: contact_number ?? null, whatsapp_number: whatsapp_number ?? null, password_hash }
  );
  return ok(res, { success: true }, "Created");
});

zonesRoutes.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, "Invalid ID", 400);

  const { zone_name, coordinator_name, contact_number, whatsapp_number, password } = req.body ?? {};
  if (!zone_name || !coordinator_name) return fail(res, "Invalid request", 400);

  const params: any = { id, zone_name, coordinator_name, contact_number: contact_number ?? null, whatsapp_number: whatsapp_number ?? null };
  let setPasswordSql = "";
  if (password) {
    params.password_hash = await bcrypt.hash(String(password), 10);
    setPasswordSql = ", password_hash = :password_hash";
  }

  await pool.query(
    `UPDATE zones SET zone_name = :zone_name, coordinator_name = :coordinator_name, contact_number = :contact_number, whatsapp_number = :whatsapp_number, updated_at = NOW()${setPasswordSql} WHERE id = :id`,
    params
  );
  return ok(res, { success: true }, "Updated");
});

zonesRoutes.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, "Invalid ID", 400);
  await pool.query("DELETE FROM zones WHERE id = :id", { id });
  return ok(res, { success: true }, "Deleted");
});

