import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import EventsTab from '../EventsTab'

// EventsTab renders both a desktop <table> and a mobile card list
// unconditionally (visibility is CSS-only), so any text/role query below
// matches twice -- hence getAllByRole rather than getByRole (same pattern
// as RosterTab.test.jsx).

vi.mock('../../utils/adminApi', () => ({
  eventsApi: {
    setPublishState: vi.fn(),
  },
  bandsApi: {
    getByEvent: vi.fn(),
  },
}))

vi.mock('../../contexts/EventContext', () => ({
  useEventContext: () => ({ refreshEvents: vi.fn() }),
}))

import { eventsApi } from '../../utils/adminApi'

// Mirrors the response shape functions/api/admin/events/[id]/publish.js
// returns for the zero-band guard: `code` is the machine-readable
// discriminator the client keys off of, alongside the unchanged
// error/message pair.
function emptyLineupError() {
  const message = 'Cannot publish event with no bands. Add at least one band first.'
  const err = new Error(message)
  err.status = 400
  err.details = { error: 'Validation error', message, code: 'EMPTY_LINEUP' }
  return err
}

const DRAFT_EVENT_NO_BANDS = {
  id: 37,
  name: 'Long Weekend Band Crawl Vol. 18',
  slug: 'lwbc18',
  date: '2026-10-11',
  status: 'draft',
  band_count: 0,
}

describe('EventsTab — publish without a lineup (empty-lineup override)', () => {
  beforeEach(() => {
    eventsApi.setPublishState.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries with allowEmptyLineup after the confirm, and the retry call carries the flag', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true) // both the generic confirm and the empty-lineup confirm say yes
    eventsApi.setPublishState.mockRejectedValueOnce(emptyLineupError()).mockResolvedValueOnce({
      success: true,
      event: { ...DRAFT_EVENT_NO_BANDS, status: 'published' },
      message: 'Event published successfully',
    })

    const showToast = vi.fn()
    render(
      <EventsTab
        events={[DRAFT_EVENT_NO_BANDS]}
        onEventsChange={vi.fn()}
        showToast={showToast}
        readOnly={false}
        canArchiveEvents={true}
      />
    )

    const publishButtons = screen.getAllByRole('button', { name: 'Publish' })
    fireEvent.click(publishButtons[0])

    await waitFor(() => expect(eventsApi.setPublishState).toHaveBeenCalledTimes(2))

    // First call: the normal publish request, no override.
    expect(eventsApi.setPublishState).toHaveBeenNthCalledWith(1, DRAFT_EVENT_NO_BANDS.id, true)
    // Retry: exactly the flag, not resent as false-y noise.
    expect(eventsApi.setPublishState).toHaveBeenNthCalledWith(2, DRAFT_EVENT_NO_BANDS.id, true, {
      allowEmptyLineup: true,
    })

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Event published successfully!', 'success'))
  })

  it('surfaces an error toast when the override retry itself fails', async () => {
    // The retry has its own catch block, which nothing else exercises: the
    // happy-path test resolves the retry and the decline test never reaches
    // it. Without this, a broken retry error path would fail silently -- the
    // admin would click through the confirm and see nothing at all happen.
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    eventsApi.setPublishState
      .mockRejectedValueOnce(emptyLineupError())
      .mockRejectedValueOnce(new Error('Network request failed'))

    const showToast = vi.fn()
    render(
      <EventsTab
        events={[DRAFT_EVENT_NO_BANDS]}
        onEventsChange={vi.fn()}
        showToast={showToast}
        readOnly={false}
        canArchiveEvents={true}
      />
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' })[0])

    await waitFor(() => expect(eventsApi.setPublishState).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Failed to publish event: Network request failed', 'error')
    )

    // A failed retry must not also claim success, and must not loop.
    expect(showToast).not.toHaveBeenCalledWith('Event published successfully!', 'success')
    expect(eventsApi.setPublishState).toHaveBeenCalledTimes(2)
  })

  it('declining the empty-lineup confirm leaves the event unpublished and does not retry', async () => {
    // First confirm ("Are you sure you want to publish this event?") says
    // yes; second confirm (the empty-lineup-specific one) says no.
    let confirmCallCount = 0
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      confirmCallCount += 1
      return confirmCallCount === 1
    })
    eventsApi.setPublishState.mockRejectedValueOnce(emptyLineupError())

    const showToast = vi.fn()
    render(
      <EventsTab
        events={[DRAFT_EVENT_NO_BANDS]}
        onEventsChange={vi.fn()}
        showToast={showToast}
        readOnly={false}
        canArchiveEvents={true}
      />
    )

    const publishButtons = screen.getAllByRole('button', { name: 'Publish' })
    fireEvent.click(publishButtons[0])

    // Wait for both confirms to have fired (proves the empty-lineup branch
    // was reached and the decline was read) before asserting nothing more
    // happened.
    await waitFor(() => expect(confirmCallCount).toBe(2))
    await waitFor(() => expect(eventsApi.setPublishState).toHaveBeenCalledTimes(1))

    // No retry -- exactly one call, never a second with the override flag.
    expect(eventsApi.setPublishState).toHaveBeenCalledTimes(1)
    // No success toast for a publish that never completed.
    expect(showToast).not.toHaveBeenCalledWith('Event published successfully!', 'success')
    expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('published successfully'), 'success')

    // The button still reads "Publish" (draft), not "Unpublish" -- the event
    // prop was never updated because the publish never went through.
    expect(screen.getAllByRole('button', { name: 'Publish' }).length).toBeGreaterThan(0)
  })
})
