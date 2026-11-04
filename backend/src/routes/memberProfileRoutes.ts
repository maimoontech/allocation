import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireMember } from "../middleware/requireMember";
import { readMemberProfile, saveMemberProfile } from "../services/memberProfileService";
import { fail, ok } from "../utils/response";

/**
 * A member's own profile.
 *
 * One GET and one PUT for all twelve tabs. That is what makes FR-030's all-or-nothing save
 * the natural case rather than the hard one, and it means switching tabs is client state
 * with no round trip (FR-026).
 *
 * Neither route takes a member identifier. The member is always the one in the token, so
 * there is no parameter to tamper with (FR-034, FR-097, FR-098).
 */

export const memberProfileRoutes = Router();

/**
 * The guards are attached PER ROUTE, not with `router.use`.
 *
 * A router-wide `requireMember()` also runs for requests that match nothing in this router —
 * and because this router is mounted on `/api/v1/members` ahead of the admin router, it would
 * answer an admin's `GET /api/v1/members` with 403 before the admin router was ever consulted.
 * That is exactly the "no member data in the admin panel" failure. Per-route guards let an
 * unmatched path fall through to the next router while still refusing a non-member the moment
 * one of these paths is matched.
 */
memberProfileRoutes.get("/me/profile", requireAuth, requireMember(), async (req, res) => {
  const memberId = req.user!.memberId ?? req.user!.id;

  try {
    const profile = await readMemberProfile(memberId);
    if (!profile) return fail(res, "Member not found", 404);
    return ok(res, profile, "OK");
  } catch {
    return fail(res, "Failed to load profile", 500);
  }
});

memberProfileRoutes.put("/me/profile", requireAuth, requireMember(), async (req, res) => {
  const memberId = req.user!.memberId ?? req.user!.id;
  const payload = req.body;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fail(res, "Invalid request", 400);
  }

  try {
    const result = await saveMemberProfile(memberId, payload as Record<string, unknown>);

    if (!result.ok && result.kind === "conflict") {
      return fail(
        res,
        "This profile was changed in another session. Reload it and apply your edits again.",
        409
      );
    }

    if (!result.ok) {
      // Nothing was written. The errors carry a tab number so the UI can open the right one
      // (FR-029).
      return fail(res, "Please correct the highlighted fields.", 400, {
        errors: result.errors
      });
    }

    // Returned so the client gets the derived values — the Hijri date of birth and the BMI —
    // without a second request.
    const profile = await readMemberProfile(memberId);
    return ok(res, profile, "Profile saved");
  } catch {
    return fail(res, "Failed to save profile", 500);
  }
});
