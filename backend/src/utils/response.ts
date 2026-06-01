import type { Response } from "express";

export function ok<T>(res: Response, data: T, message = "OK") {
  return res.json({ success: true, data, message });
}

export function fail(res: Response, message: string, status = 400, data?: unknown) {
  return res.status(status).json({ success: false, data: data ?? null, message });
}

