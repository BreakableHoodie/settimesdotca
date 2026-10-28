import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('referrerBucket', () => {
  it.each([
    ['', 'direct'],
    [undefined, 'direct'],
    ['https://settimes.ca/event/lwbc18', 'direct'],
    ['https://www.settimes.ca/', 'direct'],
    ['https://l.instagram.com/?u=abc', 'instagram'],
    ['https://lm.facebook.com/l.php?u=x', 'facebook'],
    ['https://www.google.ca/', 'google'],
    ['https://google.co.uk/search?q=x', 'google'],
    ['https://bing.com/search', 'other_search'],
    ['https://duckduckgo.com/', 'other_search'],
    ['https://example.com/blog', 'other'],
    ['https://notinstagram.com/', 'other'],
    ['https://instagram.com.evil.test/', 'other'],
    ['not a url at all', 'other'],
    ['android-app://com.google.android.googlequicksearchbox/https/www.google.com', 'google'],
    ['android-app://com.instagram.android', 'instagram'],
    ['android-app://com.facebook.katana', 'facebook'],
    ['android-app://com.google.android.gm', 'other'],
  ])('%s -> %s', async (referrer, expected) => {
    const { referrerBucket } = await import('../metrics')
    expect(referrerBucket(referrer, 'settimes.ca')).toBe(expected)
  })
})

describe('visit emission', () => {
  let trackPageView
  let sent

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    sent = []
    Object.defineProperty(navigator, 'sendBeacon', {
      value: vi.fn(async (_url, blob) => {
        sent.push(JSON.parse(await blob.text()))
        return true
      }),
      configurable: true,
    })
    window.sessionStorage.clear()
    Object.defineProperty(document, 'referrer', {
      value: 'https://l.instagram.com/?u=1',
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function load() {
    ;({ trackPageView } = await import('../metrics'))
  }

  async function flush() {
    vi.advanceTimersByTime(6000)
    await vi.advanceTimersByTimeAsync(0)
    return sent.flatMap(payload => payload.events)
  }

  it('sends one visit for multiple page views in a browser session', async () => {
    await load()
    trackPageView('/')
    trackPageView('/venues')
    const events = await flush()
    expect(events.filter(event => event.event === 'visit')).toHaveLength(1)
    expect(events.filter(event => event.event === 'page_view')).toHaveLength(2)
  })

  it('sends at most one visit when sessionStorage throws', async () => {
    vi.spyOn(window.Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    await load()
    trackPageView('/')
    trackPageView('/venues')
    const events = await flush()
    expect(events.filter(event => event.event === 'visit')).toHaveLength(1)
  })

  it('sends no second visit after a reload in the same browser session', async () => {
    await load()
    trackPageView('/')
    expect((await flush()).filter(event => event.event === 'visit')).toHaveLength(1)

    // A reload is a fresh module with the same sessionStorage.
    vi.resetModules()
    sent = []
    await load()
    trackPageView('/venues')
    const events = await flush()
    expect(events.filter(event => event.event === 'visit')).toHaveLength(0)
    expect(events.filter(event => event.event === 'page_view')).toHaveLength(1)
  })

  it('does not send the referrer URL', async () => {
    await load()
    trackPageView('/')
    const events = await flush()
    expect(JSON.stringify(events)).not.toContain('instagram.com')
  })
})
