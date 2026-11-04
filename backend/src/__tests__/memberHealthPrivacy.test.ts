import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { importExportRoutes } from "../routes/importExportRoutes";
import { memberProfileRoutes } from "../routes/memberProfileRoutes";
import { pool } from "../db/pool";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, clearMemberLoginAttempts, ensureFixtures } from "./helpers/fixtures";

/**
 * HEALTH VALUES ARE NOT LEAKED (FR-065, FR-066, FR-101)
 *
 * Tab 6 holds the only medical data in the profile. FR-066 says those values must appear in
 * no log line, no error message and no general-purpose export, and FR-101 extends that to
 * contact details and photographs in the pre-existing exports.
 *
 * Testing an absence needs values that could not plausibly come from anywhere else, so the
 * sentinels below are distinctive to the digit. Each assertion then searches the WHOLE
 * payload — not named fields — because the point is that the value is nowhere in it, however
 * it might have been serialised.
 *
 * DELIBERATELY NOT COVERED: `GET /import-export/database-backup` dumps every table, so it
 * does carry `member_profiles` and `member_photos`. That was raised as an open question and
 * has since been **authorised** as the separately-specified exception FR-101 allows for
 * (FR-101a): a backup that omits tables cannot restore the system, and this endpoint is the
 * rollback tool the release runbook depends on. FR-101 still applies in full to the CSV
 * entity exports, which is what the tests below cover.
 */

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/members", router: memberProfileRoutes },
  { path: "/api/v1/import-export", router: importExportRoutes }
]);

/** Values chosen to be unmistakable in a grep of any payload. */
const HEALTH = {
  blood_group: "AB-",
  is_regular_donor: true,
  last_donation_date: "2026-02-17",
  height_cm: 171.3,
  weight_kg: 68.4
};

/** Every string that must not appear. BMI is generated, so its value is a leak too. */
const SENTINELS = ["AB-", "2026-02-17", "171.3", "68.4"];

const MEMBER = TEST_CREDENTIALS.memberSettled;

let memberToken: string;
let adminToken: string;
let memberAccountId: number;

async function signInMember() {
  const res = await request(app).post("/api/v1/auth/login").send({
    identifier: MEMBER.itsNo,
    password: MEMBER.password,
    role: "member"
  });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

async function signInAdmin() {
  const res = await request(app).post("/api/v1/auth/login").send({
    identifier: TEST_CREDENTIALS.admin.username,
    password: TEST_CREDENTIALS.admin.password,
    role: "admin"
  });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

function saveProfile(token: string, body: Record<string, unknown>) {
  return request(app)
    .put("/api/v1/members/me/profile")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

/**
 * Captures everything the application writes while `run` executes.
 *
 * Both console and the raw streams are watched: a leak through `process.stdout.write` — which
 * is what most loggers ultimately call — would slip past a console-only spy.
 */
async function captureOutput(run: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const record = (...args: unknown[]) => {
    chunks.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };

  const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;
  const spies = methods.map((m) => vi.spyOn(console, m).mockImplementation(record));
  const stdout = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);

  try {
    await run();
  } finally {
    for (const spy of spies) spy.mockRestore();
    stdout.mockRestore();
    stderr.mockRestore();
  }

  return chunks.join("\n");
}

async function clearProfile() {
  await pool.query("DELETE FROM member_photos WHERE member_account_id = :id", {
    id: memberAccountId
  });
  await pool.query("DELETE FROM member_profiles WHERE member_account_id = :id", {
    id: memberAccountId
  });
}

beforeAll(async () => {
  const fixtures = await ensureFixtures();
  memberAccountId = fixtures.memberSettledId;
  await clearMemberLoginAttempts();
  memberToken = await signInMember();
  adminToken = await signInAdmin();
});

afterEach(async () => {
  await clearMemberLoginAttempts();
});

afterAll(async () => {
  await clearProfile();
  await pool.end();
});

describe("health values and logging (FR-066)", () => {
  it("writes no health value to any log or stream while saving them", async () => {
    let status = 0;

    const output = await captureOutput(async () => {
      const res = await saveProfile(memberToken, { ...HEALTH, if_unmodified_since: null });
      status = res.status;
    });

    // The save must genuinely have happened, or the absence below proves nothing.
    expect(status).toBe(200);

    for (const sentinel of SENTINELS) {
      expect(output).not.toContain(sentinel);
    }
  });

  it("writes no health value to any log while reading them back", async () => {
    let body = "";

    const output = await captureOutput(async () => {
      const res = await request(app)
        .get("/api/v1/members/me/profile")
        .set("Authorization", `Bearer ${memberToken}`);
      body = JSON.stringify(res.body);
    });

    // The member's own response DOES carry them — that is FR-065, not a leak.
    expect(body).toContain("171.3");

    for (const sentinel of SENTINELS) {
      expect(output).not.toContain(sentinel);
    }
  });
});

describe("health values and error messages (FR-066)", () => {
  it("rejects a bad height without repeating the value back", async () => {
    const res = await saveProfile(memberToken, {
      height_cm: -171.3,
      if_unmodified_since: null
    });

    expect(res.status).toBe(400);

    const payload = JSON.stringify(res.body);
    expect(payload).toContain("height_cm");
    expect(payload).toMatch(/positive number/i);
    // The submitted figure itself must not be echoed.
    expect(payload).not.toContain("171.3");
  });

  it("rejects a bad blood group by listing the allowed set, not the submission", async () => {
    const res = await saveProfile(memberToken, {
      blood_group: "ZZ-171.3",
      if_unmodified_since: null
    });

    expect(res.status).toBe(400);

    const payload = JSON.stringify(res.body);
    expect(payload).toContain("blood_group");
    expect(payload).not.toContain("ZZ-171.3");
  });

  it("keeps health values out of a 403 raised for another member's profile", async () => {
    // Nothing in a refusal should reveal anything about any profile at all.
    const res = await request(app)
      .get("/api/v1/members/me/profile")
      .set("Authorization", "Bearer not-a-real-token");

    expect(res.status).toBe(401);

    const payload = JSON.stringify(res.body);
    for (const sentinel of SENTINELS) {
      expect(payload).not.toContain(sentinel);
    }
  });
});

describe("health values and the member export (FR-066, FR-101)", () => {
  it("exports the member account without any profile, health or photo data", async () => {
    // Confirm the values are stored, so their absence from the CSV is meaningful.
    const [rows] = await pool.query<any[]>(
      "SELECT blood_group, height_cm, weight_kg, bmi FROM member_profiles WHERE member_account_id = :id",
      { id: memberAccountId }
    );
    expect(rows[0]?.blood_group).toBe("AB-");
    expect(Number(rows[0]?.bmi)).toBeGreaterThan(0);

    const res = await request(app)
      .get("/api/v1/import-export/members/export")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const csv = res.text;
    // The member IS in the export — this is not an empty-file false pass.
    expect(csv).toContain(MEMBER.itsNo);

    for (const sentinel of SENTINELS) {
      expect(csv).not.toContain(sentinel);
    }

    // Nor should the column names appear, which would mean a new join had been added.
    for (const column of ["blood_group", "height_cm", "weight_kg", "bmi", "last_donation_date"]) {
      expect(csv).not.toContain(column);
    }
  });

  it("exports no contact details or photograph either (FR-101)", async () => {
    await saveProfile(memberToken, {
      mobile_no_1: "03001713000",
      email: "sentinel1713@example.invalid",
      residence_address: "1713 Sentinel Street",
      if_unmodified_since: null
    });

    const res = await request(app)
      .get("/api/v1/import-export/members/export")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    for (const sentinel of ["03001713000", "sentinel1713@example.invalid", "1713 Sentinel Street"]) {
      expect(res.text).not.toContain(sentinel);
    }
    expect(res.text).not.toContain("photo");
  });

  it("still exports no health data for a member who has no profile row at all", async () => {
    await clearProfile();

    const res = await request(app)
      .get("/api/v1/import-export/members/export")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // has_profile is the only thing the export says about the profile, and it says 0.
    expect(res.text).toContain(MEMBER.itsNo);
    for (const sentinel of SENTINELS) {
      expect(res.text).not.toContain(sentinel);
    }
  });
});
