import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

    // Native <button> Enter/Space activation is a browser behaviour jsdom does
    // not fully simulate. fireEvent.click() directly exercises the DOM event
    // that a real keyboard activation would trigger (not the full browser
    // keystroke handling), which is sufficient to verify the handler is
    // reachable and works. The focus() check above ensures the element can
    // receive keyboard focus as required for keyboard-only users.
    fireEvent.click(linksButton)

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Zeroed Zebras')
    expect(rows[1]).toHaveTextContent('Instagrammed Iguanas')
    expect(linksHeader).toHaveAttribute('aria-sort', 'ascending')
  })
})

// #710 — Next event / Past event columns let the roster be filtered down to
// "who's missing data for THIS upcoming event" instead of a hand-written D1
// query. next_event_name/last_event_name come from functions/api/admin/bands.js.
const BAND_UPCOMING = {
  id: 'profile_10',
  band_profile_id: 10,
  name: 'Upcoming Act',
  genre: 'rock',
  origin_city: 'Waterloo',
  origin_region: 'ON',
  is_active: 1,
  follower_count: 0,
  social_links: '{}',
  next_event_name: 'Buddies Fest 2',
  next_event_date: '2026-08-07',
  last_event_name: null,
  last_event_date: null,
}

const BAND_WITH_HISTORY_ONLY = {
  id: 'profile_11',
  band_profile_id: 11,
  name: 'Bygone Band',
  genre: 'jazz',
  origin_city: 'Kitchener',
  origin_region: 'ON',
  is_active: 1,
  follower_count: 0,
  social_links: '{}',
  next_event_name: null,
  next_event_date: null,
  last_event_name: 'Vol. 16',
  last_event_date: '2025-08-02',
}

describe('RosterTab — Next event / Past event columns (#710)', () => {
  it('renders the Next event and Past event column headers and values', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_UPCOMING, BAND_WITH_HISTORY_ONLY] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Upcoming Act')

    expect(screen.getAllByRole('columnheader', { name: /^Next event/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('columnheader', { name: /^Past event/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Buddies Fest 2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Vol. 16').length).toBeGreaterThan(0)
  })

  it('filters to a specific Next event via the column dropdown', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_UPCOMING, BAND_WITH_HISTORY_ONLY] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Upcoming Act')

    fireEvent.click(screen.getByLabelText('Filter by Next event'))
    fireEvent.click(screen.getByLabelText('Buddies Fest 2 — 1'))

    expect(screen.getAllByText('Upcoming Act').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Bygone Band')).toHaveLength(0)
  })

  it('an artist with no upcoming booking falls into (Blanks) under Next event', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_UPCOMING, BAND_WITH_HISTORY_ONLY] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Upcoming Act')

    fireEvent.click(screen.getByLabelText('Filter by Next event'))
    fireEvent.click(screen.getByLabelText('(Blanks) — 1'))

    expect(screen.getAllByText('Bygone Band').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Upcoming Act')).toHaveLength(0)
  })

  // Names are deliberately the OPPOSITE alphabetical order from their
  // next_event_name -- same anti-coincidence trick as ZERO_LINKS_BAND above.
  // Name-ascending (the default sort) gives [Alpha Booking, Zeta Booking];
  // next_event-ascending must give the reverse, [Zeta Booking, Alpha
  // Booking], since "Aaa Fest" < "Zzz Fest". A generic `a['next_event']`
  // fallback (undefined for every row) would leave the name-ascending order
  // untouched, so this only passes if the dedicated comparator runs.
  const BAND_NEXT_EVENT_ZZZ = {
    id: 'profile_30',
    band_profile_id: 30,
    name: 'Alpha Booking',
    genre: 'rock',
    origin_city: 'Waterloo',
    origin_region: 'ON',
    is_active: 1,
    follower_count: 0,
    social_links: '{}',
    next_event_name: 'Zzz Fest',
    last_event_name: null,
  }
  const BAND_NEXT_EVENT_AAA = {
    id: 'profile_31',
    band_profile_id: 31,
    name: 'Zeta Booking',
    genre: 'rock',
    origin_city: 'Waterloo',
    origin_region: 'ON',
    is_active: 1,
    follower_count: 0,
    social_links: '{}',
    next_event_name: 'Aaa Fest',
    last_event_name: null,
  }

  it('sorts by Next event, alphabetically, and reverses on a second click', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_NEXT_EVENT_ZZZ, BAND_NEXT_EVENT_AAA] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Alpha Booking')

    const nextEventButton = screen.getByRole('button', { name: /^Next event/ })

    fireEvent.click(nextEventButton)
    let rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Zeta Booking') // "Aaa Fest"
    expect(rows[1]).toHaveTextContent('Alpha Booking') // "Zzz Fest"

    fireEvent.click(nextEventButton)
    rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Alpha Booking')
    expect(rows[1]).toHaveTextContent('Zeta Booking')
  })

  // Same anti-coincidence naming trick, this time on last_event_name.
  const BAND_LAST_EVENT_ZZZ = {
    id: 'profile_32',
    band_profile_id: 32,
    name: 'Alpha History',
    genre: 'rock',
    origin_city: 'Waterloo',
    origin_region: 'ON',
    is_active: 1,
    follower_count: 0,
    social_links: '{}',
    next_event_name: null,
    last_event_name: 'Zzz Fest',
  }
  const BAND_LAST_EVENT_AAA = {
    id: 'profile_33',
    band_profile_id: 33,
    name: 'Zeta History',
    genre: 'rock',
    origin_city: 'Waterloo',
    origin_region: 'ON',
    is_active: 1,
    follower_count: 0,
    social_links: '{}',
    next_event_name: null,
    last_event_name: 'Aaa Fest',
  }

  it('sorts by Past event, alphabetically, and reverses on a second click', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_LAST_EVENT_ZZZ, BAND_LAST_EVENT_AAA] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Alpha History')

    const pastEventButton = screen.getByRole('button', { name: /^Past event/ })

    fireEvent.click(pastEventButton)
    let rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Zeta History') // "Aaa Fest"
    expect(rows[1]).toHaveTextContent('Alpha History') // "Zzz Fest"

    fireEvent.click(pastEventButton)
    rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Alpha History')
    expect(rows[1]).toHaveTextContent('Zeta History')
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
    expect(screen.getByLabelText('metal — 1')).toBeInTheDocument()

    // Checking "punk" applies Genre's own filter, but the dropdown's own
    // counts must NOT shrink in response -- valueCountsFor excludes the
    // column's own selection (Excel behaviour).
    //
    // `metal` is the assertion that discriminates: a correct implementation
    // leaves it listed, while one that folded Genre's own filter into the
    // count would scope to {Alpha} and drop it entirely. `punk` survives
    // either way, so asserting on it alone cannot tell the two apart.
    fireEvent.click(screen.getByLabelText('punk — 1'))
    expect(screen.getByLabelText('punk — 1')).toBeChecked()
    expect(screen.getByLabelText('metal — 1')).toBeInTheDocument()
  })
})

describe('RosterTab — bulk actions scope to visible rows (#711)', () => {
  const BAND_A = {
    id: 'profile_20',
    band_profile_id: 20,
    name: 'Band A',
    genre: 'rock',
    origin_city: 'Waterloo',
    origin_region: 'ON',
    is_active: 1,
    follower_count: 0,
    social_links: '{}', // no links
  }
  const BAND_B = {
    id: 'profile_21',
    band_profile_id: 21,
    name: 'Band B',
    genre: 'rock',
    origin_city: 'Waterloo',
    origin_region: 'ON',
    is_active: 1,
    follower_count: 0,
    social_links: JSON.stringify({ instagram: '@bandB' }),
  }
  const BAND_C = {
    id: 'profile_22',
    band_profile_id: 22,
    name: 'Band C',
    genre: 'rock',
    origin_city: 'Waterloo',
    origin_region: 'ON',
    is_active: 1,
    follower_count: 0,
    social_links: '{}', // no links
  }

  it('Finding 1: bulk bar NOT visible when effectiveSelectedIds is empty (search hides all)', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_A, BAND_B, BAND_C] })
    const showToast = vi.fn()
    render(<RosterTab showToast={showToast} />)
    await screen.findAllByText('Band A')

    // Select Band A only
    const headerRow = screen.getAllByRole('row')[0]
    const selectAllCheckbox = headerRow.querySelector('input[type="checkbox"]')
    fireEvent.click(selectAllCheckbox) // Select all
    fireEvent.click(selectAllCheckbox) // Deselect all
    // Now manually select just A
    const rows = screen.getAllByRole('row')
    const aCheckbox = rows.find(r => r.textContent.includes('Band A'))?.querySelector('input[type="checkbox"]')
    fireEvent.click(aCheckbox)
    expect(screen.getAllByText(/1 selected/)).toBeDefined()

    // Now search for "Band B" which will hide Band A
    // effectiveSelectedIds = {A} ∩ {B} = {} (empty!)
    const searchInput = screen.getByPlaceholderText('Search name, origin, genre')
    fireEvent.change(searchInput, { target: { value: 'Band B' } })

    // The bulk bar should NOT be visible because effectiveSelectedIds.size === 0
    const bulkBar = screen.queryByText(/selected/)
    expect(bulkBar).toBeNull()
  })

  it('Finding 2: post-delete cleanup preserves non-deleted selections (only remove deleted ids)', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_A, BAND_B, BAND_C] })
    bandsApi.bulkDelete.mockResolvedValue({ success: true })
    const showToast = vi.fn()
    render(<RosterTab showToast={showToast} />)
    await screen.findAllByText('Band A')

    // Select all 3 bands
    const headerRow = screen.getAllByRole('row')[0]
    const selectAllCheckbox = headerRow.querySelector('input[type="checkbox"]')
    fireEvent.click(selectAllCheckbox)
    expect(screen.getAllByText(/3 selected/)).toBeDefined()

    // Filter to "No links at all" → keeps A and C visible, hides B
    // Now: 2 selected visible (A, C), 1 selected hidden (B)
    fireEvent.click(screen.getByLabelText('Filter by Links'))
    fireEvent.click(screen.getByLabelText('No links at all — 2 artists'))
    expect(screen.getByText(/2 selected/)).toBeInTheDocument()
    expect(screen.getByText(/1 hidden/)).toBeInTheDocument()

    // Delete the 2 visible (A and C)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const selectEl = screen.getByRole('combobox')
    fireEvent.change(selectEl, { target: { value: 'delete' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    confirmSpy.mockRestore()

    // Wait for the delete API call to complete (signaled by the success toast)
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Deleted 2 artists', 'success')
    })

    // Clear the filter to reveal all bands again
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Links: No links at all' }))

    // With the correct fix: B (the hidden one when we deleted) should still be selected
    // With the bug: nothing is selected (setSelectedIds(new Set()) wipes everything)
    const bCheckboxAfter = screen
      .getAllByRole('row')
      .find(r => r.textContent.includes('Band B'))
      ?.querySelector('input[type="checkbox"]')
    expect(bCheckboxAfter).toBeChecked() // B should still be selected

    // Verify deleted ids are gone: bulk bar shows exactly "1 selected" with no "hidden" text
    const bulkBar = screen.getByText(/selected/)
    expect(bulkBar.textContent).toMatch(/1 selected/)
    expect(bulkBar.textContent).not.toContain('hidden')
  })

  it('Finding 1 case 1: select-all under filter adds visible rows to hidden selections (union not replace)', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_A, BAND_B, BAND_C] })
    const showToast = vi.fn()
    render(<RosterTab showToast={showToast} />)
    await screen.findAllByText('Band A')

    // Select Band B only (the one WITH Instagram link)
    const rows = screen.getAllByRole('row')
    const bCheckbox = rows.find(r => r.textContent.includes('Band B'))?.querySelector('input[type="checkbox"]')
    fireEvent.click(bCheckbox)
    expect(screen.getByText(/1 selected/)).toBeInTheDocument()

    // Apply "No links" filter → hides Band B, shows A and C
    // selectedIds = {B}, visible = {A, C}, hidden = {B}
    // Bulk bar disappears (no visible rows selected)
    fireEvent.click(screen.getByLabelText('Filter by Links'))
    fireEvent.click(screen.getByLabelText('No links at all — 2 artists'))
    // Bulk bar is hidden now because effectiveSelectedIds.size = 0
    expect(screen.queryByText(/selected/)).toBeNull()

    // Click select-all checkbox while filter is active
    // Should add visible ids (A, C) to existing selection (B) → {A, B, C}
    // Bulk bar reappears with "2 selected · 1 hidden"
    const headerRow = screen.getAllByRole('row')[0]
    const selectAllCheckbox = headerRow.querySelector('input[type="checkbox"]')
    fireEvent.click(selectAllCheckbox)
    expect(screen.getByText(/2 selected/)).toBeInTheDocument()
    expect(screen.getByText(/1 hidden/)).toBeInTheDocument()

    // Clear the filter to verify all 3 are truly selected
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Links: No links at all' }))
    const bulkBar = screen.getByText(/selected/)
    expect(bulkBar.textContent).toMatch(/3 selected/)
    expect(bulkBar.textContent).not.toContain('hidden')
  })

  it('Finding 1 case 2: deselect-all under filter removes only visible rows from selection', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_A, BAND_B, BAND_C] })
    const showToast = vi.fn()
    render(<RosterTab showToast={showToast} />)
    await screen.findAllByText('Band A')

    // Select all 3 initially
    const headerRow = screen.getAllByRole('row')[0]
    const selectAllCheckbox = headerRow.querySelector('input[type="checkbox"]')
    fireEvent.click(selectAllCheckbox)
    expect(screen.getAllByText(/3 selected/)).toBeDefined()

    // Apply "No links" filter → hides Band B (has Instagram), shows A and C
    // Now: selectedIds = {A, B, C}, visible = {A, C}, hidden = {B}
    fireEvent.click(screen.getByLabelText('Filter by Links'))
    fireEvent.click(screen.getByLabelText('No links at all — 2 artists'))
    expect(screen.getByText(/2 selected/)).toBeInTheDocument()
    expect(screen.getByText(/1 hidden/)).toBeInTheDocument()

    // Click select-all (which acts as deselect-all when all visible are selected)
    // Should remove visible ids (A, C) from selection, leaving only hidden {B}
    // After this, effectiveSelectedIds = {} (no visible selected), so bulk bar disappears
    fireEvent.click(selectAllCheckbox)
    // Bulk bar is now gone because no visible rows are selected (only hidden B)
    expect(screen.queryByText(/selected/)).toBeNull()

    // Clear the filter to verify only B remains selected
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Links: No links at all' }))
    const bulkBar = screen.getByText(/selected/)
    expect(bulkBar.textContent).toMatch(/1 selected/)
    expect(bulkBar.textContent).not.toContain('hidden')
  })

  it('select-all, then apply filter that hides some rows → bulk delete operates on visible rows only', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_A, BAND_B, BAND_C] })
    bandsApi.bulkDelete.mockResolvedValue({ success: true })
    const showToast = vi.fn()
    render(<RosterTab showToast={showToast} />)
    await screen.findAllByText('Band A')

    // Select all 3 bands (no filter)
    const selectAllCheckbox = screen
      .getAllByRole('checkbox')
      .find(cb => cb.closest('tr') === screen.getAllByRole('row')[0])
    fireEvent.click(selectAllCheckbox)
    expect(screen.getAllByText(/3 selected/)).toBeDefined()

    // Apply Links filter: "No links at all" → hides BAND_B (has Instagram)
    fireEvent.click(screen.getByLabelText('Filter by Links'))
    fireEvent.click(screen.getByLabelText('No links at all — 2 artists'))

    // Table narrows to Band A and Band C
    expect(screen.getAllByText('Band A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Band C').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Band B')).toHaveLength(0)

    // Spy on window.confirm FIRST, before triggering the action
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    // Select Delete action from the dropdown
    const selectEl = screen.getByRole('combobox')
    fireEvent.change(selectEl, { target: { value: 'delete' } })

    // Click Apply button
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    // Confirm was called with visible count (2), not total (3)
    expect(confirmSpy).toHaveBeenCalledWith('Delete 2 artists?')
    confirmSpy.mockRestore()

    // bulkDelete was called with only the visible ids (A and C), not B
    expect(bandsApi.bulkDelete).toHaveBeenCalledWith(['profile_20', 'profile_22'])
  })

  it('single-row delete removes the id from selectedIds, not leaving a ghost', async () => {
    // This test verifies Finding 1: when a single row is deleted via Delete button,
    // the deleted id is removed from selectedIds, preventing "hidden by filters" ghost counts.
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_A, BAND_B, BAND_C] })
    const showToast = vi.fn()
    render(<RosterTab showToast={showToast} />)
    await screen.findAllByText('Band A')

    // Select all 3 bands: selectedIds = {A, B, C}
    const headerRow = screen.getAllByRole('row')[0]
    const selectAllCheckbox = headerRow.querySelector('input[type="checkbox"]')
    fireEvent.click(selectAllCheckbox)
    expect(screen.getAllByText(/3 selected/)).toBeDefined()

    // Use search to hide Bands B and C, leaving only A visible
    const searchInput = screen.getByPlaceholderText('Search name, origin, genre')
    fireEvent.change(searchInput, { target: { value: 'Band A' } })
    await screen.findAllByText('Band A')

    // Now: selectedIds = {A, B, C}, visible = {A}, hidden = {B, C}
    expect(screen.getByText(/2 hidden/)).toBeInTheDocument()

    // Delete the visible Band A
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const aRow = screen.getAllByRole('row').find(r => r.textContent.includes('Band A'))
    const deleteBtn = aRow?.querySelector('button:last-child')
    fireEvent.click(deleteBtn)
    confirmSpy.mockRestore()

    // Wait for delete to complete
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Artist deleted', 'success')
    })

    // Clear search to reveal remaining bands
    fireEvent.change(searchInput, { target: { value: '' } })
    await screen.findAllByText('Band B')

    // With the fix: selectedIds should now be {B, C} (A removed), showing "2 selected, 0 hidden"
    // Without the fix: selectedIds would still be {A, B, C}, showing "2 selected, 1 hidden"
    const bulkBar = screen.getByText(/selected/)
    expect(bulkBar.textContent).not.toContain('hidden')
    expect(bulkBar.textContent).toMatch(/2 selected/)
  })

  it('bulk bar shows "hidden by filters" text when some selections are filtered out', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_A, BAND_B, BAND_C] })
    const showToast = vi.fn()
    render(<RosterTab showToast={showToast} />)
    await screen.findAllByText('Band A')

    // Select all 3
    const selectAllCheckbox = screen
      .getAllByRole('checkbox')
      .find(cb => cb.closest('tr') === screen.getAllByRole('row')[0])
    fireEvent.click(selectAllCheckbox)

    // Apply filter that hides 1 row
    fireEvent.click(screen.getByLabelText('Filter by Links'))
    fireEvent.click(screen.getByLabelText('No links at all — 2 artists'))

    // Bulk bar should show "2 selected · 1 hidden by filters"
    // or at least indicate that some are hidden
    const bulkBar = screen.getByText(/selected/)
    expect(bulkBar.textContent).toMatch(/2/)
    expect(bulkBar.textContent).toMatch(/hidden/)
  })

  it('clearing a filter restores the full selection', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [BAND_A, BAND_B, BAND_C] })
    const showToast = vi.fn()
    render(<RosterTab showToast={showToast} />)
    await screen.findAllByText('Band A')

    // Select all 3
    const selectAllCheckbox = screen
      .getAllByRole('checkbox')
      .find(cb => cb.closest('tr') === screen.getAllByRole('row')[0])
    fireEvent.click(selectAllCheckbox)

    // Apply filter
    fireEvent.click(screen.getByLabelText('Filter by Links'))
    fireEvent.click(screen.getByLabelText('No links at all — 2 artists'))

    // Bulk bar shows 2 selected (visible)
    let bulkBar = screen.getByText(/selected/)
    expect(bulkBar.textContent).toMatch(/2/)

    // Clear the filter by clicking the chip
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Links: No links at all' }))

    // All 3 bands reappear
    expect(screen.getAllByText('Band A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Band B').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Band C').length).toBeGreaterThan(0)

    // Bulk bar now shows 3 selected
    bulkBar = screen.getByText(/selected/)
    expect(bulkBar.textContent).toMatch(/3/)
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

    // Produce a genuinely empty roster by searching for a name that matches
    // no bands. The search box (above the table) filters by name, origin, or
    // genre and produces an empty roster if nothing matches.
    const searchInput = screen.getByPlaceholderText('Search name, origin, genre')
    fireEvent.change(searchInput, { target: { value: 'nonexistent-band-xyz-999' } })

    // Assert the artist rows are gone
    expect(screen.queryAllByText('Active Aardvarks')).toHaveLength(0)
    expect(screen.queryAllByText('The Essential Letdowns')).toHaveLength(0)

    // Verify the mobile Filters button is still present and clickable
    const filterButtons = screen.queryAllByRole('button', { name: /Filters/ })
    expect(filterButtons.length).toBeGreaterThan(0)
    const mobileButton = filterButtons[filterButtons.length - 1]
    expect(mobileButton).toBeInTheDocument()
    fireEvent.click(mobileButton)
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
  })

  it('mobile filter panel ids are distinct (section vs panel, no duplicates)', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, INACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()

    // Collect all ids in the mobile filter sheet
    const allElements = document.querySelectorAll('[id]')
    const ids = Array.from(allElements).map(el => el.id)

    // Assert no duplicates: Set size must equal array length
    expect(ids.length).toBe(new Set(ids).size)
  })
})

// #772 — the desktop table's intrinsic width exceeds the container, so it
// scrolls horizontally. Without pinning, scrolling right to reach Actions
// takes Name out of view -- a row with a live Delete button and no visible
// artist name. `getByRole('columnheader'/'row')` only matches the desktop
// <table> (the mobile branch is div-based with no table roles), so these
// selectors are unambiguous without the getAllBy*/queryAllBy* workaround
// the rest of this file needs.
describe('RosterTab — sticky identity + actions columns (#772)', () => {
  it('pins the Name header to the right of the checkbox column (left-12) and Actions to the right edge', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND, INACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    const nameHeader = screen.getByRole('columnheader', { name: /^Name/ })
    expect(nameHeader.className).toMatch(/\bsticky\b/)
    expect(nameHeader.className).toMatch(/\bleft-12\b/)
    expect(nameHeader.className).not.toMatch(/\bleft-0\b/)

    const actionsHeader = screen.getByRole('columnheader', { name: 'Actions' })
    expect(actionsHeader.className).toMatch(/\bsticky\b/)
    expect(actionsHeader.className).toMatch(/\bright-0\b/)
  })

  it('readOnly: Name sticks to the left edge (left-0) since there is no checkbox column, and Actions is absent', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} readOnly />)
    await screen.findAllByText('Active Aardvarks')

    // No checkbox column in read-only mode -- Name is the first column.
    const headerRow = screen.getAllByRole('row')[0]
    expect(headerRow.querySelector('input[type="checkbox"]')).toBeNull()

    const nameHeader = screen.getByRole('columnheader', { name: /^Name/ })
    expect(nameHeader.className).toMatch(/\bsticky\b/)
    expect(nameHeader.className).toMatch(/\bleft-0\b/)
    expect(nameHeader.className).not.toMatch(/\bleft-12\b/)

    // Actions only renders when !readOnly.
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull()
  })

  it('gives the body Name cell a sticky, opaque background so the artist stays identifiable while scrolled', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    // The mobile card list renders a same-named link too -- narrow to the
    // one living inside a <td> (the desktop table).
    const nameLink = screen
      .getAllByRole('link', { name: 'Active Aardvarks' })
      .map(el => el.closest('td'))
      .find(Boolean)
    expect(nameLink).not.toBeNull()
    expect(nameLink.className).toMatch(/\bsticky\b/)
    expect(nameLink.className).toMatch(/\bleft-12\b/)
    expect(nameLink.className).toMatch(/\bbg-bg-purple\b/)
  })

  it('gives the body Actions cell a sticky right-0 position, and moves the flex layout off the <td> onto an inner wrapper', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    const editButton = screen
      .getAllByRole('button', { name: 'Edit' })
      .map(el => el.closest('td'))
      .find(Boolean)
    expect(editButton).not.toBeNull()
    expect(editButton.className).toMatch(/\bsticky\b/)
    expect(editButton.className).toMatch(/\bright-0\b/)
    // The <td> itself must NOT carry `flex` -- that was the bug (#772):
    // display:flex on a <td> drops it out of the table layout algorithm and
    // fights sticky positioning. The flex wrapper is an inner <div> instead.
    expect(editButton.className).not.toMatch(/(?:^|\s)flex(?:\s|$)/)
    expect(editButton.querySelector(':scope > div.flex')).not.toBeNull()
  })

  // Sticky cells are opaque (bg-bg-purple) so scrolled content can't show
  // through, which means the row's own translucent hover/selected
  // background-color can't just paint on the cell directly -- the fix
  // splits it onto a `before:` pseudo-element tint layer instead. This
  // proves the selected half of that split actually toggles per-row.
  it('the sticky Name cell carries the selected-tint class only once its row is selected', async () => {
    bandsApi.getAll.mockResolvedValue({ bands: [ACTIVE_BAND] })
    render(<RosterTab showToast={vi.fn()} />)
    await screen.findAllByText('Active Aardvarks')

    const getNameCell = () =>
      screen
        .getAllByRole('link', { name: 'Active Aardvarks' })
        .map(el => el.closest('td'))
        .find(Boolean)

    expect(getNameCell().className).not.toMatch(/before:bg-blue-900\/30/)

    const bodyRow = screen.getAllByRole('row').find(r => r.textContent.includes('Active Aardvarks'))
    fireEvent.click(bodyRow.querySelector('input[type="checkbox"]'))

    expect(getNameCell().className).toMatch(/before:bg-blue-900\/30/)
  })
})
