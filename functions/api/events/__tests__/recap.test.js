import { describe, expect, test } from 'vitest';
import { onRequestGet } from '../[id]/recap.js';
import {
  createTestEnv,
  insertEvent,
  insertVenue,
  insertBand,
} from '../../test-utils.js';

describe('GET /api/events/:id/recap', () => {
  test('returns 404 for a non-archived event', async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = 'true';
    const event = insertEvent(rawDb, {
      name: 'Draft Event',
      slug: 'draft-event',
      date: '2024-08-03',
      status: 'draft',
    });

    const request = new Request(
      `https://example.test/api/events/${event.slug}/recap`
    );
    const response = await onRequestGet({
      request,
      env,
      params: { id: event.slug },
    });

    expect(response.status).toBe(404);
  });

  test('returns 200 with stats and bands for an archived event looked up by slug', async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = 'true';
    const event = insertEvent(rawDb, {
      name: 'LWBC Vol5',
      slug: 'lwbc-vol5',
      date: '2024-08-03',
      status: 'archived',
    });

    const venue = insertVenue(rawDb, { name: 'Main Stage', city: 'Portland' });
    insertBand(rawDb, {
      name: 'Band Alpha',
      event_id: event.id,
      venue_id: venue.id,
      start_time: '19:00',
      end_time: '20:00',
    });

    const request = new Request(
      `https://example.test/api/events/${event.slug}/recap`
    );
    const response = await onRequestGet({
      request,
      env,
      params: { id: event.slug },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');

    const payload = await response.json();
    expect(payload.event).toMatchObject({
      id: event.id,
      name: 'LWBC Vol5',
      slug: 'lwbc-vol5',
      date: '2024-08-03',
    });
    expect(payload.stats).toMatchObject({
      total_sets: 1,
      venue_count: 1,
    });
    expect(payload.bands).toHaveLength(1);
    expect(payload.bands[0]).toMatchObject({
      name: 'Band Alpha',
      venue_id: venue.id,
      venue_name: 'Main Stage',
      start_time: '19:00',
      end_time: '20:00',
    });
  });

  test('returns 200 when looked up by numeric ID', async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = 'true';
    const event = insertEvent(rawDb, {
      name: 'LWBC Vol6',
      slug: 'lwbc-vol6',
      date: '2024-09-15',
      status: 'archived',
    });

    const venue = insertVenue(rawDb, { name: 'Side Stage', city: 'Portland' });
    insertBand(rawDb, {
      name: 'Band Beta',
      event_id: event.id,
      venue_id: venue.id,
      start_time: '20:00',
      end_time: '21:00',
    });

    const request = new Request(
      `https://example.test/api/events/${event.id}/recap`
    );
    const response = await onRequestGet({
      request,
      env,
      params: { id: String(event.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.event.id).toBe(event.id);
    expect(payload.bands).toHaveLength(1);
  });

  test('correctly classifies first-timers vs returning acts', async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = 'true';

    // Prior event
    const priorEvent = insertEvent(rawDb, {
      name: 'LWBC Vol4',
      slug: 'lwbc-vol4',
      date: '2023-08-01',
      status: 'archived',
    });

    // Current event (archived)
    const currentEvent = insertEvent(rawDb, {
      name: 'LWBC Vol5',
      slug: 'lwbc-vol5-ft',
      date: '2024-08-03',
      status: 'archived',
    });

    const venue = insertVenue(rawDb, { name: 'Main Stage', city: 'Portland' });

    // Returning act: appears in prior event
    const returningAct = insertBand(rawDb, {
      name: 'Returning Band',
      event_id: priorEvent.id,
      venue_id: venue.id,
      start_time: '18:00',
      end_time: '19:00',
    });

    // Add the same band (by name, so same band_profile_id) to the current event
    insertBand(rawDb, {
      name: 'Returning Band',
      event_id: currentEvent.id,
      venue_id: venue.id,
      start_time: '19:00',
      end_time: '20:00',
    });

    // First-timer: only appears in the current event
    insertBand(rawDb, {
      name: 'New Band',
      event_id: currentEvent.id,
      venue_id: venue.id,
      start_time: '20:00',
      end_time: '21:00',
    });

    const request = new Request(
      `https://example.test/api/events/${currentEvent.slug}/recap`
    );
    const response = await onRequestGet({
      request,
      env,
      params: { id: currentEvent.slug },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.stats.total_sets).toBe(2);
    expect(payload.stats.first_timers).toBe(1);
    expect(payload.stats.returning_acts).toBe(1);

    const returningBand = payload.bands.find((b) => b.name === 'Returning Band');
    const newBand = payload.bands.find((b) => b.name === 'New Band');
    expect(returningBand.is_returning).toBe(true);
    expect(newBand.is_returning).toBe(false);
  });

  test('returns 503 when PUBLIC_DATA_PUBLISH_ENABLED is not set', async () => {
    const { env, rawDb } = createTestEnv();
    // Do NOT set PUBLIC_DATA_PUBLISH_ENABLED
    const event = insertEvent(rawDb, {
      name: 'LWBC Vol5',
      slug: 'lwbc-vol5-gate',
      date: '2024-08-03',
      status: 'archived',
    });

    const request = new Request(
      `https://example.test/api/events/${event.slug}/recap`
    );
    const response = await onRequestGet({
      request,
      env,
      params: { id: event.slug },
    });

    expect(response.status).toBe(503);
  });
});
