import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BulkBandImport from '../components/BulkBandImport'

vi.mock('../../utils/adminApi', () => ({
  bandsApi: { bulkImport: vi.fn() },
}))

import { bandsApi } from '../../utils/adminApi'

describe('BulkBandImport', () => {
  it('imports pasted bands and shows a success message', async () => {
    bandsApi.bulkImport.mockResolvedValue({ success: true, imported: 2 })
    render(<BulkBandImport eventId={7} />)

    fireEvent.change(screen.getByLabelText(/Bands to import/i), {
      target: {
        value: 'Alpha, 20:00, 21:00, Hall, rock\nBeta, 21:00, 22:00, Hall, jazz',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: /Import bands/i }))

    expect(await screen.findByText(/Imported 2 bands/i)).toBeInTheDocument()
    expect(bandsApi.bulkImport).toHaveBeenCalledWith(7, [
      {
        name: 'Alpha',
        start_time: '20:00',
        end_time: '21:00',
        venue: 'Hall',
        genre: 'rock',
      },
      {
        name: 'Beta',
        start_time: '21:00',
        end_time: '22:00',
        venue: 'Hall',
        genre: 'jazz',
      },
    ])
  })

  it('shows per-row errors when the import is rejected', async () => {
    const err = new Error('Validation failed')
    err.details = { errors: ['Row 2: venue "Nowhere" not found'] }
    bandsApi.bulkImport.mockRejectedValue(err)
    render(<BulkBandImport eventId={7} />)

    fireEvent.change(screen.getByLabelText(/Bands to import/i), {
      target: {
        value: 'Good, 20:00, 21:00, Hall, rock\nBad, 21:00, 22:00, Nowhere, rock',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: /Import bands/i }))

    expect(await screen.findByText(/venue "Nowhere" not found/i)).toBeInTheDocument()
  })
})
