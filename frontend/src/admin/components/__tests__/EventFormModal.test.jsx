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
    expect(eventsApi.create.mock.calls[0][0]).toMatchObject({ presented_by_url: null, ticket_price: null })
    expect(publishWithLineupConfirm).not.toHaveBeenCalled()
  })

  it('sends a presenter URL and preserves a zero ticket price', async () => {
    renderModal({ ...baseEvent, status: 'draft' })
    fireEvent.change(screen.getByLabelText(/presented by url/i), {
      target: { value: 'https://organizer.example' },
    })
    fireEvent.change(screen.getByLabelText(/ticket price \(cad\)/i), { target: { value: '0' } })
    fireEvent.submit(screen.getByRole('button', { name: /update event/i }).closest('form'))

    await waitFor(() => expect(eventsApi.update).toHaveBeenCalledTimes(1))
    expect(eventsApi.update.mock.calls[0][1]).toMatchObject({
      presented_by_url: 'https://organizer.example',
      ticket_price: 0,
    })
  })
})

// #1248: the poster palette round-trips through an unrelated save, and a
// stored value that is not a palette is not written back.
describe('EventFormModal poster colours', () => {
  const variant = { ground: '#f7eef0', ink: '#1a1819', accent: '#924d7a', nowFill: '#dce9f2' }
  const palette = { v: 1, source: 'poster', light: variant, dark: variant }

  beforeEach(() => {
    vi.clearAllMocks()
    eventsApi.update.mockResolvedValue({ event: baseEvent })
  })

  async function saveUnchanged(event) {
    renderModal(event)
    fireEvent.submit(screen.getByRole('button', { name: /update event/i }).closest('form'))
    await waitFor(() => expect(eventsApi.update).toHaveBeenCalledTimes(1))
    return eventsApi.update.mock.calls[0][1].theme_colors
  }

  it('keeps a saved palette when the event is saved for another reason', async () => {
    const sent = await saveUnchanged({ ...baseEvent, status: 'draft', theme_colors: JSON.stringify(palette) })
    expect(JSON.parse(sent)).toEqual(palette)
  })

  it.each([
    ['no palette', null],
    ['the 0008 legacy shape', '{"primary":"#123456"}'],
    ['malformed JSON', '{'],
  ])('sends null for %s', async (_label, stored) => {
    expect(await saveUnchanged({ ...baseEvent, status: 'draft', theme_colors: stored })).toBeNull()
  })
})
