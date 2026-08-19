import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MetricsDashboard from '../MetricsDashboard'

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
    expect(screen.getByText('Share Views')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Shares Imported')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Most-Viewed Shared Routes')).toBeInTheDocument()
    expect(screen.getByText(/abc123/)).toBeInTheDocument()
    // Band count + creation date surfaced so the slug is actionable (#702)
    expect(screen.getByText(/4 bands/)).toBeInTheDocument()
    expect(screen.getByText(/2026-07-16/)).toBeInTheDocument()
    // Singular "view" pluralises correctly
    expect(screen.getByText(/1 view/)).toBeInTheDocument()
    expect(screen.getByText(/1 band/)).toBeInTheDocument()
    // Plural "views" still renders within the compound row
    expect(screen.getByText(/30 views/)).toBeInTheDocument()
    // view_count and import_count are different units and get conflated
    // (CLAUDE.md "Metrics & Analytics"): views are unique visitors recomputed
    // from a ledger, imports are per-fetch and undeduped, so imports CAN exceed
    // views. This caption is the only place a reader learns that — assert it
    // survives, because silently dropping it makes the panel misleading rather
    // than merely sparser.
    expect(screen.getByText(/Views count unique visitors per link/)).toBeInTheDocument()
    expect(screen.getByText(/Imports count per-fetch/)).toBeInTheDocument()
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
})
