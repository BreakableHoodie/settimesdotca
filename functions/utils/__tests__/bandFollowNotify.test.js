import { describe, expect, test, vi } from 'vitest'

vi.mock('../email.js', () => ({
  sendEmail: vi.fn(),
}))

import { sendEmail } from '../email.js'
import { notifyBandFollowers } from '../bandFollowNotify.js'
import {
  createTestEnv,
  insertEvent,
  insertVenue,
  insertBand,
} from '../../api/test-utils.js'

describe('notifyBandFollowers', () => {
  test('records a notification for each delivered email and skips failures', async () => {
    const { env, rawDb } = createTestEnv()
    const event = insertEvent(rawDb, { name: 'Fest', slug: 'fest' })
    const venue = insertVenue(rawDb, { name: 'Hall' })
    const perf = insertBand(rawDb, {
      name: 'The Band',
      event_id: event.id,
      venue_id: venue.id,
    })
    const bandProfileId = perf.band_profile_id

    const f1 = rawDb
      .prepare(
        'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)'
      )
      .run('a@example.com', bandProfileId, 'tok-a').lastInsertRowid
    const f2 = rawDb
      .prepare(
        'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)'
      )
      .run('b@example.com', bandProfileId, 'tok-b').lastInsertRowid

    // First delivers, second fails.
    sendEmail.mockImplementation((_env, { to }) =>
      Promise.resolve({ delivered: to === 'a@example.com' })
    )

    const result = await notifyBandFollowers(env, env.DB, {
      performanceId: perf.id,
      bandProfileId,
      bandName: 'The Band',
      eventName: 'Fest',
      followers: [
        { id: f1, email: 'a@example.com', unsubscribe_token: 'tok-a' },
        { id: f2, email: 'b@example.com', unsubscribe_token: 'tok-b' },
      ],
    })

    expect(result).toEqual({ sent: 1, failed: 1 })

    const notified = rawDb
      .prepare(
        'SELECT band_follow_id FROM band_follow_notifications WHERE performance_id = ? ORDER BY band_follow_id'
      )
      .all(perf.id)
    expect(notified.map((r) => r.band_follow_id)).toEqual([f1])
  })
})
