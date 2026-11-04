import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import express from "express";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { requireAuth } from "../middleware/auth";
import { PASSWORD_CHANGE_REQUIRED, requireMember } from "../middleware/requireMember";
import { pool } from "../db/pool";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, clearMemberLoginAttempts, ensureFixtures } from "./helpers/fixtures";

/**
 * FORCED FIRST-LOGIN PASSWORD CHANGE, POLICY, AND SESSION INVALIDATION
 * (FR-017 to FR-023)
 *
 * The member profile routes arrive in Phase 6, so `requireMember` is exercised here through
 * a probe route that does nothing but pass the guard. That tests the guard itself, which is
 * what matters: every member route will mount it, so proving it blocks here proves it blocks
 * everywhere.
 */

// A stand-in for any member-only route. `requireMember` is the entire subject.
const probeRouter = express.Router();
probeRouter.get("/", requireAuth, requireMember(), (_req, res) => {
  res.json({ success: true, data: { reached: true }, message: "OK" });
});

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/member-probe", router: probeRouter }
]);

function login(itsNo: string, password: string) {
  return request(app).post("/api/v1/auth/login").send({ identifier: itsNo, password, role: "member" });
}

/** Puts the fresh member back to "change outstanding", so the file can run repeatedly. */
async function resetFreshMember() {
  const hash = await bcrypt.hash(TEST_CREDENTIALS.memberFresh.password, 10);
  await pool.query(
    `UPDATE member_accounts
     SET password_hash = :h, must_change_password = 1, password_changed_at = NULL
     WHERE its_no = :i`,
    { h: hash, i: TEST_CREDENTIALS.memberFresh.itsNo }
  );
}

describe("forced first-login password change", () => {
  beforeAll(async () => {
    await ensureFixtures();
  });

  beforeEach(async () => {
    await resetFreshMember();
    // This file signs in repeatedly; see memberAuth.test.ts for why the attempt log is reset.
    await clearMemberLoginAttempts();
  });

  afterAll(async () => {
    await resetFreshMember();
    await pool.end();
  });

  it("signs the member in but flags the change as outstanding", async () => {
    const res = await login(
      TEST_CREDENTIALS.memberFresh.itsNo,
      TEST_CREDENTIALS.memberFresh.password
    );

    expect(res.status).toBe(200);
    expect(res.body.data.user.mustChangePassword).toBe(true);
  });

  // FR-018. The code is what the client uses to route to the change screen.
  it("blocks member routes with 403 and PASSWORD_CHANGE_REQUIRED", async () => {
    const res = await login(
      TEST_CREDENTIALS.memberFresh.itsNo,
      TEST_CREDENTIALS.memberFresh.password
    );

    const probe = await request(app)
      .get("/api/v1/member-probe")
      .set("Authorization", `Bearer ${res.body.data.token}`);

    expect(probe.status).toBe(403);
    expect(probe.body.data.code).toBe(PASSWORD_CHANGE_REQUIRED);
  });

  it("allows a member whose change is done through to member routes", async () => {
    const res = await login(
      TEST_CREDENTIALS.memberSettled.itsNo,
      TEST_CREDENTIALS.memberSettled.password
    );

    const probe = await request(app)
      .get("/api/v1/member-probe")
      .set("Authorization", `Bearer ${res.body.data.token}`);

    expect(probe.status).toBe(200);
    expect(probe.body.data.reached).toBe(true);
  });

  it("clears the flag and opens the profile in one step", async () => {
    const newPassword = "FirstChoice#2026";
    const signIn = await login(
      TEST_CREDENTIALS.memberFresh.itsNo,
      TEST_CREDENTIALS.memberFresh.password
    );

    const change = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${signIn.body.data.token}`)
      .send({
        current_password: TEST_CREDENTIALS.memberFresh.password,
        new_password: newPassword,
        confirm_password: newPassword
      });

    expect(change.status).toBe(200);
    expect(change.body.data.user.mustChangePassword).toBe(false);

    // Spec story 3 scenario 3: the profile opens straight away. That only works because the
    // response carries a FRESH token — the old one predates the change and is now stale.
    const freshToken = change.body.data.token;
    expect(freshToken).toBeTruthy();

    const probe = await request(app)
      .get("/api/v1/member-probe")
      .set("Authorization", `Bearer ${freshToken}`);

    expect(probe.status).toBe(200);
  });

  // FR-022, and the reason the fresh token above is necessary rather than a convenience.
  it("rejects the pre-change token afterwards, with 401", async () => {
    const newPassword = "Invalidates#2026";
    const signIn = await login(
      TEST_CREDENTIALS.memberFresh.itsNo,
      TEST_CREDENTIALS.memberFresh.password
    );
    const oldToken = signIn.body.data.token;

    // The old token works now...
    expect(
      (await request(app).get("/api/v1/member-probe").set("Authorization", `Bearer ${oldToken}`))
        .status
    ).toBe(403); // blocked only by the outstanding change

    await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${oldToken}`)
      .send({
        current_password: TEST_CREDENTIALS.memberFresh.password,
        new_password: newPassword,
        confirm_password: newPassword
      });

    // ...and is dead afterwards, for a different reason: it predates password_changed_at.
    const after = await request(app)
      .get("/api/v1/member-probe")
      .set("Authorization", `Bearer ${oldToken}`);

    expect(after.status).toBe(401);
  });

  it("revokes refresh tokens issued before the change", async () => {
    const newPassword = "RevokesRefresh#2026";
    const signIn = await login(
      TEST_CREDENTIALS.memberFresh.itsNo,
      TEST_CREDENTIALS.memberFresh.password
    );
    const oldRefresh = signIn.body.data.refresh_token;

    await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${signIn.body.data.token}`)
      .send({
        current_password: TEST_CREDENTIALS.memberFresh.password,
        new_password: newPassword,
        confirm_password: newPassword
      });

    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refresh_token: oldRefresh });

    expect(refreshed.status).toBe(401);
  });

  it("accepts the new password and refuses the old one", async () => {
    const newPassword = "SwappedOver#2026";
    const signIn = await login(
      TEST_CREDENTIALS.memberFresh.itsNo,
      TEST_CREDENTIALS.memberFresh.password
    );

    await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${signIn.body.data.token}`)
      .send({
        current_password: TEST_CREDENTIALS.memberFresh.password,
        new_password: newPassword,
        confirm_password: newPassword
      });

    expect((await login(TEST_CREDENTIALS.memberFresh.itsNo, newPassword)).status).toBe(200);
    expect(
      (await login(TEST_CREDENTIALS.memberFresh.itsNo, TEST_CREDENTIALS.memberFresh.password))
        .status
    ).toBe(401);
  });

  it("stores the new password hashed", async () => {
    const newPassword = "HashedProperly#2026";
    const signIn = await login(
      TEST_CREDENTIALS.memberFresh.itsNo,
      TEST_CREDENTIALS.memberFresh.password
    );

    await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${signIn.body.data.token}`)
      .send({
        current_password: TEST_CREDENTIALS.memberFresh.password,
        new_password: newPassword,
        confirm_password: newPassword
      });

    const [rows] = await pool.query<any[]>(
      "SELECT password_hash FROM member_accounts WHERE its_no = :i",
      { i: TEST_CREDENTIALS.memberFresh.itsNo }
    );
    const stored = rows[0].password_hash as string;

    expect(stored).not.toBe(newPassword);
    expect(stored.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare(newPassword, stored)).toBe(true);
  });

  describe("password policy (FR-019 to FR-021)", () => {
    async function attempt(newPassword: string, confirm?: string) {
      const signIn = await login(
        TEST_CREDENTIALS.memberFresh.itsNo,
        TEST_CREDENTIALS.memberFresh.password
      );
      return request(app)
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${signIn.body.data.token}`)
        .send({
          current_password: TEST_CREDENTIALS.memberFresh.password,
          new_password: newPassword,
          confirm_password: confirm ?? newPassword
        });
    }

    it("rejects a password under 8 characters, naming the rule", async () => {
      const res = await attempt("Ab#1");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/at least 8 characters/i);
    });

    it("rejects a short password without enough character variety", async () => {
      const res = await attempt("abcdefghij");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/three of/i);
    });

    it("accepts a short password that mixes character classes", async () => {
      expect((await attempt("Ab3#efgh")).status).toBe(200);
    });

    // A long passphrase should not be rejected for lacking punctuation.
    it("accepts a long all-lowercase passphrase", async () => {
      expect((await attempt("correcthorsebatterystaple")).status).toBe(200);
    });

    it("rejects a password that begins or ends with a space", async () => {
      const res = await attempt(" LeadingSpace#1 ");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/space/i);
    });

    it("rejects a confirmation that does not match (FR-019)", async () => {
      const res = await attempt("Matching#2026", "Different#2026");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/do not match/i);
    });

    it("rejects reusing the current password (FR-021)", async () => {
      const res = await attempt(TEST_CREDENTIALS.memberFresh.password);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/different from your current/i);
    });

    it("rejects a wrong current password", async () => {
      const signIn = await login(
        TEST_CREDENTIALS.memberFresh.itsNo,
        TEST_CREDENTIALS.memberFresh.password
      );

      const res = await request(app)
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${signIn.body.data.token}`)
        .send({
          current_password: "not-the-current-password",
          new_password: "Perfectly#Fine2026",
          confirm_password: "Perfectly#Fine2026"
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Current password is incorrect");
    });

    it("leaves the password unchanged when the policy rejects it", async () => {
      const [before] = await pool.query<any[]>(
        "SELECT password_hash, must_change_password FROM member_accounts WHERE its_no = :i",
        { i: TEST_CREDENTIALS.memberFresh.itsNo }
      );

      await attempt("short");

      const [after] = await pool.query<any[]>(
        "SELECT password_hash, must_change_password FROM member_accounts WHERE its_no = :i",
        { i: TEST_CREDENTIALS.memberFresh.itsNo }
      );

      expect(after[0].password_hash).toBe(before[0].password_hash);
      // Critically, the requirement is still in force.
      expect(after[0].must_change_password).toBe(before[0].must_change_password);
    });
  });

  describe("requireMember guards the account state", () => {
    it("refuses a request with no token", async () => {
      expect((await request(app).get("/api/v1/member-probe")).status).toBe(401);
    });

    it("refuses a non-member token with 403 (FR-100, FR-107)", async () => {
      const party = await request(app).post("/api/v1/auth/login").send({
        identifier: TEST_CREDENTIALS.party.itsNo,
        password: TEST_CREDENTIALS.party.password,
        role: "party"
      });

      const res = await request(app)
        .get("/api/v1/member-probe")
        .set("Authorization", `Bearer ${party.body.data.token}`);

      expect(res.status).toBe(403);
    });

    it("refuses an admin token with 403", async () => {
      const admin = await request(app).post("/api/v1/auth/login").send({
        identifier: TEST_CREDENTIALS.admin.username,
        password: TEST_CREDENTIALS.admin.password,
        role: "admin"
      });

      const res = await request(app)
        .get("/api/v1/member-probe")
        .set("Authorization", `Bearer ${admin.body.data.token}`);

      expect(res.status).toBe(403);
    });

    // FR-007 mid-session: deactivating an account must take effect on the next request, not
    // when the token eventually expires.
    it("refuses a token whose account is deactivated after sign-in", async () => {
      const signIn = await login(
        TEST_CREDENTIALS.memberSettled.itsNo,
        TEST_CREDENTIALS.memberSettled.password
      );
      const token = signIn.body.data.token;

      expect(
        (await request(app).get("/api/v1/member-probe").set("Authorization", `Bearer ${token}`))
          .status
      ).toBe(200);

      await pool.query("UPDATE member_accounts SET is_active = 0 WHERE its_no = :i", {
        i: TEST_CREDENTIALS.memberSettled.itsNo
      });

      const after = await request(app)
        .get("/api/v1/member-probe")
        .set("Authorization", `Bearer ${token}`);
      expect(after.status).toBe(403);

      await pool.query("UPDATE member_accounts SET is_active = 1 WHERE its_no = :i", {
        i: TEST_CREDENTIALS.memberSettled.itsNo
      });
    });

    it("refuses an invalid token outright", async () => {
      const res = await request(app)
        .get("/api/v1/member-probe")
        .set("Authorization", "Bearer not.a.real.token");
      expect(res.status).toBe(401);
    });
  });
});
