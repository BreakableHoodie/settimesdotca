import { test, expect } from "@playwright/test";
import { checkIcal } from "../scripts/smoke-probes.mjs";

test("serves a valid Toronto iCal feed on the edge", async ({ request }) => {
  const response = await request.get("/api/feeds/ical");
  const body = await response.text();

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/calendar(?:;|$)/);
  expect(checkIcal(body, response.status())).toEqual({ ok: true });
  expect(body).toContain("BEGIN:VEVENT");
  expect(body).toMatch(/DTSTART;TZID=America\/Toronto:/);
});
