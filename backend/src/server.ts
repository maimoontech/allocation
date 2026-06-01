import express from "express";
import cors from "cors";
import { env } from "./config/env";
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

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.cors.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS_NOT_ALLOWED"));
    }
  })
);
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

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

app.listen(env.port, () => {
  process.stdout.write(`API listening on http://localhost:${env.port}\\n`);
});
