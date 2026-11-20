import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { readMemberDashboard, type DashboardFilter } from "../services/memberDashboardService";
import { fail, ok } from "../utils/response";

/**
 * The administrator's member dashboard (FR-112).
 *
 * ADMIN ONLY, and not because the figures are secret - they name no member and carry no
 * profile value. It is because they are ORGANISATION-WIDE. A Zonal Head is scoped by
 * `member_profiles.zone_id` everywhere else in this module, and a member who has not reached
 * Tab 3 has no zone at all. Those members are precisely the ones a completion figure is
 * about, so a zone-scoped version of this page would omit the very people it was opened to
 * find, and silently report a healthier number than the truth. A zone-aware dashboard needs
 * a zone to scope by that survives an empty profile; until there is one, this stays whole.
 *
 * Its own base path rather than another rule under /api/v1/members, which is already shared
 * between the member-owned routers and the admin router. Adding a third set of rules to that
 * overlap is how the 403-on-your-own-profile bug would come back.
 */

export const memberDashboardRoutes = Router();

memberDashboardRoutes.use(requireAuth, requireRole(["admin"]));

/**
 * One filter, read from the query string.
 *
 * Three answers, and they are three different things: absent (do not filter), the literal
 * `none` (the members who have NOT answered this), or an id. Anything else is refused by
 * name rather than quietly ignored - a mistyped filter that returns the unfiltered figures
 * is a wrong number nobody questions.
 */
function readFilter(
  raw: unknown,
  label: string
): { value: number | "none" | undefined } | { error: string } {
  if (raw === undefined || raw === null || raw === "" || raw === "all") {
    return { value: undefined };
  }
  if (raw === "none") return { value: "none" };

  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: `${label} must be an id, "none" or left out.` };
  }
  return { value: id };
}

memberDashboardRoutes.get("/", async (req, res) => {
  const zone = readFilter(req.query.zone_id, "zone_id");
  if ("error" in zone) return fail(res, zone.error, 400);

  const mohallah = readFilter(req.query.mohallah_id, "mohallah_id");
  if ("error" in mohallah) return fail(res, mohallah.error, 400);

  const filter: DashboardFilter = {};
  if (zone.value !== undefined) filter.zone_id = zone.value;
  if (mohallah.value !== undefined) filter.mohallah_id = mohallah.value;

  try {
    const dashboard = await readMemberDashboard(filter);
    return ok(res, dashboard, "OK");
  } catch {
    return fail(res, "Failed to load the member dashboard", 500);
  }
});
