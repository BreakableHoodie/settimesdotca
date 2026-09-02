// --- Durable guard: every public route must be covered by the a11y spec ------
//
// e2e/accessibility/public-routes.spec.js runs the broad WCAG ruleset against
// the fan-facing surface (#1072). Before it, most public routes had no axe
// coverage at all — only `/`, `/subscribe`, `/event/:slug` and `/admin/login`
// were scanned — so a new page could (and did) ship with unreadable controls
// or focus-order bugs that only a crawler would ever hit.
//
// This is a source scan of the route table, not a runtime assertion, for the
// same reason isPublishedGuard.test.js scans source: a `<Route path>` entry is
// a string baked into main.jsx at module load time, and nothing observable by
// rendering the app tells you whether a given route has an axe test. Only
// reading the source text catches a route added without coverage.
//
// The spec's `surfaces` array (paths in coverPath-substituted form) is the
// source of truth for what is covered. A route added to main.jsx that is
// neither covered here nor listed as an explicit, reasoned exemption fails the
// build — so the a11y coverage cannot drift silently (the "no-indexable route
// without a route file" guard in functions/__tests__/staticPageMeta.test.js is
// the sibling pattern on the SSR-meta side).
//
// Deliberately NOT in the file-level blank exemption: the spec uses runtime
// path substitution (`/band/:id` etc.), so matching the covered set is a
// prefix/shape comparison, not a vetted full list of literal URLs.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The route table is main.jsx — App.jsx is a page COMPONENT (the event
// schedule), not the router. Scanning the wrong file would silently cover
// nothing (the same trap documented in AGENTS.md about the root-level
// `_routes.json` that was dead on arrival).
const currentFile = fileURLToPath(import.meta.url)
const mainJsx = path.join(path.dirname(currentFile), '../main.jsx')

// Paths covered by e2e/accessibility/public-routes.spec.js's `surfaces` array,
// in their coverPath-substituted (route-pattern) form. The spec's ready
// locators and WCAG tags apply to each. Keep this in step with the `surfaces`
// array in that file — a route listed here but absent there means the guard
// passes while no test actually runs.
const COVERED_PATHS = new Set([
  '/', // Home — EventsPage, ready: event-card
  '/event/:slug', // Event schedule — App/ScheduleView, ready: "Full Lineup"
  '/events/:slug/recap', // Event recap — EventRecapPage, ready: "Archived Lineup"
  '/embed/:slug', // Embed — EmbedPage/ScheduleView, ready: "Full Lineup"
  '/subscribe', // SubscribePage, ready: "Never Miss a Show"
  '/reset-password', // no-token error/form state, ready: "Reset Password"
  '/activate', // no-token error state, ready: "Activation Failed"
  '/privacy', // PrivacyPage, ready: "Privacy Policy"
  '/terms', // TermsPage, ready: "Terms of Service"
  '/about', // AboutPage, ready: "About"
  '/contact', // ContactPage, ready: "Contact"
  '/stats', // StatsPage, ready: "SetTimes by the Numbers"
  '/band/:id', // BandProfilePage, ready: main h1
  '/venue/:id', // VenuePage, ready: main h1
  '/s/:slug', // SharePreviewPage (runtime-created share link), ready: "-stop route"
  '/artists', // Artists directory — ready: first a[href^="/band/"] card link
  '/venues', // Venues directory — ready: first a[href^="/venue/"] card link
])

// Public routes NOT covered by the a11y spec, with a reason. Every entry here
// is a deliberate, documented no-axe surface — adding a route to this list
// without a reason is exactly the drift this guard exists to prevent.
const EXEMPT_PATHS = {
  '/admin/*': 'Admin panel — covered separately by e2e/accessibility/admin-surfaces.spec.js + admin-login.spec.js',
  '*': 'NotFoundPage catch-all — a deliberate 404 surface, not a designed page to audit',
}

function extractRoutePaths(source) {
  return [...source.matchAll(/\bRoute\s+path="([^"]+)"/g)].map(m => m[1])
}

describe('every public route has axe coverage (or a documented exemption)', () => {
  it('covers or exempts every <Route path> in main.jsx', () => {
    const source = readFileSync(mainJsx, 'utf8')
    const routes = extractRoutePaths(source)

    expect(routes.length, 'main.jsx should declare routes to scan').toBeGreaterThan(0)

    const missing = routes.filter(pathPattern => !COVERED_PATHS.has(pathPattern) && !(pathPattern in EXEMPT_PATHS))

    expect(
      missing,
      missing.length > 0
        ? `Public route(s) added to main.jsx with no axe coverage: ${missing.join(', ')}. ` +
            `Add them to e2e/accessibility/public-routes.spec.js's \`surfaces\` array (and this test's ` +
            `COVERED_PATHS) with a data-ready locator, or record them in EXEMPT_PATHS with a reason. ` +
            `A new public page with no axe scan ships a11y bugs to crawlers and real users alike (#1072).`
        : undefined
    ).toEqual([])
  })

  it('covers the SPECIFIC routes the issue promises', () => {
    // Guard the promise explicitly so a future re-scope cannot silently drop
    // the fan-facing routes #1072 set out to cover.
    expect(COVERED_PATHS.has('/')).toBe(true)
    expect(COVERED_PATHS.has('/event/:slug')).toBe(true)
    expect(COVERED_PATHS.has('/events/:slug/recap')).toBe(true)
    expect(COVERED_PATHS.has('/band/:id')).toBe(true)
    expect(COVERED_PATHS.has('/venue/:id')).toBe(true)
    expect(COVERED_PATHS.has('/s/:slug')).toBe(true)
  })
})
