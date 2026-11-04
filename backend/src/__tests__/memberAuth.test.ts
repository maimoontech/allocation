import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { pool } from "../db/pool";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, clearMemberLoginAttempts, ensureFixtures } from "./helpers/fixtures";

/**
 * MEMBER SIGN-IN (FR-009 to FR-016)
 *
 * The companion to regression/authCoordinatorFallthrough.test.ts: that file proves the
 * existing roles still work after the `member` branch was inserted, this one proves the new
 * branch does what it should and nothing more.
 */

const app = buildTestApp([{ path: "/api/v1/auth", router: authRoutes }]);

function login(identifier: string, password: string, role = "member") {
  return request(app).post("/api/v1/auth/login").send({ identifier, password, role });
}

describe("member sign-in", () => {
  beforeAll(async () => {
    await ensureFixtures();
  });

  // This file makes many deliberate wrong-password attempts, and the throttle counts per
  // address as well as per account. Without this reset the later tests would start getting
  // 429 instead of the 401 they are asserting — the throttle working, not a bug.
  beforeEach(async () => {
    await clearMemberLoginAttempts();
  });

  afterAll(async () => {
    await clearMemberLoginAttempts();
    await pool.end();
  });

  it("authenticates by ITS number and returns member claims", async () => {
    const res = await login(
      TEST_CREDENTIALS.memberSettled.itsNo,
      TEST_CREDENTIALS.memberSettled.password
    );

    expect(res.status).toBe(200);
    const user = res.body.data.user;
    expect(user.role).toBe("member");
    expect(typeof user.memberId).toBe("number");
    expect(user.id).toBe(user.memberId);
    expect(user.displayName).toBe(TEST_CREDENTIALS.memberSettled.name);
    // A member has no zone, party or venue scope of its own.
    expect(user.zoneId).toBeUndefined();
    expect(user.partyId).toBeUndefined();
    expect(user.venueId).toBeUndefined();
  });

  it("puts memberId and an iat in the token claims", async () => {
    const res = await login(
      TEST_CREDENTIALS.memberSettled.itsNo,
      TEST_CREDENTIALS.memberSettled.password
    );

    const [, payloadB64] = res.body.data.token.split(".");
    const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));

    expect(claims.role).toBe("member");
    expect(claims.sub).toBe(`member:${claims.id}`);
    expect(typeof claims.memberId).toBe("number");
    // iat is what the staleness check in requireMember compares against.
    expect(typeof claims.iat).toBe("number");
  });

  it("reports whether a password change is still outstanding", async () => {
    const fresh = await login(
      TEST_CREDENTIALS.memberFresh.itsNo,
      TEST_CREDENTIALS.memberFresh.password
    );
    expect(fresh.body.data.user.mustChangePassword).toBe(true);

    const settled = await login(
      TEST_CREDENTIALS.memberSettled.itsNo,
      TEST_CREDENTIALS.memberSettled.password
    );
    expect(settled.body.data.user.mustChangePassword).toBe(false);
  });

  it("rejects a wrong password with 401", async () => {
    const res = await login(TEST_CREDENTIALS.memberSettled.itsNo, "wrong-password");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid credentials");
  });

  it("rejects an unknown ITS number with 401, not 500", async () => {
    const res = await login("99909999", "anything");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid credentials");
  });

  it("gives the same message for an unknown account as for a wrong password (FR-013)", async () => {
    const unknown = await login("99909998", "x");
    const wrong = await login(TEST_CREDENTIALS.memberSettled.itsNo, "x");

    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  // FR-007 plus FR-013: refused, and indistinguishable from a wrong password, so the response
  // cannot be used to discover which accounts exist or have been withdrawn.
  it("refuses a deactivated account with the same message as a wrong password", async () => {
    const inactive = await login(
      TEST_CREDENTIALS.memberInactive.itsNo,
      TEST_CREDENTIALS.memberInactive.password
    );
    const wrong = await login(TEST_CREDENTIALS.memberSettled.itsNo, "x");

    expect(inactive.status).toBe(401);
    expect(inactive.body.message).toBe(wrong.body.message);
  });

  it("retains the profile data of a deactivated account (FR-007)", async () => {
    const [rows] = await pool.query<any[]>(
      "SELECT id, is_active FROM member_accounts WHERE its_no = :i",
      { i: TEST_CREDENTIALS.memberInactive.itsNo }
    );
    expect(rows).toHaveLength(1);
    expect(Boolean(rows[0].is_active)).toBe(false);
  });

  // FR-011 and FR-012. The two credential sets must be strictly separate, in both directions.
  it("does not accept party credentials for the member role", async () => {
    const res = await login(TEST_CREDENTIALS.party.itsNo, TEST_CREDENTIALS.party.password);
    expect(res.status).toBe(401);
  });

  it("does not accept member credentials for the party role", async () => {
    const res = await login(
      TEST_CREDENTIALS.memberSettled.itsNo,
      TEST_CREDENTIALS.memberSettled.password,
      "party"
    );
    expect(res.status).toBe(401);
  });

  it("does not accept member credentials for the coordinator role", async () => {
    const res = await login(
      TEST_CREDENTIALS.memberSettled.itsNo,
      TEST_CREDENTIALS.memberSettled.password,
      "coordinator"
    );
    expect(res.status).toBe(401);
  });

  it("does not accept member credentials for the admin role", async () => {
    const res = await login(
      TEST_CREDENTIALS.memberSettled.itsNo,
      TEST_CREDENTIALS.memberSettled.password,
      "admin"
    );
    expect(res.status).toBe(401);
  });

  it("records the sign-in against the member account", async () => {
    await login(TEST_CREDENTIALS.memberSettled.itsNo, TEST_CREDENTIALS.memberSettled.password);

    const [rows] = await pool.query<any[]>(
      "SELECT last_login_at FROM member_accounts WHERE its_no = :i",
      { i: TEST_CREDENTIALS.memberSettled.itsNo }
    );
    expect(rows[0].last_login_at).not.toBeNull();
  });

  it("issues a refresh token stored only as a hash", async () => {
    const res = await login(
      TEST_CREDENTIALS.memberSettled.itsNo,
      TEST_CREDENTIALS.memberSettled.password
    );
    const plain = res.body.data.refresh_token as string;

    expect(plain).toBeTruthy();
    const [rows] = await pool.query<any[]>(
      "SELECT id FROM refresh_tokens WHERE token_hash = :t",
      { t: plain }
    );
    expect(rows).toHaveLength(0);
  });

  it("stores the member session under the member role", async () => {
    const login1 = await login(
      TEST_CREDENTIALS.memberSettled.itsNo,
      TEST_CREDENTIALS.memberSettled.password
    );
    const memberId = login1.body.data.user.memberId;

    const [rows] = await pool.query<any[]>(
      "SELECT COUNT(*) AS n FROM refresh_tokens WHERE user_role = 'member' AND user_id = :id",
      { id: memberId }
    );
    expect(Number(rows[0].n)).toBeGreaterThan(0);
  });

  it("accepts a member refresh token and returns a fresh access token", async () => {
    const res = await login(
      TEST_CREDENTIALS.memberSettled.itsNo,
      TEST_CREDENTIALS.memberSettled.password
    );

    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refresh_token: res.body.data.refresh_token });

    expect(refreshed.status).toBe(200);
    const [, payloadB64] = refreshed.body.data.token.split(".");
    const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    expect(claims.role).toBe("member");
    expect(typeof claims.memberId).toBe("number");
  });

  // A refresh must not resurrect a withdrawn account, so loadUser checks is_active too.
  it("refuses to refresh a session whose account has been deactivated", async () => {
    const res = await login(
      TEST_CREDENTIALS.memberThrottle.itsNo,
      TEST_CREDENTIALS.memberThrottle.password
    );
    const refreshToken = res.body.data.refresh_token;

    await pool.query("UPDATE member_accounts SET is_active = 0 WHERE its_no = :i", {
      i: TEST_CREDENTIALS.memberThrottle.itsNo
    });

    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refresh_token: refreshToken });

    expect(refreshed.status).toBe(401);

    await pool.query("UPDATE member_accounts SET is_active = 1 WHERE its_no = :i", {
      i: TEST_CREDENTIALS.memberThrottle.itsNo
    });
  });
});
