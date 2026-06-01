import { Router } from "express";
import { authenticate, refreshAccessToken, revokeRefreshToken } from "../services/authService";
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

  try {
    const result = await authenticate({ identifier, password, role });
    return ok(res, { token: result.token, refresh_token: result.refreshToken, user: result.user }, "OK");
  } catch (err: any) {
    if (err?.message === "INVALID_CREDENTIALS") return fail(res, "Invalid credentials", 401);
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
