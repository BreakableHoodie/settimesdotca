// GET /api/admin/events/posters?url= (#1248): poster bytes, same origin, so
// the admin can read a poster's pixels to suggest a palette. The parameter
// must only ever name an event-posters/ key on the poster host.

import { describe, expect, test, vi } from "vitest";
import { onRequestGet } from "../posters.js";
import { createTestDB, createDBEnv } from "../../../test-utils.js";

const HOST = "https://band-photos.settimes.ca";
const EDITOR = { user: { role: "editor", userId: 2, email: "editor@test.local" } };

function buildEnv(object = { body: "JPEGBYTES", httpMetadata: { contentType: "image/jpeg" } }) {
  const get = vi.fn().mockResolvedValue(object);
  return { env: { DB: createDBEnv(createTestDB()), BAND_PHOTOS: { get }, BAND_PHOTOS_PUBLIC_URL: HOST }, get };
}

function call(env, url, data = EDITOR) {
  const target = new URL("https://settimes.ca/api/admin/events/posters");
  if (url !== undefined) target.searchParams.set("url", url);
  return onRequestGet({ request: new Request(target), env, data });
}

describe("GET /api/admin/events/posters", () => {
  test("an editor gets the poster's bytes with its stored image type", async () => {
    const { env, get } = buildEnv();
    const res = await call(env, `${HOST}/event-posters/1790689160000-lwbc-vol-18-poster-v3.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(await res.text()).toBe("JPEGBYTES");
    expect(get).toHaveBeenCalledWith("event-posters/1790689160000-lwbc-vol-18-poster-v3.jpg");
  });

  test("a viewer is refused before storage is touched", async () => {
    const { env, get } = buildEnv();
    const res = await call(env, `${HOST}/event-posters/a.jpg`, { user: { role: "viewer", userId: 3 } });
    expect(res.status).toBe(403);
    expect(get).not.toHaveBeenCalled();
  });

  test.each([
    ["no url", undefined],
    ["not a url", "event-posters/a.jpg"],
    ["another host", "https://evil.example/event-posters/a.jpg"],
    ["http, not https", "http://band-photos.settimes.ca/event-posters/a.jpg"],
    ["a band photo", `${HOST}/band-photos/a.jpg`],
    ["a nested key", `${HOST}/event-posters/x/a.jpg`],
    ["an encoded slash", `${HOST}/event-posters/..%2Fband-photos%2Fa.jpg`],
    ["a dot-dot segment", `${HOST}/event-posters/../band-photos/a.jpg`],
    ["a query string", `${HOST}/event-posters/a.jpg?x=1`],
    ["the bare prefix", `${HOST}/event-posters/`],
  ])("refuses %s with 400 and never reads storage", async (_label, url) => {
    const { env, get } = buildEnv();
    const res = await call(env, url);
    expect(res.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  test("a missing object is 404", async () => {
    const { env } = buildEnv(null);
    expect((await call(env, `${HOST}/event-posters/gone.jpg`)).status).toBe(404);
  });

  test("an object stored with a non-image type is not served", async () => {
    const { env } = buildEnv({ body: "<svg/>", httpMetadata: { contentType: "image/svg+xml" } });
    const res = await call(env, `${HOST}/event-posters/a.svg`);
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  test("a storage failure is a logged 500, not a crash", async () => {
    const { env } = buildEnv();
    env.BAND_PHOTOS.get.mockRejectedValue(new Error("R2 down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(env, `${HOST}/event-posters/a.jpg`);
    expect(res.status).toBe(500);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
