import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { memberAdminRoutes } from "../routes/memberAdminRoutes";
import { requireAuth } from "../middleware/auth";
import { requireMember } from "../middleware/requireMember";
import { pool } from "../db/pool";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, clearMemberLoginAttempts, ensureFixtures } from "./helpers/fixtures";

/**
 * ADMIN MEMBER LIST AND ACTIVE TOGGLE (FR-006, FR-007, FR-101)
 */

// A stand-in for a member-only route, used to prove that deactivating an account takes
// effect on the very next request rather than when the token eventually expires.
const probeRouter = express.Router();
probeRouter.get("/", requireAuth, requireMember(), (_req, res) => {
  res.json({ success: true, data: { reached: true }, message: "OK" });
});

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/members", router: memberAdminRoutes },
  { path: "/api/v1/member-probe", router: probeRouter }
]);

async function tokenFor(identifier: string, password: string, role: string) {
  const res = await request(app).post("/api/v1/auth/login").send({ identifier, password, role });
  return res.body.data?.token as string;
}

// A member of its own, posted to the test zone and party, so the list's zone/party JOINs are
// exercised without mutating the shared fixture accounts other test files read.
const POSTED_ITS = "99900196";

describe("admin member administration", () => {
  let adminToken: string;
  let settledId: number;
  let inactiveId: number;
  let postedId: number;
  let zoneName: string;
  let partyName: string;

  beforeAll(async () => {
    const fixtures = await ensureFixtures();
    settledId = fixtures.memberSettledId;
    inactiveId = fixtures.memberInactiveId;
    zoneName = TEST_CREDENTIALS.zone.name;
    partyName = TEST_CREDENTIALS.party.name;

    await pool.query("DELETE FROM member_accounts WHERE its_no = :i", { i: POSTED_ITS });
    const [inserted] = await pool.query<any>(
      `INSERT INTO member_accounts (its_no, member_name, password_hash, must_change_password, is_active)
       VALUES (:i, '__TEST_POSTED__', 'not-used', 0, 1)`,
      { i: POSTED_ITS }
    );
    postedId = Number(inserted.insertId);
    await pool.query(
      `INSERT INTO member_profiles (member_account_id, name, surname, zone_id, party_id)
       VALUES (:id, '__TEST_POSTED__', 'Posted', :zoneId, :partyId)`,
      { id: postedId, zoneId: fixtures.zoneId, partyId: fixtures.partyId }
    );
    adminToken = await tokenFor(
      TEST_CREDENTIALS.admin.username,
      TEST_CREDENTIALS.admin.password,
      "admin"
    );
  });

  beforeEach(async () => {
    await clearMemberLoginAttempts();
    // Put the fixture states back, since some tests below toggle them.
    await pool.query("UPDATE member_accounts SET is_active = 1 WHERE id = :id", { id: settledId });
    await pool.query("UPDATE member_accounts SET is_active = 0 WHERE id = :id", { id: inactiveId });
  });

  afterAll(async () => {
    await pool.query("UPDATE member_accounts SET is_active = 1 WHERE id = :id", { id: settledId });
    // member_profiles cascades from the account, so one delete is enough.
    await pool.query("DELETE FROM member_accounts WHERE its_no = :i", { i: POSTED_ITS });
    await clearMemberLoginAttempts();
    await pool.end();
  });

  describe("GET /members", () => {
    it("lists accounts with their state", async () => {
      const res = await request(app)
        .get("/api/v1/members")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(typeof res.body.data.total).toBe("number");

      const settled = res.body.data.items.find((m: any) => m.id === settledId);
      expect(settled).toBeDefined();
      expect(settled.its_no).toBe(TEST_CREDENTIALS.memberSettled.itsNo);
      expect(settled.is_active).toBe(true);
      expect(settled.must_change_password).toBe(false);
      expect(typeof settled.has_profile).toBe("boolean");
    });

    // The list carries the identifying details the admin screen displays, and nothing
    // beyond them: no health values, no free-text profile answers, no photo bytes.
    it("returns identifying details but no health fields or photo bytes", async () => {
      const res = await request(app)
        .get("/api/v1/members")
        .set("Authorization", `Bearer ${adminToken}`);

      const item = res.body.data.items.find((m: any) => m.id === settledId);
      expect(item).toBeDefined();
      for (const present of [
        "its_no",
        "first_prefix",
        "name",
        "father_name",
        "surname",
        "whatsapp_no_1",
        "mobile_no_1",
        "zone_name",
        "party_name",
        "has_photo",
        "is_active",
        "last_login_at"
      ]) {
        expect(item).toHaveProperty(present);
      }

      const keys = Object.keys(item);
      for (const forbidden of [
        "email",
        "residence_address",
        "blood_group",
        "height_cm",
        "weight_kg",
        "bmi",
        "photo",
        "image_data"
      ]) {
        expect(keys).not.toContain(forbidden);
      }
    });

    // FR-047, FR-048: the zone and party a member is posted to are resolved to their names,
    // because the admin list shows them as text. Both are nullable FKs, so an unposted member
    // must come back as null rather than failing the join.
    it("resolves the zone and party a member is posted to", async () => {
      const res = await request(app)
        .get(`/api/v1/members?q=${POSTED_ITS}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const posted = res.body.data.items.find((m: any) => m.id === postedId);
      expect(posted).toBeDefined();
      expect(posted.zone_name).toBe(zoneName);
      expect(posted.party_name).toBe(partyName);
    });

    it("returns a null zone and party for a member with no profile", async () => {
      const res = await request(app)
        .get("/api/v1/members")
        .set("Authorization", `Bearer ${adminToken}`);

      const item = res.body.data.items.find((m: any) => m.id === inactiveId);
      expect(item).toBeDefined();
      expect(item.has_profile).toBe(false);
      expect(item.zone_name).toBeNull();
      expect(item.party_name).toBeNull();
    });

    // FR-015: no password material, in any form.
    it("never returns a password hash", async () => {
      const res = await request(app)
        .get("/api/v1/members")
        .set("Authorization", `Bearer ${adminToken}`);

      const body = JSON.stringify(res.body);
      expect(body).not.toContain("password_hash");
      expect(body).not.toContain("$2b$");
      expect(body).not.toContain("$2a$");
    });

    it("filters by ITS number", async () => {
      const res = await request(app)
        .get(`/api/v1/members?q=${TEST_CREDENTIALS.memberSettled.itsNo}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].its_no).toBe(TEST_CREDENTIALS.memberSettled.itsNo);
    });

    it("filters by roster name", async () => {
      const res = await request(app)
        .get("/api/v1/members?q=__TEST_MEMBER_SETTLED__")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(
        res.body.data.items.every((m: any) => String(m.member_name).includes("__TEST_MEMBER"))
      ).toBe(true);
    });

    it("filters by active state", async () => {
      const inactive = await request(app)
        .get("/api/v1/members?is_active=false")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(inactive.body.data.items.every((m: any) => m.is_active === false)).toBe(true);
      expect(inactive.body.data.items.some((m: any) => m.id === inactiveId)).toBe(true);

      const active = await request(app)
        .get("/api/v1/members?is_active=true")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(active.body.data.items.every((m: any) => m.is_active === true)).toBe(true);
      expect(active.body.data.items.some((m: any) => m.id === inactiveId)).toBe(false);
    });

    it("paginates, and reports the unpaginated total", async () => {
      const res = await request(app)
        .get("/api/v1/members?page=1&page_size=1")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.page_size).toBe(1);
      expect(res.body.data.total).toBeGreaterThan(1);
    });

    it("caps an excessive page size rather than honouring it", async () => {
      const res = await request(app)
        .get("/api/v1/members?page_size=100000")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.body.data.page_size).toBeLessThanOrEqual(200);
    });

    it("tolerates nonsense paging parameters", async () => {
      const res = await request(app)
        .get("/api/v1/members?page=-5&page_size=abc")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.page).toBeGreaterThanOrEqual(1);
    });
  });

  describe("GET /members/:id/photo", () => {
    it("says No photo set when the member has none", async () => {
      const res = await request(app)
        .get(`/api/v1/members/${settledId}/photo`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("No photo set");
    });

    it("serves the current photograph to an administrator", async () => {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      );
      await pool.query(
        `INSERT INTO member_photos
           (member_account_id, content_type, byte_size, width, height, sha256, image_data, approval_status)
         VALUES (:id, 'image/png', :size, 1, 1, 'fixture-admin-photo', :data, 'pending')`,
        { id: settledId, size: png.length, data: png }
      );

      try {
        const res = await request(app)
          .get(`/api/v1/members/${settledId}/photo`)
          .set("Authorization", `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toBe("image/png");
        expect(Buffer.from(res.body).equals(png)).toBe(true);

        const listed = await request(app)
          .get(`/api/v1/members?q=${TEST_CREDENTIALS.memberSettled.itsNo}`)
          .set("Authorization", `Bearer ${adminToken}`);
        expect(listed.body.data.items[0].has_photo).toBe(true);
      } finally {
        await pool.query("DELETE FROM member_photos WHERE member_account_id = :id", {
          id: settledId
        });
      }
    });

    it("refuses non-administrators", async () => {
      const memberToken = await tokenFor(
        TEST_CREDENTIALS.memberSettled.itsNo,
        TEST_CREDENTIALS.memberSettled.password,
        "member"
      );

      const asMember = await request(app)
        .get(`/api/v1/members/${settledId}/photo`)
        .set("Authorization", `Bearer ${memberToken}`);
      const anonymous = await request(app).get(`/api/v1/members/${settledId}/photo`);

      expect(asMember.status).toBe(403);
      expect(anonymous.status).toBe(401);
    });
  });

  describe("PATCH /members/:id", () => {
    it("deactivates an account", async () => {
      const res = await request(app)
        .patch(`/api/v1/members/${settledId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ is_active: false });

      expect(res.status).toBe(200);
      expect(res.body.data.is_active).toBe(false);

      const [rows] = await pool.query<any[]>(
        "SELECT is_active FROM member_accounts WHERE id = :id",
        { id: settledId }
      );
      expect(Boolean(rows[0].is_active)).toBe(false);
    });

    it("reactivates an account", async () => {
      const res = await request(app)
        .patch(`/api/v1/members/${inactiveId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ is_active: true });

      expect(res.status).toBe(200);
      expect(res.body.data.is_active).toBe(true);
    });

    // FR-007. The member's profile row must survive, because withdrawing an account is not
    // the same as erasing a person's record.
    it("retains the profile when deactivating", async () => {
      const [before] = await pool.query<any[]>(
        "SELECT COUNT(*) AS n FROM member_profiles WHERE member_account_id = :id",
        { id: settledId }
      );

      await request(app)
        .patch(`/api/v1/members/${settledId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ is_active: false });

      const [after] = await pool.query<any[]>(
        "SELECT COUNT(*) AS n FROM member_profiles WHERE member_account_id = :id",
        { id: settledId }
      );
      expect(Number(after[0].n)).toBe(Number(before[0].n));
    });

    // Deactivation must bite immediately, not when the token expires. requireMember reads
    // is_active on every request, which is what makes that true.
    it("takes effect on an already-open session's next request", async () => {
      const memberToken = await tokenFor(
        TEST_CREDENTIALS.memberSettled.itsNo,
        TEST_CREDENTIALS.memberSettled.password,
        "member"
      );

      expect(
        (
          await request(app)
            .get("/api/v1/member-probe")
            .set("Authorization", `Bearer ${memberToken}`)
        ).status
      ).toBe(200);

      await request(app)
        .patch(`/api/v1/members/${settledId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ is_active: false });

      expect(
        (
          await request(app)
            .get("/api/v1/member-probe")
            .set("Authorization", `Bearer ${memberToken}`)
        ).status
      ).toBe(403);
    });

    it("rejects a body without is_active", async () => {
      const res = await request(app)
        .patch(`/api/v1/members/${settledId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("rejects a non-boolean is_active", async () => {
      const res = await request(app)
        .patch(`/api/v1/members/${settledId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ is_active: "yes" });
      expect(res.status).toBe(400);
    });

    it("returns 404 for an unknown id", async () => {
      const res = await request(app)
        .patch("/api/v1/members/99999999")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ is_active: false });
      expect(res.status).toBe(404);
    });

    it("rejects a non-numeric id", async () => {
      const res = await request(app)
        .patch("/api/v1/members/not-a-number")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ is_active: false });
      expect(res.status).toBe(400);
    });

    // Passwords are settable only through the import path, so there is exactly one place
    // that hashes them (FR-015).
    it("ignores an attempt to set a password", async () => {
      const [before] = await pool.query<any[]>(
        "SELECT password_hash FROM member_accounts WHERE id = :id",
        { id: settledId }
      );

      await request(app)
        .patch(`/api/v1/members/${settledId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ is_active: true, password: "Injected#2026", password_hash: "nope" });

      const [after] = await pool.query<any[]>(
        "SELECT password_hash FROM member_accounts WHERE id = :id",
        { id: settledId }
      );
      expect(after[0].password_hash).toBe(before[0].password_hash);
    });

    it("ignores an attempt to clear the forced password change", async () => {
      const [before] = await pool.query<any[]>(
        "SELECT must_change_password FROM member_accounts WHERE its_no = :i",
        { i: TEST_CREDENTIALS.memberFresh.itsNo }
      );
      const [idRows] = await pool.query<any[]>(
        "SELECT id FROM member_accounts WHERE its_no = :i",
        { i: TEST_CREDENTIALS.memberFresh.itsNo }
      );

      await request(app)
        .patch(`/api/v1/members/${idRows[0].id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ is_active: true, must_change_password: false });

      const [after] = await pool.query<any[]>(
        "SELECT must_change_password FROM member_accounts WHERE its_no = :i",
        { i: TEST_CREDENTIALS.memberFresh.itsNo }
      );
      expect(after[0].must_change_password).toBe(before[0].must_change_password);
    });
  });

  // FR-006: administrators only.
  describe("access control", () => {
    it("refuses an unauthenticated request", async () => {
      expect((await request(app).get("/api/v1/members")).status).toBe(401);
    });

    it.each([
      ["party", TEST_CREDENTIALS.party.itsNo, TEST_CREDENTIALS.party.password],
      ["zonal_head", TEST_CREDENTIALS.zone.name, TEST_CREDENTIALS.zone.password],
      ["coordinator", TEST_CREDENTIALS.venue.name, TEST_CREDENTIALS.venue.password]
    ])("refuses the %s role with 403", async (role, identifier, password) => {
      const token = await tokenFor(identifier, password, role);

      expect(
        (await request(app).get("/api/v1/members").set("Authorization", `Bearer ${token}`)).status
      ).toBe(403);

      expect(
        (
          await request(app)
            .patch(`/api/v1/members/${settledId}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ is_active: false })
        ).status
      ).toBe(403);
    });

    // A member must not be able to list other members, or change anyone's state.
    it("refuses a member with 403", async () => {
      const token = await tokenFor(
        TEST_CREDENTIALS.memberSettled.itsNo,
        TEST_CREDENTIALS.memberSettled.password,
        "member"
      );

      expect(
        (await request(app).get("/api/v1/members").set("Authorization", `Bearer ${token}`)).status
      ).toBe(403);

      expect(
        (
          await request(app)
            .patch(`/api/v1/members/${inactiveId}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ is_active: true })
        ).status
      ).toBe(403);
    });
  });
});
