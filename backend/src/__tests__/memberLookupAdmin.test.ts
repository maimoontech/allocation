import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { memberLookupAdminRoutes } from "../routes/memberLookupAdminRoutes";
import { memberLookupsRoutes } from "../routes/memberLookupsRoutes";
import { memberProfileRoutes } from "../routes/memberProfileRoutes";
import { pool } from "../db/pool";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, clearMemberLoginAttempts, ensureFixtures } from "./helpers/fixtures";
import { clearMemberData } from "./helpers/memberLookups";

/**
 * ADMIN MAINTENANCE OF THE MEMBERSHIP LOOKUP LISTS
 *
 * This is how T018 gets done: five lists — titles, sharafs, halqas, mozes, places — shipped
 * empty because seeding them would have meant inventing religious and organisational terms.
 * An admin now enters the authoritative values.
 *
 * The behaviour worth testing hardest is DELETION. Five of the ten foreign keys are
 * ON DELETE RESTRICT, but the other five are **ON DELETE SET NULL** — so for half of these
 * lists the database would happily let a delete through and silently blank that answer on
 * every member who had chosen it. The API therefore refuses a delete for all ten and offers
 * deactivation instead. The tests below prove it for one list of each kind, because trusting
 * the database here would be wrong for exactly half of them.
 *
 * Rows created here use a marker so teardown cannot touch anything real.
 */

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/member-lookups", router: memberLookupAdminRoutes },
  { path: "/api/v1/members/lookups", router: memberLookupsRoutes },
  { path: "/api/v1/members", router: memberProfileRoutes }
]);

const MARKER = "__TEST_ADMIN_LOOKUP__";

let adminToken: string;
let memberToken: string;

function list(entity: string) {
  return request(app)
    .get(`/api/v1/member-lookups/${entity}`)
    .set("Authorization", `Bearer ${adminToken}`);
}

function create(entity: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/api/v1/member-lookups/${entity}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send(body);
}

function patch(entity: string, id: number, body: Record<string, unknown>) {
  return request(app)
    .patch(`/api/v1/member-lookups/${entity}/${id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send(body);
}

function remove(entity: string, id: number) {
  return request(app)
    .delete(`/api/v1/member-lookups/${entity}/${id}`)
    .set("Authorization", `Bearer ${adminToken}`);
}

/** Every table this file writes to, with its name column, for teardown by marker. */
const WRITTEN = [
  ["titles", "title_name"],
  ["places", "place_name"],
  ["sharafs", "sharaf_name"],
  ["marital_statuses", "marital_status_name"],
  ["skills", "skill_name"],
  ["halqas", "halqa_name"]
] as const;

async function removeMarked() {
  // Member-owned rows first: they reference these with ON DELETE RESTRICT.
  await clearMemberData(TEST_CREDENTIALS.memberSettled.itsNo);
  for (const [table, column] of WRITTEN) {
    await pool.query(`DELETE FROM \`${table}\` WHERE \`${column}\` LIKE :p`, { p: `${MARKER}%` });
  }
}

beforeAll(async () => {
  await ensureFixtures();
  await clearMemberLoginAttempts();

  const admin = await request(app).post("/api/v1/auth/login").send({
    identifier: TEST_CREDENTIALS.admin.username,
    password: TEST_CREDENTIALS.admin.password,
    role: "admin"
  });
  expect(admin.status).toBe(200);
  adminToken = admin.body.data.token;

  const member = await request(app).post("/api/v1/auth/login").send({
    identifier: TEST_CREDENTIALS.memberSettled.itsNo,
    password: TEST_CREDENTIALS.memberSettled.password,
    role: "member"
  });
  expect(member.status).toBe(200);
  memberToken = member.body.data.token;
});

beforeEach(async () => {
  await clearMemberLoginAttempts();
  await removeMarked();
});

afterAll(async () => {
  await removeMarked();
  await clearMemberLoginAttempts();
  await pool.end();
});

describe("access control", () => {
  it("refuses a member token with 403", async () => {
    const res = await request(app)
      .get("/api/v1/member-lookups/places")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });

  it("refuses an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/v1/member-lookups/places");
    expect(res.status).toBe(401);
  });

  it("refuses a party token with 403", async () => {
    const party = await request(app).post("/api/v1/auth/login").send({
      identifier: TEST_CREDENTIALS.party.itsNo,
      password: TEST_CREDENTIALS.party.password,
      role: "party"
    });
    expect(party.status).toBe(200);

    const res = await request(app)
      .get("/api/v1/member-lookups/places")
      .set("Authorization", `Bearer ${party.body.data.token}`);
    expect(res.status).toBe(403);
  });
});

describe("the index", () => {
  it("lists all ten lists with their counts", async () => {
    const res = await request(app)
      .get("/api/v1/member-lookups")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);

    const slugs = res.body.data.map((r: any) => r.entity).sort();
    expect(slugs).toEqual([
      "halqas",
      "marital_statuses",
      "mozes",
      "places",
      "sanads",
      "sharafs",
      "skills",
      "tamreen_frequencies",
      "tamreen_methods",
      "titles"
    ]);

    // Each row says where the list is used, so an admin knows what they are editing.
    for (const row of res.body.data) {
      expect(typeof row.used_for).toBe("string");
      expect(row.used_for.length).toBeGreaterThan(0);
    }
  });

  it("reports draft counts from the database", async () => {
    // Created here rather than taken from the seed: promoting a seeded draft through this
    // very API is the intended workflow (T018), so asserting on seed rows would make the
    // suite fail as soon as the lists were curated.
    const created = await create("places", {
      name: `${MARKER} Draft Count`,
      display_order: 5,
      is_draft: 1
    });
    expect(created.status).toBe(200);
    const id = created.body.data.id as number;

    try {
      const res = await request(app)
        .get("/api/v1/member-lookups")
        .set("Authorization", `Bearer ${adminToken}`);

      const byEntity = Object.fromEntries(res.body.data.map((r: any) => [r.entity, r]));
      for (const row of res.body.data) {
        expect(typeof row.draft).toBe("number");
        expect(row.draft).toBeLessThanOrEqual(row.total);
      }
      // A draft inserted above is counted, in the list it belongs to.
      expect(byEntity.places.draft).toBeGreaterThan(0);
    } finally {
      await remove("places", id);
    }
  });

  it("rejects an unknown list with 404", async () => {
    const res = await list("not_a_list");
    expect(res.status).toBe(404);
  });
});

describe("create, edit and order", () => {
  it("creates a value and returns it in the list", async () => {
    const created = await create("places", { name: `${MARKER} Nairobi`, display_order: 5 });
    expect(created.status).toBe(200);
    expect(created.body.data.id).toBeGreaterThan(0);

    const res = await list("places");
    const row = res.body.data.rows.find((r: any) => r.id === created.body.data.id);
    expect(row).toMatchObject({
      name: `${MARKER} Nairobi`,
      display_order: 5,
      is_active: 1,
      in_use: 0
    });
  });

  // The seeded rows are drafts because nobody had reviewed them. A value an admin types IS
  // the review, so it must not come back marked "DRAFT — NEEDS REVIEW" in the member form.
  it("creates an admin-entered value as authoritative, not draft", async () => {
    const created = await create("titles", { name: `${MARKER} Sheikh ul Jamea` });
    const res = await list("titles");
    const row = res.body.data.rows.find((r: any) => r.id === created.body.data.id);
    expect(row.is_draft).toBe(0);
  });

  it("refuses a duplicate name with 409, not a 500", async () => {
    await create("places", { name: `${MARKER} Colombo` });
    const again = await create("places", { name: `${MARKER} Colombo` });

    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/already in this list/i);
  });

  it("trims the name and refuses a blank one", async () => {
    const padded = await create("places", { name: `   ${MARKER} Dubai   ` });
    expect(padded.status).toBe(200);

    const res = await list("places");
    const row = res.body.data.rows.find((r: any) => r.id === padded.body.data.id);
    expect(row.name).toBe(`${MARKER} Dubai`);

    for (const bad of ["", "   ", null, 42]) {
      const res2 = await create("places", { name: bad });
      expect(res2.status).toBe(400);
    }
  });

  it("refuses a name longer than the column", async () => {
    const res = await create("places", { name: `${MARKER}${"x".repeat(200)}` });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("150");
  });

  it("edits a name, order and flags", async () => {
    const created = await create("sharafs", { name: `${MARKER} First` });
    const id = created.body.data.id;

    const edited = await patch("sharafs", id, {
      name: `${MARKER} Corrected`,
      display_order: 9,
      is_active: 0,
      is_draft: 1
    });
    expect(edited.status).toBe(200);

    const res = await list("sharafs");
    const row = res.body.data.rows.find((r: any) => r.id === id);
    expect(row).toMatchObject({
      name: `${MARKER} Corrected`,
      display_order: 9,
      is_active: 0,
      is_draft: 1
    });
  });

  it("accepts a partial edit without disturbing the other columns", async () => {
    const created = await create("sharafs", { name: `${MARKER} Keep`, display_order: 3 });
    const id = created.body.data.id;

    await patch("sharafs", id, { is_active: 0 });

    const res = await list("sharafs");
    const row = res.body.data.rows.find((r: any) => r.id === id);
    expect(row.name).toBe(`${MARKER} Keep`);
    expect(row.display_order).toBe(3);
    expect(row.is_active).toBe(0);
  });

  it("rejects an empty edit and a bad display order", async () => {
    const created = await create("sharafs", { name: `${MARKER} Edge` });
    const id = created.body.data.id;

    expect((await patch("sharafs", id, {})).status).toBe(400);
    expect((await patch("sharafs", id, { display_order: -1 })).status).toBe(400);
    expect((await patch("sharafs", id, { display_order: 1.5 })).status).toBe(400);
    expect((await patch("sharafs", id, { is_active: "maybe" })).status).toBe(400);
  });

  it("returns 404 editing or deleting something that is gone", async () => {
    expect((await patch("places", 99999999, { name: `${MARKER} Ghost` })).status).toBe(404);
    expect((await remove("places", 99999999)).status).toBe(404);
  });

  it("orders by display_order then name, as the member form does", async () => {
    await create("places", { name: `${MARKER} Zulu`, display_order: 1 });
    await create("places", { name: `${MARKER} Alpha`, display_order: 2 });
    await create("places", { name: `${MARKER} Bravo`, display_order: 2 });

    const res = await list("places");
    const mine = res.body.data.rows
      .filter((r: any) => r.name.startsWith(MARKER))
      .map((r: any) => r.name);

    expect(mine).toEqual([`${MARKER} Zulu`, `${MARKER} Alpha`, `${MARKER} Bravo`]);
  });
});

describe("deletion is refused while a value is in use", () => {
  function saveProfile(body: Record<string, unknown>) {
    return request(app)
      .put("/api/v1/members/me/profile")
      .set("Authorization", `Bearer ${memberToken}`)
      .send(body);
  }

  // places -> member_place_visits is ON DELETE RESTRICT.
  it("refuses deleting a place a member has recorded, and says how many records", async () => {
    const created = await create("places", { name: `${MARKER} Used Place` });
    const id = created.body.data.id;

    const saved = await saveProfile({
      places_visited: [{ place_id: id, times_count: 1, years: [2020] }]
    });
    expect(saved.status).toBe(200);

    const res = await remove("places", id);
    expect(res.status).toBe(409);
    expect(res.body.data.in_use).toBe(1);
    expect(res.body.message).toMatch(/1 member record/);
    expect(res.body.message).toMatch(/Inactive instead/i);

    // Still there.
    const after = await list("places");
    expect(after.body.data.rows.some((r: any) => r.id === id)).toBe(true);
  });

  /**
   * marital_statuses -> member_profiles is ON DELETE **SET NULL**.
   *
   * This is the case that matters most. The database would allow this delete and silently
   * blank the marital status of every member who had chosen it. Only the application refuses.
   */
  it("refuses deleting a SET NULL value, which the database would have allowed", async () => {
    const created = await create("marital_statuses", { name: `${MARKER} Married` });
    const id = created.body.data.id;

    expect((await saveProfile({ marital_status_id: id })).status).toBe(200);

    const res = await remove("marital_statuses", id);
    expect(res.status).toBe(409);
    expect(res.body.data.in_use).toBe(1);

    // And the member's answer is untouched.
    const profile = await request(app)
      .get("/api/v1/members/me/profile")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(profile.body.data.marital_status_id).toBe(id);
  });

  it("counts usage across every referencing column", async () => {
    // tamreen_frequencies is referenced TWICE from member_profiles — the Party and the Solo
    // question share one list. A count that looked at only one column would say 1, not 2.
    const created = await request(app)
      .post("/api/v1/member-lookups/tamreen_frequencies")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `${MARKER} Weekly` });
    const id = created.body.data.id;

    try {
      expect(
        (
          await saveProfile({
            party_tamreen_frequency_id: id,
            solo_tamreen_frequency_id: id
          })
        ).status
      ).toBe(200);

      const res = await remove("tamreen_frequencies", id);
      expect(res.status).toBe(409);
      expect(res.body.data.in_use).toBe(2);
    } finally {
      await clearMemberData(TEST_CREDENTIALS.memberSettled.itsNo);
      await pool.query("DELETE FROM tamreen_frequencies WHERE id = :id", { id });
    }
  });

  it("deletes a value nothing points at", async () => {
    const created = await create("places", { name: `${MARKER} Unused` });
    const id = created.body.data.id;

    const res = await remove("places", id);
    expect(res.status).toBe(200);

    const after = await list("places");
    expect(after.body.data.rows.some((r: any) => r.id === id)).toBe(false);
  });

  it("allows deletion once the member's reference is gone", async () => {
    const created = await create("skills", { name: `${MARKER} Teaching` });
    const id = created.body.data.id;

    await saveProfile({ skill_ids: [id] });
    expect((await remove("skills", id)).status).toBe(409);

    await saveProfile({ skill_ids: [] });
    expect((await remove("skills", id)).status).toBe(200);
  });
});

describe("deactivation is the safe alternative to deletion", () => {
  it("hides an inactive value from the member form but keeps existing answers", async () => {
    const created = await create("halqas", { name: `${MARKER} Halqa One` });
    const id = created.body.data.id;

    function memberLookups() {
      return request(app)
        .get("/api/v1/members/lookups")
        .set("Authorization", `Bearer ${memberToken}`);
    }

    // Offered to the member while active.
    const before = await memberLookups();
    expect(before.status).toBe(200);
    expect(before.body.data.halqas.some((h: any) => h.id === id)).toBe(true);

    await request(app)
      .put("/api/v1/members/me/profile")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ halqa_id: id });

    await patch("halqas", id, { is_active: 0 });

    // Gone from the form, so nobody new can choose it...
    const after = await memberLookups();
    expect(after.body.data.halqas.some((h: any) => h.id === id)).toBe(false);

    // ...but the member who already chose it keeps their answer. That asymmetry is the whole
    // reason deactivation is offered instead of deletion.
    const profile = await request(app)
      .get("/api/v1/members/me/profile")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(profile.body.data.halqa_id).toBe(id);
  });
});
