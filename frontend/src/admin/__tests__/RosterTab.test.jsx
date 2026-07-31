import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RosterTab from '../RosterTab'

// RosterTab renders both a desktop <table> and a mobile card list
// unconditionally (visibility is CSS-only via `hidden md:block` /
// `md:hidden`), so any text query below matches twice — hence
// getAllByText/queryAllByText throughout rather than getByText.
vi.mock('../../utils/adminApi', () => ({
  bandsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    bulkDelete: vi.fn(),
  },
}))

import { bandsApi } from '../../utils/adminApi'

// Deactivated profile (#619) — e.g. The Essential Letdowns, retired after
// their farewell show, but the admin roster still has to manage them.
const INACTIVE_BAND = {
  id: 'profile_98',
  band_profile_id: 98,
  name: 'The Essential Letdowns',
  genre: 'punk',
  origin_city: 'Kitchener',
  origin_region: 'ON',
  is_active: 0,
  follower_count: 0,
  social_links: '{}',
}

const ACTIVE_BAND = {
  id: 'profile_1',
  band_profile_id: 1,
  name: 'Active Aardvarks',
  genre: 'rock',
  origin_city: 'Waterloo',
  origin_region: 'ON',
  is_active: 1,
  follower_count: 0,
  social_links: '{}',
}

describe('RosterTab — inactive profile visibility (#619)', () => {
  it('shows an inactive profile with an Inactive badge, included by default (status filter = All)', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, INACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)

    expect(await screen.findAllByText('The Essential Letdowns')).not.toHaveLength(0)
    expect(screen.getAllByText('Active Aardvarks').length).toBeGreaterThan(0)
    // Inactive badge next to the name (plus the existing Status column) —
    // both render for the retired band.
    expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0)
  })

  it('the Active filter hides inactive profiles', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, INACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'active' } })

    expect(screen.queryAllByText('The Essential Letdowns')).toHaveLength(0)
    expect(screen.getAllByText('Active Aardvarks').length).toBeGreaterThan(0)
  })

  it('the Inactive filter shows only inactive profiles', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, INACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'inactive' } })

    expect(screen.queryAllByText('Active Aardvarks')).toHaveLength(0)
    expect(screen.getAllByText('The Essential Letdowns').length).toBeGreaterThan(0)
  })
})

const BAND_WITH_IG = {
  id: 'profile_2',
  band_profile_id: 2,
  name: 'Instagrammed Iguanas',
  genre: 'rock',
  origin_city: 'Waterloo',
  origin_region: 'ON',
  is_active: 1,
  follower_count: 0,
  social_links: JSON.stringify({ instagram: '@iguanas' }),
}

describe('RosterTab — data-gap filtering', () => {
  it('filters to artists missing Instagram and restores on chip removal', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, BAND_WITH_IG] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    fireEvent.click(screen.getByRole('button', { name: /data gaps/i }))
    fireEvent.click(screen.getByLabelText('Instagram — 1 missing'))

    // ACTIVE_BAND has social_links '{}' -> missing Instagram -> kept.
    expect(screen.getAllByText('Active Aardvarks').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Instagrammed Iguanas')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Missing: Instagram' }))
    expect(screen.getAllByText('Instagrammed Iguanas').length).toBeGreaterThan(0)
  })

  it('counts stay stable after a gap filter is applied', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, BAND_WITH_IG] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    fireEvent.click(screen.getByRole('button', { name: /data gaps/i }))
    fireEvent.click(screen.getByLabelText('Instagram — 1 missing'))

    // Spotify's count is still measured against the search/status-filtered
    // roster (both bands), not the Instagram-filtered subset.
    expect(screen.getByLabelText('Spotify — 2 missing')).toBeInTheDocument()
  })
})
