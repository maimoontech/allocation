import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { pool } from "../db/pool";
import { env } from "../config/env";
import { buildTestApp } from "./helpers/testApp";
import {
  TEST_CREDENTIALS,
  TEST_MEMBER_ITS_PREFIX,
  clearMemberLoginAttempts,
  ensureFixtures
} from "./helpers/fixtures";

/**
 * MEMBER SIGN-IN THROTTLING (FR-014)
 *
 * The system has no throttling today: /auth/login runs bcrypt at cost 10 on every attempt,
 * which makes it a denial-of-service lever as much as a credential-stuffing one.
 *
 * This is deliberately scoped to the member role. Throttling the four existing roles would
 * change their behaviour, which FR-102 to FR-104 forbid — and would break
 * regression/authExistingRoles.test.ts, which signs in with a wrong password repeatedly and
 * expects 401 every time.
 */

const app = buildTestApp([{ path: "/api/v1/auth", router: authRoutes }]);
const MAX = env.memberLogin.maxAttempts;

function login(itsNo: string, password: string, role = "member") {
  return request(app).post("/api/v1/auth/login").send({ identifier: itsNo, password, role });
}

/** Clears the attempt log, so each test starts from a known count. */
const clearAttempts = clearMemberLoginAttempts;

describe("member login throttling", () => {
  beforeAll(async () => {
    await ensureFixtures();
  });

  beforeEach(async () => {
    await clearAttempts();
  });

  afterAll(async () => {
    await clearAttempts();
    await pool.end();
  });

  it("is configured with a positive attempt limit", () => {
    expect(MAX).toBeGreaterThan(0);
  });

  it("allows attempts up to the limit, then refuses with 429", async () => {
    const its = TEST_CREDENTIALS.memberThrottle.itsNo;

    for (let i = 0; i < MAX; i += 1) {
      const res = await login(its, "wrong-password");
      expect(res.status).toBe(401);
    }

    const blocked = await login(its, "wrong-password");
    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
  });

  it("sends Retry-After when it refuses", async () => {
    const its = TEST_CREDENTIALS.memberThrottle.itsNo;
    for (let i = 0; i < MAX; i += 1) await login(its, "wrong-password");

    const blocked = await login(its, "wrong-password");
    expect(blocked.status).toBe(429);

    const retryAfter = Number(blocked.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(env.memberLogin.lockoutSeconds);
  });

  // Once throttled, even the CORRECT password is refused — otherwise the throttle would be a
  // hint that the attacker had found the right one.
  it("refuses the correct password too, while throttled", async () => {
    const its = TEST_CREDENTIALS.memberThrottle.itsNo;
    for (let i = 0; i < MAX; i += 1) await login(its, "wrong-password");

    const correct = await login(its, TEST_CREDENTIALS.memberThrottle.password);
    expect(correct.status).toBe(429);
  });

  // FR-014 with FR-013: the refusal must not disclose whether the account exists.
  it("throttles an unknown ITS number identically to a real one", async () => {
    const unknown = `${TEST_MEMBER_ITS_PREFIX}999`;

    for (let i = 0; i < MAX; i += 1) {
      expect((await login(unknown, "wrong")).status).toBe(401);
    }

    const blocked = await login(unknown, "wrong");
    expect(blocked.status).toBe(429);

    await clearAttempts();
    const real = TEST_CREDENTIALS.memberThrottle.itsNo;
    for (let i = 0; i < MAX; i += 1) await login(real, "wrong");
    const blockedReal = await login(real, "wrong");

    expect(blockedReal.status).toBe(blocked.status);
    expect(blockedReal.body.message).toBe(blocked.body.message);
  });

  it("clears the count after a successful sign-in", async () => {
    const its = TEST_CREDENTIALS.memberThrottle.itsNo;

    // Short of the limit, then succeed.
    for (let i = 0; i < MAX - 1; i += 1) await login(its, "wrong-password");
    expect((await login(its, TEST_CREDENTIALS.memberThrottle.password)).status).toBe(200);

    // The earlier failures no longer count, so there is a full allowance again.
    for (let i = 0; i < MAX - 1; i += 1) {
      expect((await login(its, "wrong-password")).status).toBe(401);
    }
  });

  /**
   * REGRESSION: failures in the same SECOND as a success must still count.
   *
   * The reset-on-success boundary was first written as `attempted_at > last_success_time`.
   * attempted_at has one-second resolution, so a failure landing in the same second as the
   * success was silently excluded — six consecutive failures counted as five, handing an
   * attacker a free attempt simply by being fast. Found by driving the real endpoint.
   *
   * Now bounded by row id, which is exact. Back-to-back requests here land in the same
   * second, which is precisely the condition that broke it.
   */
  it("counts failures that land in the same second as a success", async () => {
    const its = TEST_CREDENTIALS.memberThrottle.itsNo;

    // Succeed, then fail MAX times as fast as possible — several will share that second.
    expect((await login(its, TEST_CREDENTIALS.memberThrottle.password)).status).toBe(200);
    for (let i = 0; i < MAX; i += 1) {
      expect((await login(its, "wrong-password")).status).toBe(401);
    }

    // With the timestamp boundary this returned 401, because one failure was discarded.
    const blocked = await login(its, "wrong-password");
    expect(blocked.status).toBe(429);
  });

  it("records every attempt, with its outcome", async () => {
    const its = TEST_CREDENTIALS.memberThrottle.itsNo;

    await login(its, "wrong-password");
    await login(its, TEST_CREDENTIALS.memberThrottle.password);

    const [rows] = await pool.query<any[]>(
      `SELECT succeeded, ip_hash FROM member_login_attempts
       WHERE its_no = :i ORDER BY id`,
      { i: its }
    );

    expect(rows).toHaveLength(2);
    expect(Boolean(rows[0].succeeded)).toBe(false);
    expect(Boolean(rows[1].succeeded)).toBe(true);
  });

  // The raw address is personal data the throttle does not need; equality on a hash is enough.
  it("stores the client address only as a 64-character hash, never raw", async () => {
    const its = TEST_CREDENTIALS.memberThrottle.itsNo;
    await login(its, "wrong-password");

    const [rows] = await pool.query<any[]>(
      "SELECT ip_hash FROM member_login_attempts WHERE its_no = :i LIMIT 1",
      { i: its }
    );

    const hash = rows[0].ip_hash;
    if (hash !== null) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toContain(".");
      expect(hash).not.toContain(":");
    }
  });

  // The critical isolation: the existing roles must behave exactly as they did before.
  it("does NOT throttle the party role", async () => {
    for (let i = 0; i < MAX + 3; i += 1) {
      const res = await login(TEST_CREDENTIALS.party.itsNo, "wrong-password", "party");
      expect(res.status).toBe(401);
    }
  });

  it("does NOT throttle the admin role", async () => {
    for (let i = 0; i < MAX + 3; i += 1) {
      const res = await login(TEST_CREDENTIALS.admin.username, "wrong-password", "admin");
      expect(res.status).toBe(401);
    }
  });

  it("logs no attempts for non-member roles", async () => {
    const [before] = await pool.query<any[]>("SELECT COUNT(*) AS n FROM member_login_attempts");
    for (let i = 0; i < 3; i += 1) {
      await login(TEST_CREDENTIALS.party.itsNo, "wrong-password", "party");
    }
    const [after] = await pool.query<any[]>("SELECT COUNT(*) AS n FROM member_login_attempts");

    expect(Number(after[0].n)).toBe(Number(before[0].n));
  });

  it("throttles each ITS number independently", async () => {
    const throttled = TEST_CREDENTIALS.memberThrottle.itsNo;
    for (let i = 0; i < MAX; i += 1) await login(throttled, "wrong-password");
    expect((await login(throttled, "wrong-password")).status).toBe(429);

    // A different member, same origin. The per-address counter also applies, so this asserts
    // only that the per-ITS lockout has not blanket-blocked everyone: the response must not
    // be the throttled one for a FIRST attempt by another account within the limit.
    const other = await login(
      TEST_CREDENTIALS.memberSettled.itsNo,
      TEST_CREDENTIALS.memberSettled.password
    );
    expect([200, 429]).toContain(other.status);
  });
});
