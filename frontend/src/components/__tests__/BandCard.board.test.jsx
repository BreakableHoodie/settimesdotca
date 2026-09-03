import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'
import BandCard from '../BandCard'

expect.extend(toHaveNoViolations)

const band = {
  id: 7,
  name: 'Dolly Sods',
  venue: 'Princess Cafe',
  startTime: '20:30',
  endTime: '21:15',
  date: '2026-10-11',
}

const renderBoard = (props = {}) =>
  render(
    <MemoryRouter>
      <BandCard band={band} variant="board" venueCode="PRIN" showVenue currentTime={new Date()} {...props} />
    </MemoryRouter>
  )

describe('BandCard variant="board"', () => {
  it('shows the act, its time and the venue code', () => {
    renderBoard()
    expect(screen.getByText('Dolly Sods')).toBeInTheDocument()
    expect(screen.getByText('PRIN')).toBeInTheDocument()
  })

  it('still marks a cancelled set as cancelled', () => {
    // The reason this is a variant rather than a new component: the cancelled
    // treatment is the one thing that must never differ between presentations.
    renderBoard({ band: { ...band, is_cancelled: 1 } })
    expect(screen.getByText(/cancelled/i)).toBeInTheDocument()
  })

  it('exposes the venue code to assistive tech as a real venue name', () => {
    // "PRIN" is a visual abbreviation. A screen reader must hear the VENUE, and a
    // `title` is a tooltip rather than an accessible name -- the first version of
    // this test asserted the title and passed while the row still announced four
    // letters. Assert the name is present and the abbreviation is hidden.
    renderBoard()
    expect(screen.getByText('Princess Cafe')).toBeInTheDocument()
    expect(screen.getByText('PRIN')).toHaveAttribute('aria-hidden', 'true')
  })

  // The card was fixed for this in #726 (WCAG 2.5.3): the visible fallback and
  // the announced name must match, and a band with no name has no profile to
  // link to. The board reintroduced both bugs by interpolating band.name directly.
  it('handles a band with no name without an empty link', () => {
    renderBoard({ band: { ...band, name: undefined } })
    expect(screen.getByText('Unnamed Artist')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add unnamed artist to my route/i })).toBeInTheDocument()
  })

  // The board row REPLACES the card on mobile. Without a toggle here, "Tap any
  // performer to add them to My Route" -- the interaction the event page
  // advertises in its own onboarding -- would not exist on a phone at all.
  // The original variant shipped without one and every other test still passed.
  it('can be added to My Route, like the card it replaces', () => {
    const onToggle = vi.fn()
    renderBoard({ onToggle })
    fireEvent.click(screen.getByRole('button', { name: /add dolly sods to my route/i }))
    expect(onToggle).toHaveBeenCalledWith(band.id)
  })

  it('offers removal once selected', () => {
    renderBoard({ isSelected: true })
    expect(screen.getByRole('button', { name: /remove dolly sods from my route/i })).toBeInTheDocument()
  })

  it('does not offer to add a cancelled set', () => {
    // Matches the card: a cancelled performance is not selectable (#732).
    renderBoard({ band: { ...band, is_cancelled: 1 } })
    expect(screen.queryByRole('button', { name: /my route/i })).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderBoard()
    expect(await axe(container)).toHaveNoViolations()
  })
})
