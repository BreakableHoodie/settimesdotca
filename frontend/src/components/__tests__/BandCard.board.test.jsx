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

  // Vol 18 shipped publicly in exactly this state: a published lineup whose set
  // times are not booked yet. The row used to render a bare "—", which reads as
  // broken data rather than as "not announced".
  it('says TBA rather than a bare dash when a set has no time', () => {
    renderBoard({ band: { ...band, startTime: undefined } })
    expect(screen.getByText('TBA')).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('does the same for the explicit TBD sentinel', () => {
    renderBoard({ band: { ...band, startTime: 'TBD' } })
    expect(screen.getByText('TBA')).toBeInTheDocument()
    // Assert the dash is GONE, not merely that TBA appeared -- a regression
    // rendering both would satisfy the first assertion alone.
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  // A malformed truthy value reached formatTime's own '—' default, slipping past
  // a ternary that only guarded null and the 'TBD' sentinel.
  //
  // NOTE the limit of what this covers. formatTime validates SHAPE, not range
  // (`/^\d{1,2}:\d{2}$/`), so "25:99" is accepted and renders "1:99 PM" -- not a
  // dash and not TBA. That is a pre-existing quirk of the shared util, unrelated
  // to this change, and out of scope here -- filed as #1089.
  it('does the same for a malformed time value', () => {
    renderBoard({ band: { ...band, startTime: 'not-a-time' } })
    expect(screen.getByText('TBA')).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  // A lineup you can read is not a lineup you can DECIDE from. The board took
  // the card's place on mobile and dropped its genre, leaving a column of bare
  // names -- every other test still passed, because they assert what IS shown.
  it('shows the genre so a fan can choose between acts', () => {
    renderBoard({ band: { ...band, genre: 'Shoegaze' } })
    expect(screen.getByText('Shoegaze')).toBeInTheDocument()
  })

  it('shows only the first tag when an artist submits several', () => {
    // Real Vol 18 data: Handheld answered "Punk Rock, Skatepunk, Melodic Punk",
    // which wraps a 390px row to three lines if rendered whole.
    renderBoard({ band: { ...band, genre: 'Punk Rock, Skatepunk, Melodic Punk' } })
    expect(screen.getByText('Punk Rock')).toBeInTheDocument()
    expect(screen.queryByText(/Skatepunk/)).not.toBeInTheDocument()
  })

  it('renders nothing rather than an empty chip when a band has no genre', () => {
    const { container } = renderBoard({ band: { ...band, genre: undefined } })
    // Scoped to what is DISTINCTIVE to the chip. A bare `.rounded-full` also
    // matches the add button, so the first version of this assertion could never
    // have failed for the reason it claims -- the unscoped-selector class.
    expect(container.querySelector('.rounded-full.border-border')).toBeNull()
  })

  // A TAG, not a caption. Genres here do not fit a taxonomy -- 42 of the 66 tags
  // in production belong to exactly one artist -- so they are presented as
  // facets you could act on rather than as descriptive text, matching the chip
  // the desktop card already uses.
  it('presents the genre as a tag chip, like the card does', () => {
    renderBoard({ band: { ...band, genre: 'Shoegaze' } })
    const chip = screen.getByText('Shoegaze')
    expect(chip.className).toMatch(/rounded-full/)
    expect(chip.className).toMatch(/border-border/)
  })

  it('has no axe violations', async () => {
    const { container } = renderBoard()
    expect(await axe(container)).toHaveNoViolations()
  })
})
