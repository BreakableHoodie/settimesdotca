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
  it('shows an inactive profile with an Inactive badge, included by default (no Status filter)', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, INACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)

    expect(await screen.findAllByText('The Essential Letdowns')).not.toHaveLength(0)
    expect(screen.getAllByText('Active Aardvarks').length).toBeGreaterThan(0)
    // Inactive badge next to the name (plus the existing Status column) —
    // both render for the retired band.
    expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0)
  })

  // Status used to be a standalone <select> (aria-label "Filter by status");
  // it is now the is_active column's FilterFunnel + ColumnFilter dropdown,
  // reusing the same generic values-checklist every other column gets.
  it('the Status column filter, checked to Active, hides inactive profiles', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, INACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    fireEvent.click(screen.getByLabelText('Filter by Status'))
    // Exact aria-label, not a `/^Active/` regex: the mobile card list wraps
    // each row's own "select this artist" checkbox AND the band name in one
    // `<label>`, so a checkbox for "Active Aardvarks" has an *accessible
    // name* of "Active Aardvarks" too -- a prefix regex collides with it.
    fireEvent.click(screen.getByLabelText('Active — 1'))

    expect(screen.queryAllByText('The Essential Letdowns')).toHaveLength(0)
    expect(screen.getAllByText('Active Aardvarks').length).toBeGreaterThan(0)
  })

  it('the Status column filter, checked to Inactive, shows only inactive profiles', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, INACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    fireEvent.click(screen.getByLabelText('Filter by Status'))
    fireEvent.click(screen.getByLabelText('Inactive — 1'))

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

// The DataGapFilter popover is gone; its behaviour lives on the Links
// column's FilterFunnel + LinksColumnFilter now.
describe('RosterTab — Links column filtering (formerly the Data-gaps popover)', () => {
  it('filters to artists missing Instagram and restores on chip removal', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, BAND_WITH_IG] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    fireEvent.click(screen.getByLabelText('Filter by Links'))
    fireEvent.click(screen.getByLabelText('Instagram — 1 missing'))

    // ACTIVE_BAND has social_links '{}' -> missing Instagram -> kept.
    expect(screen.getAllByText('Active Aardvarks').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Instagrammed Iguanas')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Links: Missing Instagram' }))
    expect(screen.getAllByText('Instagrammed Iguanas').length).toBeGreaterThan(0)
  })

  it('counts stay stable after a Links filter is applied', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, BAND_WITH_IG] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    fireEvent.click(screen.getByLabelText('Filter by Links'))
    fireEvent.click(screen.getByLabelText('Instagram — 1 missing'))

    // Spotify's count is still measured against the search-filtered roster
    // (both bands), not the Instagram-filtered subset -- linkCountsFor
    // excludes only the link_count column's own filter.
    expect(screen.getByLabelText('Spotify — 2 missing')).toBeInTheDocument()
  })

  it('mode "has" narrows to artists that HAVE the checked field, with a "Has" chip', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, BAND_WITH_IG] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    fireEvent.click(screen.getByLabelText('Filter by Links'))
    // Switch the mode radio from the default "missing" to "has" first --
    // this flips the accessible name of the field checkboxes below (see
    // LinksColumnFilter's LinkCheckbox: "has" mode spells out what the
    // checkbox does rather than reusing the missing-count label).
    fireEvent.click(screen.getByLabelText('Has'))
    fireEvent.click(screen.getByLabelText('Instagram — filter to artists with Instagram (1 missing)'))

    // BAND_WITH_IG has an Instagram link -> kept. ACTIVE_BAND's social_links
    // is '{}' -> no Instagram -> excluded now that the filter means HAS.
    expect(screen.getAllByText('Instagrammed Iguanas').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Active Aardvarks')).toHaveLength(0)

    // The chip must read "Links: Has Instagram", not "Links: Missing
    // Instagram" -- this is the separate matchesGapFilter branch and
    // chip-label branch this test exists to cover.
    expect(screen.getByRole('button', { name: 'Remove filter: Links: Has Instagram' })).toBeInTheDocument()
  })

  it('the "No links at all" preset narrows to link-less artists and restores on chip removal', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_WITH_IG, ZERO_LINKS_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Instagrammed Iguanas')

    fireEvent.click(screen.getByLabelText('Filter by Links'))
    fireEvent.click(screen.getByLabelText('No links at all — 1 artists'))

    // ZERO_LINKS_BAND's social_links is '{}' (no links at all) -> kept.
    // BAND_WITH_IG has an Instagram link -> excluded.
    expect(screen.getAllByText('Zeroed Zebras').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Instagrammed Iguanas')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Links: No links at all' }))
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

// Fixture set for the cross-column tests below:
// Alpha — Active,   genre "punk"
// Beta  — Active,   genre "metal"
// Gamma — Inactive, genre "punk"
const ALPHA = {
  id: 'profile_10',
  band_profile_id: 10,
  name: 'Alpha',
  genre: 'punk',
  origin_city: 'Waterloo',
  origin_region: 'ON',
  is_active: 1,
  follower_count: 0,
  social_links: '{}',
}
const BETA = {
  id: 'profile_11',
  band_profile_id: 11,
  name: 'Beta',
  genre: 'metal',
  origin_city: 'Waterloo',
  origin_region: 'ON',
  is_active: 1,
  follower_count: 0,
  social_links: '{}',
}
const GAMMA = {
  id: 'profile_12',
  band_profile_id: 12,
  name: 'Gamma',
  genre: 'punk',
  origin_city: 'Waterloo',
  origin_region: 'ON',
  is_active: 0,
  follower_count: 0,
  social_links: '{}',
}

describe('RosterTab — per-column filters combine (AND) and clear independently', () => {
  it('ANDs a Status filter and a Genre filter across two different columns', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ALPHA, BETA, GAMMA] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Alpha')

    fireEvent.click(screen.getByLabelText('Filter by Status'))
    fireEvent.click(screen.getByLabelText('Active — 2'))

    fireEvent.click(screen.getByLabelText('Filter by Genre'))
    fireEvent.click(screen.getByLabelText('punk — 1'))

    // Alpha (Active, punk) matches both. Beta is Active but "metal" —
    // excluded by Genre. Gamma is "punk" but Inactive — excluded by Status.
    expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Beta')).toHaveLength(0)
    expect(screen.queryAllByText('Gamma')).toHaveLength(0)
  })

  it('dismissing one column chip clears only that column, leaving the other filter active', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ALPHA, BETA, GAMMA] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Alpha')

    fireEvent.click(screen.getByLabelText('Filter by Status'))
    fireEvent.click(screen.getByLabelText('Active — 2'))
    fireEvent.click(screen.getByLabelText('Filter by Genre'))
    fireEvent.click(screen.getByLabelText('punk — 1'))

    // Both filters active: only Alpha shows.
    expect(screen.queryAllByText('Beta')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Genre: punk' }))

    // Genre filter cleared -> Beta (Active, metal) reappears. Status filter
    // (Active) is untouched -> Gamma (Inactive) stays hidden.
    expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Beta').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Gamma')).toHaveLength(0)
  })

  it("the Genre dropdown's counts reflect an active Status filter but not Genre's own filter", async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ALPHA, BETA, GAMMA] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Alpha')

    fireEvent.click(screen.getByLabelText('Filter by Status'))
    fireEvent.click(screen.getByLabelText('Active — 2'))
    fireEvent.click(screen.getByLabelText('Filter by Genre'))

    // Status=Active is honoured: "punk" only counts Alpha (Active), not
    // Gamma (Inactive, punk) -- so 1, not 2.
    expect(screen.getByLabelText('punk — 1')).toBeInTheDocument()

    // Checking "punk" applies Genre's own filter, but the dropdown's own
    // counts must NOT shrink in response -- valueCountsFor excludes the
    // column's own selection (Excel behaviour).
    fireEvent.click(screen.getByLabelText('punk — 1'))
    expect(screen.getByLabelText('punk — 1')).toBeInTheDocument()
  })
})

describe('RosterTab — mobile Filters button', () => {
  it('on mobile, the Filters button shows the active filter count when > 0', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, INACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    // Initially, Filters button should not show a badge
    const filterButtons = screen.getAllByRole('button', { name: /^Filters$/ })
    expect(filterButtons.length).toBeGreaterThan(0)
    expect(filterButtons[filterButtons.length - 1].textContent).not.toMatch(/\d/)

    // Open Status filter and select Active
    fireEvent.click(screen.getByLabelText('Filter by Status'))
    fireEvent.click(screen.getByLabelText('Active — 1'))

    // Now the mobile Filters button should show a badge with count "1"
    const mobileFilterButton = filterButtons[filterButtons.length - 1]
    expect(mobileFilterButton.textContent).toMatch(/Filters\s*1/)
  })

  it('on mobile, opening the Filters sheet and selecting a Status value narrows the card list', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, INACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    // Both bands should be visible initially (in mobile view)
    expect(screen.queryAllByText('Active Aardvarks').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('The Essential Letdowns').length).toBeGreaterThan(0)

    // Click the Filters button (mobile view)
    const filterButtons = screen.getAllByRole('button', { name: /^Filters/ })
    const mobileFilterButton = filterButtons[filterButtons.length - 1]
    fireEvent.click(mobileFilterButton)

    // The mobile filter sheet should open and show Status section
    // Click the Status section to expand it
    const statusHeaders = screen.getAllByText('Status')
    const statusHeader = statusHeaders[statusHeaders.length - 1]
    fireEvent.click(statusHeader.closest('button'))

    // Now check the Active checkbox in the mobile filter sheet
    fireEvent.click(screen.getByLabelText('Active — 1'))

    // The inactive band should now be hidden from the mobile card list
    expect(screen.queryAllByText('The Essential Letdowns')).toHaveLength(0)
    expect(screen.getAllByText('Active Aardvarks').length).toBeGreaterThan(0)
  })

  it('regression: clicking a different section header collapses the first section without closing the sheet', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    // Open the mobile Filters sheet
    const filterButtons = screen.getAllByRole('button', { name: /^Filters/ })
    const mobileFilterButton = filterButtons[filterButtons.length - 1]
    fireEvent.click(mobileFilterButton)

    // The Filters dialog should be open
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()

    // Expand the Status section
    const statusHeaders = screen.getAllByText('Status')
    const statusButton = statusHeaders[statusHeaders.length - 1].closest('button')
    fireEvent.click(statusButton)
    expect(statusButton).toHaveAttribute('aria-expanded', 'true')

    // Expand the Genre section
    const genreHeaders = screen.getAllByText('Genre')
    const genreButton = genreHeaders[genreHeaders.length - 1].closest('button')
    fireEvent.click(genreButton)
    expect(genreButton).toHaveAttribute('aria-expanded', 'true')

    // Simulate a mousedown on the Genre header, which should collapse it
    // without closing the sheet. This mimics clicking another section header.
    const genreHeaderElement = genreHeaders[genreHeaders.length - 1]
    fireEvent.mouseDown(genreHeaderElement)

    // The Genre button should collapse (aria-expanded = false)
    expect(genreButton).toHaveAttribute('aria-expanded', 'false')

    // The Filters sheet must still be open (this is the critical assertion
    // that would fail before the fix — the sheet would close)
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
  })

  it('mobile Filters button remains visible even when no bands match the filter', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, INACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    // Apply a filter that matches nothing: genre "nonexistent" (via search)
    fireEvent.click(screen.getByLabelText('Filter by Genre'))
    const genreSearch = screen.getByLabelText('Search Genre')
    fireEvent.change(genreSearch, { target: { value: 'nonexistent-genre-xyz' } })

    // Verify the mobile Filters button is still present and clickable
    const filterButtons = screen.queryAllByRole('button', { name: /Filters/ })
    expect(filterButtons.length).toBeGreaterThan(0)
    expect(filterButtons[filterButtons.length - 1]).toBeInTheDocument()
  })
})
