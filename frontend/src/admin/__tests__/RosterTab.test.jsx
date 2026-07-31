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

  it('mode "has" narrows to artists that HAVE the checked field, with a "Has:" chip', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, BAND_WITH_IG] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    fireEvent.click(screen.getByRole('button', { name: /data gaps/i }))
    // Switch the mode radio from the default "missing" to "has" first --
    // this flips the accessible name of the field checkboxes below (see
    // DataGapFilter's GapCheckbox: "has" mode spells out what the checkbox
    // does rather than reusing the missing-count label).
    fireEvent.click(screen.getByLabelText('Has'))
    fireEvent.click(screen.getByLabelText('Instagram — filter to artists with Instagram (1 missing)'))

    // BAND_WITH_IG has an Instagram link -> kept. ACTIVE_BAND's social_links
    // is '{}' -> no Instagram -> excluded now that the filter means HAS.
    expect(screen.getAllByText('Instagrammed Iguanas').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Active Aardvarks')).toHaveLength(0)

    // The chip must read "Has: Instagram", not "Missing: Instagram" -- this
    // is the separate matchesGapFilter branch and chip-label branch this
    // test exists to cover.
    expect(screen.getByRole('button', { name: 'Remove filter: Has: Instagram' })).toBeInTheDocument()
  })

  it('the "No links at all" preset narrows to link-less artists and restores on chip removal', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_WITH_IG, ZERO_LINKS_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Instagrammed Iguanas')

    fireEvent.click(screen.getByRole('button', { name: /data gaps/i }))
    fireEvent.click(screen.getByLabelText('No links at all — 1 artists'))

    // ZERO_LINKS_BAND's social_links is '{}' (no links at all) -> kept.
    // BAND_WITH_IG has an Instagram link -> excluded.
    expect(screen.getAllByText('Zeroed Zebras').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Instagrammed Iguanas')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: No links at all' }))
    expect(screen.getAllByText('Instagrammed Iguanas').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Zeroed Zebras').length).toBeGreaterThan(0)
  })

  it('sorts by link count, sparsest first, and reverses on a second click', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_WITH_IG, ZERO_LINKS_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Instagrammed Iguanas')

    // Mobile card view also renders a "Links:" label (not a column header),
    // so scope to the columnheader role to avoid a duplicate match. The
    // sort handler now lives on the <button> inside the <th> (keyboard
    // operability fix), not the <th> itself, so click the button.
    const linksButton = screen.getByRole('button', { name: /^Links/ })

    // Name-ascending (the default sort) would order these as
    // [Instagrammed Iguanas, Zeroed Zebras] -- the opposite of what
    // link-count-ascending must produce. Row 0 is the header row.
    fireEvent.click(linksButton)
    let rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Zeroed Zebras')
    expect(rows[1]).toHaveTextContent('Instagrammed Iguanas')

    // Second click reverses to descending -- most links first. This
    // direction previously had no test coverage at all.
    fireEvent.click(linksButton)
    rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Instagrammed Iguanas')
    expect(rows[1]).toHaveTextContent('Zeroed Zebras')
  })

  it('the Links header is keyboard operable: the sort button can be focused and activated without a mouse', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_WITH_IG, ZERO_LINKS_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Instagrammed Iguanas')

    const linksButton = screen.getByRole('button', { name: /^Links/ })
    const linksHeader = screen.getByRole('columnheader', { name: /^Links/ })

    // The <th> itself is not the click target -- only the button inside it
    // is, which is what makes the header reachable via Tab and activatable
    // via Enter/Space for a keyboard-only user. `aria-sort` starts at 'none'
    // because the roster defaults to sorting by name, not link count.
    expect(linksHeader).toHaveAttribute('aria-sort', 'none')

    linksButton.focus()
    expect(linksButton).toHaveFocus()

    fireEvent.click(linksButton)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Zeroed Zebras')
    expect(rows[1]).toHaveTextContent('Instagrammed Iguanas')
    expect(linksHeader).toHaveAttribute('aria-sort', 'ascending')
  })
})
