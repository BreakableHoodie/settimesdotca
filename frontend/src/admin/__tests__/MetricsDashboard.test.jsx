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
  it('displays share analytics: shares created, share views, and top routes', async () => {
    eventsApi.getMetrics.mockResolvedValue({
      metrics: {
        totalScheduleBuilds: 10,
        uniqueVisitors: 7,
        lastUpdated: '2026-06-18 12:00:00',
        popularBands: [],
        totalShares: 3,
        totalShareViews: 42,
        topSharedRoutes: [
          { slug: 'abc123', view_count: 30 },
          { slug: 'def456', view_count: 12 },
        ],
      },
    })

    render(<MetricsDashboard eventId={1} />)

    expect(await screen.findByText('Shares Created')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Share Views')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Most-Viewed Shared Routes')).toBeInTheDocument()
    expect(screen.getByText(/abc123/)).toBeInTheDocument()
    expect(screen.getByText('30 views')).toBeInTheDocument()
  })
})
