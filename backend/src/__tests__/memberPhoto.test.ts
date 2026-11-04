import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { authRoutes } from "../routes/authRoutes";
import { memberPhotoRoutes } from "../routes/memberPhotoRoutes";
import { memberProfileRoutes } from "../routes/memberProfileRoutes";
import { pool } from "../db/pool";
import { MAX_PHOTO_BYTES } from "../utils/imageValidation";
import { buildTestApp } from "./helpers/testApp";
import { TEST_CREDENTIALS, clearMemberLoginAttempts, ensureFixtures } from "./helpers/fixtures";

/**
 * MEMBER PHOTOGRAPH (FR-037, FR-088 to FR-091)
 *
 * The photograph is the most sensitive thing in the module after the password, so these
 * tests lean on the refusals: a disguised file, an oversized one, an unauthenticated read,
 * and another member's token.
 */

const app = buildTestApp([
  { path: "/api/v1/auth", router: authRoutes },
  { path: "/api/v1/members", router: memberPhotoRoutes },
  { path: "/api/v1/members", router: memberProfileRoutes }
]);

function pngBytes(width = 64, height = 48, payload = 32): Buffer {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return Buffer.concat([header, Buffer.alloc(payload, 0x5a)]);
}

const b64 = (b: Buffer) => b.toString("base64");

async function tokenFor(which: "memberSettled" | "memberThrottle") {
  const creds = TEST_CREDENTIALS[which];
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: creds.itsNo, password: creds.password, role: "member" });
  return res.body.data.token as string;
}

function putPhoto(token: string, body: Record<string, unknown>) {
  return request(app)
    .put("/api/v1/members/me/photo")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

function getPhoto(token: string) {
  return request(app).get("/api/v1/members/me/photo").set("Authorization", `Bearer ${token}`);
}

async function clearPhotos() {
  await pool.query("DELETE FROM member_photos WHERE member_account_id IN (SELECT id FROM member_accounts WHERE its_no LIKE '999%')");
}

describe("member photograph", () => {
  let token: string;

  beforeAll(async () => {
    await ensureFixtures();
    token = await tokenFor("memberSettled");
  });

  beforeEach(async () => {
    await clearMemberLoginAttempts();
    await clearPhotos();
  });

  afterAll(async () => {
    await clearPhotos();
    await clearMemberLoginAttempts();
    await pool.end();
  });

  describe("upload", () => {
    it("accepts a PNG and reports its metadata", async () => {
      const res = await putPhoto(token, {
        content_type: "image/png",
        data_base64: b64(pngBytes(64, 48))
      });

      expect(res.status).toBe(200);
      expect(res.body.data.content_type).toBe("image/png");
      expect(res.body.data.width).toBe(64);
      expect(res.body.data.height).toBe(48);
      expect(res.body.data.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    // The bytes are large and the client already has them; echoing them back would be waste
    // and would put image data in a JSON log.
    it("does not echo the image bytes back", async () => {
      const res = await putPhoto(token, {
        content_type: "image/png",
        data_base64: b64(pngBytes())
      });

      const body = JSON.stringify(res.body);
      expect(body).not.toContain("iVBOR");
      expect(res.body.data.image_data).toBeUndefined();
    });

    it("accepts a data-URL prefixed payload", async () => {
      const res = await putPhoto(token, {
        content_type: "image/png",
        data_base64: `data:image/png;base64,${b64(pngBytes())}`
      });
      expect(res.status).toBe(200);
    });

    // FR-089. The case the requirement singles out.
    it("rejects a non-image declared as an image", async () => {
      const res = await putPhoto(token, {
        content_type: "image/jpeg",
        data_base64: b64(Buffer.from("#!/bin/sh\nrm -rf /\n"))
      });

      expect(res.status).toBe(400);
      expect(res.body.data.code).toBe("UNSUPPORTED_TYPE");
    });

    it("rejects a real image whose declared type disagrees with its bytes", async () => {
      const res = await putPhoto(token, {
        content_type: "image/jpeg",
        data_base64: b64(pngBytes())
      });

      expect(res.status).toBe(400);
      expect(res.body.data.code).toBe("TYPE_MISMATCH");
    });

    it("rejects an image format that is not accepted", async () => {
      const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(16)]);
      const res = await putPhoto(token, { content_type: "image/gif", data_base64: b64(gif) });
      expect(res.status).toBe(400);
    });

    // FR-088, and 413 rather than 400 so the client can tell size from shape.
    it("rejects an oversized image with 413", async () => {
      const header = pngBytes(1, 1, 0);
      const oversize = Buffer.concat([
        header,
        Buffer.alloc(MAX_PHOTO_BYTES + 1 - header.length, 0x41)
      ]);

      const res = await putPhoto(token, {
        content_type: "image/png",
        data_base64: b64(oversize)
      });

      expect(res.status).toBe(413);
      expect(res.body.data.code).toBe("TOO_LARGE");
    });

    it("rejects malformed base64", async () => {
      const res = await putPhoto(token, {
        content_type: "image/png",
        data_base64: "####not base64####"
      });
      expect(res.status).toBe(400);
    });

    it("rejects a missing payload", async () => {
      expect((await putPhoto(token, { content_type: "image/png" })).status).toBe(400);
    });

    it("stores nothing when the upload is rejected", async () => {
      await putPhoto(token, {
        content_type: "image/jpeg",
        data_base64: b64(Buffer.from("not an image"))
      });

      expect((await getPhoto(token)).status).toBe(404);
    });
  });

  describe("read", () => {
    it("serves the stored bytes with the right content type", async () => {
      const bytes = pngBytes(64, 48);
      await putPhoto(token, { content_type: "image/png", data_base64: b64(bytes) });

      const res = await getPhoto(token);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("image/png");
      expect(Buffer.compare(res.body, bytes)).toBe(0);
    });

    // FR-090: a member's photograph must never sit in a shared cache.
    it("marks the response private", async () => {
      await putPhoto(token, { content_type: "image/png", data_base64: b64(pngBytes()) });

      const res = await getPhoto(token);
      expect(res.headers["cache-control"]).toContain("private");
      expect(res.headers["cache-control"]).not.toContain("public");
    });

    it("returns 304 for a matching ETag", async () => {
      await putPhoto(token, { content_type: "image/png", data_base64: b64(pngBytes()) });

      const first = await getPhoto(token);
      const etag = first.headers.etag;
      expect(etag).toBeTruthy();

      const second = await request(app)
        .get("/api/v1/members/me/photo")
        .set("Authorization", `Bearer ${token}`)
        .set("If-None-Match", etag);

      expect(second.status).toBe(304);
    });

    it("returns 404 when no photo is set", async () => {
      expect((await getPhoto(token)).status).toBe(404);
    });
  });

  describe("replace and remove", () => {
    // FR-091: no earlier image may remain retrievable.
    it("overwrites in place, leaving no earlier image", async () => {
      const first = pngBytes(10, 10);
      const second = pngBytes(20, 20);

      await putPhoto(token, { content_type: "image/png", data_base64: b64(first) });
      const firstRead = await getPhoto(token);

      await putPhoto(token, { content_type: "image/png", data_base64: b64(second) });
      const secondRead = await getPhoto(token);

      expect(Buffer.compare(secondRead.body, second)).toBe(0);
      expect(Buffer.compare(secondRead.body, first)).not.toBe(0);
      expect(secondRead.headers.etag).not.toBe(firstRead.headers.etag);

      // Exactly one row, so there is nowhere for the old image to survive.
      const [rows] = await pool.query<any[]>(
        `SELECT COUNT(*) AS n FROM member_photos
         WHERE member_account_id = (SELECT id FROM member_accounts WHERE its_no = :i)`,
        { i: TEST_CREDENTIALS.memberSettled.itsNo }
      );
      expect(Number(rows[0].n)).toBe(1);
    });

    it("removes the photo", async () => {
      await putPhoto(token, { content_type: "image/png", data_base64: b64(pngBytes()) });

      const res = await request(app)
        .delete("/api/v1/members/me/photo")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect((await getPhoto(token)).status).toBe(404);
    });

    // Idempotent, so a retry after a dropped connection behaves sensibly.
    it("treats removing a nonexistent photo as success", async () => {
      const res = await request(app)
        .delete("/api/v1/members/me/photo")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  describe("the profile reflects whether a photo exists", () => {
    it("reports has_photo", async () => {
      expect(
        (
          await request(app)
            .get("/api/v1/members/me/profile")
            .set("Authorization", `Bearer ${token}`)
        ).body.data.has_photo
      ).toBe(false);

      await putPhoto(token, { content_type: "image/png", data_base64: b64(pngBytes()) });

      expect(
        (
          await request(app)
            .get("/api/v1/members/me/profile")
            .set("Authorization", `Bearer ${token}`)
        ).body.data.has_photo
      ).toBe(true);
    });

    // The bytes live in their own table precisely so a profile read never carries them.
    it("never includes the image bytes in a profile read", async () => {
      await putPhoto(token, { content_type: "image/png", data_base64: b64(pngBytes()) });

      const res = await request(app)
        .get("/api/v1/members/me/profile")
        .set("Authorization", `Bearer ${token}`);

      const body = JSON.stringify(res.body);
      expect(body).not.toContain("image_data");
      expect(body.length).toBeLessThan(20000);
    });
  });

  // FR-090
  describe("access control", () => {
    it("refuses an unauthenticated read", async () => {
      await putPhoto(token, { content_type: "image/png", data_base64: b64(pngBytes()) });
      expect((await request(app).get("/api/v1/members/me/photo")).status).toBe(401);
    });

    it("refuses an unauthenticated upload", async () => {
      const res = await request(app)
        .put("/api/v1/members/me/photo")
        .send({ content_type: "image/png", data_base64: b64(pngBytes()) });
      expect(res.status).toBe(401);
    });

    // Each member's photo is reachable only with their own token — there is no id to supply.
    it("gives each member only their own photo", async () => {
      const tokenA = token;
      const tokenB = await tokenFor("memberThrottle");

      const imageA = pngBytes(11, 11);
      const imageB = pngBytes(22, 22);

      await putPhoto(tokenA, { content_type: "image/png", data_base64: b64(imageA) });
      await putPhoto(tokenB, { content_type: "image/png", data_base64: b64(imageB) });

      expect(Buffer.compare((await getPhoto(tokenA)).body, imageA)).toBe(0);
      expect(Buffer.compare((await getPhoto(tokenB)).body, imageB)).toBe(0);
    });

    it("refuses a party token with 403", async () => {
      const signIn = await request(app).post("/api/v1/auth/login").send({
        identifier: TEST_CREDENTIALS.party.itsNo,
        password: TEST_CREDENTIALS.party.password,
        role: "party"
      });

      const res = await request(app)
        .get("/api/v1/members/me/photo")
        .set("Authorization", `Bearer ${signIn.body.data.token}`);

      expect(res.status).toBe(403);
    });
  });
});
