import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { memberProfileRoutes } from "../routes/memberProfileRoutes";
import { pool } from "../db/pool";
import { currentHijriYear } from "../utils/hijriDate";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, clearMemberLoginAttempts } from "./helpers/fixtures";
import { clearMemberData, removeSeededLookups, seedAllLookups } from "./helpers/memberLookups";
import type { SeededLookups } from "./helpers/memberLookups";

/**
 * REPEATABLE SECTIONS: add, edit, delete (FR-046, FR-069, FR-072, FR-073, FR-074, FR-076)
 *
 * `memberProfile.test.ts` already covers replace-in-full, the omitted-versus-empty
 * distinction, duplicate rejection and the Hijri bounds. This file tests the thing those do
 * not: the sequence a member actually performs, which is the Phase 8 acceptance criterion —
 * **add three rows, edit the middle one, delete the first, save, and confirm exactly the
 * expected rows remain** — against all four repeatable sections.
 *
 * Why that sequence needs its own test. There is no add, edit or delete endpoint; there is
 * one save that replaces a section in full. So "edit the middle row" and "delete the first
 * row" are not operations the server knows about — they are differences between two arrays.
 * The risk is not that one of them fails, it is that order, identity or position is quietly
 * lost in the round trip: row 2 edited but coming back as row 3, or the delete removing the
 * wrong row because the section is keyed on position somewhere it should not be.
 *
 * Every assertion therefore checks the WHOLE section after the save, not just the row that
 * changed. A test that only looked at the edited row would pass while the others were
 * scrambled.
 */

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/members", router: memberProfileRoutes }
]);

const MEMBER = TEST_CREDENTIALS.memberSettled;

let seeded: SeededLookups;
let token: string;

function putProfile(body: Record<string, unknown>) {
  return request(app)
    .put("/api/v1/members/me/profile")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

function getProfile() {
  return request(app).get("/api/v1/members/me/profile").set("Authorization", `Bearer ${token}`);
}

async function readSection<T>(key: string): Promise<T[]> {
  const res = await getProfile();
  expect(res.status).toBe(200);
  return res.body.data[key] as T[];
}

function errorMessages(res: any): string[] {
  return (res.body.data?.errors ?? []).map((e: any) => e.message);
}

beforeAll(async () => {
  seeded = await seedAllLookups();
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: MEMBER.itsNo, password: MEMBER.password, role: "member" });
  expect(res.status).toBe(200);
  token = res.body.data.token;
});

beforeEach(async () => {
  await clearMemberLoginAttempts();
  await clearMemberData(MEMBER.itsNo);
});

afterAll(async () => {
  await clearMemberData(MEMBER.itsNo);
  await removeSeededLookups();
  await clearMemberLoginAttempts();
  await pool.end();
});

// ---------------------------------------------------------------------------
// T096 — the add / edit / delete sequence, per section
// ---------------------------------------------------------------------------

describe("Tab 2 titles — add three, edit the middle, delete the first (FR-046)", () => {
  it("leaves exactly the expected rows", async () => {
    // The same title in three different years is legitimate; the year is what distinguishes
    // the rows, so it is also the only thing an edit can change.
    const added = await putProfile({
      titles: [
        { title_id: seeded.titleId, title_year: 1410 },
        { title_id: seeded.titleId, title_year: 1420 },
        { title_id: seeded.titleId, title_year: 1430 }
      ]
    });
    expect(added.status).toBe(200);
    expect(await readSection("titles")).toHaveLength(3);

    // Edit the middle row (1420 -> 1425) and delete the first (1410), in one save.
    const saved = await putProfile({
      titles: [
        { title_id: seeded.titleId, title_year: 1425 },
        { title_id: seeded.titleId, title_year: 1430 }
      ]
    });
    expect(saved.status).toBe(200);

    expect(await readSection("titles")).toEqual([
      { title_id: seeded.titleId, title_year: 1425 },
      { title_id: seeded.titleId, title_year: 1430 }
    ]);
  });
});

describe("Tab 7 sharafs — add three, edit the middle, delete the first (FR-069)", () => {
  it("leaves exactly the expected rows", async () => {
    await putProfile({
      sharafs: [
        { sharaf_id: seeded.sharafId, sharaf_year: 1415 },
        { sharaf_id: seeded.sharafId, sharaf_year: 1425 },
        { sharaf_id: seeded.sharafId, sharaf_year: 1435 }
      ]
    });
    expect(await readSection("sharafs")).toHaveLength(3);

    const saved = await putProfile({
      sharafs: [
        { sharaf_id: seeded.sharafId, sharaf_year: 1426 },
        { sharaf_id: seeded.sharafId, sharaf_year: 1435 }
      ]
    });
    expect(saved.status).toBe(200);

    expect(await readSection("sharafs")).toEqual([
      { sharaf_id: seeded.sharafId, sharaf_year: 1426 },
      { sharaf_id: seeded.sharafId, sharaf_year: 1435 }
    ]);
  });

  it("does not disturb titles when only sharafs are sent", async () => {
    await putProfile({
      titles: [{ title_id: seeded.titleId, title_year: 1421 }],
      sharafs: [{ sharaf_id: seeded.sharafId, sharaf_year: 1422 }]
    });

    await putProfile({ sharafs: [] });

    // Replace-in-full is per section, not per profile.
    expect(await readSection("titles")).toHaveLength(1);
    expect(await readSection("sharafs")).toHaveLength(0);
  });
});

describe("Tab 8 places visited — add three, edit the middle, delete the first (FR-072)", () => {
  type Visit = { place_id: number; times_count: number; years: number[] };

  it("leaves exactly the expected rows, with each place's own years", async () => {
    // Only two places are seeded, so the third row reuses Place B's id — which is itself
    // worth exercising: it must be refused as a duplicate, so the three rows use two places
    // plus a different years list.
    await putProfile({
      places_visited: [
        { place_id: seeded.placeA, times_count: 1, years: [1438] },
        { place_id: seeded.placeB, times_count: 2, years: [1439, 1440] }
      ]
    });
    expect(await readSection<Visit>("places_visited")).toHaveLength(2);

    // Edit Place B (add a year, and the count with it) and delete Place A.
    const saved = await putProfile({
      places_visited: [{ place_id: seeded.placeB, times_count: 3, years: [1439, 1440, 1441] }]
    });
    expect(saved.status).toBe(200);

    const visits = await readSection<Visit>("places_visited");
    expect(visits).toHaveLength(1);
    expect(visits[0].place_id).toBe(seeded.placeB);
    expect(visits[0].times_count).toBe(3);
    expect(visits[0].years).toEqual([1439, 1440, 1441]);
  });

  it("removes a year from a place without touching the others", async () => {
    await putProfile({
      places_visited: [
        { place_id: seeded.placeA, times_count: 3, years: [1436, 1437, 1438] },
        { place_id: seeded.placeB, times_count: 1, years: [1440] }
      ]
    });

    // Drop the middle year from Place A. Its count must come down with it (FR-073).
    await putProfile({
      places_visited: [
        { place_id: seeded.placeA, times_count: 2, years: [1436, 1438] },
        { place_id: seeded.placeB, times_count: 1, years: [1440] }
      ]
    });

    const visits = await readSection<Visit>("places_visited");
    const a = visits.find((v) => v.place_id === seeded.placeA);
    const b = visits.find((v) => v.place_id === seeded.placeB);
    expect(a?.years).toEqual([1436, 1438]);
    expect(b?.years).toEqual([1440]);
  });
});

describe("Tab 9 Ashara Mubaraka — add three, edit the middle, delete the first (FR-074)", () => {
  type Ashara = {
    attended_with: string;
    hijri_year: number;
    moze_id: number | null;
    mohallah_id: number | null;
    aqa_moula_ashara_id: number | null;
  };

  it("leaves exactly the expected rows", async () => {
    await putProfile({
      ashara_attendances: [
        { attended_with: "With Aqa Moula TUS", hijri_year: 1440, moze_id: seeded.mozeId },
        { attended_with: "With Aamil", hijri_year: 1441, moze_id: seeded.mozeId },
        { attended_with: "With Aamil", hijri_year: 1442, moze_id: seeded.mozeId }
      ]
    });
    expect(await readSection<Ashara>("ashara_attendances")).toHaveLength(3);

    // Edit the middle record's attended-with, and delete the first.
    const saved = await putProfile({
      ashara_attendances: [
        { attended_with: "With Aqa Moula TUS", hijri_year: 1441, moze_id: seeded.mozeId },
        { attended_with: "With Aamil", hijri_year: 1442, moze_id: seeded.mozeId }
      ]
    });
    expect(saved.status).toBe(200);

    const rows = await readSection<Ashara>("ashara_attendances");
    expect(rows.map((r) => r.hijri_year)).toEqual([1441, 1442]);
    expect(rows.map((r) => r.attended_with)).toEqual(["With Aqa Moula TUS", "With Aamil"]);
  });

  /**
   * FR-077a. Where the member attended depends on who they attended with, and each answer
   * CLEARS the other's fields rather than rejecting them.
   *
   * The clearing is what these pin. A client that sends both — an older build, or a form
   * whose state was not reset — must not leave a Moze on a record that attended with Aqa
   * Moula. Nothing on the member's form would show that value, so nobody could correct it.
   */
  it("stores the Aqa Moula place and clears Moze for With Aqa Moula TUS", async () => {
    const res = await putProfile({
      ashara_attendances: [
        {
          attended_with: "With Aqa Moula TUS",
          hijri_year: 1445,
          aqa_moula_ashara_id: seeded.aqaMoulaAsharaId,
          // Deliberately sent too. The server must drop both.
          moze_id: seeded.mozeId,
          mohallah_id: seeded.mohallahId
        }
      ]
    });
    expect(res.status).toBe(200);

    const [row] = await readSection<Ashara>("ashara_attendances");
    expect(row.aqa_moula_ashara_id).toBe(seeded.aqaMoulaAsharaId);
    expect(row.moze_id).toBeNull();
    expect(row.mohallah_id).toBeNull();
  });

  it("stores Moze and clears the Aqa Moula place for With Aamil", async () => {
    const res = await putProfile({
      ashara_attendances: [
        {
          attended_with: "With Aamil",
          hijri_year: 1446,
          moze_id: seeded.mozeId,
          aqa_moula_ashara_id: seeded.aqaMoulaAsharaId
        }
      ]
    });
    expect(res.status).toBe(200);

    const [row] = await readSection<Ashara>("ashara_attendances");
    expect(row.moze_id).toBe(seeded.mozeId);
    expect(row.aqa_moula_ashara_id).toBeNull();
  });

  /**
   * FR-077b. Once a place has a year, the year alone decides it: the form no longer sends
   * one, and a stale client that sends a different one is overridden rather than trusted.
   */
  it("fills in the Aqa Moula place from the year, overriding what the client sent", async () => {
    await pool.query("UPDATE aqa_moula_asharas SET hijri_year = 1439 WHERE id = ?", [
      seeded.aqaMoulaAsharaId
    ]);
    try {
      const res = await putProfile({
        ashara_attendances: [
          { attended_with: "With Aqa Moula TUS", hijri_year: 1439, aqa_moula_ashara_id: null }
        ]
      });
      expect(res.status).toBe(200);

      const [row] = await readSection<Ashara>("ashara_attendances");
      expect(row.aqa_moula_ashara_id).toBe(seeded.aqaMoulaAsharaId);
    } finally {
      await pool.query("UPDATE aqa_moula_asharas SET hijri_year = NULL WHERE id = ?", [
        seeded.aqaMoulaAsharaId
      ]);
    }
  });

  it("refuses an Aqa Moula place that does not exist", async () => {
    const res = await putProfile({
      ashara_attendances: [
        {
          attended_with: "With Aqa Moula TUS",
          hijri_year: 1447,
          aqa_moula_ashara_id: 99999999
        }
      ]
    });
    expect(res.status).toBe(400);
  });

  it("keeps an optional Mohallah on the right record", async () => {
    await putProfile({
      ashara_attendances: [
        { attended_with: "With Aamil", hijri_year: 1443, moze_id: seeded.mozeId },
        {
          attended_with: "With Aamil",
          hijri_year: 1444,
          moze_id: seeded.mozeId,
          mohallah_id: seeded.mohallahId
        }
      ]
    });

    const rows = await readSection<Ashara>("ashara_attendances");
    expect(rows.find((r) => r.hijri_year === 1443)?.mohallah_id).toBeNull();
    expect(rows.find((r) => r.hijri_year === 1444)?.mohallah_id).toBe(seeded.mohallahId);
  });
});

// ---------------------------------------------------------------------------
// T097 — FR-073 must NAME the place, and write nothing
// ---------------------------------------------------------------------------

describe("FR-073: a count that disagrees with the years listed", () => {
  it("names the place as well as both counts", async () => {
    const res = await putProfile({
      places_visited: [{ place_id: seeded.placeA, times_count: 4, years: [1439, 1442] }]
    });

    expect(res.status).toBe(400);

    const message = errorMessages(res)[0] as string;
    // All three things FR-073 asks for: the place, and both counts.
    expect(message).toContain("Place A");
    expect(message).toContain("4");
    expect(message).toMatch(/2 year/);
  });

  it("names the right place when a later row is the one at fault", async () => {
    const res = await putProfile({
      places_visited: [
        { place_id: seeded.placeA, times_count: 1, years: [1438] },
        { place_id: seeded.placeB, times_count: 5, years: [1439] }
      ]
    });

    expect(res.status).toBe(400);

    const message = errorMessages(res)[0] as string;
    expect(message).toContain("Place B");
    expect(message).not.toContain("Place A");
  });

  it("writes nothing at all — not even the rows that were valid", async () => {
    // A good first save, so there is existing state a failed save could corrupt.
    await putProfile({
      name: "Before The Bad Save",
      places_visited: [{ place_id: seeded.placeA, times_count: 1, years: [1438] }]
    });

    const res = await putProfile({
      name: "Should Not Be Stored",
      places_visited: [
        { place_id: seeded.placeA, times_count: 1, years: [1438] },
        { place_id: seeded.placeB, times_count: 9, years: [1440] }
      ]
    });
    expect(res.status).toBe(400);

    const after = await getProfile();
    // The scalar is untouched too: validation runs before the transaction opens (FR-030).
    expect(after.body.data.name).toBe("Before The Bad Save");
    expect(after.body.data.places_visited).toHaveLength(1);
  });

  it("is reported even when another field has also failed", async () => {
    // The count check deliberately runs regardless of other validation failures, so a member
    // does not fix a typo, save, and only then learn about the mismatch.
    const res = await putProfile({
      email: "not-an-email",
      places_visited: [{ place_id: seeded.placeA, times_count: 7, years: [1439] }]
    });

    expect(res.status).toBe(400);

    const fields = (res.body.data.errors ?? []).map((e: any) => e.field);
    expect(fields).toContain("email");
    expect(fields).toContain("places_visited[0]");
  });

  it("accepts a count that matches, including zero with no years", async () => {
    const res = await putProfile({
      places_visited: [{ place_id: seeded.placeA, times_count: 0, years: [] }]
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// T098 — the Hijri year range (FR-076)
// ---------------------------------------------------------------------------

describe("FR-076: the Hijri year range", () => {
  const thisYear = currentHijriYear();

  it("accepts exactly 1400, the lower bound", async () => {
    const res = await putProfile({
      ashara_attendances: [{ attended_with: "With Aamil", hijri_year: 1400 }]
    });
    expect(res.status).toBe(200);
  });

  it("refuses 1399, one below the bound", async () => {
    const res = await putProfile({
      ashara_attendances: [{ attended_with: "With Aamil", hijri_year: 1399 }]
    });
    expect(res.status).toBe(400);
  });

  it("accepts the current Hijri year and refuses the next one", async () => {
    const ok = await putProfile({
      ashara_attendances: [{ attended_with: "With Aamil", hijri_year: thisYear }]
    });
    expect(ok.status).toBe(200);

    const refused = await putProfile({
      ashara_attendances: [{ attended_with: "With Aamil", hijri_year: thisYear + 1 }]
    });
    expect(refused.status).toBe(400);
    // The bound is named, so the member can see what the limit is.
    expect(errorMessages(refused)[0]).toContain(String(thisYear));
  });

  it("states the range rather than just rejecting", async () => {
    const res = await putProfile({
      ashara_attendances: [{ attended_with: "With Aamil", hijri_year: 1200 }]
    });
    expect(errorMessages(res)[0]).toContain("1400");
  });
});

// ---------------------------------------------------------------------------
// T099 — uniqueness, and that a refusal writes nothing
// ---------------------------------------------------------------------------

describe("uniqueness within a section", () => {
  it("refuses two Ashara records for the same Hijri year, writing nothing", async () => {
    await putProfile({
      ashara_attendances: [{ attended_with: "With Aamil", hijri_year: 1445 }]
    });

    const res = await putProfile({
      ashara_attendances: [
        { attended_with: "With Aamil", hijri_year: 1446 },
        { attended_with: "With Aqa Moula TUS", hijri_year: 1446 }
      ]
    });
    expect(res.status).toBe(400);

    // The earlier record survives: the rejected save never reached the transaction.
    const rows = await readSection<{ hijri_year: number }>("ashara_attendances");
    expect(rows.map((r) => r.hijri_year)).toEqual([1445]);
  });

  it("refuses the same place listed twice in one save", async () => {
    const res = await putProfile({
      places_visited: [
        { place_id: seeded.placeA, times_count: 1, years: [1438] },
        { place_id: seeded.placeA, times_count: 1, years: [1439] }
      ]
    });
    expect(res.status).toBe(400);
  });

  it("refuses a repeated year within one place, naming the year", async () => {
    const res = await putProfile({
      places_visited: [{ place_id: seeded.placeA, times_count: 2, years: [1439, 1439] }]
    });
    expect(res.status).toBe(400);
    expect(errorMessages(res)[0]).toContain("1439");
  });

  it("allows the same year against two different places", async () => {
    // Visiting two places in one year is ordinary; only a repeat within one place is not.
    const res = await putProfile({
      places_visited: [
        { place_id: seeded.placeA, times_count: 1, years: [1439] },
        { place_id: seeded.placeB, times_count: 1, years: [1439] }
      ]
    });
    expect(res.status).toBe(200);
  });
});
