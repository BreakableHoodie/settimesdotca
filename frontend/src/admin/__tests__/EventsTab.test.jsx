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
    // EventFormModal's save path (#821/#825) goes through these.
    update: vi.fn(),
    create: vi.fn(),
    setRevealMode: vi.fn(),
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

/**
 * #825. EventFormModal saves fields first, then publishes, so a declined or
 * failed publish leaves the save PARTIALLY done. Routing that through the
 * normal onSave would close the modal and toast "Event updated successfully!"
 * over a publish that never happened -- so it goes through onPartialSave, which
 * refreshes the parent without closing or toasting.
 *
 * These render the real EventsTab + EventFormModal together, because the defect
 * only exists in the seam between them: EventFormModal alone cannot know that
 * the parent's onSave closes the modal.
 */
describe('EventsTab + EventFormModal — partial save when publishing fails (#825)', () => {
  beforeEach(() => {
    eventsApi.setPublishState.mockReset()
    eventsApi.update.mockReset()
    eventsApi.setRevealMode.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const openEditAndSelectPublished = async () => {
    const editButtons = screen.getAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[0])

    const statusSelect = await screen.findByLabelText('Status')
    fireEvent.change(statusSelect, { target: { name: 'status', value: 'published' } })
    return statusSelect
  }

  const submitForm = () => {
    const saveButton = screen.getAllByRole('button', { name: /update event|save/i })[0]
    fireEvent.click(saveButton)
  }

  it('keeps the modal open and does not toast success when the publish confirm is declined', async () => {
    eventsApi.update.mockResolvedValue({ event: { ...DRAFT_EVENT_NO_BANDS } })
    eventsApi.setPublishState.mockRejectedValueOnce(emptyLineupError())
    vi.spyOn(window, 'confirm').mockReturnValue(false)

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

    await openEditAndSelectPublished()
    submitForm()

    // The explanatory message is on screen, which is only possible if the
    // modal stayed open.
    expect(await screen.findByText(/still a draft/i)).toBeInTheDocument()

    // Never claim success for a publish that did not happen.
    expect(showToast).not.toHaveBeenCalledWith('Event updated successfully!', 'success')
    // And the override retry must not have fired.
    expect(eventsApi.setPublishState).toHaveBeenCalledTimes(1)
  })

  it('keeps the modal open and reports the reason when publishing throws', async () => {
    eventsApi.update.mockResolvedValue({ event: { ...DRAFT_EVENT_NO_BANDS } })
    eventsApi.setPublishState.mockRejectedValueOnce(new Error('Network request failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

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

    await openEditAndSelectPublished()
    submitForm()

    // Names the real cause rather than the misleading "Failed to save event",
    // and says the fields were saved so the admin does not re-enter them.
    const message = await screen.findByText(/publishing failed/i)
    expect(message).toHaveTextContent('Network request failed')
    expect(message).toHaveTextContent(/saved/i)

    expect(showToast).not.toHaveBeenCalledWith('Event updated successfully!', 'success')
  })
})
