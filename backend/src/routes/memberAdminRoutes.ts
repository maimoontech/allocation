import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { fail, ok } from "../utils/response";

/**
 * Administrator view of member ACCOUNTS (FR-006, FR-007).
 *
 * Shows account state plus the identifying details an administrator needs to recognise a
 * person: name parts, photograph, zone and party posting, and WhatsApp and mobile numbers.
 * Health
 * values and every other answer from the member's twelve-tab profile stay private
 * (FR-065, FR-101). Bulk provisioning goes through the import route, so passwords are
 * hashed in exactly one place (FR-015); nothing here can set one.
 */

export const memberAdminRoutes = Router();

// Admin-only, router-wide, matching the pattern in zonesRoutes and mohallahsRoutes.
memberAdminRoutes.use(requireAuth, requireRole(["admin"]));

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

memberAdminRoutes.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const isActiveRaw = String(req.query.is_active ?? "").trim();

  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(req.query.page_size ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE)
  );

  const conditions: string[] = [];
  const params: any = {};

  if (q) {
    // Matches the ITS number, the roster name, or the full name stored on the profile.
    // `LIKE` with a leading wildcard cannot use the index, which is fine at this table's
    // size and keeps the search forgiving.
    conditions.push(
      `(ma.its_no LIKE :q
        OR ma.member_name LIKE :q
        OR CONCAT_WS(' ', mp.first_prefix, mp.name, mp.father_prefix, mp.father_name, mp.surname) LIKE :q)`
    );
    params.q = `%${q}%`;
  }

  if (isActiveRaw === "true" || isActiveRaw === "1") {
    conditions.push("ma.is_active = 1");
  } else if (isActiveRaw === "false" || isActiveRaw === "0") {
    conditions.push("ma.is_active = 0");
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) AS total
       FROM member_accounts ma
       LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
       ${where}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await pool.query<any[]>(
      `SELECT ma.id,
              ma.its_no,
              ma.member_name,
              ma.must_change_password,
              ma.is_active,
              IF(mp.id IS NULL, 0, 1) AS has_profile,
              IF(ph.id IS NULL, 0, 1) AS has_photo,
              mp.first_prefix,
              mp.name,
              mp.father_prefix,
              mp.father_name,
              mp.surname,
              z.zone_name,
              p.party_name,
              mp.whatsapp_no_1,
              mp.whatsapp_no_2,
              mp.mobile_no_1,
              mp.mobile_no_2,
              ma.last_login_at,
              ma.created_at
       FROM member_accounts ma
       LEFT JOIN member_profiles mp ON mp.member_account_id = ma.id
       LEFT JOIN member_photos ph ON ph.member_account_id = ma.id
       LEFT JOIN zones z ON z.id = mp.zone_id
       LEFT JOIN parties p ON p.id = mp.party_id
       ${where}
       ORDER BY ma.its_no
       LIMIT :limit OFFSET :offset`,
      { ...params, limit: pageSize, offset: (page - 1) * pageSize }
    );

    return ok(
      res,
      {
        items: rows.map((r) => ({
          id: Number(r.id),
          its_no: r.its_no,
          member_name: r.member_name,
          must_change_password: Boolean(r.must_change_password),
          is_active: Boolean(r.is_active),
          has_profile: Boolean(r.has_profile),
          has_photo: Boolean(r.has_photo),
          first_prefix: r.first_prefix,
          name: r.name,
          father_prefix: r.father_prefix,
          father_name: r.father_name,
          surname: r.surname,
          zone_name: r.zone_name,
          party_name: r.party_name,
          whatsapp_no_1: r.whatsapp_no_1,
          whatsapp_no_2: r.whatsapp_no_2,
          mobile_no_1: r.mobile_no_1,
          mobile_no_2: r.mobile_no_2,
          last_login_at: r.last_login_at,
          created_at: r.created_at
        })),
        total,
        page,
        page_size: pageSize
      },
      "OK"
    );
  } catch {
    return fail(res, "Failed to list members", 500);
  }
});

/**
 * The member's current photograph, for the administrator's member list.
 *
 * Served as bytes behind the admin guard rather than as a data URL in the list payload: a
 * list of fifty members would otherwise carry tens of megabytes. Approval status is not
 * filtered, because an administrator is the party that approves it.
 */
memberAdminRoutes.get("/:id/photo", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, "Invalid request", 400);

  try {
    const [rows] = await pool.query<any[]>(
      `SELECT content_type, byte_size, sha256, image_data
       FROM member_photos
       WHERE member_account_id = :id
       LIMIT 1`,
      { id }
    );

    const photo = rows[0];
    if (!photo) return fail(res, "No photo set", 404);

    res.setHeader("Content-Type", photo.content_type);
    res.setHeader("Content-Length", String(photo.byte_size));
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    res.setHeader("ETag", `"${photo.sha256}"`);

    if (req.headers["if-none-match"] === `"${photo.sha256}"`) {
      return res.status(304).end();
    }
    return res.status(200).end(photo.image_data);
  } catch {
    return fail(res, "Failed to load photo", 500);
  }
});

/**
 * Activates or deactivates one account.
 *
 * `is_active` is the ONLY field this accepts. A password cannot be set here, so provisioning
 * stays on the single hashing path; and nothing about the member's own profile is touched,
 * because FR-007 requires a withdrawn member's data to be retained rather than removed.
 */
memberAdminRoutes.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, "Invalid request", 400);

  const { is_active } = (req.body ?? {}) as { is_active?: unknown };
  if (typeof is_active !== "boolean") {
    return fail(res, "is_active must be true or false", 400);
  }

  try {
    const [result] = await pool.query<any>(
      "UPDATE member_accounts SET is_active = :is_active WHERE id = :id",
      { is_active: is_active ? 1 : 0, id }
    );

    // affectedRows is 0 when the row does not exist, but ALSO when the value was already
    // what was asked for, so existence is checked separately rather than inferred.
    if (Number(result?.affectedRows ?? 0) === 0) {
      const [rows] = await pool.query<any[]>(
        "SELECT id FROM member_accounts WHERE id = :id LIMIT 1",
        { id }
      );
      if (!rows.length) return fail(res, "Member not found", 404);
    }

    // Deactivating does not revoke the member's refresh tokens here. It does not need to:
    // requireMember reads is_active on every request, so an open session stops working on
    // its next call (FR-007).
    return ok(res, { id, is_active }, is_active ? "Member activated" : "Member deactivated");
  } catch {
    return fail(res, "Failed to update member", 500);
  }
});
