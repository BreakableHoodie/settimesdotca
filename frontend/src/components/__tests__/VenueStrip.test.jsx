import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'
import VenueStrip from '../VenueStrip.jsx'

// The strip used to render a hardcoded six-venue King St N list on EVERY event
// it appeared on. Vol 18 declares four venues, so the header advertised Room 47
// and Roost -- two venues with no sets on that bill. The labels were clipped by
// the header's collapse cap, which is the only reason nobody walked to the
// wrong door; fixing that clip without fixing this would have shipped the wrong
// venue names to a live page.
describe('VenueStrip', () => {
  const labels = () => [...document.querySelectorAll('svg text')].map(t => t.textContent)

  it("draws the event's own venues, not a hardcoded list", () => {
    render(<VenueStrip venues={['Prohibition Warehouse', 'Revive Karaoke', 'Blue Room', 'Princess Cafe']} />)

    // Long-name shortening is preserved: " Warehouse" and " Cafe" are dropped.
    expect(labels()).toEqual(['PROHIBITION', 'REVIVE KARAOKE', 'BLUE ROOM', 'PRINCESS'])
  })

  it('names no venue the event did not declare', () => {
    render(<VenueStrip venues={['Prohibition Warehouse', 'Revive Karaoke', 'Blue Room', 'Princess Cafe']} />)

    // The two Vol 17 venues that used to appear on every bill.
    expect(labels()).not.toContain('ROOM 47')
    expect(labels()).not.toContain('ROOST')
  })

  it('preserves the declared order, which is the walk order', () => {
    render(<VenueStrip venues={['Zeta Hall', 'Alpha Room', 'Mid Bar']} />)
    expect(labels()).toEqual(['ZETA HALL', 'ALPHA ROOM', 'MID BAR'])
  })

  it.each([
    ['no venues', []],
    ['a single venue', ['Prohibition Warehouse']],
  ])('renders nothing for %s', (_label, venues) => {
    const { container } = render(<VenueStrip venues={venues} />)
    // A route needs two stops. One is a location; zero is an unannounced bill.
    expect(container).toBeEmptyDOMElement()
  })

  it("marks only the venues on the fan's route as active", () => {
    render(<VenueStrip venues={['Alpha Room', 'Beta Bar', 'Gamma Hall']} activeVenues={['Beta Bar']} />)

    // Active stops get the larger radius; the others keep the base one.
    const radii = [...document.querySelectorAll('svg circle')].map(c => c.getAttribute('r'))
    expect(radii).toContain('8')
    expect(radii).toContain('6')
  })

  // The <svg> is aria-hidden, so the wrapper's name is ALL a screen reader
  // gets. It used to say "Venue route along King St N" -- no venue names, and
  // a street that is only right for a King St crawl. Naming the venues makes
  // it both informative and true for any event.
  it('names the actual venues in its accessible name', () => {
    render(<VenueStrip venues={['Alpha Room', 'Beta Bar']} />)
    expect(screen.getByRole('img', { name: 'Venue route: Alpha Room, Beta Bar' })).toBeInTheDocument()
  })

  it('does not claim a street the event may not be on', () => {
    render(<VenueStrip venues={['Tillsonburg Legion', 'Southside Park']} />)
    expect(screen.queryByRole('img', { name: /King St/i })).not.toBeInTheDocument()
  })
})
