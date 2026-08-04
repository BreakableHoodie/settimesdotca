import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import ComingUp from '../components/ComingUp'

// ComingUp is one of the four consumers named in the design spec's
// suppression #1 ("Never up next") -- a cancelled set must never be
// announced as the next thing to see (#732).
describe('ComingUp — cancelled sets', () => {
  it('skips a cancelled set that would otherwise be soonest, announcing the next non-cancelled set instead', () => {
    const now = Date.now()
    const bands = [
      {
        id: 1,
        name: 'Deer Fang',
        venue: 'Room 47',
        is_cancelled: 1,
        startMs: now + 10 * 60 * 1000,
        date: '2026-08-07',
        startTime: '20:00',
        endTime: '21:00',
      },
      {
        id: 2,
        name: 'Sam Nabi',
        venue: 'Roost',
        is_cancelled: 0,
        startMs: now + 30 * 60 * 1000,
        date: '2026-08-07',
        startTime: '21:00',
        endTime: '22:00',
      },
    ]

    render(<ComingUp bands={bands} currentTime={new Date(now)} />)

    expect(screen.getByRole('status')).toHaveTextContent('Sam Nabi')
    expect(screen.queryByText(/Deer Fang/)).not.toBeInTheDocument()
  })
})
