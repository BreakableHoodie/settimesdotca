// Tests for functions/api/admin/bands/photos.js — POST /api/admin/bands/photos
// (multipart photo intake) and DELETE /api/admin/bands/photos/:key.
//
// Mirrors functions/api/admin/events/__tests__/posters.test.js: same
// magic-byte MIME validation (functions/utils/imageUpload.js), same R2
// bucket shape (env.BAND_PHOTOS). This file was at 0% execution coverage
// before these tests.
//
// MIME validation reads the first 12 bytes via detectImageMimeType and
// never consults file.type, so fixtures below carry real signature bytes
// rather than a Blob `type:` option.

import { describe, expect, test, vi } from "vitest";
import { onRequestPost, onRequestDelete } from "../photos.js";
import { createTestDB, createDBEnv, insertEvent, insertVenue, insertBand } from "../../../test-utils.js";

function jpegBytes() {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
}

function jpegFile(name = "band.jpg") {
  return new File([jpegBytes()], name, { type: "image/jpeg" });
}

function textFile(name = "not-an-image.txt") {
  return new File([new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f])], name, { type: "text/plain" });
}

// Real JPEG signature followed by padding past MAX_FILE_SIZE (5MB). The
// size check runs before the magic-byte check, so the padding content is
// irrelevant -- only file.size matters here.
function oversizedJpegFile(name = "huge.jpg") {
  const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
  bytes.set(jpegBytes(), 0);
  return new File([bytes], name, { type: "image/jpeg" });
}

function buildEnv() {
  const rawDb = createTestDB();
  const put = vi.fn().mockResolvedValue(undefined);
  const del = vi.fn().mockResolvedValue(undefined);
  return {
    rawDb,
    env: {
      DB: createDBEnv(rawDb),
      BAND_PHOTOS: { put, delete: del },
      BAND_PHOTOS_PUBLIC_URL: "https://band-photos.settimes.ca",
    },
    put,
    del,
  };
}

function authedUser(role, id) {
  return { role, id, userId: id, email: `${role}@test.local` };
}

function postRequest(formData) {
  return new Request("https://example.test/api/admin/bands/photos", {
    method: "POST",
    body: formData,
  });
}

function deleteRequest(encodedKey) {
  return new Request(`https://example.test/api/admin/bands/photos/${encodedKey}`, {
    method: "DELETE",
  });
}

describe("POST /api/admin/bands/photos", () => {
  test("viewer role is forbidden (403)", async () => {
    const { env, put } = buildEnv();
    const formData = new FormData();
    formData.append("photo", jpegFile());

    const res = await onRequestPost({
      request: postRequest(formData),
      env,
      data: { user: authedUser("viewer", 3) },
    });

    expect(res.status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  test("unauthenticated request is refused with 401", async () => {
    const { env, put } = buildEnv();
    const formData = new FormData();
    formData.append("photo", jpegFile());

    const res = await onRequestPost({
      request: postRequest(formData),
      env: { ...env, ALLOW_HEADER_AUTH: "true", ENVIRONMENT: "test" },
      data: {},
    });

    expect(res.status).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });

  test("no file provided returns 400 and never calls R2", async () => {
    const { env, put } = buildEnv();
    const formData = new FormData();

    const res = await onRequestPost({
      request: postRequest(formData),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("No photo file provided");
    expect(put).not.toHaveBeenCalled();
  });

  test("oversized file is rejected with 400 naming the MAX_FILE_SIZE limit", async () => {
    const { env, put } = buildEnv();
    const formData = new FormData();
    formData.append("photo", oversizedJpegFile());

    const res = await onRequestPost({
      request: postRequest(formData),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("File too large. Maximum size is 5MB");
    expect(put).not.toHaveBeenCalled();
  });

  test("a file with a disallowed signature is rejected with 400 (magic bytes, not extension/Content-Type)", async () => {
    const { env, put } = buildEnv();
    const formData = new FormData();
    formData.append("photo", textFile("band.jpg")); // .jpg name, text/plain bytes

    const res = await onRequestPost({
      request: postRequest(formData),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid file type. Allowed: JPEG, PNG, WebP, GIF");
    expect(put).not.toHaveBeenCalled();
  });

  test("an allowed JPEG upload calls R2 put with the band-photos/ key shape and detected content type", async () => {
    const { env, put } = buildEnv();
    const formData = new FormData();
    formData.append("photo", jpegFile("My Band Photo.jpg"));

    const res = await onRequestPost({
      request: postRequest(formData),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.type).toBe("image/jpeg");
    expect(data.url).toMatch(/^https:\/\/band-photos\.settimes\.ca\/band-photos\/\d+-my_band_photo\.jpg$/);
    expect(data.filename).toMatch(/^band-photos\/\d+-my_band_photo\.jpg$/);

    expect(put).toHaveBeenCalledTimes(1);
    const [key, , options] = put.mock.calls[0];
    expect(key).toBe(data.filename);
    expect(options.httpMetadata.contentType).toBe("image/jpeg");
    expect(options.customMetadata.uploadedBy).toBe("editor@test.local");
    expect(options.customMetadata.originalName).toBe("My Band Photo.jpg");
  });

  test("R2 put() rejecting surfaces as a 500 without touching the database", async () => {
    const { env, put, rawDb } = buildEnv();
    const eventRow = insertEvent(rawDb, { name: "R2 Fail Event", slug: "r2-fail-event" });
    const venue = insertVenue(rawDb, { name: "R2 Fail Venue" });
    const band = insertBand(rawDb, { name: "R2 Fail Band", event_id: eventRow.id, venue_id: venue.id });
    put.mockRejectedValueOnce(new Error("R2 unavailable"));

    const formData = new FormData();
    formData.append("photo", jpegFile());
    formData.append("band_id", String(band.id));

    const res = await onRequestPost({
      request: postRequest(formData),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Photo upload failed");

    const profile = rawDb.prepare("SELECT photo_url FROM band_profiles WHERE id = ?").get(band.band_profile_id);
    expect(profile.photo_url).toBeNull();
  });

  test("band_id as `profile_<id>` updates that band_profiles row's photo_url directly", async () => {
    const { env, rawDb } = buildEnv();
    const eventRow = insertEvent(rawDb, { name: "Profile Prefix Event", slug: "profile-prefix-event" });
    const venue = insertVenue(rawDb, { name: "Profile Prefix Venue" });
    const band = insertBand(rawDb, { name: "Profile Prefix Band", event_id: eventRow.id, venue_id: venue.id });

    const formData = new FormData();
    formData.append("photo", jpegFile());
    formData.append("band_id", `profile_${band.band_profile_id}`);

    const res = await onRequestPost({
      request: postRequest(formData),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    const profile = rawDb.prepare("SELECT photo_url FROM band_profiles WHERE id = ?").get(band.band_profile_id);
    expect(profile.photo_url).toBe(data.url);
  });

  test("band_id as a numeric performance id resolves to that performance's band_profile_id", async () => {
    const { env, rawDb } = buildEnv();
    const eventRow = insertEvent(rawDb, { name: "Perf Id Event", slug: "perf-id-event" });
    const venue = insertVenue(rawDb, { name: "Perf Id Venue" });
    const band = insertBand(rawDb, { name: "Perf Id Band", event_id: eventRow.id, venue_id: venue.id });

    const formData = new FormData();
    formData.append("photo", jpegFile());
    formData.append("band_id", String(band.id)); // performance id, not band_profile id

    const res = await onRequestPost({
      request: postRequest(formData),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    const profile = rawDb.prepare("SELECT photo_url FROM band_profiles WHERE id = ?").get(band.band_profile_id);
    expect(profile.photo_url).toBe(data.url);
  });

  // #1035. A caller that NAMES a band and gets no match asked for something that
  // does not exist, so this is a 404 rather than a silent success. Both id shapes
  // are covered because they used to behave differently: the numeric branch
  // verified the id, while `profile_<id>` parsed the number and trusted it — so
  // `profile_99999` produced an UPDATE matching zero rows and still answered 200.
  //
  // Each case also asserts NO R2 put. Resolution now happens before the upload,
  // so a bad id cannot leave an orphaned object behind; asserting only the status
  // would let that regress silently.
  test.each([
    ["numeric id matching no performance and no profile", "999999"],
    ["profile_<id> naming a nonexistent profile", "profile_99999"],
  ])("404 and no upload when band_id resolves to nothing: %s", async (_label, bandId) => {
    const { env, rawDb, put } = buildEnv();
    const formData = new FormData();
    formData.append("photo", jpegFile());
    formData.append("band_id", bandId);

    const res = await onRequestPost({
      request: postRequest(formData),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("BAND_NOT_FOUND");
    expect(put).not.toHaveBeenCalled();
    expect(rawDb.prepare("SELECT COUNT(*) AS n FROM band_profiles").get().n).toBe(0);
  });

  // Omitting band_id stays a valid upload-without-association: the 404 above
  // fires only when a band was actually named.
  test("no band_id still uploads and returns 200", async () => {
    const { env, put } = buildEnv();
    const formData = new FormData();
    formData.append("photo", jpegFile());

    const res = await onRequestPost({
      request: postRequest(formData),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/admin/bands/photos/:key", () => {
  test("viewer role is forbidden (403)", async () => {
    const { env, del } = buildEnv();

    const res = await onRequestDelete({
      request: deleteRequest(encodeURIComponent("band-photos/123-x.jpg")),
      env,
      data: { user: authedUser("viewer", 3) },
    });

    expect(res.status).toBe(403);
    expect(del).not.toHaveBeenCalled();
  });

  test("a request with no filename segment returns 400", async () => {
    const { env, del } = buildEnv();

    const res = await onRequestDelete({
      request: new Request("https://example.test/api/admin/bands/photos/", { method: "DELETE" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Filename required");
    expect(del).not.toHaveBeenCalled();
  });

  test("a key outside the band-photos/ prefix is rejected with 400", async () => {
    const { env, del } = buildEnv();

    const res = await onRequestDelete({
      request: deleteRequest(encodeURIComponent("event-posters/123-x.jpg")),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid key");
    expect(del).not.toHaveBeenCalled();
  });

  test("a valid band-photos/ key is deleted from R2 and returns success", async () => {
    const { env, del } = buildEnv();
    const key = "band-photos/1730000000000-band.jpg";

    const res = await onRequestDelete({
      request: deleteRequest(encodeURIComponent(key)),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(del).toHaveBeenCalledExactlyOnceWith(key);
  });
});
