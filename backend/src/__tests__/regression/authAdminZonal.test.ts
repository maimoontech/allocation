import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../../routes/authRoutes";
import { pool } from "../../db/pool";
import { buildTestApp } from "../helpers/testApp";
import { TEST_CREDENTIALS, ensureFixtures } from "../helpers/fixtures";

/**
 * REGRESSION BASELINE — ADMIN AND ZONAL HEAD (FR-103)
 *
 * The two roles resolved by the explicit branches above the fallthrough. Written against
 * unmodified code so the `member` insertion cannot quietly alter either.
 */

const app = buildTestApp([{ path: "/api/v1/auth", router: authRoutes }]);

// File-level, NOT inside a describe. This file has two describe blocks, and a describe's
// afterAll runs before the next describe's beforeAll — so closing the pool inside the first
// one would leave the second with a dead pool.
afterAll(async () => {
  await pool.end();
});

describe("REGRESSION: admin login", () => {
  let adminId: number;

  beforeAll(async () => {
    adminId = (await ensureFixtures()).adminId;
  });

  it("authenticates by username and returns admin claims", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.admin.username,
      password: TEST_CREDENTIALS.admin.password,
      role: "admin"
    });

    expect(res.status).toBe(200);
    const user = res.body.data.user;
    expect(user.role).toBe("admin");
    expect(user.id).toBe(adminId);
    expect(user.displayName).toBe("Regression Test Admin");
    // An admin is global: no zone, party or venue scope.
    expect(user.zoneId).toBeUndefined();
    expect(user.partyId).toBeUndefined();
    expect(user.venueId).toBeUndefined();
  });

  it("issues claims with no scope fields", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.admin.username,
      password: TEST_CREDENTIALS.admin.password,
      role: "admin"
    });

    const [, payloadB64] = res.body.data.token.split(".");
    const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));

    expect(claims.role).toBe("admin");
    expect(claims.sub).toBe(`admin:${adminId}`);
    expect(claims.zoneId).toBeUndefined();
    expect(claims.partyId).toBeUndefined();
    expect(claims.venueId).toBeUndefined();
  });

  it("rejects a wrong password with 401", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.admin.username,
      password: "wrong",
      role: "admin"
    });

    expect(res.status).toBe(401);
  });

  it("rejects an unknown username with 401", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: "__no_such_admin__",
      password: "anything",
      role: "admin"
    });

    expect(res.status).toBe(401);
  });

  it("is not authenticated by its id, only by username", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: String(adminId),
      password: TEST_CREDENTIALS.admin.password,
      role: "admin"
    });

    expect(res.status).toBe(401);
  });
});

describe("REGRESSION: zonal head login", () => {
  let zoneId: number;

  beforeAll(async () => {
    zoneId = (await ensureFixtures()).zoneId;
  });

  it("authenticates by zone name and returns zone claims", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.zone.name,
      password: TEST_CREDENTIALS.zone.password,
      role: "zonal_head"
    });

    expect(res.status).toBe(200);
    const user = res.body.data.user;
    expect(user.role).toBe("zonal_head");
    expect(user.id).toBe(zoneId);
    // zoneId equals the row id for this role, and every zone-scoped query depends on it.
    expect(user.zoneId).toBe(zoneId);
    expect(user.displayName).toBe(TEST_CREDENTIALS.zone.name);
    expect(user.partyId).toBeUndefined();
    expect(user.venueId).toBeUndefined();
  });

  it("authenticates by numeric zone id as well as by name", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: String(zoneId),
      password: TEST_CREDENTIALS.zone.password,
      role: "zonal_head"
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user.zoneId).toBe(zoneId);
  });

  it("rejects a wrong password with 401", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.zone.name,
      password: "wrong",
      role: "zonal_head"
    });

    expect(res.status).toBe(401);
  });

  it("rejects an unknown zone with 401", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: "__NO_SUCH_ZONE__",
      password: "anything",
      role: "zonal_head"
    });

    expect(res.status).toBe(401);
  });

  it("does not accept zone credentials for the admin role", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.zone.name,
      password: TEST_CREDENTIALS.zone.password,
      role: "admin"
    });

    expect(res.status).toBe(401);
  });
});
