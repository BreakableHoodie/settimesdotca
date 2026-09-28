import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./utils/session";

const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const localToday = () => new Date().toLocaleDateString("en-CA");

const getCsrfToken = async (page) =>
  (await page.context().cookies()).find((cookie) => cookie.name === "csrf_token")?.value;

const apiGet = async (page, url) => {
  const response = await page.request.get(url);
  expect(response.ok(), `GET ${url} -> ${response.status()}: ${await response.text()}`).toBeTruthy();
  return response.json();
};

const apiPost = async (page, url, data) => {
  const csrfToken = await getCsrfToken(page);
  const response = await page.request.post(url, {
    data,
    headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
  });
  expect(response.ok(), `POST ${url} -> ${response.status()}: ${await response.text()}`).toBeTruthy();
  return response.json();
};

const seedEvent = async (page, suffix) => {
  const today = localToday();
  const slug = `my-schedule-midnight-${suffix}`;
  const created = await apiPost(page, "/api/admin/events", {
    name: `My Schedule Midnight ${suffix}`,
    slug,
    date: today,
    city: "Waterloo, ON",
  });
  const eventId = created.event?.id ?? created.id;
  const venue = (await apiGet(page, "/api/admin/venues")).venues?.[0];
  expect(eventId).toBeTruthy();
  expect(venue).toBeTruthy();

  const sets = [
    ["Late Owl", "00:30", "01:15"],
    ["Early Finch", "21:00", "21:45"],
    ["Middle Wren", "23:00", "23:45"],
  ];
  for (const [name, startTime, endTime] of sets) {
    await apiPost(page, "/api/admin/bands", {
      eventId,
      venueId: venue.id,
      name: `${name} ${suffix}`,
      startTime,
      endTime,
    });
  }
  await apiPost(page, `/api/admin/events/${eventId}/publish`, { publish: true });
  return { slug, names: sets.map(([name]) => `${name} ${suffix}`) };
};

const namesInGroups = async (container, expectedNames) =>
  container
    .locator('[role="group"]')
    .evaluateAll(
      (groups, names) =>
        groups
          .map((group) => group.getAttribute("aria-label")?.split(" at ")[0])
          .filter((name) => names.includes(name)),
      expectedNames,
    );

test("My Route sorts an after-midnight set after the evening sets", async ({ page }) => {
  const suffix = uniqueSuffix();
  // login.spec.js invalidates the saved session; seeding needs a live one (#885).
  await loginAsAdmin(page);
  const { slug, names } = await seedEvent(page, suffix);

  await page.clock.setFixedTime(new Date(`${localToday()}T18:00:00`));
  await page.goto(`/event/${slug}`);
  const main = page.getByRole("main");
  await expect(main.getByText(names[0], { exact: true })).toBeVisible();

  for (const name of names) {
    await main.getByRole("button", { name: `Add ${name} to my route` }).click();
    await expect(main.getByRole("button", { name: `Remove ${name} from my route` })).toBeVisible();
  }

  await page.getByRole("button", { name: /^My Route/ }).click();
  await expect(main.getByRole("heading", { name: "My Route" })).toBeVisible();
  await expect.poll(() => namesInGroups(main, names)).toEqual([names[1], names[2], names[0]]);

  await page.getByRole("button", { name: "Live Lineup", exact: true }).click();
  await expect.poll(() => namesInGroups(main, names)).toEqual([names[1], names[2], names[0]]);
});
