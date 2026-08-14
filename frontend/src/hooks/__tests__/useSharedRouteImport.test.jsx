import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSharedRouteImport } from '../useSharedRouteImport'

function makeParams(shareSlug) {
  const params = new URLSearchParams()
  if (shareSlug) params.set('share', shareSlug)
  return params
}

// band.id carries the performance id as its dash-suffixed segment, which is
// what the hook matches against the share snapshot's performance_ids.
const BAND_ONE = { id: 'band-profile-101', name: 'Band One' }
const BAND_TWO = { id: 'band-profile-102', name: 'Band Two' }

function makeFetchMock() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ performance_ids: [101], band_names: ['Band One'] }),
  })
}

describe('useSharedRouteImport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not fetch until bands are loaded', () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    const onShareData = vi.fn()
    const setSearchParams = vi.fn()

    renderHook(props => useSharedRouteImport(props), {
      initialProps: { searchParams: makeParams('abc123'), setSearchParams, bands: [], onShareData },
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(onShareData).not.toHaveBeenCalled()
  })

  // The exact re-fire the guard exists to stop (#765): the share-param removal
  // is an async setSearchParams, so a second `bands` update that lands before
  // it commits re-runs the effect with the slug STILL present. setSearchParams
  // is deliberately a no-op here to model that window — with the param removed
  // between renders, no second run is possible even without the guard, and the
  // test would prove nothing.
  it('imports the same shared slug at most once, even if bands update again before the param removal commits', async () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    const onShareData = vi.fn()
    const setSearchParams = vi.fn()
    const params = makeParams('abc123')

    const { rerender } = renderHook(props => useSharedRouteImport(props), {
      initialProps: { searchParams: params, setSearchParams, bands: [], onShareData },
    })

    // bands arrive — the first legitimate run
    rerender({ searchParams: params, setSearchParams, bands: [BAND_ONE], onShareData })
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/schedule/share/abc123?import=1')
    expect(onShareData).toHaveBeenCalledTimes(1)
    expect(onShareData).toHaveBeenCalledWith({ matchedIds: ['band-profile-101'], matchedNames: ['Band One'] })

    // a second bands update before the removal commits — must NOT re-fire
    rerender({ searchParams: params, setSearchParams, bands: [BAND_ONE, BAND_TWO], onShareData })
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onShareData).toHaveBeenCalledTimes(1)
  })

  it('imports a different slug in the same session (the claim does not latch permanently)', async () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    const onShareData = vi.fn()
    const setSearchParams = vi.fn()

    const { rerender } = renderHook(props => useSharedRouteImport(props), {
      initialProps: { searchParams: makeParams('abc123'), setSearchParams, bands: [BAND_ONE], onShareData },
    })
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // a different shared link arrives in the same session
    rerender({ searchParams: makeParams('def456'), setSearchParams, bands: [BAND_ONE], onShareData })
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/schedule/share/def456?import=1')
    expect(onShareData).toHaveBeenCalledTimes(2)
  })

  it('removes the share param via setSearchParams after claiming the slug', async () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    const onShareData = vi.fn()
    const setSearchParams = vi.fn(updater => updater)

    renderHook(props => useSharedRouteImport(props), {
      initialProps: {
        searchParams: makeParams('abc123'),
        setSearchParams,
        bands: [BAND_ONE],
        onShareData,
      },
    })
    await act(async () => {})

    expect(setSearchParams).toHaveBeenCalledTimes(1)
    const [updater, options] = setSearchParams.mock.calls[0]
    expect(options).toEqual({ replace: true })
    const next = updater(new URLSearchParams('?share=abc123&keep=1'))
    expect(next.get('share')).toBeNull()
    expect(next.get('keep')).toBe('1')
  })
})

// #765 follow-up — the claim was a single ref holding only the most recent
// slug, so A -> B -> A re-imported A once B had overwritten it. That
// double-counts share_links.import_count for the funnel step this hook exists
// to count once, and it is reachable: a fan can open two shared routes and
// navigate back to the first. A Set keeps every slug claimed for the hook's
// lifetime.
describe('useSharedRouteImport — returning to an earlier slug', () => {
  it('does not re-import slug A after slug B (A -> B -> A)', async () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    const onShareData = vi.fn()
    const setSearchParams = vi.fn()
    const bands = [BAND_ONE, BAND_TWO]

    const { rerender } = renderHook(props => useSharedRouteImport(props), {
      initialProps: { searchParams: makeParams('slug-a'), setSearchParams, bands, onShareData },
    })
    await act(async () => {})

    await act(async () => {
      rerender({ searchParams: makeParams('slug-b'), setSearchParams, bands, onShareData })
    })

    await act(async () => {
      rerender({ searchParams: makeParams('slug-a'), setSearchParams, bands, onShareData })
    })

    const importedSlugs = fetchMock.mock.calls.map(([url]) => url)
    expect(importedSlugs).toHaveLength(2)
    expect(importedSlugs.filter(u => u.includes('slug-a'))).toHaveLength(1)
    expect(importedSlugs.filter(u => u.includes('slug-b'))).toHaveLength(1)
  })
})
