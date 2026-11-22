import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { memberDashboardRoutes } from "../routes/memberDashboardRoutes";
import { DASHBOARD_QUERY } from "../services/memberDashboardService";
import { COMPLETION_SELECT } from "../services/memberCompletionQuery";
import { pool } from "../db/pool";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, ensureFixtures } from "./helpers/fixtures";

/**
 * THE ADMINISTRATOR'S MEMBER DASHBOARD (FR-112, FR-112a)
 *
 * The counting itself is covered by `memberFormCompletion.test.ts`, which needs no database.
 * What needs a database is everything around it: that the SQL runs at all, that the two
 * filters narrow it, that `none` reaches the members a plain filter hides, and that no
 * profile value comes back in the response.
 *
 * The filter tests assert RELATIONSHIPS between responses rather than absolute numbers,
 * because this database is shared with every other test file and the real membership. A test
 * that expected "4 accounts" would break the first time somebody added a fixture.
 */

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/member-dashboard", router: memberDashboardRoutes }
]);

/** A member of its own, posted to the test zone and mohallah, so both filters can match. */
const POSTED_ITS = "99900197";

async function tokenFor(identifier: string, password: string, role: string) {
  const res = await request(app).post("/api/v1/auth/login").send({ identifier, password, role });
  return res.body.data?.token as string;
}

/**
 * FR-112b. The dashboard average and the per-member figure in the account list must be the
 * SAME measure, and the only way to guarantee that is for both to read the same select list.
 *
 * Asserted rather than assumed because the failure is invisible: a member shown 76% in their
 * row while being counted as something else in the average looks perfectly reasonable from
 * either end, and nobody would think to compare them.
 */
it("computes completion from the select list the account list also uses", () => {
  expect(DASHBOARD_QUERY).toContain(COMPLETION_SELECT);
});

describe("member dashboard", () => {
  let adminToken: string;
  let zoneId: number;
  let mohallahId: number;

  beforeAll(async () => {
    const fixtures = await ensureFixtures();
    zoneId = fixtures.zoneId;
    mohallahId = fixtures.mohallahId;

    await pool.query("DELETE FROM member_accounts WHERE its_no = :i", { i: POSTED_ITS });
    const [inserted] = await pool.query<any>(
      `INSERT INTO member_accounts (its_no, member_name, password_hash, must_change_password, is_active)
       VALUES (:i, '__TEST_DASHBOARD__', 'not-used', 0, 1)`,
      { i: POSTED_ITS }
    );
    await pool.query(
      `INSERT INTO member_profiles (member_account_id, zone_id, mohallah_id, name)
       VALUES (:id, :zone, :mohallah, '__TEST_DASHBOARD__')`,
      { id: Number(inserted.insertId), zone: zoneId, mohallah: mohallahId }
    );

    adminToken = await tokenFor(
      TEST_CREDENTIALS.admin.username,
      TEST_CREDENTIALS.admin.password,
      "admin"
    );
  });

  afterAll(async () => {
    // The profile row goes with the account, by ON DELETE CASCADE.
    await pool.query("DELETE FROM member_accounts WHERE its_no = :i", { i: POSTED_ITS });
    await pool.end();
  });

  function get(query = "") {
    return request(app)
      .get(`/api/v1/member-dashboard${query}`)
      .set("Authorization", `Bearer ${adminToken}`);
  }

  describe("the figures", () => {
    it("answers with the access and completion blocks", async () => {
      const res = await get();

      expect(res.status).toBe(200);
      expect(res.body.data.access.total).toBeGreaterThan(0);
      expect(res.body.data.form.measured).toBeGreaterThan(0);
      expect(res.body.data.form.tabs.map((t: any) => t.tab)).toEqual([
        1, 2, 3, 4, 5, 6, 10, 11, 12
      ]);
    });

    /** Signing in and choosing a password are separate facts, and so are separate counts. */
    it("counts sign-ins and password changes separately, and names the gap", async () => {
      const { access } = (await get()).body.data;

      expect(access.signed_in + access.never_signed_in).toBe(access.total);
      expect(access.signed_in_not_changed).toBeLessThanOrEqual(access.signed_in);
      expect(access.changed_password).toBeLessThanOrEqual(access.total);
    });

    it("splits members into finished, started and untouched, adding up to the whole", async () => {
      const { form } = (await get()).body.data;

      expect(form.fully_answered + form.partly_answered + form.not_started).toBe(form.measured);
      expect(form.average_percent).toBeGreaterThanOrEqual(0);
      expect(form.average_percent).toBeLessThanOrEqual(100);
    });

    /**
     * FR-065, FR-066, FR-101. The response is counts. The query reads presence, not values,
     * so there is no health value in the process to leak — but the assertion is on the body,
     * because that is what a browser receives.
     */
    it("returns no member and no profile value at all", async () => {
      const body = JSON.stringify((await get()).body);

      for (const field of [
        "blood_group",
        "height_cm",
        "weight_kg",
        "bmi",
        "its_no",
        "member_name",
        "residence_address",
        "mobile_no_1",
        "email"
      ]) {
        expect(body).not.toContain(field);
      }
    });
  });

  describe("the Zone and Mohallah filters (FR-112a)", () => {
    it("narrows the count to one zone", async () => {
      const all = (await get()).body.data.access.total;
      const zoned = (await get(`?zone_id=${zoneId}`)).body.data.access.total;

      expect(zoned).toBeGreaterThan(0);
      expect(zoned).toBeLessThanOrEqual(all);
    });

    it("narrows the count to one mohallah", async () => {
      const all = (await get()).body.data.access.total;
      const inMohallah = (await get(`?mohallah_id=${mohallahId}`)).body.data.access.total;

      expect(inMohallah).toBeGreaterThan(0);
      expect(inMohallah).toBeLessThanOrEqual(all);
    });

    it("combines the two with AND, because they are independent answers", async () => {
      const both = (await get(`?zone_id=${zoneId}&mohallah_id=${mohallahId}`)).body.data.access;
      const zoneOnly = (await get(`?zone_id=${zoneId}`)).body.data.access;

      expect(both.total).toBeGreaterThan(0);
      expect(both.total).toBeLessThanOrEqual(zoneOnly.total);
    });

    /**
     * The whole reason `none` exists. A member with no profile row, and a member who stopped
     * before Tab 3, match no zone id at all — so without this they would appear only in the
     * unfiltered total, where nobody would look for them.
     */
    it("can count the members who have chosen no zone", async () => {
      const res = await get("?zone_id=none");

      expect(res.status).toBe(200);
      expect(res.body.data.filter.zone_id).toBe("none");
      // The fixtures include a member with no profile row at all, so this is never empty.
      expect(res.body.data.access.total).toBeGreaterThan(0);
    });

    it("can count the members who have chosen no mohallah", async () => {
      const res = await get("?mohallah_id=none");

      expect(res.status).toBe(200);
      expect(res.body.data.access.total).toBeGreaterThan(0);
    });

    it("the zone-filtered and the zone-less counts cover every account between them", async () => {
      const all = (await get()).body.data.access.total;
      const none = (await get("?zone_id=none")).body.data.access.total;
      const some = all - none;

      expect(some).toBeGreaterThanOrEqual(0);
      expect(none).toBeLessThanOrEqual(all);
    });

    it("echoes the filter back, so the page states what it counted", async () => {
      const res = await get(`?zone_id=${zoneId}`);

      expect(res.body.data.filter).toEqual({ zone_id: zoneId, mohallah_id: null });
    });

    it("treats an absent, empty or 'all' filter as no filter", async () => {
      for (const query of ["", "?zone_id=", "?zone_id=all"]) {
        const res = await get(query);
        expect(res.status).toBe(200);
        expect(res.body.data.filter.zone_id).toBeNull();
      }
    });

    /**
     * Refused by name rather than ignored. A mistyped filter that quietly returned the
     * unfiltered figures would be a wrong number nobody would think to question.
     */
    it("refuses a filter that is neither an id nor 'none'", async () => {
      for (const query of ["?zone_id=abc", "?zone_id=0", "?zone_id=-1", "?mohallah_id=1.5"]) {
        const res = await get(query);
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/must be an id/);
      }
    });

    it("counts nobody, rather than everybody, for a zone with no members", async () => {
      // An id that exists in no zone row, so the filter is valid and matches nothing.
      const res = await get("?zone_id=99999999");

      expect(res.status).toBe(200);
      expect(res.body.data.access.total).toBe(0);
      expect(res.body.data.form.average_percent).toBe(0);
    });
  });

  describe("access control", () => {
    it("refuses an unauthenticated request", async () => {
      expect((await request(app).get("/api/v1/member-dashboard")).status).toBe(401);
    });

    /**
     * Administrator only, and not for secrecy: the figures are organisation-wide. A Zonal
     * Head is scoped by `member_profiles.zone_id` everywhere else, and a member who has not
     * reached Tab 3 has no zone — so a zone-scoped version would omit the very members a
     * completion figure is about and report a healthier number than the truth.
     */
    it("refuses a Zonal Head with 403", async () => {
      const token = await tokenFor(
        TEST_CREDENTIALS.zone.name,
        TEST_CREDENTIALS.zone.password,
        "zonal_head"
      );

      expect(
        (
          await request(app)
            .get("/api/v1/member-dashboard")
            .set("Authorization", `Bearer ${token}`)
        ).status
      ).toBe(403);
    });

    it("refuses a member with 403", async () => {
      const token = await tokenFor(
        TEST_CREDENTIALS.memberSettled.itsNo,
        TEST_CREDENTIALS.memberSettled.password,
        "member"
      );

      expect(
        (
          await request(app)
            .get("/api/v1/member-dashboard")
            .set("Authorization", `Bearer ${token}`)
        ).status
      ).toBe(403);
    });
  });
});
