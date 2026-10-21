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
vi.mock('../PhotoUpload', () => ({
  default: ({ onPhotoChange, onPersisted }) => (
    <button
      type="button"
      onClick={() => {
        onPhotoChange('https://band-photos.settimes.ca/event-posters/new.jpg')
        onPersisted('https://band-photos.settimes.ca/event-posters/new.jpg')
      }}
    >
      fake: poster uploaded and saved
    </button>
  ),
}))
// The palette component has its own suite; here only what it reports matters.
vi.mock('../PosterPalette', () => ({
  default: ({ onChange, onBusyChange, autoSuggest }) => (
    <>
      <span data-testid="auto-suggest">{String(autoSuggest)}</span>
      <button
        type="button"
        onClick={() =>
          onChange({
            v: 1,
            source: 'poster',
            poster: 'https://band-photos.settimes.ca/event-posters/a.jpg',
            light: { ground: '#f7eef0', ink: '#1a1819', accent: '#924d7a', nowFill: '#dce9f2' },
            dark: { ground: '#f7eef0', ink: '#1a1819', accent: '#924d7a', nowFill: '#dce9f2' },
          })
        }
      >
        fake: colours read
      </button>
      <button type="button" onClick={() => onChange(null)}>
        fake: colours removed
      </button>
      <button type="button" onClick={() => onBusyChange(true)}>
        fake: reading
      </button>
    </>
  ),
}))

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

// #1248: the palette is sent only when it changed in the form. An unrelated
// save leaves the stored value alone, readable or not; Save waits while the
// poster's colours are being read.
describe('EventFormModal poster colours', () => {
  const variant = { ground: '#f7eef0', ink: '#1a1819', accent: '#924d7a', nowFill: '#dce9f2' }
  const palette = {
    v: 1,
    source: 'poster',
    poster: 'https://band-photos.settimes.ca/event-posters/a.jpg',
    light: variant,
    dark: variant,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    eventsApi.update.mockResolvedValue({ event: baseEvent })
    eventsApi.create.mockResolvedValue({ event: baseEvent })
  })

  async function save(event, before = () => {}) {
    renderModal(event)
    before()
    fireEvent.submit(screen.getByRole('button', { name: /update event/i }).closest('form'))
    await waitFor(() => expect(eventsApi.update).toHaveBeenCalledTimes(1))
    return eventsApi.update.mock.calls[0][1]
  }

  it.each([
    ['a saved palette', JSON.stringify(palette)],
    ['no palette', null],
    ['a stored value this version cannot read', '{"v":2,"future":true}'],
  ])('an unrelated save does not send theme_colors with %s', async (_label, stored) => {
    expect(await save({ ...baseEvent, status: 'draft', theme_colors: stored })).not.toHaveProperty('theme_colors')
  })

  it('does not let the palette read the poster over a stored value it cannot read', () => {
    renderModal({
      ...baseEvent,
      status: 'draft',
      theme_colors: '{"v":2}',
      poster_url: 'https://band-photos.settimes.ca/event-posters/a.jpg',
    })
    expect(screen.getByTestId('auto-suggest')).toHaveTextContent('false')
  })

  it('lets it read when the stored value is readable or absent', () => {
    renderModal({ ...baseEvent, status: 'draft', theme_colors: null })
    expect(screen.getByTestId('auto-suggest')).toHaveTextContent('true')
  })

  it('says a stored value it cannot read is kept', () => {
    renderModal({ ...baseEvent, status: 'draft', theme_colors: '{"v":2}' })
    expect(screen.getByText(/cannot show\. They are kept as they are/)).toBeInTheDocument()
  })

  it('sends the palette once it changed in the form', async () => {
    const payload = await save({ ...baseEvent, status: 'draft', theme_colors: null }, () =>
      fireEvent.click(screen.getByRole('button', { name: 'fake: colours read' }))
    )
    expect(JSON.parse(payload.theme_colors)).toEqual(palette)
  })

  it('sends null once the colours are removed', async () => {
    const payload = await save({ ...baseEvent, status: 'draft', theme_colors: JSON.stringify(palette) }, () =>
      fireEvent.click(screen.getByRole('button', { name: 'fake: colours removed' }))
    )
    expect(payload.theme_colors).toBeNull()
  })

  it('holds Save while the poster is being read', () => {
    renderModal({ ...baseEvent, status: 'draft' })
    fireEvent.click(screen.getByRole('button', { name: 'fake: reading' }))
    expect(screen.getByRole('button', { name: 'Waiting for poster colours…' })).toBeDisabled()
  })
})

// #1248 review, pre-existing data loss: an upload in edit mode is saved at
// once, but the events list was never told. Cancel, reopen from the stale list,
// Save: the poster was deleted. Now the list refreshes on the upload, and the
// form sends poster_url only when it changed in the form.
describe('EventFormModal poster upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventsApi.update.mockResolvedValue({ event: baseEvent })
  })

  it('an unrelated save does not send poster_url, so a stale form cannot clear a saved poster', async () => {
    renderModal({ ...baseEvent, status: 'draft', poster_url: '' })
    fireEvent.submit(screen.getByRole('button', { name: /update event/i }).closest('form'))
    await waitFor(() => expect(eventsApi.update).toHaveBeenCalledTimes(1))
    expect(eventsApi.update.mock.calls[0][1]).not.toHaveProperty('poster_url')
  })

  it('an upload saved to the event refreshes the list at once, and a save then sends it', async () => {
    const onPartialSave = vi.fn()
    render(
      <EventFormModal
        isOpen
        event={{ ...baseEvent, status: 'draft' }}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onPartialSave={onPartialSave}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'fake: poster uploaded and saved' }))
    expect(onPartialSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: baseEvent.id, poster_url: 'https://band-photos.settimes.ca/event-posters/new.jpg' })
    )
    fireEvent.submit(screen.getByRole('button', { name: /update event/i }).closest('form'))
    await waitFor(() => expect(eventsApi.update).toHaveBeenCalledTimes(1))
    expect(eventsApi.update.mock.calls[0][1].poster_url).toBe('https://band-photos.settimes.ca/event-posters/new.jpg')
  })
})
