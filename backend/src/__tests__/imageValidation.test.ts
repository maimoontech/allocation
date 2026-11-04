import { describe, expect, it } from "vitest";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_PHOTO_BYTES,
  detectImageType,
  readImageDimensions,
  validateImageUpload
} from "../utils/imageValidation";

// Minimal but genuinely well-formed headers. Real encoders are not needed: the validator
// reads only the signature and the dimension fields, so hand-built headers exercise
// exactly the code paths that matter and keep the fixtures readable.

function pngBytes(width = 320, height = 200, payload = 64): Buffer {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8); // IHDR length
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return Buffer.concat([header, Buffer.alloc(payload, 0x7f)]);
}

function jpegBytes(width = 640, height = 480): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);

  // An APP0/JFIF segment first, so the marker walker has to skip a non-SOF segment
  // before it finds the frame header.
  //
  // A JPEG segment's length field COUNTS ITSELF, so a standard 16-byte JFIF APP0 body is
  // 2 length bytes plus 14 of payload. Getting this wrong desynchronises the walk.
  const app0Body = Buffer.alloc(16);
  app0Body.writeUInt16BE(16, 0); // segment length, inclusive of these two bytes
  app0Body.write("JFIF\0", 2, "ascii");
  app0Body.writeUInt16BE(0x0101, 7); // version 1.1
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0]), app0Body]);

  // SOF0 with 3 components: 8 fixed bytes + 3 bytes per component = 17, again inclusive
  // of the length field itself.
  const sofBody = Buffer.alloc(17);
  sofBody.writeUInt16BE(17, 0); // length
  sofBody.writeUInt8(8, 2); // sample precision
  sofBody.writeUInt16BE(height, 3);
  sofBody.writeUInt16BE(width, 5);
  sofBody.writeUInt8(3, 7); // component count
  const sof0 = Buffer.concat([Buffer.from([0xff, 0xc0]), sofBody]);

  return Buffer.concat([soi, app0, sof0, Buffer.from([0xff, 0xd9])]);
}

function webpVp8xBytes(width = 800, height = 600): Buffer {
  const buf = Buffer.alloc(32);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(24, 4);
  buf.write("WEBP", 8, "ascii");
  buf.write("VP8X", 12, "ascii");
  buf.writeUInt32LE(10, 16); // chunk size
  const w = width - 1;
  const h = height - 1;
  buf[24] = w & 0xff;
  buf[25] = (w >> 8) & 0xff;
  buf[26] = (w >> 16) & 0xff;
  buf[27] = h & 0xff;
  buf[28] = (h >> 8) & 0xff;
  buf[29] = (h >> 16) & 0xff;
  return buf;
}

const b64 = (b: Buffer) => b.toString("base64");

describe("detectImageType", () => {
  it("identifies each accepted format from its signature", () => {
    expect(detectImageType(pngBytes())).toBe("image/png");
    expect(detectImageType(jpegBytes())).toBe("image/jpeg");
    expect(detectImageType(webpVp8xBytes())).toBe("image/webp");
  });

  it("rejects things that are not images", () => {
    expect(detectImageType(Buffer.from("not an image at all"))).toBeNull();
    expect(detectImageType(Buffer.from("<?php echo 1; ?>"))).toBeNull();
    expect(detectImageType(Buffer.from("GIF89a"))).toBeNull(); // a real image format, but not accepted
    expect(detectImageType(Buffer.from([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // %PDF
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull(); // truncated JPEG signature
  });

  it("does not mistake a RIFF container that is not WebP", () => {
    const wav = Buffer.alloc(12);
    wav.write("RIFF", 0, "ascii");
    wav.write("WAVE", 8, "ascii");
    expect(detectImageType(wav)).toBeNull();
  });
});

describe("readImageDimensions", () => {
  it("reads PNG dimensions from IHDR", () => {
    expect(readImageDimensions("image/png", pngBytes(123, 456))).toEqual({ width: 123, height: 456 });
  });

  it("reads JPEG dimensions, skipping the APP0 segment to find SOF0", () => {
    expect(readImageDimensions("image/jpeg", jpegBytes(1024, 768))).toEqual({ width: 1024, height: 768 });
  });

  it("reads WebP VP8X canvas dimensions", () => {
    expect(readImageDimensions("image/webp", webpVp8xBytes(1600, 900))).toEqual({ width: 1600, height: 900 });
  });

  // Dimensions are informational and the column is nullable, so an unreadable header must
  // degrade to null rather than throw and fail the whole upload.
  it("returns nulls rather than throwing when the header cannot be read", () => {
    expect(readImageDimensions("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toEqual({
      width: null,
      height: null
    });
    expect(readImageDimensions("image/jpeg", Buffer.from([0xff, 0xd8, 0xff]))).toEqual({
      width: null,
      height: null
    });
  });
});

describe("validateImageUpload", () => {
  it("accepts a valid PNG and reports its metadata", () => {
    const result = validateImageUpload({
      declaredContentType: "image/png",
      dataBase64: b64(pngBytes(320, 200))
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.contentType).toBe("image/png");
    expect(result.width).toBe(320);
    expect(result.height).toBe(200);
    expect(result.byteSize).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(ACCEPTED_IMAGE_TYPES)("accepts %s", (type) => {
    const bytes =
      type === "image/png" ? pngBytes() : type === "image/jpeg" ? jpegBytes() : webpVp8xBytes();
    const result = validateImageUpload({ declaredContentType: type, dataBase64: b64(bytes) });
    expect(result.ok).toBe(true);
  });

  it("accepts a data-URL prefixed payload", () => {
    const result = validateImageUpload({
      declaredContentType: "image/png",
      dataBase64: `data:image/png;base64,${b64(pngBytes())}`
    });
    expect(result.ok).toBe(true);
  });

  it("produces a stable hash for identical bytes and a different one otherwise", () => {
    const a = validateImageUpload({ declaredContentType: "image/png", dataBase64: b64(pngBytes(10, 10)) });
    const b = validateImageUpload({ declaredContentType: "image/png", dataBase64: b64(pngBytes(10, 10)) });
    const c = validateImageUpload({ declaredContentType: "image/png", dataBase64: b64(pngBytes(11, 10)) });
    if (!a.ok || !b.ok || !c.ok) throw new Error("expected all three to validate");
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).not.toBe(c.sha256);
  });

  // This is the case the spec singles out: a non-image renamed and declared as a JPEG.
  it("rejects a non-image declared as an image", () => {
    const result = validateImageUpload({
      declaredContentType: "image/jpeg",
      dataBase64: b64(Buffer.from("#!/bin/sh\nrm -rf /\n"))
    });
    expect(result).toMatchObject({ ok: false, code: "UNSUPPORTED_TYPE" });
  });

  // Trusting the declared type would store a PNG as a JPEG and serve it with the wrong
  // Content-Type, which some browsers will sniff and re-interpret.
  it("rejects a real image whose declared type disagrees with its bytes", () => {
    const result = validateImageUpload({
      declaredContentType: "image/jpeg",
      dataBase64: b64(pngBytes())
    });
    expect(result).toMatchObject({ ok: false, code: "TYPE_MISMATCH" });
    if (result.ok) return;
    expect(result.message).toContain("image/png");
  });

  it("rejects an image format that is not on the accepted list", () => {
    const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(16)]);
    expect(validateImageUpload({ declaredContentType: "image/gif", dataBase64: b64(gif) })).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_TYPE"
    });
  });

  it("rejects a payload over the size cap", () => {
    const oversize = Buffer.concat([pngBytes(1, 1, 0), Buffer.alloc(MAX_PHOTO_BYTES + 1, 0x41)]);
    expect(
      validateImageUpload({ declaredContentType: "image/png", dataBase64: b64(oversize) })
    ).toMatchObject({ ok: false, code: "TOO_LARGE" });
  });

  it("accepts a payload just under the size cap", () => {
    const header = pngBytes(1, 1, 0);
    const underCap = Buffer.concat([header, Buffer.alloc(MAX_PHOTO_BYTES - header.length, 0x41)]);
    expect(underCap.length).toBe(MAX_PHOTO_BYTES);
    expect(
      validateImageUpload({ declaredContentType: "image/png", dataBase64: b64(underCap) })
    ).toMatchObject({ ok: true });
  });

  // Buffer.from(s, "base64") silently drops unrecognised characters, so without an
  // explicit shape check arbitrary text would decode to plausible-looking bytes.
  it.each([
    ["not base64 at all!", "INVALID_BASE64"],
    ["####", "INVALID_BASE64"],
    ["QUJD", "UNSUPPORTED_TYPE"] // valid base64 for "ABC", but not an image
  ])("rejects %j", (payload, code) => {
    expect(
      validateImageUpload({ declaredContentType: "image/png", dataBase64: payload })
    ).toMatchObject({ ok: false, code });
  });

  it.each([
    [undefined, "EMPTY"],
    [null, "EMPTY"],
    ["", "EMPTY"],
    ["   ", "EMPTY"],
    [42, "EMPTY"]
  ])("rejects missing or non-string data %j", (payload, code) => {
    expect(
      validateImageUpload({ declaredContentType: "image/png", dataBase64: payload })
    ).toMatchObject({ ok: false, code });
  });

  it.each([undefined, null, "", "application/pdf", "text/html", 7])(
    "rejects a declared type of %j",
    (declared) => {
      expect(
        validateImageUpload({ declaredContentType: declared, dataBase64: b64(pngBytes()) })
      ).toMatchObject({ ok: false, code: "UNSUPPORTED_TYPE" });
    }
  );

  it("is case- and whitespace-insensitive about the declared type", () => {
    expect(
      validateImageUpload({ declaredContentType: "  IMAGE/PNG ", dataBase64: b64(pngBytes()) })
    ).toMatchObject({ ok: true });
  });

  it("never returns image bytes on a failure", () => {
    const result = validateImageUpload({
      declaredContentType: "image/png",
      dataBase64: b64(Buffer.from("nope"))
    });
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("bytes");
  });
});
