import { useEffect, useRef } from 'react'

// Applies a shared route (?share=<slug>) exactly once per slug, in this order
// of events: claim the slug synchronously, remove the param, then refetch
// /api/schedule/share/:slug?import=1 and hand the matched bands to onShareData.
//
// The ?import=1 refetch counts an import server-side (share_links.import_count,
// #703), so firing it twice for one slug inflates the funnel. The param removal
// is an async setSearchParams, which cannot protect two effect runs that share
// the same pre-update closure — the claim must happen synchronously, before any
// async work. The claim is keyed on the slug so a DIFFERENT share link in the
// same session still imports (#765).
export function useSharedRouteImport({ searchParams, setSearchParams, bands, onShareData }) {
  const importedShareSlugRef = useRef(null)

  useEffect(() => {
    const shareSlug = searchParams.get('share')
    if (!shareSlug || bands.length === 0) return

    if (importedShareSlugRef.current === shareSlug) return
    importedShareSlugRef.current = shareSlug

    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        next.delete('share')
        return next
      },
      { replace: true }
    )

    fetch(`/api/schedule/share/${encodeURIComponent(shareSlug)}?import=1`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(data => {
        const matchedBands = bands.filter(band => {
          const parts = band.id.split('-')
          const perfId = Number(parts[parts.length - 1])
          return data.performance_ids.includes(perfId)
        })
        const matchedIds = matchedBands.map(band => band.id)
        const matchedNames = matchedBands.map(band => band.name || '')

        if (matchedIds.length === 0) return

        onShareData({ matchedIds, matchedNames })
      })
      .catch(err => {
        console.warn('[App] Failed to load share link', err)
      })
  }, [bands, searchParams, setSearchParams, onShareData])
}
