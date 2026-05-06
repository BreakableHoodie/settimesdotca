import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock react-router-dom so we can control slug param
vi.mock('react-router-dom', () => ({
  useParams: vi.fn(),
}))

// Mock ScheduleView to avoid full render complexity
vi.mock('../components/ScheduleView', () => ({
  default: () => <div>Schedule</div>,
}))

import { useParams } from 'react-router-dom'
import EmbedPage from '../pages/EmbedPage'

describe('EmbedPage', () => {
  it('shows error instead of infinite spinner when no slug in URL', async () => {
    useParams.mockReturnValue({ slug: undefined })

    render(<EmbedPage />)

    // Should NOT stay in loading state forever
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    }, { timeout: 2000 })

    // Should show an error message
    expect(screen.getByText(/no event slug/i)).toBeInTheDocument()
  })

  it('shows loading state initially when slug is present', async () => {
    useParams.mockReturnValue({ slug: 'my-fest-2026' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bands: [] }),
    })

    render(<EmbedPage />)
    // Loading text should appear initially
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
