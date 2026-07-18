// Tests for functions/utils/imageUpload.js — the magic-byte MIME detector +
// size cap extracted from functions/api/admin/bands/photos.js (#616) so
// functions/api/admin/events/posters.js can reuse the exact same validation.

import { describe, expect, test } from "vitest";
import { ALLOWED_IMAGE_TYPES, detectImageMimeType, MAX_FILE_SIZE } from "../imageUpload.js";

function fileFromBytes(bytes, name = "upload.bin") {
  return new File([new Uint8Array(bytes)], name);
}

describe("imageUpload constants", () => {
  test("MAX_FILE_SIZE is 5MB", () => {
    expect(MAX_FILE_SIZE).toBe(5 * 1024 * 1024);
  });

  test("ALLOWED_IMAGE_TYPES covers JPEG, PNG, WebP, GIF", () => {
    expect(ALLOWED_IMAGE_TYPES).toEqual(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  });
});

describe("detectImageMimeType", () => {
  test("accepts a JPEG magic byte header (FF D8 FF)", async () => {
    const file = fileFromBytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    await expect(detectImageMimeType(file)).resolves.toBe("image/jpeg");
  });

  test("accepts a full PNG 8-byte signature", async () => {
    const file = fileFromBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(detectImageMimeType(file)).resolves.toBe("image/png");
  });

  test("accepts a GIF87a signature", async () => {
    const file = fileFromBytes([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
    await expect(detectImageMimeType(file)).resolves.toBe("image/gif");
  });

  test("accepts a GIF89a signature", async () => {
    const file = fileFromBytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    await expect(detectImageMimeType(file)).resolves.toBe("image/gif");
  });

  test("accepts a WebP (RIFF....WEBP) signature", async () => {
    const file = fileFromBytes([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    await expect(detectImageMimeType(file)).resolves.toBe("image/webp");
  });

  test("rejects an unrecognised header", async () => {
    const file = fileFromBytes([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    await expect(detectImageMimeType(file)).resolves.toBeNull();
  });

  test("rejects a truncated PNG header (partial signature, e.g. spoofed via a short file)", async () => {
    // Only the first 4 bytes of the 8-byte PNG signature — must not
    // false-positive as PNG on a partial match.
    const file = fileFromBytes([0x89, 0x50, 0x4e, 0x47]);
    await expect(detectImageMimeType(file)).resolves.toBeNull();
  });

  test("rejects an empty file", async () => {
    const file = fileFromBytes([]);
    await expect(detectImageMimeType(file)).resolves.toBeNull();
  });

  test("rejects a RIFF header that isn't WEBP (e.g. a WAV file)", async () => {
    const file = fileFromBytes([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
    await expect(detectImageMimeType(file)).resolves.toBeNull();
  });

  test("does not trust a spoofed Content-Type — detection is purely magic-byte based", async () => {
    // A file whose declared type claims image/png but whose bytes are JPEG's
    // magic header must be detected as JPEG (or rejected), never PNG.
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "fake.png", { type: "image/png" });
    await expect(detectImageMimeType(file)).resolves.toBe("image/jpeg");
  });
});
