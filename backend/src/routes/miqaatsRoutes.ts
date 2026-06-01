import { Router } from "express";
import { pool } from "../db/pool";
import { fail, ok } from "../utils/response";
import { requireAuth, requireRole } from "../middleware/auth";

export const miqaatsRoutes = Router();

miqaatsRoutes.get("/", requireAuth, async (_req, res) => {
  const [rows] = await pool.query<any[]>(
    "SELECT id, miqaat_name, english_date, hijri_date, is_active FROM miqaats ORDER BY english_date DESC"
  );
  return ok(res, rows, "OK");
});

miqaatsRoutes.post("/", requireAuth, requireRole(["admin"]), async (req, res) => {
  const { miqaat_name, english_date, hijri_date, is_active } = req.body ?? {};
  if (!miqaat_name || !english_date) return fail(res, "Invalid request", 400);

  await pool.query(
    "INSERT INTO miqaats (miqaat_name, english_date, hijri_date, is_active) VALUES (:miqaat_name, :english_date, :hijri_date, :is_active)",
    { miqaat_name, english_date, hijri_date: hijri_date ?? null, is_active: is_active ?? 1 }
  );
  return ok(res, { success: true }, "Created");
});

miqaatsRoutes.put("/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, "Invalid ID", 400);
  const { miqaat_name, english_date, hijri_date, is_active } = req.body ?? {};
  if (!miqaat_name || !english_date) return fail(res, "Invalid request", 400);

  await pool.query(
    "UPDATE miqaats SET miqaat_name = :miqaat_name, english_date = :english_date, hijri_date = :hijri_date, is_active = :is_active WHERE id = :id",
    { id, miqaat_name, english_date, hijri_date: hijri_date ?? null, is_active: is_active ?? 1 }
  );
  return ok(res, { success: true }, "Updated");
});

miqaatsRoutes.delete("/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return fail(res, "Invalid ID", 400);
  await pool.query("DELETE FROM miqaats WHERE id = :id", { id });
  return ok(res, { success: true }, "Deleted");
});

