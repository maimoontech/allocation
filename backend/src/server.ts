import express from "express";
import cors from "cors";
import { statSync } from "node:fs";
import { env } from "./config/env";
import { ensureSchema } from "./db/ensureSchema";
import { corsOptions, terminalErrorHandler } from "./middleware/httpBoundary";
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
import { memberAdminRoutes } from "./routes/memberAdminRoutes";
import { memberLookupAdminRoutes } from "./routes/memberLookupAdminRoutes";
import { memberLookupsRoutes } from "./routes/memberLookupsRoutes";
import { helpChatAdminRoutes, memberHelpChatRoutes } from "./routes/memberHelpChatRoutes";
import { memberProfileRoutes } from "./routes/memberProfileRoutes";
import { memberPhotoRoutes } from "./routes/memberPhotoRoutes";
import { memberPhotoApprovalRoutes } from "./routes/memberPhotoApprovalRoutes";
import { partyMemberRoutes } from "./routes/partyMemberRoutes";

const app = express();
const backendPackage = require("../package.json") as { version?: string };
const backendBuildId =
  process.env.RENDER_GIT_COMMIT ||
  process.env.RENDER_GIT_BRANCH ||
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  "local";

app.use(cors(corsOptions));
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
// Member self-service routes are mounted BEFORE the admin router on the same base path.
// Express matches in order, and the admin router applies requireRole(["admin"]) to
// everything under it — so if it came first, a member hitting /members/me/profile would be
// refused 403 by the admin guard before reaching their own route. The specific "/me/..."
// paths cannot collide with the admin router's "/" and "/:id".
app.use("/api/v1/members", memberProfileRoutes);
// Member-owned, and mounted with the other "/me/..." routers for the same reason: ahead of
// the admin router, whose "/:id" would otherwise swallow these paths.
app.use("/api/v1/members", memberHelpChatRoutes);
app.use("/api/v1/members", memberPhotoRoutes);
app.use("/api/v1/members/lookups", memberLookupsRoutes);
app.use("/api/v1/members", memberAdminRoutes);

// Admin -> Help Chats. Its own base path rather than another rule on /api/v1/members,
// which is already shared between member-owned and admin-only routers.
app.use("/api/v1/help-chats", helpChatAdminRoutes);

// Admin maintenance of the membership lookup lists. A separate base path from
// /api/v1/members on purpose: that path is shared by the member-owned routers and an
// admin-only router, and adding a third set of rules to that overlap is how the 403-on-
// your-own-profile bug would come back.
app.use("/api/v1/member-lookups", memberLookupAdminRoutes);
app.use("/api/v1/member-photo-approvals", memberPhotoApprovalRoutes);
// The party's view of its own members. Its own base path, so the party-only guard cannot
// reach any other role's routes.
app.use("/api/v1/party-members", partyMemberRoutes);

app.use(terminalErrorHandler);

async function startServer() {
  await ensureSchema();

  const server = app.listen(env.port, () => {
    // On Windows this 'listening' callback fires even when the bind then fails with
    // EADDRINUSE — the 'error' event arrives immediately AFTER it, and address() is still
    // null here. Announcing success unconditionally is exactly what makes a failed restart
    // look like a successful one, so say nothing and let the error handler below speak.
    if (server.address() === null) return;

    // The build timestamp is printed because `npm start` runs the COMPILED output: when this
    // is older than your last `npm run build`, the process is serving stale code, and no
    // amount of refreshing the browser will show a source change.
    const builtAt = statSync(__filename).mtime.toLocaleString();
    process.stdout.write(`API listening on http://localhost:${env.port} (build ${builtAt})\n`);
  });

  // Without this listener EADDRINUSE arrives as an asynchronous 'error' event AFTER
  // app.listen() has returned and startServer() has already resolved, so the .catch() below
  // never sees it. A restart that quietly loses the port to an older, still-running process
  // then looks exactly like a successful one — while the stale process goes on answering
  // with whatever code IT was started with.
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      process.stderr.write(
        `\nPort ${env.port} is already in use. THIS SERVER IS NOT RUNNING.\n` +
          `An older process still owns the port and is answering requests with its own, ` +
          `probably outdated, code. Stop it first:\n\n` +
          `  Get-NetTCPConnection -LocalPort ${env.port} -State Listen   # shows OwningProcess\n` +
          `  Stop-Process -Id <OwningProcess> -Force\n\n` +
          `Then start again. For local work prefer "npm run dev", which reloads from source ` +
          `on save and needs no build step.\n`
      );
    } else {
      process.stderr.write(`Server failed to start: ${String(error)}\n`);
    }
    process.exit(1);
  });
}

startServer().catch((error) => {
  process.stderr.write(`Failed to start server: ${String(error)}\n`);
  process.exit(1);
});
