import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { memberProfileRoutes } from "../routes/memberProfileRoutes";
import { pool } from "../db/pool";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, clearMemberLoginAttempts } from "./helpers/fixtures";
import { clearMemberData, removeSeededLookups, seedAllLookups } from "./helpers/memberLookups";

/**
 * NOTHING SENSITIVE LEAVES IN AN ERROR (FR-015, FR-028, FR-066, FR-101) — T111, T112
 *
 * The §7 security checklist in quickstart.md is covered test by test elsewhere: cross-member
 * isolation and the ignored ITS number in `memberProfile.test.ts`, cross-role refusals in
 * `memberForcedPasswordChange.test.ts` and `memberAdmin.test.ts`, unauthenticated and
 * magic-byte and oversize photo rejection in `memberPhoto.test.ts`, deactivated-account
 * indistinguishability in `memberAuth.test.ts`, and the export rules in
 * `memberHealthPrivacy.test.ts`.
 *
 * What was NOT covered is the error path, and that is what this file is for.
 *
 * The specific risk: `mysql2` interpolates named placeholders client-side, so a failed query
 * produces an error whose `sql` property contains the values that were being written —
 * including health values and anything else the member typed. If such an error were logged or
 * returned, every guarantee about health data would be void on exactly the request where
 * something went wrong. The application logs nothing at all (there is not one `console.*` call
 * outside tests) and both the route handlers and the terminal error handler in `server.ts`
 * return fixed strings, so the property holds — these tests pin it so it cannot regress.
 *
 * Writing them also surfaced a gap: there was no length validation on any text column, so an
 * over-long value reached MySQL and came back as a 500 that named no field. The member saw
 * the whole save fail with nothing to correct. Length and range checks were added; the tests
 * below are what they are for.
 */

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/members", router: memberProfileRoutes }
]);

const MEMBER = TEST_CREDENTIALS.memberSettled;

let token: string;

function putProfile(body: Record<string, unknown>) {
  return request(app)
    .put("/api/v1/members/me/profile")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

function errorFor(res: any, field: string): string | undefined {
  return (res.body.data?.errors ?? []).find((e: any) => e.field === field)?.message;
}

beforeAll(async () => {
  await seedAllLookups();
  await clearMemberLoginAttempts();
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

describe("an over-long value is a field error, not a database failure", () => {
  it("names the field and its limit instead of returning 500", async () => {
    const res = await putProfile({ name: "x".repeat(101) });

    expect(res.status).toBe(400);
    expect(errorFor(res, "name")).toBe("Must be 100 characters or fewer.");
  });

  it("accepts a value of exactly the limit", async () => {
    const res = await putProfile({ name: "x".repeat(100) });
    expect(res.status).toBe(200);
  });

  it("measures the trimmed value, not the raw one", async () => {
    // Surrounding whitespace is stripped before storage, so it must not count against the
    // limit — otherwise a value that fits is refused for characters that never get written.
    const res = await putProfile({ name: `   ${"x".repeat(100)}   ` });
    expect(res.status).toBe(200);
  });

  it.each([
    ["phone_no", 25],
    ["email", 190],
    ["designation", 150],
    ["hifz_current_ayyah", 50]
  ])("applies the right limit to %s", async (field, limit) => {
    const res = await putProfile({ [field]: "1".repeat(limit + 1) });

    expect(res.status).toBe(400);
    expect(errorFor(res, field)).toContain(String(limit));
  });

  it("refuses a height beyond what the column can hold, naming the bound", async () => {
    const res = await putProfile({ height_cm: 5000 });

    expect(res.status).toBe(400);
    expect(errorFor(res, "height_cm")).toContain("999.99");
  });

  it("still refuses a non-positive height", async () => {
    const res = await putProfile({ weight_kg: 0 });
    expect(res.status).toBe(400);
    expect(errorFor(res, "weight_kg")).toMatch(/positive/i);
  });
});

describe("an error payload carries nothing sensitive", () => {
  it("does not echo the over-long value it is rejecting", async () => {
    // The sentinel is distinctive, so finding it anywhere in the payload is unambiguous.
    const sentinel = "SENTINEL17131713";
    const res = await putProfile({ name: sentinel.repeat(20) });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain(sentinel);
  });

  it("returns no SQL, stack trace or driver detail on a validation failure", async () => {
    const res = await putProfile({
      email: "not-an-email",
      height_cm: -1,
      blood_group: "ZZ"
    });

    expect(res.status).toBe(400);

    const payload = JSON.stringify(res.body);
    for (const giveaway of [
      "INSERT",
      "UPDATE ",
      "SELECT",
      "member_profiles",
      "ER_",
      "sqlMessage",
      "at Object",
      "node_modules"
    ]) {
      expect(payload).not.toContain(giveaway);
    }
  });

  it("returns no password or hash on a failed sign-in (FR-015)", async () => {
    const password = "WrongPassword#17131713";
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: MEMBER.itsNo, password, role: "member" });

    expect(res.status).toBe(401);

    const payload = JSON.stringify(res.body);
    expect(payload).not.toContain(password);
    expect(payload).not.toContain("$2a$");
    expect(payload).not.toContain("$2b$");
    expect(payload).not.toContain("password_hash");
  });

  it("returns no password on a successful sign-in either", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: MEMBER.itsNo, password: MEMBER.password, role: "member" });

    expect(res.status).toBe(200);

    const payload = JSON.stringify(res.body);
    expect(payload).not.toContain(MEMBER.password);
    expect(payload).not.toContain("password_hash");
  });

  it("gives an unknown ITS number the same shape of refusal as a wrong password", async () => {
    // Account existence must not be inferable from the response (FR-013).
    const unknown = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "99900999", password: "Whatever#2026", role: "member" });
    await clearMemberLoginAttempts();
    const wrong = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: MEMBER.itsNo, password: "Whatever#2026", role: "member" });

    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.message).toBe(wrong.body.message);
  });
});

describe("the one line the application is allowed to write about a failure", () => {
  /**
   * The no-logging rule was absolute until a real "Internal server error" report could not be
   * traced to anything, because every 500 produced the identical opaque string. The rule is
   * now "one narrow line per failure", and these tests are what keep it narrow.
   */
  it("names the fault without quoting any data", async () => {
    const { formatErrorLine } = await import("../utils/errorRef");

    // Shaped like the dangerous case: mysql2 hangs the interpolated SQL — including whatever
    // the member typed — off the error object.
    const err: any = new Error("Duplicate entry 'AB-' for key 'x'");
    err.code = "ER_DUP_ENTRY";
    err.sql = "INSERT INTO member_profiles (blood_group, height_cm) VALUES ('AB-', 171.3)";
    err.sqlMessage = "Duplicate entry 'AB-'";

    const line = formatErrorLine("deadbeef", "PUT", "/api/v1/members/me/profile", err);

    // Enough to find the fault.
    expect(line).toContain("deadbeef");
    expect(line).toContain("PUT");
    expect(line).toContain("/api/v1/members/me/profile");
    expect(line).toContain("ER_DUP_ENTRY");

    // And nothing the member typed, nor the query, nor the driver's message.
    for (const leak of ["AB-", "171.3", "INSERT", "member_profiles", "Duplicate entry"]) {
      expect(line).not.toContain(leak);
    }

    // One line, so it cannot smuggle a stack.
    expect(line.split("\n")).toHaveLength(1);
  });

  it("copes with an error carrying no code or name", async () => {
    const { formatErrorLine } = await import("../utils/errorRef");
    const line = formatErrorLine("abc12345", "GET", "/x", {});
    expect(line).toContain("code=none");
    expect(line).toContain("name=Error");
  });

  it("gives every reference a distinct value", async () => {
    const { newErrorRef } = await import("../utils/errorRef");
    const refs = new Set(Array.from({ length: 200 }, () => newErrorRef()));
    expect(refs.size).toBe(200);
    for (const ref of refs) expect(ref).toMatch(/^[0-9a-f]{8}$/);
  });

  it("has no console call anywhere in src outside the tests", async () => {
    // Checked as source rather than behaviour, because the claim is about every code path,
    // including the ones no test exercises. If a log statement is ever added, this fails and
    // whoever added it has to decide what it is allowed to say.
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const offenders: string[] = [];

    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        if (entry === "__tests__" || entry === "node_modules") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith(".ts")) continue;
        const text = readFileSync(full, "utf8");
        // The one permitted occurrence is inside a string in env.ts: a hint telling the
        // operator how to generate a secret, not a log statement.
        for (const [index, line] of text.split("\n").entries()) {
          if (!/\bconsole\.(log|error|warn|info|debug|trace)\s*\(/.test(line)) continue;
          if (full.endsWith(join("config", "env.ts")) && line.includes("randomBytes")) continue;
          offenders.push(`${full}:${index + 1}`);
        }
      }
    }

    walk(join(__dirname, ".."));

    expect(offenders).toEqual([]);
  });

  it("writes to a stream in exactly two permitted places and nowhere else", async () => {
    // A source check rather than a behaviour one on purpose: it fails when somebody adds the
    // *next* log line, which is the moment the privacy question has to be asked again. A
    // behaviour test would only cover the paths it happened to exercise.
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const found: string[] = [];

    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        if (entry === "__tests__" || entry === "node_modules") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith(".ts")) continue;
        const text = readFileSync(full, "utf8");
        for (const [index, line] of text.split("\n").entries()) {
          if (!/process\.(stdout|stderr)\.write\s*\(/.test(line)) continue;
          found.push(`${entry}:${index + 1}`);
        }
      }
    }

    walk(join(__dirname, ".."));

    /**
     * The complete, intended set. Asserted by file rather than by count, so adding or moving
     * one fails here and whoever did it has to say what it may contain. It has already earned
     * its keep twice: once catching that this list was longer than I assumed, and once when
     * the error line moved out of `server.ts` into the extracted boundary middleware.
     *
     * - `env.ts` — startup only: names the missing variables and the `.env` path checked.
     * - `httpBoundary.ts` — the one error line per 500 (see `utils/errorRef.ts`). **The only
     *   one of the six that runs while serving requests, and so the only one that could ever
     *   see member data.**
     * - `server.ts` — four, all at startup and none reachable once the server is serving:
     *   1. "API listening", with the build timestamp of the running file.
     *   2. The EADDRINUSE guidance. Contains the port number and nothing else — no error
     *      object is interpolated, so there is nothing here to leak.
     *   3. Any other `listen` failure, which interpolates `String(error)`.
     *   4. The startup-failure catch, which interpolates `String(error)`.
     *
     * Noted, not changed: lines 3 and 4 interpolate `String(error)`, which on a connection
     * failure can include the database host and user. Pre-existing for 4 and the same shape
     * for 3; both are startup-only, so neither can observe a member's data.
     */
    const byFile = found.reduce<Record<string, number>>((acc, f) => {
      const file = f.split(":")[0];
      acc[file] = (acc[file] ?? 0) + 1;
      return acc;
    }, {});

    expect(byFile).toEqual({ "env.ts": 1, "httpBoundary.ts": 1, "server.ts": 4 });
  });
});
