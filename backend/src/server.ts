import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { fail } from "./utils/response";
import { authRoutes } from "./routes/authRoutes";
import { zonesRoutes } from "./routes/zonesRoutes";
import { mohallahsRoutes } from "./routes/mohallahsRoutes";
import { partiesRoutes } from "./routes/partiesRoutes";
import { venuesRoutes } from "./routes/venuesRoutes";
import { miqaatsRoutes } from "./routes/miqaatsRoutes";
import { schedulesRoutes } from "./routes/schedulesRoutes";
import { reportsRoutes } from "./routes/reportsRoutes";
import { ratingsRoutes } from "./routes/ratingsRoutes";
import { importExportRoutes } from "./routes/importExportRoutes";

const app = express();
const backendPackage = require("../package.json") as { version?: string };
const backendBuildId =
  process.env.RENDER_GIT_COMMIT ||
  process.env.RENDER_GIT_BRANCH ||
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  "local";

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.cors.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS_NOT_ALLOWED"));
    }
  })
);
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    service: "backend",
    version: backendPackage.version ?? "unknown",
    build: backendBuildId,
    db_host: env.db.host,
    db_name: env.db.name
  })
);

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/zones", zonesRoutes);
app.use("/api/v1/mohallahs", mohallahsRoutes);
app.use("/api/v1/parties", partiesRoutes);
app.use("/api/v1/venues", venuesRoutes);
app.use("/api/v1/miqaats", miqaatsRoutes);
app.use("/api/v1/schedules", schedulesRoutes);
app.use("/api/v1/reports", reportsRoutes);
app.use("/api/v1/ratings", ratingsRoutes);
app.use("/api/v1/import-export", importExportRoutes);

app.use((err: any, _req: any, res: any, _next: any) => {
  if (res.headersSent) return;
  const code = String(err?.code ?? "");
  if (code === "ER_DUP_ENTRY") return fail(res, "Duplicate entry", 409);
  return fail(res, "Internal server error", 500);
});

app.listen(env.port, () => {
  process.stdout.write(`API listening on http://localhost:${env.port}\\n`);
});
