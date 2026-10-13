import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VenuesTab from '../VenuesTab'

vi.mock('../../utils/adminApi', () => ({
  venuesApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { venuesApi } from '../../utils/adminApi'

// Owner decision 2026-10-10: an editor can CREATE a venue, but only an admin
// can edit or delete one (the server enforces this in venues.js and
// venues/[id].js). Before this, the tab showed Edit and Delete to editors and
// the server refused both, so the screen offered buttons that could only fail.
// Each case asserts on the venue's own row, not the whole page, so a stray
// "Edit" elsewhere cannot satisfy it.
const VENUE = { id: 1, name: 'Prohibition Warehouse', address: '', city: 'Waterloo', band_count: 2 }

async function renderTab(props) {
  render(<VenuesTab showToast={vi.fn()} {...props} />)
  // Desktop table row and mobile card both render in jsdom; take the table row.
  const cell = await screen.findAllByText(VENUE.name)
  return cell[0].closest('tr')
}

describe('VenuesTab role gating', () => {
  beforeEach(() => {
    venuesApi.getAll.mockResolvedValue({ venues: [VENUE] })
  })

  it('an admin sees Add Venue, and Edit and Delete on each venue', async () => {
    const row = await renderTab({ readOnly: false, canManage: true })
    expect(screen.getByRole('button', { name: /add venue/i })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('an editor sees Add Venue but no Edit or Delete', async () => {
    const row = await renderTab({ readOnly: false, canManage: false })
    expect(screen.getByRole('button', { name: /add venue/i })).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(within(row).queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.queryAllByRole('button', { name: 'Edit' })).toHaveLength(0)
  })

  // Losing admin while an edit form is open must not leave a form that can only
  // 403, nor hide Add Venue, which an editor may still use.
  it('closes an open edit form when the user loses admin, and offers Add Venue again', async () => {
    const showToast = vi.fn()
    const { rerender } = render(<VenuesTab showToast={showToast} readOnly={false} canManage />)
    const row = (await screen.findAllByText(VENUE.name))[0].closest('tr')
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('heading', { name: 'Edit Venue' })).toBeInTheDocument()

    rerender(<VenuesTab showToast={showToast} readOnly={false} canManage={false} />)

    expect(await screen.findByRole('button', { name: /add venue/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Edit Venue' })).toBeNull()
  })

  it('a viewer sees no write controls at all', async () => {
    await renderTab({ readOnly: true, canManage: false })
    await waitFor(() => expect(venuesApi.getAll).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /add venue/i })).toBeNull()
    expect(screen.queryAllByRole('button', { name: 'Edit' })).toHaveLength(0)
  })
})
