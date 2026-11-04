import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../../routes/authRoutes";
import { pool } from "../../db/pool";
import { buildTestApp } from "../helpers/testApp";
import { TEST_CREDENTIALS, ensureFixtures } from "../helpers/fixtures";

/**
 * REGRESSION BASELINE — PARTY LOGIN (FR-102)
 *
 * Written and passing against UNMODIFIED authentication code, before the `member` branch is
 * added to `authenticate()`. That ordering is the whole point: a test written afterwards
 * could only confirm the new behaviour, not that the old behaviour survived.
 *
 * Party login is the one the requirement singles out, and it is the closest neighbour to the
 * change: the `member` branch is inserted into the same if-chain.
 *
 * Re-run this file after every task that touches authService.ts, authRoutes.ts or
 * middleware/auth.ts.
 */

const app = buildTestApp([{ path: "/api/v1/auth", router: authRoutes }]);

describe("REGRESSION: party login", () => {
  beforeAll(async () => {
    await ensureFixtures();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("authenticates by ITS number and returns party claims", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.party.itsNo,
      password: TEST_CREDENTIALS.party.password,
      role: "party"
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.refresh_token).toBeTruthy();

    const user = res.body.data.user;
    expect(user.role).toBe("party");
    expect(user.displayName).toBe(TEST_CREDENTIALS.party.name);
    // partyId and zoneId are what every party-scoped query relies on; losing either would
    // silently widen or empty a party's data.
    expect(typeof user.partyId).toBe("number");
    expect(typeof user.zoneId).toBe("number");
    expect(user.id).toBe(user.partyId);
    expect(user.venueId).toBeUndefined();
  });

  it("issues a token whose claims carry role, id, partyId and zoneId", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.party.itsNo,
      password: TEST_CREDENTIALS.party.password,
      role: "party"
    });

    const [, payloadB64] = res.body.data.token.split(".");
    const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));

    expect(claims.role).toBe("party");
    expect(claims.sub).toBe(`party:${claims.id}`);
    expect(typeof claims.partyId).toBe("number");
    expect(typeof claims.zoneId).toBe("number");
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it("rejects a wrong password with 401 and the existing message", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.party.itsNo,
      password: "definitely-not-the-password",
      role: "party"
    });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, data: null, message: "Invalid credentials" });
  });

  // An unknown identifier must not reach bcrypt with an undefined hash. If it did, bcryptjs
  // would throw and the route would answer 500 "Server error (check DB config)", which both
  // leaks that the account is absent and looks like an outage.
  it("rejects an unknown ITS number with 401, not 500", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: "00000000000",
      password: "anything",
      role: "party"
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid credentials");
  });

  it("returns the same message for an unknown account as for a wrong password", async () => {
    const unknown = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "00000000000", password: "x", role: "party" });
    const wrongPassword = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: TEST_CREDENTIALS.party.itsNo, password: "x", role: "party" });

    expect(unknown.status).toBe(wrongPassword.status);
    expect(unknown.body.message).toBe(wrongPassword.body.message);
  });

  // Party login is by ITS number only — not by party name, and not by numeric id. Widening
  // this would hand one party access to another's data.
  it("does not authenticate a party by its name", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.party.name,
      password: TEST_CREDENTIALS.party.password,
      role: "party"
    });

    expect(res.status).toBe(401);
  });

  it.each([
    ["missing identifier", { password: "x", role: "party" }],
    ["missing password", { identifier: "99900001", role: "party" }],
    ["missing role", { identifier: "99900001", password: "x" }],
    ["empty body", {}]
  ])("rejects a malformed request (%s) with 400", async (_label, body) => {
    const res = await request(app).post("/api/v1/auth/login").send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request");
  });

  it("records the login against the party row", async () => {
    await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.party.itsNo,
      password: TEST_CREDENTIALS.party.password,
      role: "party"
    });

    const [rows] = await pool.query<any[]>(
      "SELECT last_login_at FROM parties WHERE its_no = :i",
      { i: TEST_CREDENTIALS.party.itsNo }
    );
    expect(rows[0].last_login_at).not.toBeNull();
  });

  it("stores the refresh token hashed, never in plain text", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.party.itsNo,
      password: TEST_CREDENTIALS.party.password,
      role: "party"
    });

    const plain = res.body.data.refresh_token as string;
    const [rows] = await pool.query<any[]>(
      "SELECT token_hash FROM refresh_tokens WHERE token_hash = :t",
      { t: plain }
    );
    expect(rows).toHaveLength(0);
  });

  it("accepts the issued refresh token and returns a fresh access token", async () => {
    const login = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.party.itsNo,
      password: TEST_CREDENTIALS.party.password,
      role: "party"
    });

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refresh_token: login.body.data.refresh_token });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  it("rejects an unknown refresh token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refresh_token: "not-a-real-token" });

    expect(res.status).toBe(401);
  });

  it("revokes a refresh token on logout, after which it cannot be used", async () => {
    const login = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.party.itsNo,
      password: TEST_CREDENTIALS.party.password,
      role: "party"
    });
    const token = login.body.data.refresh_token;

    const logout = await request(app).post("/api/v1/auth/logout").send({ refresh_token: token });
    expect(logout.status).toBe(200);

    const reuse = await request(app).post("/api/v1/auth/refresh").send({ refresh_token: token });
    expect(reuse.status).toBe(401);
  });
});
