import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { importExportRoutes } from "../routes/importExportRoutes";
import { pool } from "../db/pool";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, clearMemberLoginAttempts, ensureFixtures } from "./helpers/fixtures";

/**
 * ADMIN PROVISIONING OF MEMBER ACCOUNTS (FR-001 to FR-008)
 *
 * Reuses the existing import route rather than adding a bespoke one, so the CSV parsing,
 * transaction, bcrypt hashing and per-row error reporting are the code already in production
 * use for zones, parties and venues.
 *
 * The accounts created here use a 9991 prefix, distinct from the 999001 fixture range, so a
 * failure in this file cannot leave rows that confuse the other member tests.
 */

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/import-export", router: importExportRoutes }
]);

const PROVISION_PREFIX = "9991";
const ITS_A = "999100001";
const ITS_B = "999100002";

async function adminToken() {
  const res = await request(app).post("/api/v1/auth/login").send({
    identifier: TEST_CREDENTIALS.admin.username,
    password: TEST_CREDENTIALS.admin.password,
    role: "admin"
  });
  return res.body.data.token as string;
}

function importCsv(token: string, csv: string) {
  return request(app)
    .post("/api/v1/import-export/members/import")
    .set("Authorization", `Bearer ${token}`)
    .send({ csv });
}

const HEADER = "its_no,member_name,password,is_active";

async function removeProvisioned() {
  const [rows] = await pool.query<any[]>(
    "SELECT id FROM member_accounts WHERE its_no LIKE :p",
    { p: `${PROVISION_PREFIX}%` }
  );
  for (const row of rows) {
    await pool.query("DELETE FROM refresh_tokens WHERE user_role = 'member' AND user_id = :id", {
      id: row.id
    });
  }
  await pool.query("DELETE FROM member_accounts WHERE its_no LIKE :p", {
    p: `${PROVISION_PREFIX}%`
  });
}

async function readAccount(itsNo: string) {
  const [rows] = await pool.query<any[]>(
    `SELECT id, its_no, member_name, password_hash, must_change_password, is_active,
            password_changed_at
     FROM member_accounts WHERE its_no = :i`,
    { i: itsNo }
  );
  return rows[0];
}

describe("member provisioning", () => {
  let token: string;

  beforeAll(async () => {
    await ensureFixtures();
    await removeProvisioned();
    token = await adminToken();
  });

  afterEach(async () => {
    await removeProvisioned();
    await clearMemberLoginAttempts();
  });

  afterAll(async () => {
    await removeProvisioned();
    await pool.end();
  });

  it("creates one account per row, flagged as needing a password change", async () => {
    const res = await importCsv(
      token,
      `${HEADER}\n${ITS_A},Roster Name A,Issued#2026,1\n${ITS_B},Roster Name B,Issued#2026,1\n`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.inserted).toBe(2);
    expect(res.body.data.errors).toHaveLength(0);

    const a = await readAccount(ITS_A);
    expect(a.member_name).toBe("Roster Name A");
    expect(Boolean(a.must_change_password)).toBe(true); // FR-004
    expect(a.password_changed_at).toBeNull();
    expect(Boolean(a.is_active)).toBe(true);
  });

  it("hashes the supplied password, never storing it as given", async () => {
    await importCsv(token, `${HEADER}\n${ITS_A},Roster Name A,Issued#2026,1\n`);

    const a = await readAccount(ITS_A);
    expect(a.password_hash).not.toBe("Issued#2026");
    expect(a.password_hash.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare("Issued#2026", a.password_hash)).toBe(true);
  });

  it("produces an account that can actually sign in", async () => {
    await importCsv(token, `${HEADER}\n${ITS_A},Roster Name A,Issued#2026,1\n`);

    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: ITS_A,
      password: "Issued#2026",
      role: "member"
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user.mustChangePassword).toBe(true);
  });

  // FR-002 and FR-003. The unique key on its_no makes a duplicate impossible at the engine
  // level; this proves the route treats a repeat as an update rather than erroring.
  it("updates rather than duplicating when the same roster is re-uploaded", async () => {
    const csv = `${HEADER}\n${ITS_A},Roster Name A,Issued#2026,1\n`;

    const first = await importCsv(token, csv);
    expect(first.body.data.inserted).toBe(1);

    const second = await importCsv(token, csv);
    expect(second.body.data.inserted).toBe(0);
    expect(second.body.data.updated).toBe(1);
    expect(second.body.data.errors).toHaveLength(0);

    const [rows] = await pool.query<any[]>(
      "SELECT COUNT(*) AS n FROM member_accounts WHERE its_no = :i",
      { i: ITS_A }
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it("does not insert twice when one file lists the same ITS number twice", async () => {
    const res = await importCsv(
      token,
      `${HEADER}\n${ITS_A},First Spelling,Issued#2026,1\n${ITS_A},Second Spelling,Issued#2026,1\n`
    );

    expect(res.body.data.inserted).toBe(1);
    expect(res.body.data.updated).toBe(1);

    const [rows] = await pool.query<any[]>(
      "SELECT COUNT(*) AS n FROM member_accounts WHERE its_no = :i",
      { i: ITS_A }
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it("refreshes the roster name and active flag on re-upload", async () => {
    await importCsv(token, `${HEADER}\n${ITS_A},Old Name,Issued#2026,1\n`);
    await importCsv(token, `${HEADER}\n${ITS_A},New Name,Issued#2026,0\n`);

    const a = await readAccount(ITS_A);
    expect(a.member_name).toBe("New Name");
    expect(Boolean(a.is_active)).toBe(false);
  });

  /**
   * FR-005 — the one that matters most.
   *
   * Once a member has chosen their own password, re-running the roster must not reset it and
   * must not put them back through the forced change. Otherwise every re-import would lock
   * out everyone who had already set themselves up.
   */
  describe("re-provisioning an account whose member has chosen a password", () => {
    async function setUpChosenPassword() {
      await importCsv(token, `${HEADER}\n${ITS_A},Roster Name A,Issued#2026,1\n`);

      const signIn = await request(app).post("/api/v1/auth/login").send({
        identifier: ITS_A,
        password: "Issued#2026",
        role: "member"
      });

      await request(app)
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${signIn.body.data.token}`)
        .send({
          current_password: "Issued#2026",
          new_password: "MemberChosen#2026",
          confirm_password: "MemberChosen#2026"
        });

      const after = await readAccount(ITS_A);
      expect(after.password_changed_at).not.toBeNull();
      expect(Boolean(after.must_change_password)).toBe(false);
      return after;
    }

    it("leaves the chosen password in place", async () => {
      const before = await setUpChosenPassword();

      await importCsv(token, `${HEADER}\n${ITS_A},Roster Name A,Issued#2026,1\n`);

      const after = await readAccount(ITS_A);
      expect(after.password_hash).toBe(before.password_hash);
      expect(await bcrypt.compare("MemberChosen#2026", after.password_hash)).toBe(true);
    });

    it("does not re-impose the forced change", async () => {
      await setUpChosenPassword();

      await importCsv(token, `${HEADER}\n${ITS_A},Roster Name A,Issued#2026,1\n`);

      const after = await readAccount(ITS_A);
      expect(Boolean(after.must_change_password)).toBe(false);
    });

    it("leaves the member still able to sign in with their own password", async () => {
      await setUpChosenPassword();
      await importCsv(token, `${HEADER}\n${ITS_A},Roster Name A,Issued#2026,1\n`);

      expect(
        (
          await request(app).post("/api/v1/auth/login").send({
            identifier: ITS_A,
            password: "MemberChosen#2026",
            role: "member"
          })
        ).status
      ).toBe(200);

      // And the roster password does NOT work — it was never reinstated.
      expect(
        (
          await request(app).post("/api/v1/auth/login").send({
            identifier: ITS_A,
            password: "Issued#2026",
            role: "member"
          })
        ).status
      ).toBe(401);
    });

    it("still refreshes the roster name", async () => {
      await setUpChosenPassword();
      await importCsv(token, `${HEADER}\n${ITS_A},Corrected Name,Issued#2026,1\n`);

      const after = await readAccount(ITS_A);
      expect(after.member_name).toBe("Corrected Name");
    });
  });

  // FR-008: a bad row is reported with its row number, and the good rows still apply.
  describe("per-row error reporting", () => {
    it("rejects a malformed ITS number and still processes the valid rows", async () => {
      const res = await importCsv(
        token,
        `${HEADER}\n${ITS_A},Valid One,Issued#2026,1\nnot-a-number,Bad Row,Issued#2026,1\n${ITS_B},Valid Two,Issued#2026,1\n`
      );

      expect(res.status).toBe(200);
      expect(res.body.data.inserted).toBe(2);
      expect(res.body.data.errors).toHaveLength(1);

      // Row 3: header is row 1, so the bad row is the third line of the file.
      expect(res.body.data.errors[0].row).toBe(3);
      expect(res.body.data.errors[0].message).toMatch(/digits/i);

      expect(await readAccount(ITS_A)).toBeTruthy();
      expect(await readAccount(ITS_B)).toBeTruthy();
    });

    it("reports a missing ITS number", async () => {
      const res = await importCsv(token, `${HEADER}\n,No Its,Issued#2026,1\n`);

      expect(res.body.data.inserted).toBe(0);
      expect(res.body.data.errors).toHaveLength(1);
      expect(res.body.data.errors[0].message).toMatch(/its_no is required/i);
    });

    it("reports a new account with no password", async () => {
      const res = await importCsv(token, `${HEADER}\n${ITS_A},No Password,,1\n`);

      expect(res.body.data.inserted).toBe(0);
      expect(res.body.data.errors).toHaveLength(1);
      expect(res.body.data.errors[0].message).toMatch(/password is required/i);
      expect(await readAccount(ITS_A)).toBeUndefined();
    });

    it("reports every bad row, not just the first", async () => {
      const res = await importCsv(
        token,
        `${HEADER}\nbad-one,A,Issued#2026,1\nbad-two,B,Issued#2026,1\n`
      );

      expect(res.body.data.errors).toHaveLength(2);
      expect(res.body.data.errors.map((e: any) => e.row)).toEqual([2, 3]);
    });

    it("rejects a file missing a required column", async () => {
      const res = await importCsv(token, `its_no,member_name\n${ITS_A},Missing Columns\n`);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/missing column/i);
    });

    it("accepts a two-column its_no,password roster", async () => {
      const res = await importCsv(token, `its_no,password\n${ITS_A},Issued#2026\n`);

      expect(res.status).toBe(200);
      expect(res.body.data.inserted).toBe(1);
      expect(res.body.data.errors).toHaveLength(0);

      const a = await readAccount(ITS_A);
      // The columns the file omits take their defaults rather than blocking the import.
      expect(a.member_name).toBeNull();
      expect(Boolean(a.is_active)).toBe(true);
      expect(Boolean(a.must_change_password)).toBe(true);
      expect(await bcrypt.compare("Issued#2026", a.password_hash)).toBe(true);
    });

    it("leaves an existing member_name alone when the column is absent", async () => {
      await importCsv(token, `${HEADER}\n${ITS_A},Roster Name A,Issued#2026,1\n`);
      const res = await importCsv(token, `its_no,password\n${ITS_A},Issued#2026\n`);

      expect(res.status).toBe(200);
      expect((await readAccount(ITS_A)).member_name).toBe("Roster Name A");
    });

    it("rejects an empty payload", async () => {
      const res = await importCsv(token, "");
      expect(res.status).toBe(400);
    });

    it("rejects a header with no data rows", async () => {
      const res = await importCsv(token, `${HEADER}\n`);
      expect(res.status).toBe(400);
    });
  });

  describe("template and export", () => {
    it("serves a template naming the columns the import expects", async () => {
      const res = await request(app)
        .get("/api/v1/import-export/members/template")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.text.trim()).toBe("its_no,member_name,password,is_active");
    });

    // FR-015: a hash must never leave the system, following the convention the other
    // entities already use of emitting an empty password column.
    it("exports accounts with an empty password column and no hash", async () => {
      await importCsv(token, `${HEADER}\n${ITS_A},Roster Name A,Issued#2026,1\n`);

      const res = await request(app)
        .get("/api/v1/import-export/members/export")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.text).toContain(ITS_A);
      expect(res.text).not.toContain("$2b$");
      expect(res.text).not.toContain("$2a$");
      expect(res.text).not.toContain("Issued#2026");
    });

    // FR-101: the export is account state only.
    it("exports no contact, health or photo columns", async () => {
      const res = await request(app)
        .get("/api/v1/import-export/members/export")
        .set("Authorization", `Bearer ${token}`);

      const header = res.text.split("\n")[0];
      for (const forbidden of [
        "mobile",
        "whatsapp",
        "email",
        "address",
        "blood",
        "height",
        "weight",
        "bmi",
        "photo",
        "image"
      ]) {
        expect(header.toLowerCase()).not.toContain(forbidden);
      }
    });
  });

  // FR-006: provisioning is an administrator's job and nobody else's.
  describe("access control", () => {
    it("refuses an unauthenticated import", async () => {
      const res = await request(app)
        .post("/api/v1/import-export/members/import")
        .send({ csv: `${HEADER}\n${ITS_A},X,Issued#2026,1\n` });
      expect(res.status).toBe(401);
    });

    it.each([
      ["party", TEST_CREDENTIALS.party.itsNo, TEST_CREDENTIALS.party.password],
      ["zonal_head", TEST_CREDENTIALS.zone.name, TEST_CREDENTIALS.zone.password],
      ["coordinator", TEST_CREDENTIALS.venue.name, TEST_CREDENTIALS.venue.password]
    ])("refuses the %s role with 403", async (role, identifier, password) => {
      const signIn = await request(app)
        .post("/api/v1/auth/login")
        .send({ identifier, password, role });

      const res = await request(app)
        .post("/api/v1/import-export/members/import")
        .set("Authorization", `Bearer ${signIn.body.data.token}`)
        .send({ csv: `${HEADER}\n${ITS_A},X,Issued#2026,1\n` });

      expect(res.status).toBe(403);
      expect(await readAccount(ITS_A)).toBeUndefined();
    });

    it("refuses a member their own provisioning route", async () => {
      const signIn = await request(app).post("/api/v1/auth/login").send({
        identifier: TEST_CREDENTIALS.memberSettled.itsNo,
        password: TEST_CREDENTIALS.memberSettled.password,
        role: "member"
      });

      const res = await request(app)
        .post("/api/v1/import-export/members/import")
        .set("Authorization", `Bearer ${signIn.body.data.token}`)
        .send({ csv: `${HEADER}\n${ITS_A},X,Issued#2026,1\n` });

      expect(res.status).toBe(403);
    });
  });

  // FR-106: provisioning must not disturb anything that already exists.
  it("touches no existing table", async () => {
    const counts = async () => {
      const [rows] = await pool.query<any[]>(
        `SELECT
           (SELECT COUNT(*) FROM parties) AS parties,
           (SELECT COUNT(*) FROM zones) AS zones,
           (SELECT COUNT(*) FROM venues) AS venues,
           (SELECT COUNT(*) FROM schedules) AS schedules,
           (SELECT COUNT(*) FROM members) AS dormant_members`
      );
      return rows[0];
    };

    const before = await counts();
    await importCsv(
      token,
      `${HEADER}\n${ITS_A},Roster Name A,Issued#2026,1\n${ITS_B},Roster Name B,Issued#2026,1\n`
    );
    const after = await counts();

    expect(after).toEqual(before);
  });
});
