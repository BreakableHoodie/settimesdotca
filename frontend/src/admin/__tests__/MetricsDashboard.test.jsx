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
        uniqueVisitors: 7,
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
  })

  it('renders 0 for share imports when the field is absent (older data)', async () => {
    eventsApi.getMetrics.mockResolvedValue({
      metrics: {
        totalScheduleBuilds: 0,
        uniqueVisitors: 0,
        lastUpdated: null,
        popularBands: [],
        totalShares: 0,
        totalShareViews: 0,
        topSharedRoutes: [],
      },
    })

    render(<MetricsDashboard eventId={1} />)

    expect(await screen.findByText('Shares Imported')).toBeInTheDocument()
    const shareImportsLabel = screen.getByText('Shares Imported')
    expect(shareImportsLabel.parentElement.textContent).toContain('0')
  })
})
