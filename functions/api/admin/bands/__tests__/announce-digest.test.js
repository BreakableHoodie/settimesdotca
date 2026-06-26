import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestEnv, insertEvent, insertVenue, insertBand } from '../../../test-utils.js'
import { flushAnnounceDigest } from '../../../../utils/announceDigest.js'

vi.mock('../../../../utils/email.js', () => ({
  sendEmail: vi.fn(() => Promise.resolve({ delivered: true })),
  isEmailConfigured: () => true,
}))

import { sendEmail } from '../../../../utils/email.js'

describe('flushAnnounceDigest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends a single-band email when only one band is queued for a fan+event', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Fest', slug: 'fest-single' })
    const venue = insertVenue(rawDb, { name: 'Hall' })
    const perf = insertBand(rawDb, { name: 'The Band', event_id: ev.id, venue_id: venue.id })

    const followId = rawDb.prepare(
      'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)'
    ).run('fan@example.com', perf.band_profile_id, 'tok-unsub').lastInsertRowid

    rawDb.prepare(
      `INSERT INTO band_announce_queue
       (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(followId, perf.id, ev.id, 'The Band', 'Fest', 'fest-single', perf.band_profile_id)

    const stats = await flushAnnounceDigest(env, env.DB)

    expect(stats.sent).toBe(1)
    expect(stats.failed).toBe(0)
    expect(sendEmail).toHaveBeenCalledOnce()
    const [, { subject }] = sendEmail.mock.calls[0]
    expect(subject).toBe('The Band just joined the lineup for Fest!')

    // Queue entry consumed
    const remaining = rawDb.prepare('SELECT * FROM band_announce_queue').all()
    expect(remaining).toHaveLength(0)
    // Notification row recorded
    const notif = rawDb.prepare('SELECT * FROM band_follow_notifications').all()
    expect(notif).toHaveLength(1)
  })

  it('sends a digest when a fan follows multiple announced bands on the same event', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Crawl', slug: 'crawl-digest' })
    const venue = insertVenue(rawDb, { name: 'Stage' })

    const perfA = insertBand(rawDb, { name: 'Band A', event_id: ev.id, venue_id: venue.id })
    const perfB = insertBand(rawDb, { name: 'Band B', event_id: ev.id, venue_id: venue.id })

    const fanFollowA = rawDb.prepare(
      'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)'
    ).run('fan@example.com', perfA.band_profile_id, 'tok-a').lastInsertRowid

    const fanFollowB = rawDb.prepare(
      'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)'
    ).run('fan@example.com', perfB.band_profile_id, 'tok-b').lastInsertRowid

    rawDb.prepare(
      `INSERT INTO band_announce_queue
       (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(fanFollowA, perfA.id, ev.id, 'Band A', 'Crawl', 'crawl-digest', perfA.band_profile_id)

    rawDb.prepare(
      `INSERT INTO band_announce_queue
       (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(fanFollowB, perfB.id, ev.id, 'Band B', 'Crawl', 'crawl-digest', perfB.band_profile_id)

    const stats = await flushAnnounceDigest(env, env.DB)

    // One email for the fan, not two
    expect(stats.sent).toBe(1)
    expect(sendEmail).toHaveBeenCalledOnce()
    const [, { subject }] = sendEmail.mock.calls[0]
    expect(subject).toBe('2 bands you follow are playing Crawl!')

    // Both queue entries consumed, both notification rows written
    expect(rawDb.prepare('SELECT * FROM band_announce_queue').all()).toHaveLength(0)
    expect(rawDb.prepare('SELECT * FROM band_follow_notifications').all()).toHaveLength(2)
  })

  it('sends separate digests for different fans', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Fest', slug: 'fest-fans' })
    const venue = insertVenue(rawDb, { name: 'Spot' })
    const perf = insertBand(rawDb, { name: 'Band X', event_id: ev.id, venue_id: venue.id })

    const f1 = rawDb.prepare(
      'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)'
    ).run('fan1@example.com', perf.band_profile_id, 'tok-f1').lastInsertRowid

    const f2 = rawDb.prepare(
      'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)'
    ).run('fan2@example.com', perf.band_profile_id, 'tok-f2').lastInsertRowid

    for (const [followId, token] of [[f1, 'tok-f1'], [f2, 'tok-f2']]) {
      rawDb.prepare(
        `INSERT INTO band_announce_queue
         (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(followId, perf.id, ev.id, 'Band X', 'Fest', 'fest-fans', perf.band_profile_id)
    }

    const stats = await flushAnnounceDigest(env, env.DB)

    expect(stats.sent).toBe(2)
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })

  it('returns empty stats when the queue is empty', async () => {
    const { env, rawDb } = createTestEnv()
    const stats = await flushAnnounceDigest(env, env.DB)
    expect(stats).toEqual({ sent: 0, failed: 0, skipped: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('releases the claim and increments failed when send fails', async () => {
    const { env, rawDb } = createTestEnv()
    sendEmail.mockResolvedValueOnce({ delivered: false, reason: 'provider_error' })

    const ev = insertEvent(rawDb, { name: 'Fest', slug: 'fest-fail' })
    const venue = insertVenue(rawDb, { name: 'Room' })
    const perf = insertBand(rawDb, { name: 'Band Z', event_id: ev.id, venue_id: venue.id })

    const followId = rawDb.prepare(
      'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)'
    ).run('fail@example.com', perf.band_profile_id, 'tok-z').lastInsertRowid

    rawDb.prepare(
      `INSERT INTO band_announce_queue
       (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(followId, perf.id, ev.id, 'Band Z', 'Fest', 'fest-fail', perf.band_profile_id)

    const stats = await flushAnnounceDigest(env, env.DB)

    expect(stats.failed).toBe(1)
    // Queue consumed (won't retry via digest; resend-announcement handles recovery)
    expect(rawDb.prepare('SELECT * FROM band_announce_queue').all()).toHaveLength(0)
    // Claim released so resend-announcement can recover
    expect(rawDb.prepare('SELECT * FROM band_follow_notifications').all()).toHaveLength(0)
  })

  it('skips entries already claimed by a concurrent flush or resend', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Fest', slug: 'fest-skip' })
    const venue = insertVenue(rawDb, { name: 'Stage' })
    const perf = insertBand(rawDb, { name: 'Band Q', event_id: ev.id, venue_id: venue.id })

    const followId = rawDb.prepare(
      'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)'
    ).run('skip@example.com', perf.band_profile_id, 'tok-q').lastInsertRowid

    rawDb.prepare(
      `INSERT INTO band_announce_queue
       (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(followId, perf.id, ev.id, 'Band Q', 'Fest', 'fest-skip', perf.band_profile_id)

    // Simulate a concurrent resend that already claimed the notification row
    rawDb.prepare(
      'INSERT INTO band_follow_notifications (performance_id, band_follow_id) VALUES (?, ?)'
    ).run(perf.id, followId)

    const stats = await flushAnnounceDigest(env, env.DB)

    expect(stats.skipped).toBe(1)
    expect(stats.sent).toBe(0)
    expect(sendEmail).not.toHaveBeenCalled()
    // Queue entry still cleaned up
    expect(rawDb.prepare('SELECT * FROM band_announce_queue').all()).toHaveLength(0)
  })
})
