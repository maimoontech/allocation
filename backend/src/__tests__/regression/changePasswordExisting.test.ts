import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { authRoutes } from "../../routes/authRoutes";
import { pool } from "../../db/pool";
import { buildTestApp } from "../helpers/testApp";
import { TEST_CREDENTIALS, ensureFixtures } from "../helpers/fixtures";

/**
 * REGRESSION BASELINE — EXISTING CHANGE-PASSWORD BEHAVIOUR (FR-104)
 *
 * `POST /auth/change-password` is guarded for ["zonal_head", "party", "coordinator"] and
 * dispatches through `tableForSelfServiceRole()`, which returns "venues" as its DEFAULT —
 * the same fallthrough shape as `authenticate()`.
 *
 * The member branch has to be added to both the guard and the service. These tests pin what
 * the existing three roles do first, including the behaviours that are weaker than the
 * membership module will require: there is no password policy today, and changing a password
 * does not revoke existing sessions. Both are recorded deliberately, so that when the module
 * adds them it is visible whether existing roles were affected too.
 */

const app = buildTestApp([{ path: "/api/v1/auth", router: authRoutes }]);

async function loginAsParty(password: string) {
  const res = await request(app).post("/api/v1/auth/login").send({
    identifier: TEST_CREDENTIALS.party.itsNo,
    password,
    role: "party"
  });
  return res;
}

/** Puts the party password back, so the file can run repeatedly. */
async function resetPartyPassword() {
  const hash = await bcrypt.hash(TEST_CREDENTIALS.party.password, 10);
  await pool.query("UPDATE parties SET password_hash = :h WHERE its_no = :i", {
    h: hash,
    i: TEST_CREDENTIALS.party.itsNo
  });
}

describe("REGRESSION: change password for existing roles", () => {
  beforeAll(async () => {
    await ensureFixtures();
  });

  afterAll(async () => {
    await resetPartyPassword();
    await pool.end();
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .send({ current_password: "a", new_password: "b" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Unauthorized");
  });

  it("rejects a malformed request with 400", async () => {
    const login = await loginAsParty(TEST_CREDENTIALS.party.password);
    const token = login.body.data.token;

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ current_password: "only-this" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request");
  });

  it("rejects a wrong current password with 400 and a specific message", async () => {
    const login = await loginAsParty(TEST_CREDENTIALS.party.password);
    const token = login.body.data.token;

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ current_password: "not-my-password", new_password: "Whatever#2026" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Current password is incorrect");
  });

  it("changes a party password, after which the old one fails and the new one works", async () => {
    const newPassword = "PartyChanged#2026";

    const login = await loginAsParty(TEST_CREDENTIALS.party.password);
    const token = login.body.data.token;

    const change = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ current_password: TEST_CREDENTIALS.party.password, new_password: newPassword });

    expect(change.status).toBe(200);
    expect(change.body.message).toBe("Password changed");

    expect((await loginAsParty(TEST_CREDENTIALS.party.password)).status).toBe(401);
    expect((await loginAsParty(newPassword)).status).toBe(200);

    await resetPartyPassword();
  });

  it("stores the new password hashed, never in plain text", async () => {
    const newPassword = "PartyHashCheck#2026";

    const login = await loginAsParty(TEST_CREDENTIALS.party.password);
    await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${login.body.data.token}`)
      .send({ current_password: TEST_CREDENTIALS.party.password, new_password: newPassword });

    const [rows] = await pool.query<any[]>(
      "SELECT password_hash FROM parties WHERE its_no = :i",
      { i: TEST_CREDENTIALS.party.itsNo }
    );
    const stored = rows[0].password_hash as string;

    expect(stored).not.toBe(newPassword);
    expect(stored.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare(newPassword, stored)).toBe(true);

    await resetPartyPassword();
  });

  // Recorded as current behaviour, not as a good idea. The membership module requires a
  // policy (FR-020) and session invalidation (FR-022); existing roles have neither, and this
  // test makes it obvious if adding them changes the existing roles by accident.
  it("CURRENT BEHAVIOUR: accepts a trivially weak new password", async () => {
    const login = await loginAsParty(TEST_CREDENTIALS.party.password);

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${login.body.data.token}`)
      .send({ current_password: TEST_CREDENTIALS.party.password, new_password: "a" });

    expect(res.status).toBe(200);

    await resetPartyPassword();
  });

  it("CURRENT BEHAVIOUR: a token issued before the change still works afterwards", async () => {
    const newPassword = "PartyStillValid#2026";
    const login = await loginAsParty(TEST_CREDENTIALS.party.password);
    const token = login.body.data.token;

    await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ current_password: TEST_CREDENTIALS.party.password, new_password: newPassword });

    // The same token is still accepted — nothing revokes it.
    const reuse = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ current_password: newPassword, new_password: TEST_CREDENTIALS.party.password });

    expect(reuse.status).toBe(200);

    await resetPartyPassword();
  });

  // Admin is deliberately absent from the role guard, so an admin token must be refused.
  it("refuses the admin role with 403", async () => {
    const login = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.admin.username,
      password: TEST_CREDENTIALS.admin.password,
      role: "admin"
    });

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${login.body.data.token}`)
      .send({ current_password: TEST_CREDENTIALS.admin.password, new_password: "Whatever#2026" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Forbidden");
  });

  // The target row comes from the token, never from the request body, so there is no way to
  // change someone else's password.
  it("ignores any identifier in the body and changes only the caller's own password", async () => {
    const newPassword = "OnlyMine#2026";
    const login = await loginAsParty(TEST_CREDENTIALS.party.password);

    const [before] = await pool.query<any[]>(
      "SELECT password_hash FROM parties WHERE its_no <> :i ORDER BY id LIMIT 1",
      { i: TEST_CREDENTIALS.party.itsNo }
    );

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${login.body.data.token}`)
      .send({
        current_password: TEST_CREDENTIALS.party.password,
        new_password: newPassword,
        identifier: "30100001",
        id: 1,
        its_no: "30100001"
      });

    expect(res.status).toBe(200);

    const [after] = await pool.query<any[]>(
      "SELECT password_hash FROM parties WHERE its_no <> :i ORDER BY id LIMIT 1",
      { i: TEST_CREDENTIALS.party.itsNo }
    );
    expect(after[0].password_hash).toBe(before[0].password_hash);

    await resetPartyPassword();
  });
});
