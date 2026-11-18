import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { readMemberDashboard } from "../services/memberDashboardService";
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

memberDashboardRoutes.get("/", async (_req, res) => {
  try {
    const dashboard = await readMemberDashboard();
    return ok(res, dashboard, "OK");
  } catch {
    return fail(res, "Failed to load the member dashboard", 500);
  }
});
