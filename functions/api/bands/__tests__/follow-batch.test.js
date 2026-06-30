import { describe, it, expect } from 'vitest'
import { createTestEnv, insertBand, insertEvent } from '../../test-utils'
import * as followBatchHandler from '../follow-batch.js'
import * as confirmBatchHandler from '../confirm-follow-batch.js'

// waitUntil in tests: run the promise synchronously so email side-effects
// execute before assertions (mirrors follow.test.js pattern).
const waitUntil = (p) => p

describe('POST /api/bands/follow-batch', () => {
  it('inserts N verified=0 rows all sharing one batch_token', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol17', slug: 'vol17-batch' })
    const b1 = insertBand(rawDb, { name: 'Alpha', event_id: ev.id })
    const b2 = insertBand(rawDb, { name: 'Beta', event_id: ev.id })
    const b3 = insertBand(rawDb, { name: 'Gamma', event_id: ev.id })

    const req = new Request('https://example.test/api/bands/follow-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'fan@example.com',
        performance_ids: [b1.id, b2.id, b3.id],
      }),
    })
    const res = await followBatchHandler.onRequestPost({
      request: req,
      env,
      waitUntil,
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)

    const rows = rawDb
      .prepare('SELECT * FROM band_follows WHERE email = ? ORDER BY id')
      .all('fan@example.com')

    // Three rows — one per band
    expect(rows).toHaveLength(3)

    // Security invariant: every row must be unverified
    for (const row of rows) {
      expect(row.verified).toBe(0)
      expect(row.verification_token).toBeTruthy()
      expect(row.unsubscribe_token).toBeTruthy()
      expect(row.consent_method).toBe('web_form')
    }

    // All three rows share the same batch_token
    const tokens = new Set(rows.map((r) => r.batch_token))
    expect(tokens.size).toBe(1)
    expect([...tokens][0]).toBeTruthy()
  })

  it('returns confirmUrl in dev (email unconfigured) instead of sending email', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol17', slug: 'vol17-confirmurl' })
    const b1 = insertBand(rawDb, { name: 'Dev Band A', event_id: ev.id })
    const b2 = insertBand(rawDb, { name: 'Dev Band B', event_id: ev.id })

    const req = new Request('https://example.test/api/bands/follow-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dev@example.com',
        performance_ids: [b1.id, b2.id],
      }),
    })
    const res = await followBatchHandler.onRequestPost({
      request: req,
      env,
      waitUntil,
    })

    const data = await res.json()
    expect(data.success).toBe(true)
    // Dev env: email not configured → confirmUrl included
    expect(data.confirmUrl).toMatch(/\/api\/bands\/confirm-follow-batch\?token=/)
  })

  it('is idempotent — re-submitting the same email returns 200 with no duplicate rows', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol17', slug: 'vol17-idempotent' })
    const b1 = insertBand(rawDb, { name: 'Idem Band', event_id: ev.id })

    const makeReq = () =>
      new Request('https://example.test/api/bands/follow-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'idem@example.com',
          performance_ids: [b1.id],
        }),
      })

    const r1 = await followBatchHandler.onRequestPost({ request: makeReq(), env, waitUntil })
    const r2 = await followBatchHandler.onRequestPost({ request: makeReq(), env, waitUntil })

    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)

    const rows = rawDb
      .prepare('SELECT * FROM band_follows WHERE email = ?')
      .all('idem@example.com')
    // INSERT OR IGNORE: no duplicate rows
    expect(rows).toHaveLength(1)
  })

  it('no-enumeration: existing follows return 200 without leaking state', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol17', slug: 'vol17-noenum' })
    const band = insertBand(rawDb, { name: 'Existing Band', event_id: ev.id })

    // Pre-seed a verified follow
    rawDb
      .prepare(
        'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)',
      )
      .run('existing@example.com', band.band_profile_id, 'existing-unsub')

    const req = new Request('https://example.test/api/bands/follow-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'existing@example.com',
        performance_ids: [band.id],
      }),
    })
    const res = await followBatchHandler.onRequestPost({ request: req, env, waitUntil })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    // No confirmUrl leaked — no new row was created
    expect(data.confirmUrl).toBeUndefined()

    // Original verified row untouched; no duplicate
    const rows = rawDb
      .prepare('SELECT * FROM band_follows WHERE email = ?')
      .all('existing@example.com')
    expect(rows).toHaveLength(1)
    expect(rows[0].verified).toBe(1)
  })

  it('returns 400 for an invalid email', async () => {
    const { env } = createTestEnv()

    const req = new Request('https://example.test/api/bands/follow-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', performance_ids: [1] }),
    })
    const res = await followBatchHandler.onRequestPost({ request: req, env, waitUntil })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/email/i)
  })

  it('returns 400 when performance_ids is missing', async () => {
    const { env } = createTestEnv()

    const req = new Request('https://example.test/api/bands/follow-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan@example.com' }),
    })
    const res = await followBatchHandler.onRequestPost({ request: req, env, waitUntil })
    expect(res.status).toBe(400)
  })

  it('returns 400 when performance_ids is empty', async () => {
    const { env } = createTestEnv()

    const req = new Request('https://example.test/api/bands/follow-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan@example.com', performance_ids: [] }),
    })
    const res = await followBatchHandler.onRequestPost({ request: req, env, waitUntil })
    expect(res.status).toBe(400)
  })

  it(`returns 400 when performance_ids exceeds MAX_BATCH_SIZE (30)`, async () => {
    const { env } = createTestEnv()
    const tooMany = Array.from({ length: 31 }, (_, i) => i + 1)

    const req = new Request('https://example.test/api/bands/follow-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan@example.com', performance_ids: tooMany }),
    })
    const res = await followBatchHandler.onRequestPost({ request: req, env, waitUntil })
    expect(res.status).toBe(400)
  })

  it('returns 400 when performance_ids contains non-integers', async () => {
    const { env } = createTestEnv()

    const req = new Request('https://example.test/api/bands/follow-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan@example.com', performance_ids: ['one', 2] }),
    })
    const res = await followBatchHandler.onRequestPost({ request: req, env, waitUntil })
    expect(res.status).toBe(400)
  })

  it('returns 200 silently when all performance_ids are unknown (no enumeration)', async () => {
    const { env } = createTestEnv()

    const req = new Request('https://example.test/api/bands/follow-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan@example.com', performance_ids: [99999, 99998] }),
    })
    const res = await followBatchHandler.onRequestPost({ request: req, env, waitUntil })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('records consent_ip from CF-Connecting-IP', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol17', slug: 'vol17-ip' })
    const band = insertBand(rawDb, { name: 'IP Band Batch', event_id: ev.id })

    const req = new Request('https://example.test/api/bands/follow-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.10',
      },
      body: JSON.stringify({ email: 'ip@example.com', performance_ids: [band.id] }),
    })
    await followBatchHandler.onRequestPost({ request: req, env, waitUntil })

    const row = rawDb
      .prepare('SELECT consent_ip FROM band_follows WHERE email = ?')
      .get('ip@example.com')
    expect(row.consent_ip).toBe('203.0.113.10')
  })
})

describe('GET /api/bands/confirm-follow-batch', () => {
  it('verifies all pending follows in the batch and clears batch_token', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol17', slug: 'vol17-confirm-batch' })
    const b1 = insertBand(rawDb, { name: 'Confirm A', event_id: ev.id })
    const b2 = insertBand(rawDb, { name: 'Confirm B', event_id: ev.id })

    // Create the batch follows
    const followReq = new Request('https://example.test/api/bands/follow-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'confirmbatch@example.com',
        performance_ids: [b1.id, b2.id],
      }),
    })
    const followRes = await followBatchHandler.onRequestPost({
      request: followReq,
      env,
      waitUntil,
    })
    const { confirmUrl } = await followRes.json()
    expect(confirmUrl).toBeTruthy()

    const batchToken = new URL(confirmUrl).searchParams.get('token')
    expect(batchToken).toBeTruthy()

    // Verify both rows are pending before confirm
    const pending = rawDb
      .prepare('SELECT verified FROM band_follows WHERE email = ?')
      .all('confirmbatch@example.com')
    expect(pending.every((r) => r.verified === 0)).toBe(true)

    // Confirm the batch
    const confirmReq = new Request(
      `https://example.test/api/bands/confirm-follow-batch?token=${batchToken}`,
    )
    const confirmRes = await confirmBatchHandler.onRequestGet({
      request: confirmReq,
      env,
    })
    expect(confirmRes.status).toBe(200)
    const html = await confirmRes.text()
    expect(html).toMatch(/you're all set/i)

    // All rows now verified=1, batch_token cleared
    const confirmed = rawDb
      .prepare('SELECT verified, batch_token FROM band_follows WHERE email = ?')
      .all('confirmbatch@example.com')
    expect(confirmed).toHaveLength(2)
    for (const row of confirmed) {
      expect(row.verified).toBe(1)
      expect(row.batch_token).toBeNull()
    }
  })

  it('is idempotent — a second click on a used token still returns 200', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol17', slug: 'vol17-idem-confirm' })
    const band = insertBand(rawDb, { name: 'Idem Confirm', event_id: ev.id })

    const followReq = new Request('https://example.test/api/bands/follow-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'idem2@example.com',
        performance_ids: [band.id],
      }),
    })
    const followRes = await followBatchHandler.onRequestPost({
      request: followReq,
      env,
      waitUntil,
    })
    const { confirmUrl } = await followRes.json()
    const batchToken = new URL(confirmUrl).searchParams.get('token')

    const makeConfirmReq = () =>
      new Request(
        `https://example.test/api/bands/confirm-follow-batch?token=${batchToken}`,
      )

    const first = await confirmBatchHandler.onRequestGet({ request: makeConfirmReq(), env })
    const second = await confirmBatchHandler.onRequestGet({ request: makeConfirmReq(), env })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    // Row still verified=1 after both clicks
    const row = rawDb
      .prepare('SELECT verified FROM band_follows WHERE email = ?')
      .get('idem2@example.com')
    expect(row.verified).toBe(1)
  })

  it('returns 400 for a missing token', async () => {
    const { env } = createTestEnv()
    const req = new Request('https://example.test/api/bands/confirm-follow-batch')
    const res = await confirmBatchHandler.onRequestGet({ request: req, env })
    expect(res.status).toBe(400)
  })

  it('returns 400 for an oversized token', async () => {
    const { env } = createTestEnv()
    const longToken = 'a'.repeat(257)
    const req = new Request(
      `https://example.test/api/bands/confirm-follow-batch?token=${longToken}`,
    )
    const res = await confirmBatchHandler.onRequestGet({ request: req, env })
    expect(res.status).toBe(400)
  })

  it('returns 200 for an unknown token (no enumeration)', async () => {
    const { env } = createTestEnv()
    const req = new Request(
      'https://example.test/api/bands/confirm-follow-batch?token=nonexistent-batch-token',
    )
    const res = await confirmBatchHandler.onRequestGet({ request: req, env })
    // Unknown token: changes=0, but we still show the success page (generic/no-enumeration)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toMatch(/you're all set/i)
  })
})
