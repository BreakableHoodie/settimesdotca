import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import ComingUp from '../components/ComingUp'

// A band starting in 30 minutes with no venue assigned
function makeBand({ name = 'Test Band', venue = null, minutesAhead = 30 } = {}) {
  const startMs = Date.now() + minutesAhead * 60 * 1000
  return [{ id: 1, name, venue, startMs, date: '2026-08-15', startTime: '21:00', endTime: '22:00' }]
}

describe('ComingUp', () => {
  it('does not render "undefined" when next band has no venue', () => {
    const bands = makeBand({ name: 'Venueless Band', venue: null })
    render(<ComingUp bands={bands} currentTime={new Date()} />)
    expect(document.body.textContent).not.toContain('undefined')
    expect(document.body.textContent).not.toContain('null')
  })

  it('shows band name when next band has no venue', () => {
    const bands = makeBand({ name: 'No Venue Band', venue: null })
    render(<ComingUp bands={bands} currentTime={new Date()} />)
    expect(screen.getByText('No Venue Band')).toBeInTheDocument()
  })

  it('shows venue name when next band has a venue', () => {
    const bands = makeBand({ name: 'Main Stage Band', venue: 'Main Stage' })
    render(<ComingUp bands={bands} currentTime={new Date()} />)
    expect(screen.getByText('Main Stage')).toBeInTheDocument()
  })

  it('title attribute does not contain "null" or "undefined" for venueless band', () => {
    const bands = makeBand({ name: 'No Venue', venue: null })
    render(<ComingUp bands={bands} currentTime={new Date()} />)
    const container = document.querySelector('[title]')
    const title = container?.getAttribute('title') ?? ''
    expect(title).not.toContain('null')
    expect(title).not.toContain('undefined')
  })
})
