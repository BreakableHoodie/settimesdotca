import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RunningLatePanel from '../RunningLatePanel'

vi.mock('../../../utils/adminApi', () => ({
  eventsApi: {
    getVenueDelays: vi.fn(),
    shiftVenue: vi.fn(),
    clearVenueDelay: vi.fn(),
  },
}))

import { eventsApi } from '../../../utils/adminApi'

const DELAYS = [
  { venueId: 1, venue: 'Blue Room', minutes: 0, updatedAt: null },
  { venueId: 2, venue: 'Roost', minutes: 15, updatedAt: '2026-10-11 22:00:00' },
]

const apiError = (message, details) => Object.assign(new Error(message), { details })

function renderPanel(props = {}) {
  const showToast = vi.fn()
  const onShifted = vi.fn()
  render(<RunningLatePanel eventId={7} showToast={showToast} onShifted={onShifted} {...props} />)
  return { showToast, onShifted }
}

beforeEach(() => {
  vi.clearAllMocks()
  eventsApi.getVenueDelays.mockResolvedValue({ delays: DELAYS })
})

describe('RunningLatePanel (#1249)', () => {
  it("lists each venue's current state, read fresh for this event", async () => {
    renderPanel()
    expect(await screen.findByText('running about 15 min late')).toBeInTheDocument()
    expect(screen.getByText('on time')).toBeInTheDocument()
    expect(eventsApi.getVenueDelays).toHaveBeenCalledWith(7)
  })

  it('+15 shifts that venue, shows the new total, and refreshes the lineup', async () => {
    eventsApi.shiftVenue.mockResolvedValue({ delayMinutes: 15, shifted: [{ id: 1 }, { id: 2 }] })
    const { showToast, onShifted } = renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: '+15 minutes later: Blue Room' }))
    await waitFor(() => expect(eventsApi.shiftVenue).toHaveBeenCalledWith(7, 1, 15))
    expect(await screen.findAllByText('running about 15 min late')).toHaveLength(2)
    expect(onShifted).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Blue Room: 2 sets moved later by 15 min.', 'success')
  })

  it('a custom negative amount pulls the sets back earlier', async () => {
    eventsApi.shiftVenue.mockResolvedValue({ delayMinutes: 5, shifted: [{ id: 3 }] })
    const { showToast } = renderPanel()
    fireEvent.change(await screen.findByLabelText('Roost: custom minutes (negative moves sets earlier)'), {
      target: { value: '-10' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Shift' })[1])
    await waitFor(() => expect(eventsApi.shiftVenue).toHaveBeenCalledWith(7, 2, -10))
    expect(showToast).toHaveBeenCalledWith('Roost: 1 set moved earlier by 10 min.', 'success')
    expect(await screen.findByText('running about 5 min late')).toBeInTheDocument()
  })

  it('names the sets when a shift is refused for crossing 6 AM, and changes nothing shown', async () => {
    eventsApi.shiftVenue.mockRejectedValue(
      apiError('This shift would move a set across 6 AM, into a different festival day.', {
        code: 'SHIFT_CROSSES_FESTIVAL_DAY',
        sets: [{ id: 9, name: 'Dawn Chorus', startTime: '05:50' }],
      })
    )
    const { showToast, onShifted } = renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: '+30 minutes later: Blue Room' }))
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/Dawn Chorus/), 'error'))
    expect(onShifted).not.toHaveBeenCalled()
    expect(screen.getByText('on time')).toBeInTheDocument()
  })

  it('names the clashing pair when a shift would overlap another set', async () => {
    eventsApi.shiftVenue.mockRejectedValue(
      apiError('The shift overlaps another set at this venue.', {
        conflicts: [{ a: { name: 'Next Up' }, b: { name: 'Still Playing' } }],
      })
    )
    const { showToast } = renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: '+10 minutes later: Blue Room' }))
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'Not moved: Next Up would overlap Still Playing. Nothing was changed.',
        'error'
      )
    )
  })

  it('"Back on time" clears the banner and says the times were left alone', async () => {
    eventsApi.clearVenueDelay.mockResolvedValue({ success: true, venueId: 2, delayMinutes: 0 })
    const { showToast, onShifted } = renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Back on time' }))
    await waitFor(() => expect(eventsApi.clearVenueDelay).toHaveBeenCalledWith(7, 2))
    await waitFor(() => expect(screen.getAllByText('on time')).toHaveLength(2))
    expect(showToast).toHaveBeenCalledWith('Roost is back on time. Set times were left as they are.', 'success')
    expect(onShifted).not.toHaveBeenCalled()
  })

  it('a viewer sees the state but no controls', async () => {
    renderPanel({ readOnly: true })
    expect(await screen.findByText('running about 15 min late')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it("switching events mid-load: event A's late reply never lands in event B's panel", async () => {
    let resolveA
    eventsApi.getVenueDelays.mockImplementation(eventId =>
      eventId === 7
        ? new Promise(resolve => {
            resolveA = resolve
          })
        : Promise.resolve({ delays: [{ venueId: 50, venue: 'Event B Hall', minutes: 0, updatedAt: null }] })
    )
    const { rerender } = render(<RunningLatePanel eventId={7} showToast={vi.fn()} onShifted={vi.fn()} />)
    rerender(<RunningLatePanel eventId={8} showToast={vi.fn()} onShifted={vi.fn()} />)
    expect(await screen.findByText('Event B Hall')).toBeInTheDocument()
    resolveA({ delays: DELAYS }) // event A answers last
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.queryByText('Blue Room')).not.toBeInTheDocument()
    expect(screen.getByText('Event B Hall')).toBeInTheDocument()
  })

  it("A -> B -> A: the first A load failing late does not hide the second A load's result", async () => {
    const rejecters = []
    let call = 0
    eventsApi.getVenueDelays.mockImplementation(eventId => {
      if (eventId === 8) return Promise.resolve({ delays: [] })
      call += 1
      return call === 1
        ? new Promise((_, reject) => {
            rejecters.push(reject)
          })
        : Promise.resolve({ delays: DELAYS })
    })
    const props = { showToast: vi.fn(), onShifted: vi.fn() }
    const { rerender } = render(<RunningLatePanel eventId={7} {...props} />)
    rerender(<RunningLatePanel eventId={8} {...props} />)
    rerender(<RunningLatePanel eventId={7} {...props} />)
    expect(await screen.findByText('Blue Room')).toBeInTheDocument()
    rejecters[0](new Error('the first A request failed late'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Blue Room')).toBeInTheDocument()
  })

  it("venue A's reply does not re-enable venue B while B's own shift is in flight", async () => {
    const resolvers = {}
    eventsApi.shiftVenue.mockImplementation(
      (eventId, venueId) =>
        new Promise(resolve => {
          resolvers[venueId] = resolve
        })
    )
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: '+15 minutes later: Blue Room' }))
    fireEvent.click(screen.getByRole('button', { name: '+10 minutes later: Roost' }))
    resolvers[1]({ delayMinutes: 15, shifted: [] }) // A answers first
    await waitFor(() => expect(screen.getByRole('button', { name: '+15 minutes later: Blue Room' })).toBeEnabled())
    expect(screen.getByRole('button', { name: '+10 minutes later: Roost' })).toBeDisabled()
    resolvers[2]({ delayMinutes: 25, shifted: [] })
    await waitFor(() => expect(screen.getByRole('button', { name: '+10 minutes later: Roost' })).toBeEnabled())
  })

  it('switching events and back mid-shift keeps the in-flight venue disabled (no double shift)', async () => {
    let resolveShift
    eventsApi.getVenueDelays.mockImplementation(eventId =>
      Promise.resolve({
        delays: eventId === 7 ? DELAYS : [{ venueId: 50, venue: 'Event B Hall', minutes: 0, updatedAt: null }],
      })
    )
    eventsApi.shiftVenue.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveShift = resolve
        })
    )
    const props = { showToast: vi.fn(), onShifted: vi.fn() }
    const { rerender } = render(<RunningLatePanel eventId={7} {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: '+15 minutes later: Blue Room' }))
    rerender(<RunningLatePanel eventId={8} {...props} />) // to event B...
    await screen.findByText('Event B Hall')
    rerender(<RunningLatePanel eventId={7} {...props} />) // ...and back, before A's shift settles
    expect(await screen.findByRole('button', { name: '+15 minutes later: Blue Room' })).toBeDisabled()
    resolveShift({ delayMinutes: 15, shifted: [] })
    await waitFor(() => expect(screen.getByRole('button', { name: '+15 minutes later: Blue Room' })).toBeEnabled())
  })

  it("each preset's accessible name starts with its visible label (WCAG 2.5.3)", async () => {
    renderPanel()
    const preset = await screen.findByRole('button', { name: '+30 minutes later: Blue Room' })
    expect(preset.getAttribute('aria-label').startsWith(preset.textContent)).toBe(true)
  })

  it('every control is at least 44 px tall (a mis-tap moves a whole venue)', async () => {
    renderPanel()
    await screen.findByText('running about 15 min late')
    const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('spinbutton')]
    for (const control of controls) expect(control.className).toMatch(/\bmin-h-\[44px\]/)
  })

  it('renders nothing for an event with no venues', async () => {
    eventsApi.getVenueDelays.mockResolvedValue({ delays: [] })
    renderPanel()
    await waitFor(() => expect(eventsApi.getVenueDelays).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Running late?' })).not.toBeInTheDocument()
  })

  it('shows a load error and retries the venue delay request', async () => {
    eventsApi.getVenueDelays.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce({ delays: DELAYS })
    renderPanel()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load running-late status.")
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('running about 15 min late')).toBeInTheDocument()
    expect(eventsApi.getVenueDelays).toHaveBeenCalledTimes(2)
  })
})
