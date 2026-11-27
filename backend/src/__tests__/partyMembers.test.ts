import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { partyMemberRoutes } from "../routes/partyMemberRoutes";
import { pool } from "../db/pool";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, clearMemberLoginAttempts, ensureFixtures } from "./helpers/fixtures";

/**
 * PARTY MEMBERS — ONLY THE PARTY'S OWN PEOPLE.
 *
 * The list is the party's roster and the photograph is the one place outside the member and
 * the authorised administrators where image bytes are served (FR-090). Every case below is
 * about the boundary: the party id comes from the token, never from the request, and a member
 * of another party must be indistinguishable from one with no photograph.
 */

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/party-members", router: partyMemberRoutes }
]);

const OWN_ITS = "99900199";
const OTHER_ITS = "99900198";
const OTHER_PARTY_NAME = "__TEST_OTHER_PARTY__";

// 1x1 transparent PNG, same fixture the photo tests use.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const PNG_SHA = createHash("sha256").update(PNG).digest("hex");

let partyToken: string;
let adminToken: string;
let memberToken: string;
let ownMemberId: number;
let otherMemberId: number;
let otherPartyId: number;

async function insertMember(itsNo: string, name: string) {
  const [res] = await pool.query<any>(
    `INSERT INTO member_accounts (its_no, member_name, password_hash, must_change_password, is_active)
     VALUES (:itsNo, :name, 'not-used', 0, 1)`,
    { itsNo, name }
  );
  return Number(res.insertId);
}

async function insertProfile(memberId: number, partyId: number, name: string, surname: string) {
  await pool.query(
    `INSERT INTO member_profiles
       (member_account_id, first_prefix, name, father_prefix, father_name, surname, party_id)
     VALUES (:memberId, 'Mulla', :name, 'Sheikh', 'Father', :surname, :partyId)`,
    { memberId, partyId, name, surname }
  );
}

async function tokenFor(identifier: string, password: string, role: string) {
  const res = await request(app).post("/api/v1/auth/login").send({ identifier, password, role });
  return res.body.data?.token as string;
}

describe("party member roster", () => {
  beforeAll(async () => {
    const fixtures = await ensureFixtures();
    await clearMemberLoginAttempts();

    partyToken = await tokenFor(
      TEST_CREDENTIALS.party.itsNo,
      TEST_CREDENTIALS.party.password,
      "party"
    );
    adminToken = await tokenFor(
      TEST_CREDENTIALS.admin.username,
      TEST_CREDENTIALS.admin.password,
      "admin"
    );
    memberToken = await tokenFor(
      TEST_CREDENTIALS.memberSettled.itsNo,
      TEST_CREDENTIALS.memberSettled.password,
      "member"
    );

    const [otherParty] = await pool.query<any>(
      `INSERT INTO parties
         (its_no, leader_name, party_name, zone_id, category, password_hash)
       VALUES ('99900197', '__TEST_OTHER_LEADER__', :name, :zoneId, 'C', 'not-used')`,
      { name: OTHER_PARTY_NAME, zoneId: fixtures.zoneId }
    );
    otherPartyId = Number(otherParty.insertId);

    ownMemberId = await insertMember(OWN_ITS, "__TEST_PARTY_MEMBER__");
    await insertProfile(ownMemberId, fixtures.partyId, "Party", "Member");
    await pool.query(
      `INSERT INTO member_photos
         (member_account_id, content_type, byte_size, width, height, sha256, image_data, approval_status)
       VALUES (:id, 'image/png', :size, 1, 1, :sha, :data, 'pending')`,
      { id: ownMemberId, size: PNG.length, sha: PNG_SHA, data: PNG }
    );

    otherMemberId = await insertMember(OTHER_ITS, "__TEST_OTHER_PARTY_MEMBER__");
    await insertProfile(otherMemberId, otherPartyId, "Other", "Member");
    await pool.query(
      `INSERT INTO member_photos
         (member_account_id, content_type, byte_size, width, height, sha256, image_data, approval_status)
       VALUES (:id, 'image/png', :size, 1, 1, :sha, :data, 'pending')`,
      { id: otherMemberId, size: PNG.length, sha: PNG_SHA, data: PNG }
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM member_accounts WHERE its_no IN (:own, :other)", {
      own: OWN_ITS,
      other: OTHER_ITS
    });
    await pool.query("DELETE FROM parties WHERE party_name = :name", { name: OTHER_PARTY_NAME });
    await clearMemberLoginAttempts();
    await pool.end();
  });

  it("lists the party's own members and nobody else", async () => {
    const res = await request(app)
      .get("/api/v1/party-members")
      .set("Authorization", `Bearer ${partyToken}`);

    expect(res.status).toBe(200);
    const itsNumbers = res.body.data.items.map((m: any) => m.its_no);
    expect(itsNumbers).toContain(OWN_ITS);
    expect(itsNumbers).not.toContain(OTHER_ITS);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  /**
   * An EXHAUSTIVE assertion, deliberately. Listing every key means a new column cannot be
   * added to this response without somebody coming here and saying what it is - which is the
   * only reliable guard on the narrowest view in the application.
   */
  it("returns the name parts without account or contact details", async () => {
    const res = await request(app)
      .get("/api/v1/party-members")
      .set("Authorization", `Bearer ${partyToken}`);

    const item = res.body.data.items.find((m: any) => m.its_no === OWN_ITS);
    expect(item).toEqual({
      id: ownMemberId,
      its_no: OWN_ITS,
      first_prefix: "Mulla",
      name: "Party",
      father_prefix: "Sheikh",
      father_name: "Father",
      surname: "Member",
      has_photo: true,
      // FR-112c. Two facts ABOUT the profile, neither of them from it. Their values are
      // asserted in the test below; here the point is that these four keys and no others
      // joined the response.
      profile_updated_at: expect.anything(),
      completion_percent: expect.any(Number),
      completion_answered: expect.any(Number),
      completion_asked: expect.any(Number)
    });
  });

  /**
   * FR-112c. How much of the form the member has filled in, and when they last saved it.
   *
   * The percentage must be the same measure the administrator list shows and the dashboard
   * averages - they share `memberCompletionQuery` - and it must be derived from presence, so
   * no profile value may appear anywhere in the response. The forbidden-keys check is in the
   * exhaustive assertion above; this one checks the figures mean what they say.
   */
  describe("profile completion and last saved (FR-112c)", () => {
    it("reports a coherent percentage and fraction", async () => {
      const res = await request(app)
        .get("/api/v1/party-members")
        .set("Authorization", `Bearer ${partyToken}`);

      const item = res.body.data.items.find((m: any) => m.its_no === OWN_ITS);
      expect(item).toBeDefined();

      // A member in a party has a profile row, so there is always a denominator.
      expect(item.completion_asked).toBeGreaterThan(10);
      expect(item.completion_answered).toBeLessThanOrEqual(item.completion_asked);
      expect(item.completion_percent).toBe(
        Math.round((item.completion_answered / item.completion_asked) * 100)
      );

      // The fixture stores a name, a father name, a surname and a party, so this member has
      // answered something: a measure that reported 0 here would not be measuring.
      expect(item.completion_answered).toBeGreaterThanOrEqual(3);
      expect(item.completion_percent).toBeGreaterThan(0);
    });

    it("reports when the profile was last saved, as a readable date", async () => {
      const res = await request(app)
        .get("/api/v1/party-members")
        .set("Authorization", `Bearer ${partyToken}`);

      const item = res.body.data.items.find((m: any) => m.its_no === OWN_ITS);
      expect(item.profile_updated_at).not.toBeNull();
      expect(Number.isFinite(new Date(item.profile_updated_at).getTime())).toBe(true);
    });

    /**
     * The presence columns the completion query selects must not reach the caller. Two of
     * them would be Tab 6 medical data if they did (FR-065, FR-066).
     */
    it("carries no presence column and no discriminant", async () => {
      const res = await request(app)
        .get("/api/v1/party-members")
        .set("Authorization", `Bearer ${partyToken}`);

      const payload = JSON.stringify(res.body);
      for (const forbidden of [
        "p_blood_group",
        "p_height_cm",
        "p_weight_kg",
        "p_contact_no",
        "p_photo",
        "is_regular_donor",
        "has_hifz_sanad",
        "occupation_type",
        "khidmat_type",
        "hizb_participation",
        "is_muntasib_ila_jamea",
        "p_farig_year"
      ]) {
        expect(payload, forbidden).not.toContain(forbidden);
      }
    });
  });

  it("searches within the party only", async () => {
    const own = await request(app)
      .get("/api/v1/party-members")
      .query({ q: "Party Member" })
      .set("Authorization", `Bearer ${partyToken}`);
    expect(own.body.data.items.map((m: any) => m.its_no)).toEqual([OWN_ITS]);

    const other = await request(app)
      .get("/api/v1/party-members")
      .query({ q: OTHER_ITS })
      .set("Authorization", `Bearer ${partyToken}`);
    expect(other.body.data.items).toEqual([]);
    expect(other.body.data.total).toBe(0);
  });

  it("serves a photograph for its own member", async () => {
    const res = await request(app)
      .get(`/api/v1/party-members/${ownMemberId}/photo`)
      .set("Authorization", `Bearer ${partyToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(Buffer.from(res.body).equals(PNG)).toBe(true);
  });

  it("answers a member of another party exactly as it answers no photo", async () => {
    const res = await request(app)
      .get(`/api/v1/party-members/${otherMemberId}/photo`)
      .set("Authorization", `Bearer ${partyToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("No photo set");
  });

  it("hides a deactivated member from the roster", async () => {
    await pool.query("UPDATE member_accounts SET is_active = 0 WHERE id = :id", { id: ownMemberId });
    try {
      const res = await request(app)
        .get("/api/v1/party-members")
        .set("Authorization", `Bearer ${partyToken}`);

      expect(res.body.data.items.some((m: any) => m.its_no === OWN_ITS)).toBe(false);
    } finally {
      await pool.query("UPDATE member_accounts SET is_active = 1 WHERE id = :id", {
        id: ownMemberId
      });
    }
  });

  it("refuses every other role", async () => {
    const asAdmin = await request(app)
      .get("/api/v1/party-members")
      .set("Authorization", `Bearer ${adminToken}`);
    const asMember = await request(app)
      .get("/api/v1/party-members")
      .set("Authorization", `Bearer ${memberToken}`);
    const anonymous = await request(app).get("/api/v1/party-members");

    expect(asAdmin.status).toBe(403);
    expect(asMember.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });
});
