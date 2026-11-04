import express, { type Express, type Router } from "express";

/**
 * Builds a minimal Express app around the REAL routers, for supertest.
 *
 * Why not import `server.ts`: it calls `startServer()` at module scope, which runs
 * `ensureSchema()` (issuing ALTER TABLE) and binds a port. Importing it from a test would
 * mutate the schema and leave a listener open. Making it importable would mean changing the
 * production bootstrap of a live system, which is not worth it for these tests.
 *
 * What this does and does not cover: it mounts the same routers with the same
 * `express.json()` body limit, so the route -> service -> database path is exercised exactly
 * as in production. It does not include the CORS allow-list or the terminal error handler,
 * neither of which this feature touches.
 */
export function buildTestApp(mounts: Array<{ path: string; router: Router }>): Express {
  const app = express();

  // Same limit as server.ts, so payload-size behaviour matches.
  app.use(express.json({ limit: "5mb" }));

  for (const { path, router } of mounts) {
    app.use(path, router);
  }

  return app;
}
