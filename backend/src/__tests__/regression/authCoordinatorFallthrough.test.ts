import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../../routes/authRoutes";
import { pool } from "../../db/pool";
import { buildTestApp } from "../helpers/testApp";
import { TEST_CREDENTIALS, ensureFixtures } from "../helpers/fixtures";

/**
 * REGRESSION BASELINE — COORDINATOR LOGIN, AND THE FALLTHROUGH (FR-103)
 *
 * This is the most important file in the suite.
 *
 * `authenticate()` in backend/src/services/authService.ts handles admin, zonal_head and
 * party as explicit `if (role === ...)` blocks and then **falls through** to the
 * venue/coordinator query with NO role check of its own. Coordinator login works today only
 * because nothing else catches the request first.
 *
 * The `member` branch is being inserted immediately above that fallthrough. Two ways that
 * can go wrong:
 *
 *   1. placed below it  -> member logins get answered by the venue query and fail
 *   2. placed above it but written loosely -> coordinator logins get swallowed by the
 *      member branch and every coordinator is locked out
 *
 * The second is the dangerous one, because it breaks a role nobody was working on. These
 * tests pin the behaviour before the change so either mistake fails immediately.
 */

const app = buildTestApp([{ path: "/api/v1/auth", router: authRoutes }]);

describe("REGRESSION: coordinator login resolves through the fallthrough", () => {
  let venueId: number;
  let zoneId: number;

  beforeAll(async () => {
    const fixtures = await ensureFixtures();
    venueId = fixtures.venueId;
    zoneId = fixtures.zoneId;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("authenticates a coordinator by venue name and returns venue claims", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.venue.name,
      password: TEST_CREDENTIALS.venue.password,
      role: "coordinator"
    });

    expect(res.status).toBe(200);
    const user = res.body.data.user;
    expect(user.role).toBe("coordinator");
    expect(user.venueId).toBe(venueId);
    expect(user.id).toBe(venueId);
    expect(user.displayName).toBe(TEST_CREDENTIALS.venue.name);
    expect(user.partyId).toBeUndefined();
  });

  it("authenticates a coordinator by numeric venue id", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: String(venueId),
      password: TEST_CREDENTIALS.venue.password,
      role: "coordinator"
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user.venueId).toBe(venueId);
  });

  // The coordinator query is a JOIN through mohallahs to reach the zone. If that join were
  // dropped, zone-scoped coordinator queries would silently see nothing.
  it("resolves zoneId through the venue -> mohallah join", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.venue.name,
      password: TEST_CREDENTIALS.venue.password,
      role: "coordinator"
    });

    expect(res.body.data.user.zoneId).toBe(zoneId);
  });

  it("puts venueId and zoneId in the token claims", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.venue.name,
      password: TEST_CREDENTIALS.venue.password,
      role: "coordinator"
    });

    const [, payloadB64] = res.body.data.token.split(".");
    const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));

    expect(claims.role).toBe("coordinator");
    expect(claims.venueId).toBe(venueId);
    expect(claims.zoneId).toBe(zoneId);
    expect(claims.sub).toBe(`coordinator:${venueId}`);
  });

  it("rejects a wrong coordinator password with 401", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.venue.name,
      password: "wrong",
      role: "coordinator"
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid credentials");
  });

  it("rejects an unknown venue with 401, not 500", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: "__NO_SUCH_VENUE__",
      password: "anything",
      role: "coordinator"
    });

    expect(res.status).toBe(401);
  });

  // Each role must be served by its own branch. If a coordinator could authenticate with a
  // party's credentials, or vice versa, the fallthrough has been widened.
  it("does not accept party credentials for the coordinator role", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.party.itsNo,
      password: TEST_CREDENTIALS.party.password,
      role: "coordinator"
    });

    expect(res.status).toBe(401);
  });

  it("does not accept coordinator credentials for the party role", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.venue.name,
      password: TEST_CREDENTIALS.venue.password,
      role: "party"
    });

    expect(res.status).toBe(401);
  });

  it("does not accept admin credentials for the coordinator role", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.admin.username,
      password: TEST_CREDENTIALS.admin.password,
      role: "coordinator"
    });

    expect(res.status).toBe(401);
  });

  /**
   * THE FALLTHROUGH, STATED DIRECTLY.
   *
   * Today an unrecognised role string reaches the venue query, because there is no
   * `role === "coordinator"` guard. So a bogus role with correct venue credentials
   * currently SUCCEEDS.
   *
   * That is the behaviour this test records — not an endorsement of it. Once a `member`
   * branch and a proper coordinator guard exist, this should become a 401, and this test
   * must then be updated deliberately rather than by accident. It is here so that the
   * change is visible when it happens.
   */
  it("documents that an unknown role currently falls through to the venue query", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.venue.name,
      password: TEST_CREDENTIALS.venue.password,
      role: "not_a_real_role"
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user.venueId).toBe(venueId);
    // The role is echoed back from the request, unvalidated.
    expect(res.body.data.user.role).toBe("not_a_real_role");
  });

  it("records the login against the venue row", async () => {
    await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.venue.name,
      password: TEST_CREDENTIALS.venue.password,
      role: "coordinator"
    });

    const [rows] = await pool.query<any[]>("SELECT last_login_at FROM venues WHERE id = :id", {
      id: venueId
    });
    expect(rows[0].last_login_at).not.toBeNull();
  });
});
