"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PHOTO_BYTES = exports.ACCEPTED_IMAGE_TYPES = void 0;
exports.detectImageType = detectImageType;
exports.readImageDimensions = readImageDimensions;
exports.validateImageUpload = validateImageUpload;
const crypto_1 = __importDefault(require("crypto"));
// Validation for member profile photographs.
//
// The type is determined from the file's MAGIC BYTES, never from the declared content type
// or a filename, because those are attacker-controlled: renaming a script to .jpg and
// declaring image/jpeg must not get it stored and later served back.
//
// Photographs arrive base64-encoded inside the ordinary JSON body, which is why this takes
// a string rather than a stream. That keeps the existing express.json({ limit: "5mb" })
// as the outer guard and adds no multipart dependency; base64 inflates by about a third,
// so a 2MB image arrives as roughly 2.7MB and stays inside that limit.
exports.ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** 2 MiB. Chosen so the base64 form stays well inside the existing 5mb JSON body limit. */
exports.MAX_PHOTO_BYTES = 2 * 1024 * 1024;
function isAcceptedType(value) {
    return exports.ACCEPTED_IMAGE_TYPES.includes(value);
}
/**
 * Identifies the image type from its leading bytes, independently of anything the caller
 * claimed. Returns null for anything that is not one of the three accepted formats.
 */
function detectImageType(bytes) {
    // JPEG: FF D8 FF
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "image/jpeg";
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a) {
        return "image/png";
    }
    // WebP: "RIFF" .... "WEBP"
    if (bytes.length >= 12 &&
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP") {
        return "image/webp";
    }
    return null;
}
function pngDimensions(bytes) {
    // The IHDR chunk is required to be first; width and height are big-endian uint32 at
    // offsets 16 and 20.
    if (bytes.length < 24)
        return null;
    if (bytes.toString("ascii", 12, 16) !== "IHDR")
        return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function jpegDimensions(bytes) {
    // Walk the marker segments looking for a Start Of Frame. SOF0/1/2/3/5/6/7/9/10/11/13/14/15
    // all carry the dimensions in the same place; DHT/DAC/RST and SOS do not and must be
    // skipped or stopped at.
    let offset = 2; // past SOI
    while (offset + 3 < bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset += 1; // resynchronise on padding
            continue;
        }
        const marker = bytes[offset + 1];
        // Standalone markers carry no length payload.
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
        }
        // Start of scan: pixel data follows, so the dimensions are not coming.
        if (marker === 0xda)
            return null;
        const length = bytes.readUInt16BE(offset + 2);
        if (length < 2)
            return null;
        const isSof = (marker >= 0xc0 && marker <= 0xc3) ||
            (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf);
        if (isSof) {
            if (offset + 9 >= bytes.length)
                return null;
            // Segment: length(2) precision(1) height(2) width(2)
            return {
                height: bytes.readUInt16BE(offset + 5),
                width: bytes.readUInt16BE(offset + 7)
            };
        }
        offset += 2 + length;
    }
    return null;
}
function webpDimensions(bytes) {
    if (bytes.length < 30)
        return null;
    const chunk = bytes.toString("ascii", 12, 16);
    // Extended format: canvas size is a 24-bit value minus one, little-endian, at offset 24.
    if (chunk === "VP8X") {
        const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return { width, height };
    }
    // Lossless: 14-bit width then 14-bit height, minus one, packed from offset 21.
    if (chunk === "VP8L") {
        const bits = bytes.readUInt32LE(21);
        return {
            width: 1 + (bits & 0x3fff),
            height: 1 + ((bits >> 14) & 0x3fff)
        };
    }
    // Lossy: the VP8 keyframe header carries 14-bit dimensions after the start code.
    if (chunk === "VP8 ") {
        if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a)
            return null;
        return {
            width: bytes.readUInt16LE(26) & 0x3fff,
            height: bytes.readUInt16LE(28) & 0x3fff
        };
    }
    return null;
}
/** Dimensions where they can be read cheaply, otherwise null. Informational only. */
function readImageDimensions(contentType, bytes) {
    let dims = null;
    if (contentType === "image/png")
        dims = pngDimensions(bytes);
    else if (contentType === "image/jpeg")
        dims = jpegDimensions(bytes);
    else if (contentType === "image/webp")
        dims = webpDimensions(bytes);
    if (!dims || dims.width <= 0 || dims.height <= 0)
        return { width: null, height: null };
    return dims;
}
/**
 * Strips an optional data-URL prefix and rejects anything that is not strict base64.
 *
 * Buffer.from(s, "base64") silently ignores characters it does not recognise, so decoding
 * alone would accept arbitrary text. The shape has to be checked first.
 */
function decodeBase64(input) {
    const withoutPrefix = input.replace(/^data:[^;,]*;base64,/, "").trim();
    if (!withoutPrefix)
        return null;
    const compact = withoutPrefix.replace(/\s+/g, "");
    if (compact.length % 4 !== 0)
        return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact))
        return null;
    const decoded = Buffer.from(compact, "base64");
    if (decoded.length === 0)
        return null;
    return decoded;
}
/**
 * Validates a submitted photograph.
 *
 * Checks, in order: non-empty, strict base64, size cap, a recognised magic-byte signature,
 * and agreement between the declared and detected type. The size cap is applied to the
 * DECODED length, and the encoded length is screened first so an oversized payload is
 * rejected before it is materialised.
 */
function validateImageUpload(input) {
    const declared = typeof input.declaredContentType === "string" ? input.declaredContentType.trim().toLowerCase() : "";
    const raw = typeof input.dataBase64 === "string" ? input.dataBase64 : "";
    if (!raw.trim()) {
        return { ok: false, code: "EMPTY", message: "No image data was supplied." };
    }
    if (!isAcceptedType(declared)) {
        return {
            ok: false,
            code: "UNSUPPORTED_TYPE",
            message: `Unsupported image type. Accepted types are ${exports.ACCEPTED_IMAGE_TYPES.join(", ")}.`
        };
    }
    // Screen the encoded length before decoding: 4 base64 characters per 3 bytes.
    if (raw.replace(/\s+/g, "").length > Math.ceil((exports.MAX_PHOTO_BYTES + 3) / 3) * 4 + 64) {
        return {
            ok: false,
            code: "TOO_LARGE",
            message: `Image is larger than the ${Math.round(exports.MAX_PHOTO_BYTES / 1024 / 1024)}MB limit.`
        };
    }
    const bytes = decodeBase64(raw);
    if (!bytes) {
        return { ok: false, code: "INVALID_BASE64", message: "Image data is not valid base64." };
    }
    if (bytes.length > exports.MAX_PHOTO_BYTES) {
        return {
            ok: false,
            code: "TOO_LARGE",
            message: `Image is larger than the ${Math.round(exports.MAX_PHOTO_BYTES / 1024 / 1024)}MB limit.`
        };
    }
    const detected = detectImageType(bytes);
    if (!detected) {
        return {
            ok: false,
            code: "UNSUPPORTED_TYPE",
            message: "The uploaded file is not a JPEG, PNG or WebP image."
        };
    }
    if (detected !== declared) {
        return {
            ok: false,
            code: "TYPE_MISMATCH",
            message: `The file is a ${detected} image but was submitted as ${declared}.`
        };
    }
    const { width, height } = readImageDimensions(detected, bytes);
    return {
        ok: true,
        contentType: detected,
        bytes,
        byteSize: bytes.length,
        width,
        height,
        sha256: crypto_1.default.createHash("sha256").update(bytes).digest("hex")
    };
}
