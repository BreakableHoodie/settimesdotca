import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'
import BandCard from '../BandCard'
import { contrastRatio } from '../../utils/colour'

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
      <BandCard band={band} variant="board" boardVenue showVenue currentTime={new Date()} {...props} />
    </MemoryRouter>
  )

describe('BandCard variant="board"', () => {
  it("shows the act and its venue's stamp: the real short name, never a code (#1248)", () => {
    renderBoard({
      band: { ...band, venue: 'Princess Cafe (Upstairs)', venue_short: 'Princess Cafe', venue_ink: '#B4432F' },
    })
    expect(screen.getByText('Dolly Sods')).toBeInTheDocument()
    const stamp = screen.getByText('Princess Cafe')
    expect(stamp).toHaveAttribute('data-venue-ink', '#b4432f')
    expect(stamp).toHaveStyle({ backgroundColor: '#b4432f' })
    expect(stamp).toHaveAttribute('title', 'Princess Cafe (Upstairs)')
  })

  it('a venue with no ink gets an uncoloured stamp, and nothing reaches CSS that is not a hex colour', () => {
    renderBoard({ band: { ...band, venue_short: 'Princess Cafe', venue_ink: 'red;background:url(x)' } })
    const stamp = screen.getByText('Princess Cafe')
    expect(stamp).not.toHaveAttribute('data-venue-ink')
    expect(stamp.getAttribute('style')).not.toMatch(/background|url/)
  })

  it('still marks a cancelled set as cancelled', () => {
    // The reason this is a variant rather than a new component: the cancelled
    // treatment is the one thing that must never differ between presentations.
    renderBoard({ band: { ...band, is_cancelled: 1 } })
    expect(screen.getByText(/cancelled/i)).toBeInTheDocument()
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

  // A genre can be non-empty and still have no first tag. `sanitizeString` trims
  // the whole value but does not strip a leading separator, so ", Punk" reaches
  // the render with an empty [0]. Truthy enough to draw the chip's border and
  // nothing inside it. Neither shape is in production; the admin field allows both.
  it.each([
    ['whitespace only', '   '],
    ['separators only', ' , , '],
    ['a lone separator', ','],
  ])('renders no chip when the genre is %s', (_label, genre) => {
    const { container } = renderBoard({ band: { ...band, genre } })
    expect(container.querySelector('.rounded-full.border-border')).toBeNull()
  })

  it('skips an empty leading tag rather than the whole genre', () => {
    renderBoard({ band: { ...band, genre: ', Punk Rock, Skatepunk' } })
    expect(screen.getByText('Punk Rock')).toBeInTheDocument()
  })

  // A TAG, not a caption. Genres here do not fit a taxonomy -- 42 of the 66 tags
  // in production belong to exactly one artist -- so they are presented as
  // facets you could act on rather than as descriptive text, matching the chip
  // the desktop card already uses.
  it('letters a light ink in black, not invisible white', () => {
    renderBoard({ band: { ...band, venue_short: 'Pale Hall', venue_ink: '#ffffff' } })
    expect(screen.getByText('Pale Hall')).toHaveStyle({ color: '#000000' })
  })

  // The column accepts any hex, so the lettering must clear 4.5:1 on every ink,
  // including the greys where white just fails (#777777: white 4.48:1, and a
  // #111111 fallback only 4.22:1).
  it.each(['#777777', '#767676', '#808080', '#959595', '#ffff00', '#1e3a8a'])(
    'stamp lettering clears 4.5:1 on ink %s',
    ink => {
      renderBoard({ band: { ...band, venue_short: 'Any Hall', venue_ink: ink } })
      const [r, g, b] = screen.getByText('Any Hall').style.color.match(/\d+/g).map(Number)
      const lettering = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
      expect(contrastRatio(lettering, ink)).toBeGreaterThanOrEqual(4.5)
    }
  )

  it('a stamp with no ink is self-contained: text-colour fill, ground-colour letters', () => {
    renderBoard({ band: { ...band, venue_short: 'Inkless', venue_ink: null } })
    const stamp = screen.getByText('Inkless')
    expect(stamp).toHaveClass('bg-text-primary', 'text-bg-navy')
  })

  it('shows the genre beside the stamp', () => {
    renderBoard({ band: { ...band, genre: 'Shoegaze, Dream Pop' } })
    expect(screen.getByText('Shoegaze')).toBeInTheDocument()
  })

  // #1248: an on-stage row wears the poster's "on now" fill and says so in
  // words. Strictly start <= now < end: isHappeningNow's +/-30 minute window
  // would call a set "on now" twenty minutes before it starts.
  describe('on now', () => {
    const start = Date.parse('2026-10-11T20:30:00-04:00')
    const end = Date.parse('2026-10-11T21:15:00-04:00')
    const timed = { ...band, startMs: start, endMs: end }
    const rowOf = () => screen.getByText('Dolly Sods').closest('.grid')

    it('marks a set on stage, with the time it ends', () => {
      renderBoard({ band: timed, currentTime: new Date(start + 10 * 60000) })
      expect(rowOf()).toHaveClass('board-now')
      expect(screen.getByText(/On now, until 9:15/)).toBeInTheDocument()
    })

    it.each([
      ['twenty minutes before it starts', start - 20 * 60000],
      ['the moment it ends', end],
    ])('does not mark it %s', (_label, at) => {
      renderBoard({ band: timed, currentTime: new Date(at) })
      expect(rowOf()).not.toHaveClass('board-now')
      expect(screen.queryByText(/On now/)).not.toBeInTheDocument()
    })

    it('promises no end time for an open-ended set', () => {
      renderBoard({ band: { ...timed, endTime: 'END' }, currentTime: new Date(start + 60000) })
      expect(screen.getByText('On now')).toBeInTheDocument()
      expect(screen.queryByText(/until/)).not.toBeInTheDocument()
    })

    it('never marks a cancelled set', () => {
      renderBoard({ band: { ...timed, is_cancelled: 1 }, currentTime: new Date(start + 60000) })
      expect(screen.queryByText(/On now/)).not.toBeInTheDocument()
    })
  })

  it('has no axe violations', async () => {
    const { container } = renderBoard()
    expect(await axe(container)).toHaveNoViolations()
  })
})
