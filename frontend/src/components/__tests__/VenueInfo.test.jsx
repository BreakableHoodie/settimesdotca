import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'
import VenueInfo from '../VenueInfo'

// #754 — the `mapHref === '#'` branch (no admin-set googleMaps, or an
// unsafe/invalid one) used to render the address as plain inert text with no
// way to actually get directions. It now falls back to buildDirectionsHref.
//
// Testing gotcha this file exists to guard against (per #753's postmortem):
// an <a> with no `href` has NO implicit ARIA `link` role, so
// `queryByRole('link', ...)` returns null even against a *rendered* dead
// anchor. Every assertion below checks the visible "Directions" text
// alongside the role query, so a reintroduced href-less anchor still fails
// these tests instead of silently passing.

function renderVenueInfo(venues) {
  return render(<VenueInfo eventData={{ venue_info: JSON.stringify(venues) }} />)
}

describe('VenueInfo directions fallback (#754)', () => {
  it('renders a directions link with the venue name in its accessible name when googleMaps is missing', () => {
    renderVenueInfo([{ name: 'The Mill', address: '20 John Pound Road, Tillsonburg, ON' }])

    const link = screen.getByRole('link', { name: 'Directions to The Mill' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveTextContent('Directions')
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent('The Mill, 20 John Pound Road, Tillsonburg, ON')
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  })

  it('falls back to buildDirectionsHref when googleMaps is an invalid/unsafe URL', () => {
    renderVenueInfo([
      {
        name: "Paddy's Underground",
        address: '20 John Pound Road, Tillsonburg, ON',
        googleMaps: 'javascript:alert(1)',
      },
    ])

    const link = screen.getByRole('link', { name: "Directions to Paddy's Underground" })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', expect.stringContaining('google.com/maps/search'))
  })

  it('prefers the admin-set googleMaps URL when present, over buildDirectionsHref', () => {
    renderVenueInfo([
      {
        name: 'The Copper Mug',
        address: '79 Broadway Street, Tillsonburg, ON',
        googleMaps: 'https://maps.example.com/copper-mug-exact-pin',
      },
    ])

    // The whole card becomes the link (existing `else` branch, untouched).
    const link = screen.getByRole('link', { name: 'Open directions to The Copper Mug' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://maps.example.com/copper-mug-exact-pin')

    // No second/competing "Directions to ..." link should exist.
    expect(screen.queryByRole('link', { name: 'Directions to The Copper Mug' })).not.toBeInTheDocument()
  })

  it('does not crash and renders no directions link when address is null', () => {
    renderVenueInfo([{ name: 'Roost', address: null }])

    expect(screen.getByText('Roost')).toBeInTheDocument()
    expect(screen.queryByText('Directions')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /directions/i })).not.toBeInTheDocument()
  })

  // The MapPin row must not render for a blank address, in EITHER branch —
  // otherwise a location icon sits next to an empty span, labelling nothing.
  // CodeRabbit flagged only the no-googleMaps branch; the admin-set branch
  // below had the identical defect and is covered here too.
  it.each([
    ['null', null],
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('renders no address row for a %s address (no-googleMaps branch)', (_label, address) => {
    const { container } = renderVenueInfo([{ name: 'Roost', address }])

    expect(screen.getByText('Roost')).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-map-pin')).toBeNull()
    expect(screen.queryByText('Directions')).not.toBeInTheDocument()
  })

  it.each([
    ['null', null],
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('renders no address row for a %s address (admin googleMaps branch)', (_label, address) => {
    const { container } = renderVenueInfo([{ name: 'Roost', address, googleMaps: 'https://maps.google.com/?q=Roost' }])

    expect(screen.getByRole('link', { name: 'Open directions to Roost' })).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-map-pin')).toBeNull()
  })

  it('does not crash and renders no directions link when address is an empty string', () => {
    renderVenueInfo([{ name: 'Roost', address: '' }])

    expect(screen.getByText('Roost')).toBeInTheDocument()
    expect(screen.queryByText('Directions')).not.toBeInTheDocument()
  })
})
