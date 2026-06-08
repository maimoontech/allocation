"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const env_1 = require("./config/env");
const response_1 = require("./utils/response");
const authRoutes_1 = require("./routes/authRoutes");
const zonesRoutes_1 = require("./routes/zonesRoutes");
const mohallahsRoutes_1 = require("./routes/mohallahsRoutes");
const partiesRoutes_1 = require("./routes/partiesRoutes");
const venuesRoutes_1 = require("./routes/venuesRoutes");
const miqaatsRoutes_1 = require("./routes/miqaatsRoutes");
const schedulesRoutes_1 = require("./routes/schedulesRoutes");
const reportsRoutes_1 = require("./routes/reportsRoutes");
const ratingsRoutes_1 = require("./routes/ratingsRoutes");
const importExportRoutes_1 = require("./routes/importExportRoutes");
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin(origin, callback) {
        if (!origin || env_1.env.cors.allowedOrigins.includes(origin))
            return callback(null, true);
        return callback(new Error("CORS_NOT_ALLOWED"));
    }
}));
app.use(express_1.default.json({ limit: "5mb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/v1/auth", authRoutes_1.authRoutes);
app.use("/api/v1/zones", zonesRoutes_1.zonesRoutes);
app.use("/api/v1/mohallahs", mohallahsRoutes_1.mohallahsRoutes);
app.use("/api/v1/parties", partiesRoutes_1.partiesRoutes);
app.use("/api/v1/venues", venuesRoutes_1.venuesRoutes);
app.use("/api/v1/miqaats", miqaatsRoutes_1.miqaatsRoutes);
app.use("/api/v1/schedules", schedulesRoutes_1.schedulesRoutes);
app.use("/api/v1/reports", reportsRoutes_1.reportsRoutes);
app.use("/api/v1/ratings", ratingsRoutes_1.ratingsRoutes);
app.use("/api/v1/import-export", importExportRoutes_1.importExportRoutes);
app.use((err, _req, res, _next) => {
    if (res.headersSent)
        return;
    const code = String(err?.code ?? "");
    if (code === "ER_DUP_ENTRY")
        return (0, response_1.fail)(res, "Duplicate entry", 409);
    return (0, response_1.fail)(res, "Internal server error", 500);
});
app.listen(env_1.env.port, () => {
    process.stdout.write(`API listening on http://localhost:${env_1.env.port}\\n`);
});
