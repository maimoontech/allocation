import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { fail } from "../utils/response";

export type Role = "admin" | "zonal_head" | "party" | "coordinator";

export type JwtClaims = {
  sub: string;
  role: Role;
  id: number;
  zoneId?: number;
  partyId?: number;
  venueId?: number;
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
