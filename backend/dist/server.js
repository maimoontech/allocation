"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const node_fs_1 = require("node:fs");
const env_1 = require("./config/env");
const ensureSchema_1 = require("./db/ensureSchema");
const httpBoundary_1 = require("./middleware/httpBoundary");
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
const memberAdminRoutes_1 = require("./routes/memberAdminRoutes");
const memberLookupAdminRoutes_1 = require("./routes/memberLookupAdminRoutes");
const memberLookupsRoutes_1 = require("./routes/memberLookupsRoutes");
const memberHelpChatRoutes_1 = require("./routes/memberHelpChatRoutes");
const helpTopicAdminRoutes_1 = require("./routes/helpTopicAdminRoutes");
const memberProfileRoutes_1 = require("./routes/memberProfileRoutes");
const memberPhotoRoutes_1 = require("./routes/memberPhotoRoutes");
const memberPhotoApprovalRoutes_1 = require("./routes/memberPhotoApprovalRoutes");
const partyMemberRoutes_1 = require("./routes/partyMemberRoutes");
const app = (0, express_1.default)();
const backendPackage = require("../package.json");
const backendBuildId = process.env.RENDER_GIT_COMMIT ||
    process.env.RENDER_GIT_BRANCH ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    "local";
app.use((0, cors_1.default)(httpBoundary_1.corsOptions));
app.use(express_1.default.json({ limit: "5mb" }));
app.get("/health", (_req, res) => res.json({
    ok: true,
    service: "backend",
    version: backendPackage.version ?? "unknown",
    build: backendBuildId,
    db_host: env_1.env.db.host,
    db_name: env_1.env.db.name
}));
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
// Member self-service routes are mounted BEFORE the admin router on the same base path.
// Express matches in order, and the admin router applies requireRole(["admin"]) to
// everything under it — so if it came first, a member hitting /members/me/profile would be
// refused 403 by the admin guard before reaching their own route. The specific "/me/..."
// paths cannot collide with the admin router's "/" and "/:id".
app.use("/api/v1/members", memberProfileRoutes_1.memberProfileRoutes);
// Member-owned, and mounted with the other "/me/..." routers for the same reason: ahead of
// the admin router, whose "/:id" would otherwise swallow these paths.
app.use("/api/v1/members", memberHelpChatRoutes_1.memberHelpChatRoutes);
app.use("/api/v1/members", memberPhotoRoutes_1.memberPhotoRoutes);
app.use("/api/v1/members/lookups", memberLookupsRoutes_1.memberLookupsRoutes);
app.use("/api/v1/members", memberAdminRoutes_1.memberAdminRoutes);
// Admin -> Help Chats. Its own base path rather than another rule on /api/v1/members,
// which is already shared between member-owned and admin-only routers.
app.use("/api/v1/help-chats", memberHelpChatRoutes_1.helpChatAdminRoutes);
app.use("/api/v1/help-topics", helpTopicAdminRoutes_1.helpTopicAdminRoutes);
// Admin maintenance of the membership lookup lists. A separate base path from
// /api/v1/members on purpose: that path is shared by the member-owned routers and an
// admin-only router, and adding a third set of rules to that overlap is how the 403-on-
// your-own-profile bug would come back.
app.use("/api/v1/member-lookups", memberLookupAdminRoutes_1.memberLookupAdminRoutes);
app.use("/api/v1/member-photo-approvals", memberPhotoApprovalRoutes_1.memberPhotoApprovalRoutes);
// The party's view of its own members. Its own base path, so the party-only guard cannot
// reach any other role's routes.
app.use("/api/v1/party-members", partyMemberRoutes_1.partyMemberRoutes);
app.use(httpBoundary_1.terminalErrorHandler);
async function startServer() {
    await (0, ensureSchema_1.ensureSchema)();
    const server = app.listen(env_1.env.port, () => {
        // On Windows this 'listening' callback fires even when the bind then fails with
        // EADDRINUSE — the 'error' event arrives immediately AFTER it, and address() is still
        // null here. Announcing success unconditionally is exactly what makes a failed restart
        // look like a successful one, so say nothing and let the error handler below speak.
        if (server.address() === null)
            return;
        // The build timestamp is printed because `npm start` runs the COMPILED output: when this
        // is older than your last `npm run build`, the process is serving stale code, and no
        // amount of refreshing the browser will show a source change.
        const builtAt = (0, node_fs_1.statSync)(__filename).mtime.toLocaleString();
        process.stdout.write(`API listening on http://localhost:${env_1.env.port} (build ${builtAt})\n`);
    });
    // Without this listener EADDRINUSE arrives as an asynchronous 'error' event AFTER
    // app.listen() has returned and startServer() has already resolved, so the .catch() below
    // never sees it. A restart that quietly loses the port to an older, still-running process
    // then looks exactly like a successful one — while the stale process goes on answering
    // with whatever code IT was started with.
    server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
            process.stderr.write(`\nPort ${env_1.env.port} is already in use. THIS SERVER IS NOT RUNNING.\n` +
                `An older process still owns the port and is answering requests with its own, ` +
                `probably outdated, code. Stop it first:\n\n` +
                `  Get-NetTCPConnection -LocalPort ${env_1.env.port} -State Listen   # shows OwningProcess\n` +
                `  Stop-Process -Id <OwningProcess> -Force\n\n` +
                `Then start again. For local work prefer "npm run dev", which reloads from source ` +
                `on save and needs no build step.\n`);
        }
        else {
            process.stderr.write(`Server failed to start: ${String(error)}\n`);
        }
        process.exit(1);
    });
}
startServer().catch((error) => {
    process.stderr.write(`Failed to start server: ${String(error)}\n`);
    process.exit(1);
});
