// Regression guard for the Helmet-duplicates-SSR-meta bug (PR #784, CodeRabbit
// Major finding): react-helmet-async marks the tags it manages with data-rh.
// SSR-injected canonical/og:url/etc. carry no such marker, so if a page's
// client <Helmet> also declares them, Helmet can't tell it already owns the
// slot and APPENDS a second copy on mount instead of replacing the first —
// two <link rel="canonical">, two <meta property="og:url">, live in the DOM
// at once. That produced a real "Duplicate, Google chose different canonical
// than user" Search Console error (see CLAUDE.md, "SSR owns identity meta").
// The fix is ownership: on every SSR-injected route below, the page's own
// <Helmet> was stripped of everything SSR emits. Deleting a tag this
// page's <Helmet> legitimately owns (one SSR does NOT emit) would drop
// the tag rather than de-duplicate it -- the ownership rule is "SSR owns
// what SSR emits," never "the client may only own <title>." #790
// extended the same fix (and this file's seed-then-mount-then-count pattern) to
// JSON-LD on /band/:id and /venue/:id, whose client <Helmet> used to emit its
// own MusicGroup/MusicVenue <script> block duplicating the one
// functions/band/[id].js and functions/venue/[id].js already inject server-side.
//
// This app is client-side rendered, not server-rendered: main.jsx calls
// ReactDOM.createRoot(...).render(...), never hydrateRoot — the SSR layer
// (functions/utils/ssrMeta.js) only injects <head> meta into an otherwise
// EMPTY index.html shell (`<div id="root"></div>`), never app markup. So the
// production sequence this test reproduces is: (1) the browser parses HTML
// with the SSR-injected head tags already present, then (2) React mounts the
// page component into #root the exact same way main.jsx does. seedSsrHead()
// below stands in for step 1; render() (which uses createRoot under the
// hood, like main.jsx) is step 2 unmodified — this is the real production
// sequence, not an approximation of a hydrateRoot pass that never runs here.
//
// Mutation check performed by hand: reverting any one of the Helmet trims in
// this PR (restoring that page's old canonical/og:url declaration, or
// restoring the /band/:id or /venue/:id client JSON-LD block removed in
// #790) turns its "exactly one" assertion below into "found 2" and fails —
// see the PR description for the recorded run. That's what makes this a real
// regression guard rather than a tautology that would pass either way.
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../App.jsx'
import ArtistsPage from '../ArtistsPage.jsx'
import VenuesPage from '../VenuesPage.jsx'
import AboutPage from '../AboutPage.jsx'
import ContactPage from '../ContactPage.jsx'
import StatsPage from '../StatsPage.jsx'
import PrivacyPage from '../PrivacyPage.jsx'
import TermsPage from '../TermsPage.jsx'
import SubscribePage from '../SubscribePage.jsx'
import EventRecapPage from '../EventRecapPage.jsx'
import VenuePage from '../VenuePage.jsx'
import BandProfilePage from '../BandProfilePage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/metrics', () => ({
  trackPageView: vi.fn(),
  trackSocialClick: vi.fn(),
  trackArtistView: vi.fn(),
  trackEventView: vi.fn(),
}))
vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

// The two tags every SSR handler built on functions/utils/ssrMeta.js injects
// for an affected route, and the two Google's canonicalization signal keys
// on -- what the real GSC incident hit. Standing in for the backend's actual
// injected HTML (functions/__tests__/staticPageMeta.test.js and
// functions/events/__tests__/recap.test.js already prove THAT string is
// correct and singular server-side; this file proves the client doesn't
// re-add a second copy on top of it).
function seedSsrHead(path, title) {
  const canonical = document.createElement('link')
  canonical.setAttribute('rel', 'canonical')
  canonical.setAttribute('href', `https://settimes.ca${path}`)
  document.head.appendChild(canonical)

  const ogUrl = document.createElement('meta')
  ogUrl.setAttribute('property', 'og:url')
  ogUrl.setAttribute('content', `https://settimes.ca${path}`)
  document.head.appendChild(ogUrl)

  // #785: the SSR layer (functions/utils/ssrMeta.js serveWithInjectedMeta)
  // swaps the route's <title> into the raw HTML response. Seed that title too
  // and assert the client keeps it (never clobbers it with a loading/fallback
  // title, and reproduces its exact string once data arrives). Marked with
  // data-seeded so afterEach can remove exactly this node — a React-managed
  // <title> (react-helmet-async renders one via React 19 head hoisting,
  // carrying no data-rh) must be left for React's own unmount cleanup.
  const titleTag = document.createElement('title')
  titleTag.setAttribute('data-seeded', 'true')
  titleTag.textContent = title
  document.head.appendChild(titleTag)
}

function countIdentityTags() {
  return {
    canonical: document.head.querySelectorAll('link[rel="canonical"]').length,
    ogUrl: document.head.querySelectorAll('meta[property="og:url"]').length,
  }
}

// Stands in for the JSON-LD <script> blocks functions/band/[id].js and
// functions/venue/[id].js inject server-side (#790) -- appended to <head>,
// matching serveWithInjectedMeta's real injection point (just before
// </head>) -- the same seed-then-mount-then-count pattern seedSsrHead/
// countIdentityTags use for canonical/og:url above, extended to JSON-LD
// since those two routes' client Helmet used to duplicate their own
// MusicGroup/MusicVenue schema on mount the same way it used to duplicate
// canonical/og:url.
function seedSsrJsonLd(schemas) {
  schemas.forEach(schema => {
    const script = document.createElement('script')
    script.setAttribute('type', 'application/ld+json')
    script.textContent = JSON.stringify(schema)
    document.head.appendChild(script)
  })
}

// Counts JSON-LD <script> blocks ANYWHERE in the document (not just <head>)
// by their @type. This is not a stylistic choice: under React 19,
// react-helmet-async (v3) only auto-hoists <script async> tags to <head> --
// a bare <script type="application/ld+json"> (no `async`, as this codebase's
// JSON-LD blocks are) renders in place in the React tree instead, i.e.
// inside <body>, wherever <Helmet> sits as a component. A client-duplicated
// JSON-LD block would therefore land in <body>, NOT <head> -- confirmed by
// instrumenting react-helmet-async's React19Dispatcher directly. Scoping
// this count to document.head would make the assertion below pass whether or
// not the client still declares the block -- a test that survives both the
// correct and the broken implementation, i.e. no guard at all. This was caught
// by mutation-checking (restoring the deleted client block and confirming the
// test then fails); querying the whole document is the only selector that can
// actually observe a real duplicate here.
function countJsonLdByType() {
  const counts = {}
  document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
    let type
    try {
      type = JSON.parse(el.textContent)['@type']
    } catch {
      type = 'unparseable'
    }
    counts[type] = (counts[type] || 0) + 1
  })
  return counts
}

// Helmet's own tags (data-rh="true") are removed on unmount by
// react-helmet-async itself; the SSR tags seeded above are plain nodes
// Helmet never owned and RTL's cleanup() doesn't know about them, so each
// test starts from a clean head regardless of what a prior test left behind.
afterEach(() => {
  document
    .querySelectorAll(
      'link[rel="canonical"], meta[property="og:url"], script[type="application/ld+json"], title[data-seeded]'
    )
    .forEach(el => el.remove())
})

function withProviders(children, { themed = false } = {}) {
  const withHelmet = <HelmetProvider>{children}</HelmetProvider>
  return themed ? <ThemeProvider>{withHelmet}</ThemeProvider> : withHelmet
}

describe('SSR-injected routes — client Helmet must not duplicate canonical/og:url after mount', () => {
  beforeEach(() => {
    fetchPublicJson.mockReset()
  })

  it('ArtistsPage (/artists)', async () => {
    fetchPublicJson.mockResolvedValue({ artists: [], hasMore: false })
    seedSsrHead('/artists', 'Artists – SetTimes')

    render(
      withProviders(
        <MemoryRouter>
          <ArtistsPage />
        </MemoryRouter>,
        { themed: true }
      )
    )
    await screen.findByRole('searchbox', { name: /search artists/i })

    expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
    await waitFor(() => expect(document.title).toBe('Artists – SetTimes'))
  })

  it('VenuesPage (/venues)', async () => {
    fetchPublicJson.mockResolvedValue({ venues: [], hasMore: false })
    seedSsrHead('/venues', 'Venues – SetTimes')

    render(
      withProviders(
        <MemoryRouter>
          <VenuesPage />
        </MemoryRouter>,
        { themed: true }
      )
    )
    await screen.findByRole('heading', { level: 1 })

    expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
    await waitFor(() => expect(document.title).toBe('Venues – SetTimes'))
  })

  it('AboutPage (/about)', async () => {
    seedSsrHead('/about', 'About | SetTimes')

    render(
      withProviders(
        <MemoryRouter>
          <AboutPage />
        </MemoryRouter>
      )
    )
    await screen.findByRole('heading', { level: 1 })

    expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
    await waitFor(() => expect(document.title).toBe('About | SetTimes'))
  })

  it('ContactPage (/contact)', async () => {
    seedSsrHead('/contact', 'Contact | SetTimes')

    render(
      withProviders(
        <MemoryRouter>
          <ContactPage />
        </MemoryRouter>
      )
    )
    await screen.findByRole('heading', { level: 1 })

    expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
    await waitFor(() => expect(document.title).toBe('Contact | SetTimes'))
  })

  it('StatsPage (/stats)', async () => {
    fetchPublicJson.mockResolvedValue({
      bands: 22,
      venues: 6,
      events: 1,
      performances: 23,
      routes_shared: 14,
      route_views: 40,
      fans_following: 8,
      page_views: 500,
      top_bands: [],
    })
    seedSsrHead('/stats', 'Stats | SetTimes')

    render(
      withProviders(
        <MemoryRouter>
          <StatsPage />
        </MemoryRouter>,
        { themed: true }
      )
    )
    await screen.findByText(/22/)

    expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
    await waitFor(() => expect(document.title).toBe('Stats | SetTimes'))
  })

  it('PrivacyPage (/privacy)', async () => {
    seedSsrHead('/privacy', 'Privacy Policy | SetTimes')

    render(
      withProviders(
        <MemoryRouter>
          <PrivacyPage />
        </MemoryRouter>
      )
    )
    await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })

    expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
    await waitFor(() => expect(document.title).toBe('Privacy Policy | SetTimes'))
  })

  it('TermsPage (/terms)', async () => {
    seedSsrHead('/terms', 'Terms of Service | SetTimes')

    render(
      withProviders(
        <MemoryRouter>
          <TermsPage />
        </MemoryRouter>
      )
    )
    await screen.findByRole('heading', { level: 1, name: 'Terms of Service' })

    expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
    await waitFor(() => expect(document.title).toBe('Terms of Service | SetTimes'))
  })

  it('SubscribePage (/subscribe)', async () => {
    seedSsrHead('/subscribe', 'Subscribe — Never Miss a Show | SetTimes')

    render(
      withProviders(
        <MemoryRouter>
          <SubscribePage />
        </MemoryRouter>
      )
    )
    await screen.findByRole('heading', { level: 1, name: 'Never Miss a Show' })

    expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
    await waitFor(() => expect(document.title).toBe('Subscribe — Never Miss a Show | SetTimes'))
  })

  it('EventRecapPage (/events/:slug/recap)', async () => {
    fetchPublicJson.mockResolvedValue({
      event: { id: 1, name: 'LWBC Vol17', slug: 'lwbc17', date: '2026-08-02' },
      stats: { total_sets: 2, venue_count: 1, first_timers: 1, returning_acts: 1 },
      bands: [],
    })
    seedSsrHead('/events/lwbc17/recap', 'LWBC Vol17 — Event Recap | SetTimes.ca')

    render(
      withProviders(
        <MemoryRouter initialEntries={['/events/lwbc17/recap']}>
          <Routes>
            <Route path="/events/:slug/recap" element={<EventRecapPage />} />
          </Routes>
        </MemoryRouter>
      )
    )
    await screen.findByText('LWBC Vol17')

    expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
    await waitFor(() => expect(document.title).toBe('LWBC Vol17 — Event Recap | SetTimes.ca'))
  })

  it('VenuePage (/venue/:id)', async () => {
    fetchPublicJson.mockResolvedValue({
      venue: { id: 3, name: 'Room 47', city: 'Waterloo', location: 'Waterloo, ON', address: null, website: null },
      upcoming: [],
      past: [],
    })
    seedSsrHead('/venue/3', 'Room 47 — Live Music Venue in Waterloo, ON | SetTimes')
    // Mirrors functions/venue/[id].js's jsonLd: [musicVenue, breadcrumb] (#790).
    seedSsrJsonLd([
      { '@context': 'https://schema.org', '@type': 'MusicVenue', name: 'Room 47', url: 'https://settimes.ca/venue/3' },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] },
    ])

    render(
      withProviders(
        <MemoryRouter initialEntries={['/venue/3']}>
          <Routes>
            <Route path="/venue/:id" element={<VenuePage />} />
          </Routes>
        </MemoryRouter>,
        { themed: true }
      )
    )
    await screen.findByRole('heading', { level: 1, name: 'Room 47' })

    expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
    expect(countJsonLdByType()).toEqual({ MusicVenue: 1, BreadcrumbList: 1 })
    await waitFor(() => expect(document.title).toBe('Room 47 — Live Music Venue in Waterloo, ON | SetTimes'))
  })

  // #785 / #859 review: VenuePage is the one SSR-injected route with no
  // loading early-return, so its <Helmet> renders on the very first paint.
  // React 19 hoists that <title> into document.title, which beats the
  // !loading guard on the effect — an ungated fallback here replaced the
  // server-sent title with 'Venue – SetTimes' for the whole fetch window.
  // The BandProfilePage deferred case below cannot catch this class: that
  // page has no <Helmet> at all.
  it('VenuePage keeps the SSR <title> while the venue fetch is in flight', async () => {
    let resolveFetch
    fetchPublicJson.mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve
      })
    )
    seedSsrHead('/venue/3', 'Room 47 — Live Music Venue in Waterloo, ON | SetTimes')

    render(
      withProviders(
        <MemoryRouter initialEntries={['/venue/3']}>
          <Routes>
            <Route path="/venue/:id" element={<VenuePage />} />
          </Routes>
        </MemoryRouter>,
        { themed: true }
      )
    )

    // Still loading: the title in the DOM is exactly what the server sent.
    await waitFor(() => expect(document.title).toBe('Room 47 — Live Music Venue in Waterloo, ON | SetTimes'))

    resolveFetch({
      venue: { id: 3, name: 'Room 47', city: 'Waterloo', location: 'Waterloo, ON', address: null, website: null },
      upcoming: [],
      past: [],
    })
    await screen.findByRole('heading', { level: 1, name: 'Room 47' })

    expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
    await waitFor(() => expect(document.title).toBe('Room 47 — Live Music Venue in Waterloo, ON | SetTimes'))
  })

  it('BandProfilePage (/band/:id)', async () => {
    fetchPublicJson.mockResolvedValue({
      id: 206,
      name: 'ALL',
      photo_url: null,
      photo_alt_text: null,
      description: null,
      genre: 'Punk',
      origin: null,
      social: {},
      stats: null,
      upcoming: [],
      past: [],
    })
    seedSsrHead('/band/206', 'ALL — Punk in Waterloo Region | SetTimes')
    // Mirrors functions/band/[id].js's jsonLd: [musicGroup, breadcrumb] (#790).
    seedSsrJsonLd([
      { '@context': 'https://schema.org', '@type': 'MusicGroup', name: 'ALL', url: 'https://settimes.ca/band/206' },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] },
    ])

    render(
      withProviders(
        <MemoryRouter initialEntries={['/band/206']}>
          <Routes>
            <Route path="/band/:id" element={<BandProfilePage />} />
          </Routes>
        </MemoryRouter>,
        { themed: true }
      )
    )
    await screen.findByRole('heading', { level: 1, name: 'ALL' })

    expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
    expect(countJsonLdByType()).toEqual({ MusicGroup: 1, BreadcrumbList: 1 })
    await waitFor(() => expect(document.title).toBe('ALL — Punk in Waterloo Region | SetTimes'))
  })

  // #785: the SSR <title> must survive the whole load — the fetch is still
  // in flight when the component mounts, and the loading skeleton must not
  // clobber the server-sent title with a generic placeholder.
  it('BandProfilePage keeps the SSR <title> while the profile fetch is in flight', async () => {
    let resolveFetch
    fetchPublicJson.mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve
      })
    )
    seedSsrHead('/band/206', 'ALL — Punk in Waterloo Region | SetTimes')
    // Mirrors functions/band/[id].js's jsonLd: [musicGroup, breadcrumb] (#790).
    seedSsrJsonLd([
      { '@context': 'https://schema.org', '@type': 'MusicGroup', name: 'ALL', url: 'https://settimes.ca/band/206' },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] },
    ])

    render(
      withProviders(
        <MemoryRouter initialEntries={['/band/206']}>
          <Routes>
            <Route path="/band/:id" element={<BandProfilePage />} />
          </Routes>
        </MemoryRouter>,
        { themed: true }
      )
    )

    // Still loading: the title in the DOM is exactly what the server sent.
    await waitFor(() => expect(document.title).toBe('ALL — Punk in Waterloo Region | SetTimes'))

    resolveFetch({
      id: 206,
      name: 'ALL',
      photo_url: null,
      photo_alt_text: null,
      description: null,
      genre: 'Punk',
      origin: null,
      social: {},
      stats: null,
      upcoming: [],
      past: [],
    })
    await screen.findByRole('heading', { level: 1, name: 'ALL' })

    expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
    expect(countJsonLdByType()).toEqual({ MusicGroup: 1, BreadcrumbList: 1 })
    await waitFor(() => expect(document.title).toBe('ALL — Punk in Waterloo Region | SetTimes'))
  })

  // App.jsx is the /event/:slug route's own component (main.jsx routes it
  // directly, not through a dedicated page component) -- it fetches via raw
  // fetch(), not fetchPublicJson, so it gets its own minimal mock rather than
  // the shared fetchPublicJson mock above.
  it('App (/event/:slug)', async () => {
    // App loads the schedule through fetchPublicJson, which this file mocks at
    // the module level and resets in beforeEach — so the payload must be set
    // here, not on a raw global.fetch stub. The stub is kept as well: other
    // components mounted by this route still call fetch directly.
    const schedulePayload = {
      bands: [],
      event: { id: 1, name: 'LWBC Vol17', slug: 'lwbc17', date: '2026-08-02', end_date: null, city: 'Kitchener' },
    }
    fetchPublicJson.mockResolvedValue(schedulePayload)
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => schedulePayload,
    })
    seedSsrHead('/event/lwbc17', 'LWBC Vol17 — Set Times & Lineup in Kitchener | SetTimes')

    try {
      render(
        withProviders(
          <MemoryRouter initialEntries={['/event/lwbc17']}>
            <Routes>
              <Route path="/event/:slug" element={<App />} />
            </Routes>
          </MemoryRouter>,
          { themed: true }
        )
      )
      // The event name renders in more than one place once loaded (breadcrumb,
      // sticky context bar) -- findAllByText tolerates that; findByText would
      // throw on the very success condition this is waiting for.
      await screen.findAllByText(/LWBC Vol17/, {}, { timeout: 3000 })

      expect(countIdentityTags()).toEqual({ canonical: 1, ogUrl: 1 })
      await waitFor(() => expect(document.title).toBe('LWBC Vol17 — Set Times & Lineup in Kitchener | SetTimes'))
    } finally {
      global.fetch = originalFetch
    }
  })
})
