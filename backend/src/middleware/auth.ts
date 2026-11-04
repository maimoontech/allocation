import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { fail } from "../utils/response";

export type Role = "admin" | "zonal_head" | "party" | "coordinator" | "member";

export type JwtClaims = {
  sub: string;
  role: Role;
  id: number;
  zoneId?: number;
  partyId?: number;
  venueId?: number;
  /** Set only for the member role, mirroring partyId and venueId. */
  memberId?: number;
  /**
   * Member role only: the account's `password_changed_at` as a Unix timestamp at the moment
   * this token was issued, or null if the member had never changed it.
   *
   * `requireMember` compares this for EQUALITY against the account's current value, so a
   * token minted before a password change is rejected (FR-022).
   *
   * Equality rather than ordering against `iat` on purpose. `iat` has one-second resolution,
   * so a token issued in the same second as the change would compare as "not older" and
   * survive — a real, if narrow, hole. Comparing the stamp itself has no such granularity.
   */
  pwdAt?: number | null;
  /** Issued-at and expiry, in seconds, added by jsonwebtoken itself. */
  iat?: number;
  exp?: number;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: JwtClaims;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return fail(res, "Unauthorized", 401);
  const token = header.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, env.jwt.secret) as JwtClaims;
    req.user = decoded;
    return next();
  } catch {
    return fail(res, "Unauthorized", 401);
  }
}

export function requireRole(roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) return fail(res, "Unauthorized", 401);
    if (!roles.includes(role)) return fail(res, "Forbidden", 403);
    return next();
  };
}
