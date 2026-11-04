import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { memberAdminRoutes } from "../routes/memberAdminRoutes";
import { memberLookupsRoutes } from "../routes/memberLookupsRoutes";
import { memberPhotoRoutes } from "../routes/memberPhotoRoutes";
import { memberProfileRoutes } from "../routes/memberProfileRoutes";
import { pool } from "../db/pool";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, clearMemberLoginAttempts, ensureFixtures } from "./helpers/fixtures";

/**
 * ROUTE MOUNTING — THE ADMIN LIST AND THE MEMBER ROUTERS SHARE ONE BASE PATH.
 *
 * The member profile and photo routers are mounted on `/api/v1/members` ahead of the admin
 * router. Express runs a router's `use` middleware for every request that enters that router,
 * even when no path inside it matches — so a router-wide `requireMember()` answered the
 * admin's `GET /api/v1/members` with 403 "Forbidden" and the admin panel showed no members.
 *
 * Mounting the admin router alone in its own test file cannot catch that, which is why this
 * file mounts every router at `/api/v1/members` in the same order as `server.ts`.
 */

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/members", router: memberProfileRoutes },
  { path: "/api/v1/members", router: memberPhotoRoutes },
  { path: "/api/v1/members/lookups", router: memberLookupsRoutes },
  { path: "/api/v1/members", router: memberAdminRoutes }
]);

async function tokenFor(identifier: string, password: string, role: string) {
  const res = await request(app).post("/api/v1/auth/login").send({ identifier, password, role });
  return res.body.data?.token as string;
}

describe("routers sharing /api/v1/members", () => {
  let adminToken: string;
  let memberToken: string;
  let zoneToken: string;

  beforeAll(async () => {
    await ensureFixtures();
    await clearMemberLoginAttempts();
    adminToken = await tokenFor(
      TEST_CREDENTIALS.admin.username,
      TEST_CREDENTIALS.admin.password,
      "admin"
    );
    memberToken = await tokenFor(
      TEST_CREDENTIALS.memberSettled.itsNo,
      TEST_CREDENTIALS.memberSettled.password,
      "member"
    );
    zoneToken = await tokenFor(
      TEST_CREDENTIALS.zone.name,
      TEST_CREDENTIALS.zone.password,
      "zonal_head"
    );
  });

  afterAll(async () => {
    await clearMemberLoginAttempts();
    await pool.end();
  });

  it("lets an admin reach the member list mounted after the member routers", async () => {
    const res = await request(app)
      .get("/api/v1/members")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it("still refuses a non-member the member-only profile path", async () => {
    const res = await request(app)
      .get("/api/v1/members/me/profile")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });

  it("still serves the member's own profile", async () => {
    const res = await request(app)
      .get("/api/v1/members/me/profile")
      .set("Authorization", `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.its_no).toBe(TEST_CREDENTIALS.memberSettled.itsNo);
  });

  it("refuses the admin list to a zonal head", async () => {
    const res = await request(app)
      .get("/api/v1/members")
      .set("Authorization", `Bearer ${zoneToken}`);

    expect(res.status).toBe(403);
  });

  it("requires authentication for the admin list", async () => {
    const res = await request(app).get("/api/v1/members");
    expect(res.status).toBe(401);
  });
});
