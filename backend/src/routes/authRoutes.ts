import { Router } from "express";
import {
  authenticate,
  changeMemberPassword,
  changePassword,
  refreshAccessToken,
  revokeRefreshToken
} from "../services/authService";
import {
  clientIpFrom,
  evaluateMemberLoginThrottle,
  hashClientIp,
  recordMemberLoginAttempt
} from "../services/loginThrottleService";
import { requireAuth, requireRole } from "../middleware/auth";
import { fail, ok } from "../utils/response";
import type { Role } from "../middleware/auth";

export const authRoutes = Router();

authRoutes.post("/login", async (req, res) => {
  const { identifier, password, role } = (req.body ?? {}) as {
    identifier?: string;
    password?: string;
    role?: Role;
  };

  if (!identifier || !password || !role) return fail(res, "Invalid request", 400);

  // Throttling applies to the MEMBER role only (FR-014). The four existing roles are
  // unthrottled today, and throttling them here would change their behaviour, which
  // FR-102 to FR-104 forbid. Extending it to them is a separate, deliberate change.
  const isMember = role === "member";
  const ipHash = isMember ? hashClientIp(clientIpFrom(req)) : null;
  const itsNo = identifier.trim();

  if (isMember) {
    const decision = await evaluateMemberLoginThrottle({ itsNo, ipHash });
    if (decision.throttled) {
      res.setHeader("Retry-After", String(decision.retryAfterSeconds));
      // Deliberately the same shape as any other refusal, and it says nothing about whether
      // the account exists (FR-013, FR-014).
      return fail(res, "Too many attempts. Please try again later.", 429);
    }
  }

  try {
    const result = await authenticate({ identifier, password, role });
    if (isMember) await recordMemberLoginAttempt({ itsNo, ipHash, succeeded: true });
    return ok(res, { token: result.token, refresh_token: result.refreshToken, user: result.user }, "OK");
  } catch (err: any) {
    if (err?.message === "INVALID_CREDENTIALS") {
      if (isMember) await recordMemberLoginAttempt({ itsNo, ipHash, succeeded: false });
      return fail(res, "Invalid credentials", 401);
    }
    return fail(res, "Login failed. Server error (check DB config).", 500);
  }
});

authRoutes.post("/refresh", async (req, res) => {
  const { refresh_token } = (req.body ?? {}) as { refresh_token?: string };
  if (!refresh_token) return fail(res, "Invalid request", 400);

  try {
    const data = await refreshAccessToken(refresh_token);
    return ok(res, data, "OK");
  } catch {
    return fail(res, "Invalid refresh token", 401);
  }
});

authRoutes.post("/logout", async (req, res) => {
  const { refresh_token } = (req.body ?? {}) as { refresh_token?: string };
  if (refresh_token) {
    try {
      await revokeRefreshToken(refresh_token);
    } catch {
      return ok(res, { success: true }, "OK");
    }
  }
  return ok(res, { success: true }, "OK");
});

authRoutes.post(
  "/change-password",
  requireAuth,
  requireRole(["zonal_head", "party", "coordinator", "member"]),
  async (req, res) => {
    const { current_password, new_password, confirm_password } = (req.body ?? {}) as {
      current_password?: string;
      new_password?: string;
      confirm_password?: string;
    };
    if (!current_password || !new_password) return fail(res, "Invalid request", 400);

    // MEMBER path. Handled first and separately so the existing three roles below are
    // reached by exactly the code they were before: same checks, same messages, same
    // response shape (FR-104).
    //
    // This is also the ONE member route that works while a forced change is outstanding
    // (FR-018) — hence no requireMember guard here; changeMemberPassword does its own
    // account checks.
    if (req.user!.role === "member") {
      try {
        const result = await changeMemberPassword({
          memberId: req.user!.memberId ?? req.user!.id,
          currentPassword: current_password,
          newPassword: new_password,
          confirmPassword: confirm_password
        });

        // A fresh pair, because the member's existing token predates the change and is now
        // rejected by requireMember's staleness check. Without this they would be bounced
        // to the login screen immediately after succeeding.
        return ok(
          res,
          {
            success: true,
            token: result.token,
            refresh_token: result.refreshToken,
            user: result.user
          },
          "Password changed"
        );
      } catch (err: any) {
        switch (err?.message) {
          case "INVALID_PASSWORD_CHANGE":
            return fail(res, "Current password is incorrect", 400);
          case "PASSWORD_CONFIRMATION_MISMATCH":
            return fail(res, "New password and confirmation do not match", 400);
          case "PASSWORD_POLICY":
            // Names the rule that failed, as FR-020 requires.
            return fail(res, err.detail ?? "Password does not meet the required rules", 400);
          case "PASSWORD_REUSED":
            return fail(res, "New password must be different from your current password", 400);
          default:
            return fail(res, "Failed to change password", 500);
        }
      }
    }

    try {
      await changePassword({
        role: req.user!.role as "zonal_head" | "party" | "coordinator",
        id: req.user!.id,
        currentPassword: current_password,
        newPassword: new_password
      });
      return ok(res, { success: true }, "Password changed");
    } catch (err: any) {
      if (err?.message === "INVALID_PASSWORD_CHANGE") {
        return fail(res, "Current password is incorrect", 400);
      }
      return fail(res, "Failed to change password", 500);
    }
  }
);
