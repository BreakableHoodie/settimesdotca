import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './credentials';

const loginAsAdmin = async (page) => {
  await page.goto('/admin');
  if (page.url().includes('/admin/login')) {
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/admin$/);
  }
};

const openEventsTab = async (page) => {
  await page.click('button:has-text("Events")');
};

const openCreateEventModal = async (page) => {
  await page.click('button:has-text("Create New Event")');
  await expect(page.getByRole('heading', { name: 'Create New Event' })).toBeVisible();
};

const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const getCsrfToken = async (page) => {
  const cookies = await page.context().cookies();
  const csrfCookie = cookies.find(cookie => cookie.name === 'csrf_token');
  return csrfCookie?.value;
};

const apiGet = async (page, url) => {
  const response = await page.request.get(url);
  expect(response.ok()).toBeTruthy();
  return response.json();
};

const apiPost = async (page, url, data) => {
  const csrfToken = await getCsrfToken(page);
  const headers = csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
  const response = await page.request.post(url, { data, headers });
  expect(response.ok()).toBeTruthy();
  return response.json();
};

test.describe('Event Creation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should allow admin to create a new event', async ({ page }) => {
    const suffix = uniqueSuffix();
    const eventName = `Test Event ${suffix}`;
    const eventSlug = `test-event-${suffix}`;
    await openEventsTab(page);
    await openCreateEventModal(page);

    await page.fill('input[name="name"]', eventName);
    await page.fill('input[name="slug"]', eventSlug);
    await page.fill('input[name="date"]', '2026-10-15');

    await page.click('button[type="submit"]:has-text("Create Event")');

    const row = page.locator('table tbody tr', { hasText: eventName }).first();
    await expect(row).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await openEventsTab(page);
    await openCreateEventModal(page);

    await page.click('button[type="submit"]:has-text("Create Event")');

    const nameMissing = await page.locator('input[name="name"]').evaluate(input => input.validity.valueMissing);
    expect(nameMissing).toBe(true);
  });

  test('should allow admin to publish an event', async ({ page }) => {
    const suffix = uniqueSuffix();
    const eventName = `Published Event ${suffix}`;
    const eventSlug = `published-event-${suffix}`;
    await openEventsTab(page);
    await openCreateEventModal(page);

    await page.fill('input[name="name"]', eventName);
    await page.fill('input[name="slug"]', eventSlug);
    await page.fill('input[name="date"]', '2026-10-20');
    await page.click('button[type="submit"]:has-text("Create Event")');

    const eventsData = await apiGet(page, '/api/admin/events');
    const createdEvent = eventsData.events?.find(event => event.name === eventName);
    expect(createdEvent).toBeTruthy();

    const venuesData = await apiGet(page, '/api/admin/venues');
    const venue = venuesData.venues?.[0];
    expect(venue).toBeTruthy();

    await apiPost(page, '/api/admin/bands', {
      eventId: createdEvent.id,
      venueId: venue.id,
      name: `Publish Band ${suffix}`,
      startTime: '19:00',
      endTime: '19:30',
    });

    page.once('dialog', dialog => dialog.accept());
    const publishRow = page.locator('table tbody tr', { hasText: eventName }).first();
    await publishRow.locator('button', { hasText: /^Publish$/ }).click();

    await expect(publishRow.locator('button', { hasText: /^Unpublish$/ })).toBeVisible({ timeout: 15000 });
  });

  test('should show error when creating event with past date', async ({ page }) => {
    const suffix = uniqueSuffix();
    await openEventsTab(page);
    await openCreateEventModal(page);

    await page.fill('input[name="name"]', `Past Event ${suffix}`);
    await page.fill('input[name="slug"]', `past-event-${suffix}`);
    await page.fill('input[name="date"]', '2020-01-01');

    await page.click('button[type="submit"]:has-text("Create Event")');

    await expect(page.getByText('Date cannot be in the past')).toBeVisible();
  });

  test('should allow admin to edit an event', async ({ page }) => {
    const suffix = uniqueSuffix();
    const eventName = `Editable Event ${suffix}`;
    const eventSlug = `editable-event-${suffix}`;
    const updatedName = `Updated Event ${suffix}`;
    await openEventsTab(page);
    await openCreateEventModal(page);

    await page.fill('input[name="name"]', eventName);
    await page.fill('input[name="slug"]', eventSlug);
    await page.fill('input[name="date"]', '2026-10-25');
    await page.click('button[type="submit"]:has-text("Create Event")');

    const editRow = page.locator('table tbody tr', { hasText: eventName }).first();
    await editRow.locator('button', { hasText: /^Edit$/ }).click();
    await expect(page.getByRole('heading', { name: 'Edit Event' })).toBeVisible();

    await page.fill('input[name="name"]', updatedName);
    await page.click('button[type="submit"]:has-text("Update Event")');

    const updatedRow = page.locator('table tbody tr', { hasText: updatedName }).first();
    await expect(updatedRow).toBeVisible({ timeout: 15000 });
  });

  test('should allow admin to delete an event', async ({ page }) => {
    const suffix = uniqueSuffix();
    const eventName = `Delete Event ${suffix}`;
    const eventSlug = `delete-event-${suffix}`;
    await openEventsTab(page);
    await openCreateEventModal(page);

    await page.fill('input[name="name"]', eventName);
    await page.fill('input[name="slug"]', eventSlug);
    await page.fill('input[name="date"]', '2026-10-30');
    await page.click('button[type="submit"]:has-text("Create Event")');

    page.once('dialog', dialog => dialog.accept());
    const deleteRow = page.locator('table tbody tr', { hasText: eventName }).first();
    await deleteRow.locator('button', { hasText: /^Delete$/ }).click();

    await expect(page.locator('table tbody tr', { hasText: eventName })).toHaveCount(0, { timeout: 15000 });
  });
});
