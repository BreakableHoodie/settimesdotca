import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventFormModal from '../EventFormModal'
import { eventsApi } from '../../../utils/adminApi'
import { publishWithLineupConfirm } from '../../utils/publishWithLineupConfirm'

vi.mock('../../../utils/adminApi', () => ({
  eventsApi: {
    create: vi.fn(),
    update: vi.fn(),
    setPublishState: vi.fn(),
    setRevealMode: vi.fn(),
  },
}))
vi.mock('../../utils/publishWithLineupConfirm', () => ({ publishWithLineupConfirm: vi.fn() }))
vi.mock('../PhotoUpload', () => ({ default: () => <div data-testid="photo-upload" /> }))

const baseEvent = {
  id: 37,
  name: 'Long Weekend Band Crawl Vol. 18',
  slug: 'lwbc18',
  date: '2099-10-11',
  end_date: null,
  description: '',
  city: 'Kitchener',
  ticket_url: '',
  poster_url: '',
  social_links: null,
  doors_json: null,
  reveal_mode: 0,
}

function renderModal(event) {
  const onClose = vi.fn()
  const onSave = vi.fn()
  render(<EventFormModal isOpen event={event} onClose={onClose} onSave={onSave} />)
  return { onClose, onSave }
}

async function submitWithStatus(status) {
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: status } })
  fireEvent.submit(screen.getByRole('button', { name: /update event/i }).closest('form'))
  await waitFor(() => expect(eventsApi.update).toHaveBeenCalledTimes(1))
}

describe('EventFormModal publication routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventsApi.update.mockResolvedValue({ event: baseEvent })
    eventsApi.create.mockResolvedValue({ event: baseEvent })
    publishWithLineupConfirm.mockResolvedValue({ cancelled: false })
  })

  it('removes status from a draft-to-published update and calls the publish path', async () => {
    renderModal({ ...baseEvent, status: 'draft' })
    await submitWithStatus('published')

    expect(eventsApi.update.mock.calls[0][1]).not.toHaveProperty('status')
    expect(publishWithLineupConfirm).toHaveBeenCalledWith(eventsApi, {
      id: baseEvent.id,
      name: baseEvent.name,
    })
  })

  it('keeps status in the payload when re-saving an already-published event', async () => {
    renderModal({ ...baseEvent, status: 'published' })
    await submitWithStatus('published')

    expect(eventsApi.update.mock.calls[0][1]).toHaveProperty('status', 'published')
    expect(publishWithLineupConfirm).not.toHaveBeenCalled()
  })

  it('removes status when editing an archived event', async () => {
    renderModal({ ...baseEvent, status: 'archived' })
    fireEvent.submit(screen.getByRole('button', { name: /update event/i }).closest('form'))
    await waitFor(() => expect(eventsApi.update).toHaveBeenCalledTimes(1))

    expect(eventsApi.update.mock.calls[0][1]).not.toHaveProperty('status')
    expect(publishWithLineupConfirm).not.toHaveBeenCalled()
  })

  it('creates a draft without rerouting through publication', async () => {
    render(<EventFormModal isOpen event={null} onClose={vi.fn()} onSave={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Event Name *'), { target: { value: 'New Festival' } })
    fireEvent.change(screen.getByLabelText('Event Date *'), { target: { value: '2099-10-11' } })
    fireEvent.submit(screen.getByRole('button', { name: /create event/i }).closest('form'))

    await waitFor(() => expect(eventsApi.create).toHaveBeenCalledTimes(1))
    expect(eventsApi.create.mock.calls[0][0]).toHaveProperty('status', 'draft')
    expect(publishWithLineupConfirm).not.toHaveBeenCalled()
  })
})
