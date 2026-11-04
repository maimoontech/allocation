import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../../routes/authRoutes";
import { schedulesRoutes } from "../../routes/schedulesRoutes";
import { pool } from "../../db/pool";
import { buildTestApp } from "../helpers/testApp";
import { TEST_CREDENTIALS, ensureFixtures, type Fixtures } from "../helpers/fixtures";

/**
 * REGRESSION BASELINE — PARTY DATA SCOPING (FR-105)
 *
 * Authentication is only half of what must not regress. A party's token carries `partyId`,
 * and `schedulesRoutes.ts` turns that into two SQL conditions:
 *
 *     if (user.role === "party") {
 *       conditions.push("s.party_id = :party_id");
 *       conditions.push("s.is_published = 1");
 *     }
 *
 * Both matter. Lose the first and a party sees every party's schedule; lose the second and it
 * sees unpublished drafts. Either would be a data leak rather than a broken feature, and
 * neither would show up in a login test.
 *
 * The fixtures deliberately include all three cases: a published row for the test party, an
 * unpublished row for the test party, and a published row for a DIFFERENT party.
 */

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/schedules", router: schedulesRoutes }
]);

async function partyToken() {
  const res = await request(app).post("/api/v1/auth/login").send({
    identifier: TEST_CREDENTIALS.party.itsNo,
    password: TEST_CREDENTIALS.party.password,
    role: "party"
  });
  return res.body.data.token as string;
}

describe("REGRESSION: party schedule scoping", () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await ensureFixtures();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/schedules");
    expect(res.status).toBe(401);
  });

  it("returns only rows belonging to the authenticated party", async () => {
    const res = await request(app)
      .get("/api/v1/schedules")
      .set("Authorization", `Bearer ${await partyToken()}`);

    expect(res.status).toBe(200);
    const rows: any[] = res.body.data;
    expect(Array.isArray(rows)).toBe(true);

    // Every row must be this party's. One foreign row here is a leak.
    const foreign = rows.filter((r) => r.party_id !== fixtures.partyId);
    expect(foreign).toHaveLength(0);
  });

  it("hides the published row that belongs to another party", async () => {
    const res = await request(app)
      .get("/api/v1/schedules")
      .set("Authorization", `Bearer ${await partyToken()}`);

    const ids = (res.body.data as any[]).map((r) => r.id);
    expect(ids).not.toContain(fixtures.otherPartyScheduleId);
  });

  it("hides the party's own UNPUBLISHED row", async () => {
    const res = await request(app)
      .get("/api/v1/schedules")
      .set("Authorization", `Bearer ${await partyToken()}`);

    const ids = (res.body.data as any[]).map((r) => r.id);
    expect(ids).not.toContain(fixtures.unpublishedScheduleId);
  });

  it("shows the party's own published row", async () => {
    const res = await request(app)
      .get("/api/v1/schedules")
      .set("Authorization", `Bearer ${await partyToken()}`);

    const ids = (res.body.data as any[]).map((r) => r.id);
    expect(ids).toContain(fixtures.publishedScheduleId);
  });

  it("every returned row is published", async () => {
    const res = await request(app)
      .get("/api/v1/schedules")
      .set("Authorization", `Bearer ${await partyToken()}`);

    for (const row of res.body.data as any[]) {
      expect(Boolean(row.is_published)).toBe(true);
    }
  });

  // The scope comes from the token, not the query string. If a party could widen it by
  // asking, the server-side filter would be decorative.
  it("ignores a party_id supplied in the query string", async () => {
    const token = await partyToken();

    const res = await request(app)
      .get(`/api/v1/schedules?party_id=${fixtures.otherPartyId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const foreign = (res.body.data as any[]).filter((r) => r.party_id !== fixtures.partyId);
    expect(foreign).toHaveLength(0);
  });

  it("an admin sees rows the party cannot, proving the filter is role-based", async () => {
    const adminLogin = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.admin.username,
      password: TEST_CREDENTIALS.admin.password,
      role: "admin"
    });

    const adminRes = await request(app)
      .get("/api/v1/schedules")
      .set("Authorization", `Bearer ${adminLogin.body.data.token}`);

    expect(adminRes.status).toBe(200);
    const adminIds = (adminRes.body.data as any[]).map((r) => r.id);

    // The admin can see both of the rows that were hidden from the party.
    expect(adminIds).toContain(fixtures.unpublishedScheduleId);
    expect(adminIds).toContain(fixtures.otherPartyScheduleId);
  });

  it("rejects a party token on an admin-only operation", async () => {
    const res = await request(app)
      .post("/api/v1/schedules/publish")
      .set("Authorization", `Bearer ${await partyToken()}`)
      .send({ miqaat_id: fixtures.miqaatId, zone_id: fixtures.zoneId });

    expect(res.status).toBe(403);
  });

  it("rejects an invalid token outright", async () => {
    const res = await request(app)
      .get("/api/v1/schedules")
      .set("Authorization", "Bearer not.a.real.token");

    expect(res.status).toBe(401);
  });
});
