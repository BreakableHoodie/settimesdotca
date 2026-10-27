import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventTimeline from '../EventTimeline'
import LiveContextBar from '../LiveContextBar'
import { trackTicketClick } from '../../utils/metrics'

vi.mock('../../utils/metrics', async importOriginal => ({
  ...(await importOriginal()),
  trackTicketClick: vi.fn(),
}))

const TICKETS = 'https://tickets.example.com/lwbc19'

// The event page is where fans are on show night, and until #1384 it had no
// ticket link: LWBC18's ticket clicks read 0 because there was nothing there
// to click.
describe('Event page ticket link (#1384)', () => {
  beforeEach(() => trackTicketClick.mockClear())

  const renderBar = (eventData, currentTime) =>
    render(<LiveContextBar eventData={eventData} currentTime={currentTime} bands={[]} onViewChange={vi.fn()} />)

  const ticketLinks = () => screen.queryAllByRole('link', { name: /Get tickets/ })

  it('links to the tickets before the show and counts the click', () => {
    renderBar({ id: 42, name: 'Vol. 19', date: '2027-02-14', ticket_url: TICKETS }, new Date('2027-02-01T12:00:00'))
    // One in the mobile layout and one in the desktop layout.
    expect(ticketLinks()).toHaveLength(2)
    for (const link of ticketLinks()) {
      expect(link).toHaveAttribute('href', TICKETS)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    fireEvent.click(ticketLinks()[0])
    expect(trackTicketClick).toHaveBeenCalledWith(42)
  })

  it('still links on show night, when the page is busiest', () => {
    renderBar({ id: 42, name: 'Vol. 19', date: '2027-02-14', ticket_url: TICKETS }, new Date('2027-02-14T20:00:00'))
    expect(screen.getAllByText('Live Tonight').length).toBeGreaterThan(0)
    expect(ticketLinks()).toHaveLength(2)
  })

  it('drops the link once the show is over, and for an archived edition', () => {
    const { unmount } = renderBar(
      { id: 42, name: 'Vol. 19', date: '2027-02-14', ticket_url: TICKETS },
      new Date('2027-02-15T12:00:00')
    )
    expect(screen.getAllByText('Recap').length).toBeGreaterThan(0)
    expect(ticketLinks()).toHaveLength(0)
    unmount()

    // Archived is over whatever the clock says.
    renderBar(
      { id: 42, name: 'Vol. 19', date: '2027-02-14', ticket_url: TICKETS, is_archived: true },
      new Date('2027-02-01T12:00:00')
    )
    expect(ticketLinks()).toHaveLength(0)
  })

  it('renders nothing for a missing or unsafe ticket URL', () => {
    const { unmount } = renderBar({ id: 42, name: 'Vol. 19', date: '2027-02-14' }, new Date('2027-02-01T12:00:00'))
    expect(ticketLinks()).toHaveLength(0)
    unmount()
    renderBar(
      { id: 42, name: 'Vol. 19', date: '2027-02-14', ticket_url: 'javascript:alert(1)' },
      new Date('2027-02-01T12:00:00')
    )
    expect(ticketLinks()).toHaveLength(0)
  })
})

// The homepage card showed "Get tickets" for a concluded edition too, sending
// fans to a sale that had closed (found while fixing #1384).
describe('Homepage card ticket button (#1384)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const card = extra => ({
    id: 7,
    name: 'Ticket Fest',
    slug: 'ticket-fest',
    date: '2027-02-14',
    status: 'published',
    venues: [],
    bands: [],
    band_count: 0,
    venue_count: 0,
    ticket_url: TICKETS,
    poster_url: null,
    ...extra,
  })

  const mount = buckets => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: h => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
          json: () => Promise.resolve({ now: [], upcoming: [], past: [], ...buckets }),
        })
      )
    )
    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )
  }

  it('offers tickets for an upcoming edition', async () => {
    mount({ upcoming: [card()] })
    expect(await screen.findByRole('link', { name: 'Get tickets' })).toHaveAttribute('href', TICKETS)
  })

  it('offers a recap, not tickets, for a concluded edition', async () => {
    mount({ past: [card({ date: '2020-05-10', status: 'archived' })] })
    expect(await screen.findByRole('link', { name: 'Recap' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Get tickets' })).not.toBeInTheDocument()
  })
})
