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

// Zero links, but named to sort LAST alphabetically -- the opposite end of
// the name-ascending default sort from BAND_WITH_IG. This deliberately
// breaks the coincidence that made the old sort test vacuous: with
// ACTIVE_BAND ("Active Aardvarks", 0 links) name-ascending and
// link-count-ascending happened to produce the same order, so the assertion
// passed even after the Links header's onClick was deleted entirely. Here
// name-ascending gives [Instagrammed Iguanas, Zeroed Zebras] while
// link-count-ascending must give the reverse: [Zeroed Zebras, Instagrammed
// Iguanas].
const ZERO_LINKS_BAND = {
  id: 'profile_3',
  band_profile_id: 3,
  name: 'Zeroed Zebras',
  genre: 'rock',
  origin_city: 'Waterloo',
  origin_region: 'ON',
  is_active: 1,
  follower_count: 0,
  social_links: '{}',
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

  it('sorts by link count, sparsest first, and reverses on a second click', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_WITH_IG, ZERO_LINKS_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Instagrammed Iguanas')

    // Mobile card view also renders a "Links:" label (not a column header),
    // so scope to the columnheader role to avoid a duplicate match.
    const linksHeader = screen.getByRole('columnheader', { name: /^Links/ })

    // Name-ascending (the default sort) would order these as
    // [Instagrammed Iguanas, Zeroed Zebras] -- the opposite of what
    // link-count-ascending must produce. Row 0 is the header row.
    fireEvent.click(linksHeader)
    let rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Zeroed Zebras')
    expect(rows[1]).toHaveTextContent('Instagrammed Iguanas')

    // Second click reverses to descending -- most links first. This
    // direction previously had no test coverage at all.
    fireEvent.click(linksHeader)
    rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Instagrammed Iguanas')
    expect(rows[1]).toHaveTextContent('Zeroed Zebras')
  })
})
