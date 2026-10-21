import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'
import RosterTab from '../RosterTab'

// CodeRabbit #1361: an upload in edit mode is saved to the artist before the
// form is. If the roster refresh then FAILS, a reopened form must still not
// carry the old photo back, so the new URL is merged into the row at once.
vi.mock('../../utils/adminApi', () => ({
  bandsApi: { getAll: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), bulkDelete: vi.fn() },
}))
vi.mock('../components/BandForm', () => ({
  default: ({ formData, onCancel, onPhotoPersisted }) => (
    <div data-testid="band-form">
      <span data-testid="form-photo">{formData.photo_url}</span>
      <button onClick={() => onPhotoPersisted?.('https://band-photos.settimes.ca/band-photos/new.jpg')}>
        Photo saved to artist
      </button>
      <button onClick={onCancel}>Cancel form</button>
    </div>
  ),
}))

import { bandsApi } from '../../utils/adminApi'

const BAND = {
  id: 'profile_1',
  band_profile_id: 1,
  name: 'Active Aardvarks',
  genre: 'rock',
  is_active: 1,
  follower_count: 0,
  social_links: '{}',
  photo_url: 'https://old.example/a.jpg',
}

describe('RosterTab photo saved during an edit', () => {
  it('keeps the new photo in the row even when the refresh fails', async () => {
    bandsApi.getAll.mockResolvedValueOnce({ bands: [BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    bandsApi.getAll.mockRejectedValueOnce(new Error('offline'))
    fireEvent.click(await screen.findByRole('button', { name: 'Photo saved to artist' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel form' }))
    await waitFor(() => expect(screen.queryByTestId('band-form')).not.toBeInTheDocument())
    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0])
    expect(await screen.findByTestId('form-photo')).toHaveTextContent(
      'https://band-photos.settimes.ca/band-photos/new.jpg'
    )
  })
})
