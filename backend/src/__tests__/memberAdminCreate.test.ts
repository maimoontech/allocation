import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { memberAdminRoutes } from "../routes/memberAdminRoutes";
import { pool } from "../db/pool";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, ensureFixtures } from "./helpers/fixtures";

/**
 * CREATING ONE MEMBER ACCOUNT, AND THE ZONAL HEAD SCOPE (FR-004, FR-005, FR-015, FR-020)
 *
 * Admin and Zonal Head both create accounts from the same three fields — ITS number, full
 * name, password. What differs is what they can then SEE: an administrator sees every
 * account, a Zonal Head only those whose profile places them in that zone.
 *
 * The consequence worth pinning is the awkward one. An account this route creates has no
 * profile, so it is in no zone, so the Zonal Head who created it cannot see it. That is the
 * accepted cost of recording no zone at creation; a test states it out loud, so that if
 * someone later makes creation set a zone, this fails and is rewritten deliberately rather
 * than drifting.
 *
 * A separate file from memberAdmin.test.ts because that file closes the shared pool in its
 * own afterAll, and each file owns its pool lifecycle here.
 */

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/members", router: memberAdminRoutes }
]);

async function tokenFor(identifier: string, password: string, role: string) {
  const res = await request(app).post("/api/v1/auth/login").send({ identifier, password, role });
  return res.body.data?.token as string;
}

/** The account each creation test makes and removes again. */
const NEW_ITS = "99900197";
/** A member posted INTO the fixture zone, so the Zonal Head has something in scope. */
const IN_ZONE_ITS = "99900198";
/** A member with no profile at all, so it can be in no zone. */
const NO_ZONE_ITS = "99900199";

const VALID_PASSWORD = "Tanzeem#2026";

describe("creating a member account", () => {
  let adminToken: string;
  let zonalToken: string;

  async function removeCreated() {
    await pool.query("DELETE FROM member_accounts WHERE its_no = :i", { i: NEW_ITS });
  }

  beforeAll(async () => {
    await ensureFixtures();

    adminToken = await tokenFor(
      TEST_CREDENTIALS.admin.username,
      TEST_CREDENTIALS.admin.password,
      "admin"
    );
    zonalToken = await tokenFor(
      TEST_CREDENTIALS.zone.name,
      TEST_CREDENTIALS.zone.password,
      "zonal_head"
    );
  });

  beforeEach(removeCreated);

  afterAll(removeCreated);

  it("creates an account from an ITS number, a full name and a password", async () => {
    const res = await request(app)
      .post("/api/v1/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ its_no: NEW_ITS, member_name: "__TEST_CREATED__", password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.its_no).toBe(NEW_ITS);
    expect(res.body.data.must_change_password).toBe(true);

    const [rows] = await pool.query<any[]>(
      `SELECT member_name, must_change_password, password_changed_at, is_active
       FROM member_accounts WHERE its_no = :i`,
      { i: NEW_ITS }
    );
    expect(rows[0].member_name).toBe("__TEST_CREATED__");
    // FR-004 and FR-005: a provisioned password is one-time, and "never changed by the
    // member" is recorded as a NULL stamp rather than inferred later.
    expect(Number(rows[0].must_change_password)).toBe(1);
    expect(rows[0].password_changed_at).toBeNull();
    expect(Number(rows[0].is_active)).toBe(1);
  });

  it("never returns password material", async () => {
    const res = await request(app)
      .post("/api/v1/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ its_no: NEW_ITS, member_name: "__TEST_CREATED__", password: VALID_PASSWORD });

    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain(VALID_PASSWORD);
    expect(serialised).not.toContain("password_hash");
    expect(serialised).not.toContain("$2a$");
    expect(serialised).not.toContain("$2b$");
  });

  it("stores the password as a bcrypt hash the member can sign in with", async () => {
    await request(app)
      .post("/api/v1/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ its_no: NEW_ITS, member_name: "__TEST_CREATED__", password: VALID_PASSWORD });

    const [rows] = await pool.query<any[]>(
      "SELECT password_hash FROM member_accounts WHERE its_no = :i",
      { i: NEW_ITS }
    );
    expect(rows[0].password_hash).not.toBe(VALID_PASSWORD);
    expect(String(rows[0].password_hash).startsWith("$2")).toBe(true);

    // The real proof is end to end: the credential actually signs in.
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: NEW_ITS, password: VALID_PASSWORD, role: "member" });
    expect(login.status).toBe(200);
  });

  it("lets a Zonal Head create one too", async () => {
    const res = await request(app)
      .post("/api/v1/members")
      .set("Authorization", `Bearer ${zonalToken}`)
      .send({ its_no: NEW_ITS, member_name: "__TEST_CREATED__", password: VALID_PASSWORD });

    expect(res.status).toBe(200);
  });

  it("refuses a party and an unauthenticated caller", async () => {
    const partyToken = await tokenFor(
      TEST_CREDENTIALS.party.itsNo,
      TEST_CREDENTIALS.party.password,
      "party"
    );

    expect(
      (
        await request(app)
          .post("/api/v1/members")
          .set("Authorization", `Bearer ${partyToken}`)
          .send({ its_no: NEW_ITS, member_name: "x", password: VALID_PASSWORD })
      ).status
    ).toBe(403);

    expect(
      (
        await request(app)
          .post("/api/v1/members")
          .send({ its_no: NEW_ITS, member_name: "x", password: VALID_PASSWORD })
      ).status
    ).toBe(401);
  });

  it("rejects an ITS number that is not 6 to 20 digits", async () => {
    for (const its of ["12345", "12ab567", "", "   ", "1".repeat(21)]) {
      const res = await request(app)
        .post("/api/v1/members")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ its_no: its, member_name: "__TEST_CREATED__", password: VALID_PASSWORD });
      expect(res.status).toBe(400);
    }
  });

  it("requires a full name", async () => {
    const res = await request(app)
      .post("/api/v1/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ its_no: NEW_ITS, member_name: "   ", password: VALID_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/full name/i);
  });

  it("applies the member password policy, naming the rule that failed", async () => {
    const tooShort = await request(app)
      .post("/api/v1/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ its_no: NEW_ITS, member_name: "__TEST_CREATED__", password: "short" });

    expect(tooShort.status).toBe(400);
    expect(tooShort.body.message).toMatch(/8 characters/i);

    // Long enough, but all digits — so under 12 characters it is not mixed enough.
    const weak = await request(app)
      .post("/api/v1/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ its_no: NEW_ITS, member_name: "__TEST_CREATED__", password: "12345678" });

    expect(weak.status).toBe(400);
    expect(weak.body.message).toMatch(/three of/i);
  });

  it("refuses a duplicate ITS number with 409, naming the number", async () => {
    await request(app)
      .post("/api/v1/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ its_no: NEW_ITS, member_name: "__TEST_CREATED__", password: VALID_PASSWORD });

    const again = await request(app)
      .post("/api/v1/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ its_no: NEW_ITS, member_name: "__TEST_AGAIN__", password: VALID_PASSWORD });

    expect(again.status).toBe(409);
    expect(again.body.message).toContain(NEW_ITS);

    // The first account must be untouched: a refused duplicate is not a silent update.
    const [rows] = await pool.query<any[]>(
      "SELECT member_name FROM member_accounts WHERE its_no = :i",
      { i: NEW_ITS }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].member_name).toBe("__TEST_CREATED__");
  });

  it("creates no profile row, so the account is in no zone", async () => {
    await request(app)
      .post("/api/v1/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ its_no: NEW_ITS, member_name: "__TEST_CREATED__", password: VALID_PASSWORD });

    const [rows] = await pool.query<any[]>(
      `SELECT COUNT(*) AS n
       FROM member_profiles mp
       JOIN member_accounts ma ON ma.id = mp.member_account_id
       WHERE ma.its_no = :i`,
      { i: NEW_ITS }
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it("hides the account it just created from the Zonal Head who created it", async () => {
    await request(app)
      .post("/api/v1/members")
      .set("Authorization", `Bearer ${zonalToken}`)
      .send({ its_no: NEW_ITS, member_name: "__TEST_CREATED__", password: VALID_PASSWORD });

    // Accepted, documented behaviour rather than an oversight: with no profile there is no
    // zone to scope by, and showing zone-less accounts to every Zonal Head would leak one
    // zone's new members into another's list.
    const zonal = await request(app)
      .get(`/api/v1/members?q=${NEW_ITS}`)
      .set("Authorization", `Bearer ${zonalToken}`);
    expect(zonal.status).toBe(200);
    expect(zonal.body.data.items.map((m: any) => m.its_no)).not.toContain(NEW_ITS);

    // The administrator does see it, which proves the account is real.
    const admin = await request(app)
      .get(`/api/v1/members?q=${NEW_ITS}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(admin.body.data.items.map((m: any) => m.its_no)).toContain(NEW_ITS);
  });
});

/**
 * ZONE SCOPING OF THE LIST AND THE ACTIVE TOGGLE
 *
 * Two accounts of this file's own making: one with a profile in the fixture zone, one with
 * no profile at all. One is in scope for the Zonal Head and the other cannot be, which is
 * what makes the pair worth having.
 */
describe("zonal head scoping of member administration", () => {
  let adminToken: string;
  let zonalToken: string;
  let inZoneId: number;
  let noZoneId: number;

  async function removeOwn() {
    await pool.query("DELETE FROM member_accounts WHERE its_no IN (:a, :b)", {
      a: IN_ZONE_ITS,
      b: NO_ZONE_ITS
    });
  }

  beforeAll(async () => {
    const fixtures = await ensureFixtures();
    await removeOwn();

    const [inZone] = await pool.query<any>(
      `INSERT INTO member_accounts (its_no, member_name, password_hash, must_change_password, is_active)
       VALUES (:i, '__TEST_IN_ZONE__', 'not-used', 0, 1)`,
      { i: IN_ZONE_ITS }
    );
    inZoneId = Number(inZone.insertId);
    await pool.query(
      `INSERT INTO member_profiles (member_account_id, name, surname, zone_id, party_id)
       VALUES (:id, '__TEST_IN_ZONE__', 'Posted', :zoneId, :partyId)`,
      { id: inZoneId, zoneId: fixtures.zoneId, partyId: fixtures.partyId }
    );

    const [noZone] = await pool.query<any>(
      `INSERT INTO member_accounts (its_no, member_name, password_hash, must_change_password, is_active)
       VALUES (:i, '__TEST_NO_ZONE__', 'not-used', 0, 1)`,
      { i: NO_ZONE_ITS }
    );
    noZoneId = Number(noZone.insertId);

    adminToken = await tokenFor(
      TEST_CREDENTIALS.admin.username,
      TEST_CREDENTIALS.admin.password,
      "admin"
    );
    zonalToken = await tokenFor(
      TEST_CREDENTIALS.zone.name,
      TEST_CREDENTIALS.zone.password,
      "zonal_head"
    );
  });

  beforeEach(async () => {
    // Some tests below toggle these, so put them back.
    await pool.query("UPDATE member_accounts SET is_active = 1 WHERE id IN (:a, :b)", {
      a: inZoneId,
      b: noZoneId
    });
  });

  afterAll(async () => {
    // member_profiles cascades from the account, so one delete is enough.
    await removeOwn();
    await pool.end();
  });

  it("shows a Zonal Head the member posted to their zone", async () => {
    const res = await request(app)
      .get(`/api/v1/members?q=${IN_ZONE_ITS}`)
      .set("Authorization", `Bearer ${zonalToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((m: any) => m.id)).toContain(inZoneId);
  });

  it("hides a member with no profile from a Zonal Head but not from an administrator", async () => {
    const zonal = await request(app)
      .get(`/api/v1/members?q=${NO_ZONE_ITS}`)
      .set("Authorization", `Bearer ${zonalToken}`);
    const admin = await request(app)
      .get(`/api/v1/members?q=${NO_ZONE_ITS}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(zonal.body.data.items.map((m: any) => m.id)).not.toContain(noZoneId);
    expect(admin.body.data.items.map((m: any) => m.id)).toContain(noZoneId);
  });

  it("lets a Zonal Head deactivate a member in their own zone", async () => {
    const res = await request(app)
      .patch(`/api/v1/members/${inZoneId}`)
      .set("Authorization", `Bearer ${zonalToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(200);

    const [rows] = await pool.query<any[]>(
      "SELECT is_active FROM member_accounts WHERE id = :id",
      { id: inZoneId }
    );
    expect(Number(rows[0].is_active)).toBe(0);
  });

  it("refuses a Zonal Head a member outside their zone, without writing", async () => {
    const res = await request(app)
      .patch(`/api/v1/members/${noZoneId}`)
      .set("Authorization", `Bearer ${zonalToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(403);

    // The refusal must happen BEFORE the update, not after it.
    const [after] = await pool.query<any[]>(
      "SELECT is_active FROM member_accounts WHERE id = :id",
      { id: noZoneId }
    );
    expect(Number(after[0].is_active)).toBe(1);
  });

  it("still lets an administrator deactivate a member with no zone", async () => {
    const res = await request(app)
      .patch(`/api/v1/members/${noZoneId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(200);
  });
});
