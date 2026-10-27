import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MetricsDashboard from '../components/MetricsDashboard'

vi.mock('../../utils/adminApi', () => ({
  eventsApi: {
    getMetrics: vi.fn(),
  },
}))

import { eventsApi } from '../../utils/adminApi'

describe('MetricsDashboard', () => {
  it('displays share analytics: shares created, share views, imports, and top routes', async () => {
    eventsApi.getMetrics.mockResolvedValue({
      metrics: {
        totalScheduleBuilds: 10,
        routeBuilders: 7,
        completionRate: 25,
        routeSizeDistribution: [
          { bucket: '1', route_count: 1 },
          { bucket: '2-3', route_count: 2 },
          { bucket: '4-6', route_count: 0 },
          { bucket: '7-11', route_count: 0 },
          { bucket: '12+', route_count: 0 },
        ],
        lastUpdated: '2026-06-18 12:00:00',
        popularBands: [],
        totalShares: 3,
        totalShareViews: 42,
        totalShareImports: 5,
        topSharedRoutes: [
          { slug: 'abc123', view_count: 30, band_count: 4, created_at: '2026-07-16 07:02:00' },
          { slug: 'def456', view_count: 1, band_count: 1, created_at: '2026-07-29 21:59:00' },
        ],
      },
    })

    render(<MetricsDashboard eventId={1} />)

    expect(await screen.findByText('Shares Created')).toBeInTheDocument()
    expect(screen.getByText('Fans Who Built a Route')).toBeInTheDocument()
    expect(screen.getByText('25.0%')).toBeInTheDocument()
    expect(screen.getByText('Route Size Distribution')).toBeInTheDocument()
    // Contract: every bucket renders, its count comes from `route_count`, and
    // both label pluralisations resolve. A heading-only check satisfies none.
    expect(screen.getByText('1 set')).toBeInTheDocument()
    expect(screen.getByText('1 route')).toBeInTheDocument()
    expect(screen.getByText('2-3 sets')).toBeInTheDocument()
    expect(screen.getByText('2 routes')).toBeInTheDocument()
    expect(screen.getByText('12+ sets')).toBeInTheDocument()
    expect(screen.getAllByText('0 routes')).toHaveLength(3)
    expect(screen.getByText(/Page-view history may be shorter/)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Share Views (unique visitors per link, all-time)')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Shares Imported')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Most-Viewed Shared Routes')).toBeInTheDocument()
    expect(screen.getByText(/abc123/)).toBeInTheDocument()
    // Band count + creation date surfaced so the slug is actionable (#702)
    expect(screen.getByText(/4 bands/)).toBeInTheDocument()
    expect(screen.getByText(/2026-07-16/)).toBeInTheDocument()
    // Singular "view" pluralises correctly
    expect(screen.getByText(/1 unique visitor/)).toBeInTheDocument()
    expect(screen.getByText(/1 band/)).toBeInTheDocument()
    // Plural "views" still renders within the compound row
    expect(screen.getByText(/30 unique visitors/)).toBeInTheDocument()
    // view_count and import_count are different units and get conflated
    // (CLAUDE.md "Metrics & Analytics"): views are unique visitors recomputed
    // from a ledger, imports are per-fetch and undeduped, so imports CAN exceed
    // views. This caption is the only place a reader learns that — assert it
    // survives, because silently dropping it makes the panel misleading rather
    // than merely sparser.
    expect(screen.getByText(/Unique visitors are deduplicated per link/)).toBeInTheDocument()
    expect(screen.getByText(/Imports count per-fetch/)).toBeInTheDocument()
  })

  it('shows legacy raw fetches separately from unique visitors', async () => {
    eventsApi.getMetrics.mockResolvedValue({
      metrics: {
        totalScheduleBuilds: 0,
        routeBuilders: 0,
        completionRate: undefined,
        routeSizeDistribution: [],
        lastUpdated: null,
        popularBands: [],
        totalShares: 1,
        totalShareViews: 2,
        totalShareViewsLegacy: 9,
        totalShareImports: 0,
        topSharedRoutes: [{ slug: 'legacy', view_count: 2, view_count_legacy: 9, band_count: 1 }],
      },
    })

    render(<MetricsDashboard eventId={1} />)

    expect(await screen.findByText('Share Views (unique visitors per link, all-time)')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    // Two renders: the aggregate card and the route row. An exact-string
    // getByText matched only the card, because the row's node reads
    // " · 9 pre-cutover raw fetches" -- so the route-level indicator this
    // feature exists to show was never actually asserted.
    expect(screen.getAllByText(/9 pre-cutover raw fetches/)).toHaveLength(2)
    expect(screen.queryByText('11')).not.toBeInTheDocument()
  })

  it('omits legacy raw fetches when the legacy count is zero or null', async () => {
    eventsApi.getMetrics.mockResolvedValue({
      metrics: {
        totalScheduleBuilds: 0,
        routeBuilders: 0,
        completionRate: undefined,
        routeSizeDistribution: [],
        lastUpdated: null,
        popularBands: [],
        totalShares: 1,
        totalShareViews: 3,
        totalShareViewsLegacy: 0,
        totalShareImports: 0,
        topSharedRoutes: [{ slug: 'fresh', view_count: 3, view_count_legacy: null, band_count: 1 }],
      },
    })

    render(<MetricsDashboard eventId={1} />)

    expect(await screen.findByText('Share Views (unique visitors per link, all-time)')).toBeInTheDocument()
    // Anchored on the leading count: the explanatory caption below the cards
    // also contains "pre-cutover raw fetches" and renders unconditionally, so
    // an unanchored regex matches it and the assertion proves nothing.
    expect(screen.queryByText(/\d+ pre-cutover raw fetches/)).not.toBeInTheDocument()
  })

  it('renders 0 for share imports when the field is absent (older data)', async () => {
    eventsApi.getMetrics.mockResolvedValue({
      metrics: {
        totalScheduleBuilds: 0,
        routeBuilders: 0,
        completionRate: undefined,
        routeSizeDistribution: [],
        lastUpdated: null,
        popularBands: [],
        totalShares: 0,
        totalShareViews: 0,
        topSharedRoutes: [],
      },
    })

    render(<MetricsDashboard eventId={1} />)

    expect(await screen.findByText('Shares Imported')).toBeInTheDocument()
    expect(screen.getByText('Route Completion Rate')).toBeInTheDocument()
    expect(screen.getByText('n/a')).toBeInTheDocument()
    const shareImportsLabel = screen.getByText('Shares Imported')
    expect(shareImportsLabel.parentElement.textContent).toContain('0')
    // An empty topSharedRoutes must show the empty state, not a bare heading.
    // The endpoint filters to view_count > 0, so "no rows" is the normal
    // between-seasons case rather than an error — it needs to read that way.
    expect(screen.getByText('No shared routes with views yet')).toBeInTheDocument()
  })

  // Not a hypothetical edge case — it is the state of live data. The
  // denominator is event_daily_stats.event_views, which only began recording
  // with #706, while schedule_builds goes back years. Measured in production
  // 2026-08-18: event 1 (lwbc15) has 20 route builders against 2 recorded
  // views, i.e. 1000%. The API deliberately returns the raw ratio (capping a
  // stored metric would destroy information); the clamp is presentation-only,
  // so it has to be asserted here or nothing covers it.
  it('caps a completion rate above 100% for display', async () => {
    eventsApi.getMetrics.mockResolvedValue({
      metrics: {
        totalScheduleBuilds: 40,
        routeBuilders: 20,
        completionRate: 1000,
        routeSizeDistribution: [
          { bucket: '1', route_count: 20 },
          { bucket: '2-3', route_count: 0 },
          { bucket: '4-6', route_count: 0 },
          { bucket: '7-11', route_count: 0 },
          { bucket: '12+', route_count: 0 },
        ],
        lastUpdated: '2026-08-18 12:00:00',
        popularBands: [],
        totalShares: 0,
        totalShareViews: 0,
        topSharedRoutes: [],
      },
    })

    render(<MetricsDashboard eventId={1} />)

    expect(await screen.findByText('Route Completion Rate')).toBeInTheDocument()
    expect(screen.getByText('100.0%')).toBeInTheDocument()
    // The uncapped figure must not reach the page.
    expect(screen.queryByText('1000.0%')).not.toBeInTheDocument()
  })

  describe('show-night traffic (#1246 Q1)', () => {
    const base = {
      totalScheduleBuilds: 0,
      routeBuilders: 0,
      routeSizeDistribution: [],
      popularBands: [],
      topSharedRoutes: [],
    }

    it('renders hour labels and counts in festival order, with no date heading for one day', async () => {
      eventsApi.getMetrics.mockResolvedValue({
        metrics: {
          ...base,
          showNightCurve: [
            { festival_date: '2026-10-11', hour: 18, views: 12 },
            { festival_date: '2026-10-11', hour: 0, views: 1 },
            { festival_date: '2026-10-11', hour: 1, views: 5 },
          ],
        },
      })

      render(<MetricsDashboard eventId={1} />)

      expect(await screen.findByText('Show-night traffic')).toBeInTheDocument()
      const list = screen.getByRole('list', { name: 'Event page views by hour' })
      const rows = within(list)
        .getAllByRole('listitem')
        .map(li => li.textContent)
      // A quiet hour inside the night is a 0, not a missing row: a gap would
      // read as "no data" rather than "nobody came".
      expect(rows).toEqual([
        '6 PM12 views',
        '7 PM0 views',
        '8 PM0 views',
        '9 PM0 views',
        '10 PM0 views',
        '11 PM0 views',
        '12 AM1 view',
        '1 AM5 views',
      ])
      expect(screen.queryByText('2026-10-11')).not.toBeInTheDocument()
      expect(screen.queryByText(/Day 1/)).not.toBeInTheDocument()
    })

    it('scales bar width to views over the busiest hour', async () => {
      eventsApi.getMetrics.mockResolvedValue({
        metrics: {
          ...base,
          showNightCurve: [
            { festival_date: '2026-10-11', hour: 20, views: 50 },
            { festival_date: '2026-10-11', hour: 21, views: 25 },
          ],
        },
      })

      const { container } = render(<MetricsDashboard eventId={1} />)
      await screen.findByText('Show-night traffic')

      const widths = [...container.querySelectorAll('li div > div')].map(el => el.style.width)
      expect(widths).toEqual(['100%', '50%'])
    })

    it('groups a multi-day curve under a heading per date', async () => {
      eventsApi.getMetrics.mockResolvedValue({
        metrics: {
          ...base,
          showNightCurve: [
            { festival_date: '2026-07-10', hour: 19, views: 3 },
            { festival_date: '2026-07-11', hour: 19, views: 4 },
          ],
        },
      })

      render(<MetricsDashboard eventId={1} />)

      expect(await screen.findByRole('heading', { name: '2026-07-10' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '2026-07-11' })).toBeInTheDocument()
    })

    it('shows the empty state when there are no rows', async () => {
      eventsApi.getMetrics.mockResolvedValue({ metrics: { ...base, showNightCurve: [] } })

      render(<MetricsDashboard eventId={1} />)

      expect(
        await screen.findByText(
          'No show-night views recorded yet. Hourly counts started in October 2026, so earlier editions have none.'
        )
      ).toBeInTheDocument()
    })
  })
})
