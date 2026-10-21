import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
    notifySubscribers: vi.fn(),
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

// Always in the future, relative to whenever the suite runs. A past date makes
// EventsTab treat the draft as archived (isEventLockedAsArchived), so Edit asks
// for an archived-edit confirmation first. These tests decline confirms, so a
// fixed date silently turned them red the day after it passed (2026-10-12).
const FUTURE_DATE = (() => {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toLocaleDateString('en-CA')
})()

const DRAFT_EVENT_NO_BANDS = {
  id: 37,
  name: 'Long Weekend Band Crawl Vol. 18',
  slug: 'lwbc18',
  date: FUTURE_DATE,
  status: 'draft',
  band_count: 0,
}

const EVENT_WITH_LINEUP = {
  ...DRAFT_EVENT_NO_BANDS,
  name: 'Event with lineup',
  slug: 'event-with-lineup',
  band_count: 1,
}

describe('EventsTab — event deletion visibility', () => {
  it('shows Delete to admins but not editors within the event row and card', () => {
    const { unmount } = render(
      <EventsTab
        events={[EVENT_WITH_LINEUP]}
        onEventsChange={vi.fn()}
        showToast={vi.fn()}
        readOnly={false}
        canArchiveEvents={true}
        canDeleteEvents={true}
      />
    )

    const desktopRow = screen.getAllByRole('row')[1]
    const mobileCard = screen.getAllByText(EVENT_WITH_LINEUP.name)[1].closest('.p-4')
    expect(within(desktopRow).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(within(mobileCard).getByRole('button', { name: 'Delete' })).toBeInTheDocument()

    unmount()
    render(
      <EventsTab
        events={[EVENT_WITH_LINEUP]}
        onEventsChange={vi.fn()}
        showToast={vi.fn()}
        readOnly={false}
        canArchiveEvents={true}
        canDeleteEvents={false}
      />
    )

    expect(within(screen.getAllByRole('row')[1]).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    const editorMobileCard = screen.getAllByText(EVENT_WITH_LINEUP.name)[1].closest('.p-4')
    expect(within(editorMobileCard).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})

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
    const onEventsChange = vi.fn()
    render(
      <EventsTab
        events={[DRAFT_EVENT_NO_BANDS]}
        onEventsChange={onEventsChange}
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
    // ...and it stays open in the real panel only if the list refresh runs in
    // the background: AdminPanel's full reload unmounts the tab and the modal
    // with it (#1248 review; this stub hid that until then).
    expect(onEventsChange).toHaveBeenCalledWith({ background: true })

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

// Notifying the general subscriber list (#1150).
//
// The banner on the fan-facing event page promises "set times coming soon --
// subscribe for updates". The send endpoint existed (#1149) but NOTHING in the
// admin UI called it, so the promise could only be kept with a curl. These
// cover the button that keeps it.
describe('EventsTab — notify subscribers', () => {
  // Vol 18's real shape on the day this shipped: published, fifteen sets
  // announced, not one of them placed.
  const LINEUP_UP_SCHEDULE_TBA = {
    id: 37,
    name: 'Long Weekend Band Crawl Vol. 18',
    slug: 'lwbc18',
    date: '2026-10-11',
    status: 'published',
    band_count: 15,
    scheduled_count: 0,
  }
  const SCHEDULE_OUT = { ...LINEUP_UP_SCHEDULE_TBA, scheduled_count: 15 }

  const renderTab = (events, showToast = vi.fn()) => {
    render(
      <EventsTab
        events={events}
        onEventsChange={vi.fn()}
        showToast={showToast}
        readOnly={false}
        canArchiveEvents={true}
      />
    )
    return showToast
  }

  // Opens the ConfirmDialog. The dialog is a real component, not window.confirm,
  // so the tests drive its actual buttons -- which is also what makes the
  // "declined" case meaningful rather than a mocked return value.
  const clickNotify = () => fireEvent.click(screen.getAllByRole('button', { name: 'Notify' })[0])
  const confirmSend = () => fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  const cancelSend = () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  beforeEach(() => {
    eventsApi.notifySubscribers.mockReset()
    eventsApi.notifySubscribers.mockResolvedValue({ success: true, sent: 3, failed: 0, skipped: 0, remaining: 0 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the LINEUP notice while no set has a time', async () => {
    renderTab([LINEUP_UP_SCHEDULE_TBA])
    clickNotify()
    confirmSend()

    await waitFor(() => expect(eventsApi.notifySubscribers).toHaveBeenCalledWith(37, 'lineup_announced'))
  })

  it('sends the SCHEDULE notice once any set has a time', async () => {
    // The kind is derived, so this is the assertion that the derivation is
    // live rather than hardcoded to one value.
    renderTab([SCHEDULE_OUT])
    clickNotify()
    confirmSend()

    await waitFor(() => expect(eventsApi.notifySubscribers).toHaveBeenCalledWith(37, 'schedule_announced'))
  })

  it('names the notice in the dialog before anything is sent', () => {
    // The operator does not choose the kind, so they must be able to SEE it.
    renderTab([LINEUP_UP_SCHEDULE_TBA])
    clickNotify()

    expect(screen.getByRole('dialog')).toHaveTextContent('The lineup is live')
    expect(screen.getByRole('dialog')).toHaveTextContent('cannot be undone')
    expect(eventsApi.notifySubscribers).not.toHaveBeenCalled()
  })

  it('sends nothing when the dialog is cancelled', () => {
    // Email has no undo, so the cancel path is the one that must not be vacuous.
    renderTab([LINEUP_UP_SCHEDULE_TBA])
    clickNotify()
    cancelSend()

    expect(eventsApi.notifySubscribers).not.toHaveBeenCalled()
  })

  it('tells the operator to press again when the send was capped', async () => {
    // `remaining` is not an error -- the send is capped per invocation. A fan
    // left in that bucket hears nothing until someone presses again, so hiding
    // it would strand them silently.
    eventsApi.notifySubscribers.mockResolvedValue({ success: true, sent: 200, failed: 0, skipped: 0, remaining: 47 })
    const showToast = renderTab([LINEUP_UP_SCHEDULE_TBA])
    clickNotify()
    confirmSend()

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('47 still to go'), 'success'))
  })

  it('reports a total delivery failure as an error, not as "already notified"', async () => {
    // sent 0 / remaining 0 / failed > 0 matches the "already notified" shape on
    // its first two fields. Without the failed check it renders in GREEN and
    // the operator never learns nobody was mailed -- a silent failure in the
    // one place there is no undo.
    eventsApi.notifySubscribers.mockResolvedValue({ success: true, sent: 0, failed: 5, skipped: 0, remaining: 0 })
    const showToast = renderTab([LINEUP_UP_SCHEDULE_TBA])
    clickNotify()
    confirmSend()

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('5 failed'), 'error'))
    expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('already been notified'), 'success')
  })

  it('offers no button on a draft event', () => {
    // The endpoint 404s on anything unpublished; showing the button would
    // promise an action that cannot succeed.
    renderTab([{ ...LINEUP_UP_SCHEDULE_TBA, status: 'draft' }])

    expect(screen.queryAllByRole('button', { name: 'Notify' })).toHaveLength(0)
  })

  it('offers no button on a published event with no lineup', () => {
    renderTab([{ ...LINEUP_UP_SCHEDULE_TBA, band_count: 0 }])

    expect(screen.queryAllByRole('button', { name: 'Notify' })).toHaveLength(0)
  })
})

// #1248 review: rows were memoised on a WHITELIST of event fields, so a list
// refresh that changed any other field (poster, city, description) left the
// row's Edit button holding the old event, and the form opened stale. Hidden
// while every refresh remounted the tab behind a spinner; exposed once a
// refresh ran in the background.
describe('EventsTab rows after a list refresh', () => {
  it('Edit opens the refreshed event, whatever field changed', async () => {
    const props = { onEventsChange: vi.fn(), showToast: vi.fn(), readOnly: false, canArchiveEvents: true }
    const { rerender } = render(<EventsTab {...props} events={[{ ...DRAFT_EVENT_NO_BANDS, city: 'Old City' }]} />)
    rerender(<EventsTab {...props} events={[{ ...DRAFT_EVENT_NO_BANDS, city: 'New City' }]} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(await screen.findByDisplayValue('New City')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Old City')).not.toBeInTheDocument()
  })
})
