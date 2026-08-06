import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import BandCard from '../BandCard'

const baseBand = {
  id: 'venue-card-1',
  name: 'Deer Fang',
  venue: 'Room 47',
}

const renderCard = props =>
  render(
    <MemoryRouter>
      <BandCard band={baseBand} onToggle={vi.fn()} {...props} />
    </MemoryRouter>
  )

// #742 — VenuePage's cards span multiple days of a multi-day event (Buddies
// Fest 2, Aug 7-9), and getTimeDescription (already inside this card) can't
// tell those days apart at the same clock time -- it renders a bare "8:00 PM"
// for any day within the same festival week. `dayLabel` is the opt-in prop
// that lets a caller supply the disambiguating date explicitly, without
// forcing every OTHER caller (which already shows the date via day tabs/
// dividers outside this card) to grow one too.
describe('BandCard — optional dayLabel prop (#742)', () => {
  it('renders the day label text when dayLabel is provided', () => {
    renderCard({ dayLabel: 'Sat, Aug 8 (Day 2)' })
    expect(screen.getByText('Sat, Aug 8 (Day 2)')).toBeInTheDocument()
  })

  it('renders no day label row when dayLabel is omitted (existing callers unaffected)', () => {
    const { container } = renderCard()
    // The day label paragraph is the only <p> that would carry a CalendarDays
    // icon inside this card; assert the icon itself is absent rather than
    // guessing at a class name, so this doesn't silently pass if the markup
    // shape changes.
    expect(container.querySelector('svg.lucide-calendar-days')).toBeNull()
  })

  it('renders no day label row when dayLabel is an empty string', () => {
    const { container } = renderCard({ dayLabel: '' })
    expect(screen.queryByText(/Day \d/)).toBeNull()
    // Assert the same icon absence the omitted case checks. A text-only
    // assertion would still pass if an empty label row rendered -- an icon
    // with nothing beside it, which is exactly the defect this guards.
    expect(container.querySelector('svg.lucide-calendar-days')).toBeNull()
  })

  it('renders the day label with its calendar icon when provided', () => {
    const { container } = renderCard({ dayLabel: 'Fri, Aug 7 (Day 1)' })
    expect(screen.getByText('Fri, Aug 7 (Day 1)')).toBeInTheDocument()
    // Pins the positive half of the contract the two absence tests assert
    // against, so "icon absent" stays meaningful rather than vacuously true.
    expect(container.querySelector('svg.lucide-calendar-days')).not.toBeNull()
  })
})
