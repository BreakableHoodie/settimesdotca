import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BandForm from '../BandForm'

vi.mock('../PhotoUpload', () => ({ default: () => <div data-testid="photo-upload" /> }))
vi.mock('../RichTextEditor', () => ({ default: () => <div data-testid="rich-text-editor" /> }))

const baseFormData = {
  name: 'The Testers',
  event_id: '',
  venue_id: '',
  start_time: '',
  end_time: '',
  duration: '',
  performance_date: '',
  notes: '',
  origin_city: '',
  origin_region: '',
  genre: '',
  photo_url: '',
  photo_alt_text: '',
  description: '',
  website: '',
  instagram: '',
  bandcamp: '',
  facebook: '',
  youtube: '',
  spotify: '',
  apple_music: '',
  linktree: '',
  contact_email: '',
  is_active: 1,
}

function renderForm(overrides = {}, props = {}) {
  const onSubmit = vi.fn()
  render(
    <BandForm
      events={[{ id: 12, name: 'Test Festival' }]}
      venues={[{ id: 4, name: 'The Test Venue' }]}
      formData={{ ...baseFormData, ...overrides }}
      submitting={false}
      mode="create"
      onChange={vi.fn()}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      {...props}
    />
  )
  return onSubmit
}

function submittedFields(onSubmit) {
  const form = onSubmit.mock.calls[0][0].target
  return Object.fromEntries(new window.FormData(form).entries())
}

describe('BandForm', () => {
  it('requires schedule controls when an event is selected, but not in global view', () => {
    renderForm({ event_id: '12' })
    expect(screen.getByLabelText(/Start Time/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Duration \(minutes\)/)).toBeInTheDocument()

    cleanup()
    renderForm({ event_id: '12' }, { globalView: true })
    expect(screen.queryByLabelText(/Start Time/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Duration \(minutes\)/)).not.toBeInTheDocument()
  })

  it('submits new profile fields while omitting unrendered schedule fields', () => {
    const onSubmit = renderForm({}, { globalView: true })
    fireEvent.submit(screen.getByRole('button', { name: 'Add Artist' }).closest('form'))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(submittedFields(onSubmit)).toMatchObject({
      name: 'The Testers',
      website: '',
      instagram: '',
      contact_email: '',
      is_active: '1',
    })
    expect(submittedFields(onSubmit)).not.toHaveProperty('event_id')
    expect(submittedFields(onSubmit)).not.toHaveProperty('start_time')
    expect(submittedFields(onSubmit)).not.toHaveProperty('venue_id')
  })

  it('submits schedule fields for an edited performance, including empty values', () => {
    const onSubmit = renderForm({ event_id: '12', venue_id: '' })
    fireEvent.submit(screen.getByRole('button', { name: 'Create & Add Artist' }).closest('form'))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(submittedFields(onSubmit)).toMatchObject({
      name: 'The Testers',
      event_id: '12',
      venue_id: '',
      start_time: '',
      end_time: '',
      duration: '',
    })
  })

  it('keeps the required validation attached to the artist name field', () => {
    renderForm({ name: '' }, { globalView: true })
    const nameInput = screen.getByLabelText('Artist Name *')

    expect(nameInput).toBeRequired()
  })
})
