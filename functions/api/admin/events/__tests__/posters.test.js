// Tests for POST /api/admin/events/posters (#616).
//
// Mirrors functions/api/admin/bands/photos.js: same magic-byte validation
// (functions/utils/imageUpload.js), same R2 bucket (env.BAND_PHOTOS) under an
// event-posters/ key prefix. event_id is optional (a poster can be uploaded
// while creating a brand-new event that has no id yet) but validated and
// existence-checked when provided; providing it persists poster_url
// immediately.

import { describe, expect, test, vi } from "vitest";
import { onRequestPost } from "../posters.js";
import { createTestDB, createDBEnv, insertEvent } from "../../../test-utils.js";

function jpegFile(name = "poster.jpg") {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  return new File([bytes], name, { type: "image/jpeg" });
}

function textFile(name = "not-an-image.txt") {
  return new File([new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f])], name, { type: "text/plain" });
}

function buildEnv() {
  const rawDb = createTestDB();
  const put = vi.fn().mockResolvedValue(undefined);
  return {
    rawDb,
    env: {
      DB: createDBEnv(rawDb),
      BAND_PHOTOS: { put },
      BAND_PHOTOS_PUBLIC_URL: "https://band-photos.settimes.ca",
    },
    put,
  };
}

function requestWith(formData) {
  return new Request("https://example.test/api/admin/events/posters", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/admin/events/posters", () => {
  test("viewer role is forbidden (403)", async () => {
    const { env } = buildEnv();
    const formData = new FormData();
    formData.append("poster", jpegFile());

    const res = await onRequestPost({
      request: requestWith(formData),
      env,
      data: { user: { role: "viewer", userId: 3, email: "viewer@test.local" } },
    });

    expect(res.status).toBe(403);
  });

  test("editor role can upload a poster and gets a public URL back", async () => {
    const { env, put } = buildEnv();
    const formData = new FormData();
    formData.append("poster", jpegFile());

    const res = await onRequestPost({
      request: requestWith(formData),
      env,
      data: { user: { role: "editor", userId: 2, email: "editor@test.local" } },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.url).toMatch(/^https:\/\/band-photos\.settimes\.ca\/event-posters\/\d+-poster\.jpg$/);
    expect(data.type).toBe("image/jpeg");

    // R2 .put() called with the event-posters/ prefix (not band-photos/).
    expect(put).toHaveBeenCalledTimes(1);
    const [key] = put.mock.calls[0];
    expect(key).toMatch(/^event-posters\//);
  });

  test("rejects a non-image file with 400 (magic-byte check, not just extension/Content-Type)", async () => {
    const { env, put } = buildEnv();
    const formData = new FormData();
    formData.append("poster", textFile("poster.jpg")); // .jpg name, but text/plain bytes

    const res = await onRequestPost({
      request: requestWith(formData),
      env,
      data: { user: { role: "editor", userId: 2, email: "editor@test.local" } },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid file type/);
    expect(put).not.toHaveBeenCalled();
  });

  test("rejects when no poster file is provided", async () => {
    const { env } = buildEnv();
    const formData = new FormData();

    const res = await onRequestPost({
      request: requestWith(formData),
      env,
      data: { user: { role: "editor", userId: 2, email: "editor@test.local" } },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/No poster file provided/);
  });

  test("event_id omitted: upload succeeds without touching the events table", async () => {
    const { env, rawDb } = buildEnv();
    const event = insertEvent(rawDb, { name: "No Poster Yet", slug: "no-poster-yet" });
    const formData = new FormData();
    formData.append("poster", jpegFile());

    const res = await onRequestPost({
      request: requestWith(formData),
      env,
      data: { user: { role: "editor", userId: 2, email: "editor@test.local" } },
    });

    expect(res.status).toBe(200);
    const stored = rawDb.prepare("SELECT poster_url FROM events WHERE id = ?").get(event.id);
    expect(stored.poster_url).toBeNull();
  });

  test("event_id provided and valid: poster_url is persisted immediately", async () => {
    const { env, rawDb } = buildEnv();
    const event = insertEvent(rawDb, { name: "Gets A Poster", slug: "gets-a-poster" });
    const formData = new FormData();
    formData.append("poster", jpegFile());
    formData.append("event_id", String(event.id));

    const res = await onRequestPost({
      request: requestWith(formData),
      env,
      data: { user: { role: "editor", userId: 2, email: "editor@test.local" } },
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    const stored = rawDb.prepare("SELECT poster_url FROM events WHERE id = ?").get(event.id);
    expect(stored.poster_url).toBe(data.url);
  });

  test("event_id provided but malformed: 400, no upload attempted", async () => {
    const { env, put } = buildEnv();
    const formData = new FormData();
    formData.append("poster", jpegFile());
    formData.append("event_id", "not-a-number");

    const res = await onRequestPost({
      request: requestWith(formData),
      env,
      data: { user: { role: "editor", userId: 2, email: "editor@test.local" } },
    });

    expect(res.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  test("event_id provided but references a non-existent event: 404, no upload attempted", async () => {
    const { env, put } = buildEnv();
    const formData = new FormData();
    formData.append("poster", jpegFile());
    formData.append("event_id", "999999");

    const res = await onRequestPost({
      request: requestWith(formData),
      env,
      data: { user: { role: "editor", userId: 2, email: "editor@test.local" } },
    });

    expect(res.status).toBe(404);
    expect(put).not.toHaveBeenCalled();
  });
});
