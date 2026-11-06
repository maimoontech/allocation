import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { memberLookupsRoutes } from "../routes/memberLookupsRoutes";
import { memberProfileRoutes } from "../routes/memberProfileRoutes";
import { pool } from "../db/pool";
import { currentHijriYear } from "../utils/hijriDate";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, clearMemberLoginAttempts } from "./helpers/fixtures";
import {
  LOOKUP_MARKER,
  clearMemberData,
  removeSeededLookups,
  seedAllLookups,
  seedLookup
} from "./helpers/memberLookups";
import type { SeededLookups } from "./helpers/memberLookups";

/**
 * MEMBER PROFILE: lookups, read, save, validation and isolation
 * (FR-028 to FR-033, FR-034 to FR-096)
 *
 * The five empty lookups — titles, sharafs, halqas, mozes, places — are seeded here with
 * clearly-marked test values, because several requirements can only be exercised against a
 * non-empty list. They are removed afterwards, so production's intentionally-empty state is
 * unaffected.
 */

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/members/lookups", router: memberLookupsRoutes },
  { path: "/api/v1/members", router: memberProfileRoutes }
]);

async function memberToken(which: "memberSettled" | "memberThrottle" = "memberSettled") {
  const creds = TEST_CREDENTIALS[which];
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: creds.itsNo, password: creds.password, role: "member" });
  return res.body.data.token as string;
}

function getProfile(token: string) {
  return request(app).get("/api/v1/members/me/profile").set("Authorization", `Bearer ${token}`);
}

function putProfile(token: string, body: Record<string, unknown>) {
  return request(app)
    .put("/api/v1/members/me/profile")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

/** Field names from a 400 response, for concise assertions. */
function errorFields(res: any): string[] {
  return (res.body.data?.errors ?? []).map((e: any) => e.field);
}

describe("member profile", () => {
  let seeded: SeededLookups;
  let token: string;

  beforeAll(async () => {
    seeded = await seedAllLookups();
    token = await memberToken();
  });

  beforeEach(async () => {
    await clearMemberLoginAttempts();
    // Each test starts from an empty profile, so one cannot depend on another's writes.
    await clearMemberData(TEST_CREDENTIALS.memberSettled.itsNo);
  });

  afterAll(async () => {
    // Member-owned rows first: they reference the seeded lookups with ON DELETE RESTRICT,
    // so the lookups cannot go until these do.
    await clearMemberData(TEST_CREDENTIALS.memberSettled.itsNo);
    await clearMemberData(TEST_CREDENTIALS.memberThrottle.itsNo);
    await removeSeededLookups();
    await clearMemberLoginAttempts();
    await pool.end();
  });

  // -------------------------------------------------------------------------
  describe("GET /members/lookups", () => {
    it("returns every list the form needs in one response", async () => {
      const res = await request(app)
        .get("/api/v1/members/lookups")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      for (const key of [
        "titles",
        "sharafs",
        "halqas",
        "mozes",
        "places",
        "sanads",
        "marital_statuses",
        "skills",
        "tamreen_frequencies",
        "tamreen_methods",
        "zones",
        "parties",
        "mohallahs"
      ]) {
        expect(Array.isArray(res.body.data[key])).toBe(true);
      }
    });

    // FR-048: the Tab 3 dependent dropdown filters client-side, so parties must carry it.
    it("includes zone_id on every party", async () => {
      const res = await request(app)
        .get("/api/v1/members/lookups")
        .set("Authorization", `Bearer ${token}`);

      expect(res.body.data.parties.length).toBeGreaterThan(0);
      for (const party of res.body.data.parties) {
        expect(typeof party.zone_id).toBe("number");
      }
    });

    /**
     * FR-048a. Inactive Hizbs are returned, carrying the flag so Tab 3 can mark them.
     *
     * Filtering them out server-side is the failure this guards: a member whose own Hizb was
     * deactivated would find their saved value missing from the list, the select renders
     * blank, and the save is refused with nothing on screen to explain it.
     *
     * The seeded party is deactivated and restored inside the test, so it touches only a row
     * the fixtures own.
     */
    it("returns inactive parties too, each carrying is_active", async () => {
      await pool.query("UPDATE parties SET is_active = 0 WHERE id = :id", {
        id: seeded.partyId
      });
      try {
        const res = await request(app)
          .get("/api/v1/members/lookups")
          .set("Authorization", `Bearer ${token}`);

        const found = res.body.data.parties.find((p: any) => p.id === seeded.partyId);
        expect(found, "a deactivated party must still be offered").toBeDefined();
        expect(found.is_active).toBe(false);

        // And an active one is still reported as active, or the flag says nothing.
        const active = res.body.data.parties.find((p: any) => p.id === seeded.otherPartyId);
        expect(active?.is_active).toBe(true);
      } finally {
        await pool.query("UPDATE parties SET is_active = 1 WHERE id = :id", {
          id: seeded.partyId
        });
      }
    });

    /**
     * FR-077c. Venues reach Tab 9, all of them, and WITHOUT the sensitive columns.
     *
     * `venues` is a pre-existing table that holds `password_hash` and `last_login_at` —
     * venues sign in to this system. A `SELECT *` here would publish both to every member,
     * so the absence of those keys is the assertion that matters most in this test.
     */
    it("returns every venue, with no credential fields", async () => {
      const res = await request(app)
        .get("/api/v1/members/lookups")
        .set("Authorization", `Bearer ${token}`);

      expect(Array.isArray(res.body.data.venues)).toBe(true);
      expect(res.body.data.venues.length).toBeGreaterThan(0);

      for (const venue of res.body.data.venues) {
        expect(Object.keys(venue).sort()).toEqual(["id", "is_active", "mohallah_id", "name"]);
        expect(venue).not.toHaveProperty("password_hash");
        expect(venue).not.toHaveProperty("last_login_at");
      }
    });

    it("includes inactive venues, each carrying is_active", async () => {
      const venueId = await (async () => {
        const [rows] = await pool.query<any[]>("SELECT id FROM venues LIMIT 1");
        return Number(rows[0].id);
      })();

      await pool.query("UPDATE venues SET is_active = 0 WHERE id = :id", { id: venueId });
      try {
        const res = await request(app)
          .get("/api/v1/members/lookups")
          .set("Authorization", `Bearer ${token}`);

        const found = res.body.data.venues.find((v: any) => v.id === venueId);
        expect(found, "a deactivated venue must still be offered").toBeDefined();
        expect(found.is_active).toBe(false);
      } finally {
        await pool.query("UPDATE venues SET is_active = 1 WHERE id = :id", { id: venueId });
      }
    });

    // FR-076: the upper bound must come from the server, not the client's clock.
    it("returns the current Hijri year, computed server-side", async () => {
      const res = await request(app)
        .get("/api/v1/members/lookups")
        .set("Authorization", `Bearer ${token}`);

      expect(res.body.data.current_hijri_year).toBe(currentHijriYear());
      expect(res.body.data.current_hijri_year).toBeGreaterThanOrEqual(1400);
    });

    // FR-094: draft values are flagged so the UI can mark them for review.
    it("flags draft values", async () => {
      const res = await request(app)
        .get("/api/v1/members/lookups")
        .set("Authorization", `Bearer ${token}`);

      const title = res.body.data.titles.find((t: any) => t.id === seeded.titleId);
      expect(title.is_draft).toBe(true);
    });

    it("omits inactive values", async () => {
      const id = await seedLookup("titles", "title_name", `${LOOKUP_MARKER} Retired`);
      await pool.query("UPDATE titles SET is_active = 0 WHERE id = :id", { id });

      const res = await request(app)
        .get("/api/v1/members/lookups")
        .set("Authorization", `Bearer ${token}`);

      expect(res.body.data.titles.some((t: any) => t.id === id)).toBe(false);
    });

    it("requires a member token", async () => {
      expect((await request(app).get("/api/v1/members/lookups")).status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  describe("GET /members/me/profile", () => {
    // FR-033: a member with nothing saved yet must get a usable shape, not a 404.
    it("returns a complete empty shape before anything is saved", async () => {
      const res = await getProfile(token);

      expect(res.status).toBe(200);
      expect(res.body.data.its_no).toBe(TEST_CREDENTIALS.memberSettled.itsNo);
      expect(res.body.data.name).toBeNull();
      expect(res.body.data.titles).toEqual([]);
      expect(res.body.data.places_visited).toEqual([]);
      expect(res.body.data.has_photo).toBe(false);
      expect(res.body.data.bmi).toBeNull();
    });

    // FR-034: read-only, and from the token's account.
    it("returns the signed-in member's own ITS number", async () => {
      const res = await getProfile(token);
      expect(res.body.data.its_no).toBe(TEST_CREDENTIALS.memberSettled.itsNo);
    });

    it("requires authentication", async () => {
      expect((await request(app).get("/api/v1/members/me/profile")).status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  describe("PUT /members/me/profile", () => {
    it("saves Tab 1 and Tab 3 and returns them on the next read", async () => {
      const save = await putProfile(token, {
        first_prefix: "Sheikh",
        name: "Round",
        father_prefix: "Mulla",
        father_name: "Trip",
        surname: "Member",
        dob_gregorian: "1985-03-14",
        marital_status_id: seeded.maritalId,
        residence_address: "12 Example Street",
        mobile_no_1: "+92 300 1234567",
        email: "round.trip@example.test",
        zone_id: seeded.zoneId,
        party_id: seeded.partyId,
        hizb_role: "Leader"
      });

      expect(save.status).toBe(200);

      const read = await getProfile(token);
      expect(read.body.data.first_prefix).toBe("Sheikh");
      expect(read.body.data.name).toBe("Round");
      expect(read.body.data.dob_gregorian).toBe("1985-03-14");
      expect(read.body.data.email).toBe("round.trip@example.test");
      expect(read.body.data.zone_id).toBe(seeded.zoneId);
      expect(read.body.data.party_id).toBe(seeded.partyId);
      expect(read.body.data.hizb_role).toBe("Leader");
    });

    // FR-039: derived on the server from the Gregorian date, and the client cannot set it.
    it("derives the Hijri date of birth", async () => {
      await putProfile(token, { dob_gregorian: "1985-03-14" });

      const read = await getProfile(token);
      expect(read.body.data.dob_hijri_day).toBe(22);
      expect(read.body.data.dob_hijri_month).toBe(6);
      expect(read.body.data.dob_hijri_year).toBe(1405);
      expect(read.body.data.dob_hijri_text).toBe("22nd Jammad-il-Ukhra 1405 AH");
    });

    it("ignores a client-supplied Hijri date of birth", async () => {
      await putProfile(token, {
        dob_gregorian: "1985-03-14",
        dob_hijri_year: 1200,
        dob_hijri_text: "whatever the client says"
      });

      const read = await getProfile(token);
      expect(read.body.data.dob_hijri_year).toBe(1405);
      expect(read.body.data.dob_hijri_text).toBe("22nd Jammad-il-Ukhra 1405 AH");
    });

    it("clears the derived Hijri date when the Gregorian date is cleared", async () => {
      await putProfile(token, { dob_gregorian: "1985-03-14" });
      await putProfile(token, { dob_gregorian: null });

      const read = await getProfile(token);
      expect(read.body.data.dob_hijri_year).toBeNull();
      expect(read.body.data.dob_hijri_text).toBeNull();
    });

    // FR-064: generated by the database, so it cannot be written or drift from its inputs.
    it("derives BMI from height and weight", async () => {
      await putProfile(token, { height_cm: 174, weight_kg: 72.5 });

      const read = await getProfile(token);
      expect(read.body.data.bmi).toBeCloseTo(23.95, 2);
    });

    it("ignores a client-supplied BMI", async () => {
      await putProfile(token, { height_cm: 174, weight_kg: 72.5, bmi: 99 });
      expect((await getProfile(token)).body.data.bmi).toBeCloseTo(23.95, 2);
    });

    it("shows no BMI when either measurement is missing", async () => {
      await putProfile(token, { height_cm: 174, weight_kg: null });
      expect((await getProfile(token)).body.data.bmi).toBeNull();
    });

    it("ignores a submitted ITS number (FR-034)", async () => {
      await putProfile(token, { its_no: "11111111", name: "Still Me" });

      const read = await getProfile(token);
      expect(read.body.data.its_no).toBe(TEST_CREDENTIALS.memberSettled.itsNo);
      expect(read.body.data.name).toBe("Still Me");
    });

    // FR-033: partial saves are the normal case, not an error.
    it("accepts a partial profile and leaves untouched fields alone", async () => {
      await putProfile(token, { name: "First", surname: "Save" });
      await putProfile(token, { name: "Second" });

      const read = await getProfile(token);
      expect(read.body.data.name).toBe("Second");
      expect(read.body.data.surname).toBe("Save");
    });

    it("rejects a non-object body", async () => {
      const res = await request(app)
        .put("/api/v1/members/me/profile")
        .set("Authorization", `Bearer ${token}`)
        .send([1, 2, 3]);
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  describe("validation", () => {
    it("rejects a malformed email, naming field and tab", async () => {
      const res = await putProfile(token, { email: "not-an-email" });

      expect(res.status).toBe(400);
      expect(errorFields(res)).toContain("email");
      expect(res.body.data.errors[0].tab).toBe(1);
    });

    it("rejects a future date of birth", async () => {
      const res = await putProfile(token, { dob_gregorian: "2999-01-01" });
      expect(res.status).toBe(400);
      expect(errorFields(res)).toContain("dob_gregorian");
    });

    it("rejects an impossible date", async () => {
      const res = await putProfile(token, { dob_gregorian: "2026-02-30" });
      expect(res.status).toBe(400);
    });

    it("rejects a malformed phone number", async () => {
      const res = await putProfile(token, { mobile_no_1: "call me maybe" });
      expect(res.status).toBe(400);
      expect(errorFields(res)).toContain("mobile_no_1");
    });

    it("rejects a value outside an enum", async () => {
      const res = await putProfile(token, { blood_group: "Z+" });
      expect(res.status).toBe(400);
      expect(errorFields(res)).toContain("blood_group");
    });

    it("rejects a non-positive height or weight", async () => {
      const res = await putProfile(token, { height_cm: 0, weight_kg: -5 });
      expect(res.status).toBe(400);
      expect(errorFields(res)).toEqual(expect.arrayContaining(["height_cm", "weight_kg"]));
    });

    it("rejects a future donation date", async () => {
      const res = await putProfile(token, { last_donation_date: "2999-01-01" });
      expect(res.status).toBe(400);
    });

    it("rejects a since-year before the year of birth", async () => {
      const res = await putProfile(token, {
        dob_gregorian: "1990-01-01",
        occupation_since_year: 1985
      });
      expect(res.status).toBe(400);
      expect(errorFields(res)).toContain("occupation_since_year");
    });

    /**
     * The window is Hijri: 1401 AH to the current Hijri year, computed per request so it
     * rolls over on its own. The ceiling is read from the same helper the route uses rather
     * than written as a literal, which would expire silently at the next Hijri new year.
     *
     * A Gregorian year is the case worth stating outright. It is the mistake this field had
     * for real — 1950-2026 accepted 2006 CE and a Hijri year alike, so the wrong calendar
     * stored without complaint.
     */
    /**
     * FR-049a. The Zikr e Hussain year has its OWN floor, 1375 AH rather than 1401.
     *
     * 1375-1400 is the whole point of the field being separate, so both ends are asserted:
     * 1375 must be accepted and 1374 refused. A test that only checked the ceiling would
     * pass against the shared 1401 floor and miss the entire difference.
     */
    it("accepts a Zikr e Hussain year from 1375 AH, below the other years' floor", async () => {
      const current = currentHijriYear();

      expect((await putProfile(token, { zikr_e_hussain_since_year: 1375 })).status).toBe(200);
      expect((await putProfile(token, { zikr_e_hussain_since_year: 1400 })).status).toBe(200);
      expect((await putProfile(token, { zikr_e_hussain_since_year: current })).status).toBe(200);

      expect((await putProfile(token, { zikr_e_hussain_since_year: 1374 })).status).toBe(400);
      expect((await putProfile(token, { zikr_e_hussain_since_year: current + 1 })).status).toBe(400);
      expect((await putProfile(token, { zikr_e_hussain_since_year: 2006 })).status).toBe(400);
    });

    it("stores and returns the Zikr e Hussain year", async () => {
      await putProfile(token, { zikr_e_hussain_since_year: 1390 });
      expect((await getProfile(token)).body.data.zikr_e_hussain_since_year).toBe(1390);
    });

    it("rejects a prefix year outside 1401 AH to the current Hijri year", async () => {
      const current = currentHijriYear();

      expect((await putProfile(token, { prefix_year: 1400 })).status).toBe(400);
      expect((await putProfile(token, { prefix_year: current + 1 })).status).toBe(400);
      expect((await putProfile(token, { prefix_year: 2006 })).status).toBe(400);

      expect((await putProfile(token, { prefix_year: 1401 })).status).toBe(200);
      expect((await putProfile(token, { prefix_year: current })).status).toBe(200);
    });

    // FR-029: nothing is written when validation fails.
    it("writes nothing when a save is rejected", async () => {
      await putProfile(token, { name: "Good Value" });
      const rejected = await putProfile(token, { name: "Should Not Stick", email: "bad" });

      expect(rejected.status).toBe(400);
      expect((await getProfile(token)).body.data.name).toBe("Good Value");
    });

    it("reports several problems at once, each with its tab", async () => {
      const res = await putProfile(token, {
        email: "bad",
        blood_group: "Z+",
        hizb_role: "Emperor"
      });

      expect(res.status).toBe(400);
      const tabs = res.body.data.errors.map((e: any) => e.tab);
      expect(tabs).toEqual(expect.arrayContaining([1, 3, 6]));
    });

    // FR-048. The rule most likely to be hit in practice, by changing the Zone and leaving
    // the Party behind.
    it("rejects a Party that does not belong to the selected Zone", async () => {
      const res = await putProfile(token, {
        zone_id: seeded.zoneId,
        party_id: seeded.otherPartyId
      });

      expect(res.status).toBe(400);
      expect(errorFields(res)).toContain("party_id");
      expect(res.body.data.errors[0].message).toMatch(/does not belong/i);
    });

    it("accepts a Party that does belong to the selected Zone", async () => {
      const res = await putProfile(token, {
        zone_id: seeded.otherZoneId,
        party_id: seeded.otherPartyId
      });
      expect(res.status).toBe(200);
    });

    it("rejects a lookup id that does not exist", async () => {
      const res = await putProfile(token, { marital_status_id: 99999999 });
      expect(res.status).toBe(400);
      expect(errorFields(res)).toContain("marital_status_id");
    });

    describe("conditional rules", () => {
      // FR-059
      it("requires a Sanad when Hifz Sanad is yes", async () => {
        const res = await putProfile(token, { has_hifz_sanad: true });
        expect(res.status).toBe(400);
        expect(errorFields(res)).toContain("sanad_id");
      });

      it("clears the Sanad when Hifz Sanad is no", async () => {
        await putProfile(token, { has_hifz_sanad: true, sanad_id: seeded.sanadId });
        await putProfile(token, { has_hifz_sanad: false, sanad_id: seeded.sanadId });

        expect((await getProfile(token)).body.data.sanad_id).toBeNull();
      });

      // FR-081
      it("requires a reason when the Karachi Tamreen session is not attended", async () => {
        const res = await putProfile(token, { attends_karachi_tamreen: false });
        expect(res.status).toBe(400);
        expect(errorFields(res)).toContain("tamreen_absence_reason");
      });

      it("clears the reason when the session is attended", async () => {
        await putProfile(token, {
          attends_karachi_tamreen: false,
          tamreen_absence_reason: "Away"
        });
        await putProfile(token, {
          attends_karachi_tamreen: true,
          tamreen_absence_reason: "Away"
        });

        expect((await getProfile(token)).body.data.tamreen_absence_reason).toBeNull();
      });

      // FR-052
      it("clears the Designation when the occupation is a Business", async () => {
        await putProfile(token, { occupation_type: "Job", designation: "Engineer" });
        await putProfile(token, { occupation_type: "Business", designation: "Engineer" });

        expect((await getProfile(token)).body.data.designation).toBeNull();
      });

      // FR-086
      it.each([
        ["Sansta", ["sansta_name"]],
        ["Umoor", ["umoor_name"]],
        ["Both", ["sansta_name", "umoor_name"]]
      ])("requires the right name fields for khidmat type %s", async (type, expected) => {
        const res = await putProfile(token, { khidmat_type: type });
        expect(res.status).toBe(400);
        expect(errorFields(res)).toEqual(expect.arrayContaining(expected));
      });

      it("clears the Umoor name when the khidmat type is Sansta only", async () => {
        await putProfile(token, {
          khidmat_type: "Both",
          sansta_name: "S",
          umoor_name: "U"
        });
        await putProfile(token, {
          khidmat_type: "Sansta",
          sansta_name: "S",
          umoor_name: "U"
        });

        expect((await getProfile(token)).body.data.umoor_name).toBeNull();
      });
    });
  });

  // -------------------------------------------------------------------------
  /**
   * The same Hijri window applies to all five year fields, not just the prefix year.
   *
   * A Gregorian value is the probe in every case: it is what these fields used to accept, so
   * a tab left behind in a future edit fails here rather than silently storing 2020 CE
   * alongside 1441 AH in the same column.
   */
  describe("the Hijri year window (all five fields)", () => {
    it("rejects a Gregorian year in every field that moved to Hijri", async () => {
      const gregorian = 2020;

      expect((await putProfile(token, { prefix_year: gregorian })).status).toBe(400);
      expect((await putProfile(token, { khidmat_since_year: gregorian })).status).toBe(400);
      expect(
        (await putProfile(token, { titles: [{ title_id: seeded.titleId, title_year: gregorian }] }))
          .status
      ).toBe(400);
      expect(
        (
          await putProfile(token, {
            sharafs: [{ sharaf_id: seeded.sharafId, sharaf_year: gregorian }]
          })
        ).status
      ).toBe(400);
      expect(
        (
          await putProfile(token, {
            places_visited: [
              { place_id: seeded.placeA, times_count: 1, years: [gregorian] }
            ]
          })
        ).status
      ).toBe(400);
    });

    it("accepts the current Hijri year in every one of them", async () => {
      const current = currentHijriYear();

      expect((await putProfile(token, { prefix_year: current })).status).toBe(200);
      expect((await putProfile(token, { khidmat_since_year: current })).status).toBe(200);
      expect(
        (await putProfile(token, { titles: [{ title_id: seeded.titleId, title_year: current }] }))
          .status
      ).toBe(200);
      expect(
        (
          await putProfile(token, {
            sharafs: [{ sharaf_id: seeded.sharafId, sharaf_year: current }]
          })
        ).status
      ).toBe(200);
      expect(
        (
          await putProfile(token, {
            places_visited: [{ place_id: seeded.placeA, times_count: 1, years: [current] }]
          })
        ).status
      ).toBe(200);
    });

    /**
     * khidmat_since_year used to be checked against the member's GREGORIAN year of birth.
     * Now that it is Hijri, 1447 AH is numerically less than a 2006 CE birth year, so that
     * check would reject every valid value. It was moved off that comparison deliberately,
     * and this pins it — the failure would otherwise look like an unrelated birth-year rule.
     */
    it("does not compare the Hijri khidmat year against a Gregorian year of birth", async () => {
      await putProfile(token, { dob_gregorian: "2006-01-01" });

      const res = await putProfile(token, { khidmat_since_year: 1447 });
      expect(res.status).toBe(200);
      expect((await getProfile(token)).body.data.khidmat_since_year).toBe(1447);
    });
  });

  // -------------------------------------------------------------------------
  describe("repeatable sections", () => {
    it("saves and returns titles", async () => {
      await putProfile(token, {
        titles: [
          { title_id: seeded.titleId, title_year: 1432 },
          { title_id: seeded.titleId, title_year: 1440 }
        ]
      });

      const read = await getProfile(token);
      expect(read.body.data.titles).toEqual([
        { title_id: seeded.titleId, title_year: 1432 },
        { title_id: seeded.titleId, title_year: 1440 }
      ]);
    });

    it("replaces a section in full rather than appending", async () => {
      await putProfile(token, { titles: [{ title_id: seeded.titleId, title_year: 1432 }] });
      await putProfile(token, { titles: [{ title_id: seeded.titleId, title_year: 1440 }] });

      const read = await getProfile(token);
      expect(read.body.data.titles).toHaveLength(1);
      expect(read.body.data.titles[0].title_year).toBe(1440);
    });

    it("leaves a section untouched when its array is omitted", async () => {
      await putProfile(token, { titles: [{ title_id: seeded.titleId, title_year: 1432 }] });
      await putProfile(token, { name: "Unrelated change" });

      expect((await getProfile(token)).body.data.titles).toHaveLength(1);
    });

    it("clears a section when its array is empty", async () => {
      await putProfile(token, { titles: [{ title_id: seeded.titleId, title_year: 1432 }] });
      await putProfile(token, { titles: [] });

      expect((await getProfile(token)).body.data.titles).toEqual([]);
    });

    it("rejects the same title and year listed twice", async () => {
      const res = await putProfile(token, {
        titles: [
          { title_id: seeded.titleId, title_year: 1432 },
          { title_id: seeded.titleId, title_year: 1432 }
        ]
      });
      expect(res.status).toBe(400);
    });

    it("saves skills as a set", async () => {
      await putProfile(token, { skill_ids: [seeded.skillId, seeded.skillId] });
      expect((await getProfile(token)).body.data.skill_ids).toEqual([seeded.skillId]);
    });

    describe("places visited (Tab 8)", () => {
      it("saves a place with its count and years", async () => {
        await putProfile(token, {
          places_visited: [
            { place_id: seeded.placeA, times_count: 3, years: [1439, 1442, 1444] }
          ]
        });

        const read = await getProfile(token);
        expect(read.body.data.places_visited).toEqual([
          { place_id: seeded.placeA, times_count: 3, years: [1439, 1442, 1444] }
        ]);
      });

      // FR-073, and the message must name both numbers so the member knows what to fix.
      it("refuses a count that does not match the years listed", async () => {
        const res = await putProfile(token, {
          places_visited: [{ place_id: seeded.placeA, times_count: 3, years: [1439, 1442] }]
        });

        expect(res.status).toBe(400);
        expect(res.body.data.errors[0].tab).toBe(8);
        expect(res.body.data.errors[0].message).toMatch(/3/);
        expect(res.body.data.errors[0].message).toMatch(/2 year/);
      });

      it("accepts a count of zero with no years", async () => {
        const res = await putProfile(token, {
          places_visited: [{ place_id: seeded.placeA, times_count: 0, years: [] }]
        });
        expect(res.status).toBe(200);
      });

      // FR-071
      it("refuses the same place listed twice", async () => {
        const res = await putProfile(token, {
          places_visited: [
            { place_id: seeded.placeA, times_count: 1, years: [1440] },
            { place_id: seeded.placeA, times_count: 1, years: [1441] }
          ]
        });
        expect(res.status).toBe(400);
        expect(res.body.data.errors[0].message).toMatch(/already listed/i);
      });

      it("refuses a repeated year within one place", async () => {
        const res = await putProfile(token, {
          places_visited: [{ place_id: seeded.placeA, times_count: 2, years: [1440, 1440] }]
        });
        expect(res.status).toBe(400);
      });

      it("accepts several different places", async () => {
        const res = await putProfile(token, {
          places_visited: [
            { place_id: seeded.placeA, times_count: 1, years: [1440] },
            { place_id: seeded.placeB, times_count: 2, years: [1441, 1442] }
          ]
        });
        expect(res.status).toBe(200);
        expect((await getProfile(token)).body.data.places_visited).toHaveLength(2);
      });
    });

    describe("Ashara Mubaraka (Tab 9)", () => {
      it("saves an attendance record", async () => {
        await putProfile(token, {
          ashara_attendances: [
            {
              attended_with: "With Aqa Moula TUS",
              hijri_year: 1441,
              moze_id: seeded.mozeId,
              mohallah_id: seeded.mohallahId
            }
          ]
        });

        const read = await getProfile(token);
        expect(read.body.data.ashara_attendances).toHaveLength(1);
        expect(read.body.data.ashara_attendances[0].attended_with).toBe("With Aqa Moula TUS");
        expect(read.body.data.ashara_attendances[0].hijri_year).toBe(1441);
      });

      // FR-076
      it("refuses a Hijri year before 1400", async () => {
        const res = await putProfile(token, {
          ashara_attendances: [{ attended_with: "With Aamil", hijri_year: 1399 }]
        });
        expect(res.status).toBe(400);
        expect(res.body.data.errors[0].message).toMatch(/1400/);
      });

      it("refuses a Hijri year beyond the current one", async () => {
        const res = await putProfile(token, {
          ashara_attendances: [
            { attended_with: "With Aamil", hijri_year: currentHijriYear() + 1 }
          ]
        });
        expect(res.status).toBe(400);
      });

      it("accepts the current Hijri year", async () => {
        const res = await putProfile(token, {
          ashara_attendances: [
            { attended_with: "With Aamil", hijri_year: currentHijriYear() }
          ]
        });
        expect(res.status).toBe(200);
      });

      it("refuses two records for the same Hijri year", async () => {
        const res = await putProfile(token, {
          ashara_attendances: [
            { attended_with: "With Aamil", hijri_year: 1441 },
            { attended_with: "With Aqa Moula TUS", hijri_year: 1441 }
          ]
        });
        expect(res.status).toBe(400);
      });

      it("refuses an attended-with value outside the two allowed", async () => {
        const res = await putProfile(token, {
          ashara_attendances: [{ attended_with: "With Someone Else", hijri_year: 1441 }]
        });
        expect(res.status).toBe(400);
      });

      it("accepts a record with no Mohallah, which is optional", async () => {
        const res = await putProfile(token, {
          ashara_attendances: [
            { attended_with: "With Aamil", hijri_year: 1442, moze_id: seeded.mozeId }
          ]
        });
        expect(res.status).toBe(200);
        expect((await getProfile(token)).body.data.ashara_attendances[0].mohallah_id).toBeNull();
      });
    });

    // FR-030: the save is one transaction, so a late failure must not leave earlier
    // sections written.
    it("writes no section when a later one fails validation", async () => {
      await putProfile(token, { titles: [{ title_id: seeded.titleId, title_year: 1432 }] });

      const res = await putProfile(token, {
        titles: [{ title_id: seeded.titleId, title_year: 1440 }],
        places_visited: [{ place_id: seeded.placeA, times_count: 5, years: [1440] }]
      });

      expect(res.status).toBe(400);
      // The titles section still holds the ORIGINAL year.
      expect((await getProfile(token)).body.data.titles[0].title_year).toBe(1432);
    });
  });

  // -------------------------------------------------------------------------
  // FR-097, FR-098: one member's data is reachable only with that member's token.
  describe("isolation between members", () => {
    it("returns each member only their own profile", async () => {
      const tokenA = await memberToken("memberSettled");
      const tokenB = await memberToken("memberThrottle");

      await putProfile(tokenA, { name: "Member A" });
      await putProfile(tokenB, { name: "Member B" });

      expect((await getProfile(tokenA)).body.data.name).toBe("Member A");
      expect((await getProfile(tokenB)).body.data.name).toBe("Member B");
      expect((await getProfile(tokenA)).body.data.its_no).toBe(
        TEST_CREDENTIALS.memberSettled.itsNo
      );
      expect((await getProfile(tokenB)).body.data.its_no).toBe(
        TEST_CREDENTIALS.memberThrottle.itsNo
      );

      // Clean up B, which is outside this file's beforeEach reset.
      await clearMemberData(TEST_CREDENTIALS.memberThrottle.itsNo);
    });

    it("cannot be redirected to another member by a body field", async () => {
      const tokenA = await memberToken("memberSettled");
      const [rowsB] = await pool.query<any[]>(
        "SELECT id FROM member_accounts WHERE its_no = :i",
        { i: TEST_CREDENTIALS.memberThrottle.itsNo }
      );
      const bId = Number(rowsB[0].id);

      await putProfile(tokenA, {
        name: "Written By A",
        member_account_id: bId,
        id: bId,
        its_no: TEST_CREDENTIALS.memberThrottle.itsNo
      });

      // B's profile must not exist as a result of A's write.
      const [bProfile] = await pool.query<any[]>(
        "SELECT COUNT(*) AS n FROM member_profiles WHERE member_account_id = :id",
        { id: bId }
      );
      expect(Number(bProfile[0].n)).toBe(0);

      expect((await getProfile(tokenA)).body.data.name).toBe("Written By A");
    });

    // FR-100, FR-107
    it.each([
      ["party", TEST_CREDENTIALS.party.itsNo, TEST_CREDENTIALS.party.password],
      ["admin", TEST_CREDENTIALS.admin.username, TEST_CREDENTIALS.admin.password]
    ])("refuses a %s token with 403", async (role, identifier, password) => {
      const signIn = await request(app)
        .post("/api/v1/auth/login")
        .send({ identifier, password, role });

      const res = await request(app)
        .get("/api/v1/members/me/profile")
        .set("Authorization", `Bearer ${signIn.body.data.token}`);

      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // The two-sessions edge case: the later save must not silently discard the earlier one.
  describe("concurrent edits", () => {
    it("rejects a save whose if_unmodified_since is stale", async () => {
      await putProfile(token, { name: "First" });
      const read = await getProfile(token);
      const stamp = read.body.data.updated_at;

      // Another session saves in between.
      await new Promise((r) => setTimeout(r, 1100));
      await putProfile(token, { name: "From another session" });

      const conflicted = await putProfile(token, {
        name: "Based on a stale read",
        if_unmodified_since: stamp
      });

      expect(conflicted.status).toBe(409);
      expect((await getProfile(token)).body.data.name).toBe("From another session");
    });

    it("accepts a save whose if_unmodified_since is current", async () => {
      await putProfile(token, { name: "First" });
      const read = await getProfile(token);

      const res = await putProfile(token, {
        name: "Second",
        if_unmodified_since: read.body.data.updated_at
      });

      expect(res.status).toBe(200);
    });
  });
});
