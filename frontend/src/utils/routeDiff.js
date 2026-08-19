/**
 * Compare a fan's own route against a shared one (#730).
 *
 * The shared-route dialog used to show only incoming-centric counts
 * ("incoming / already yours / new to add"), which never answered the question
 * fans actually ask on a crawl night: what do we have in common, and what do I
 * give up by taking yours? `lose` is the half that was missing — it only
 * materialises under Replace, since Merge is purely additive.
 *
 * Ids only. Resolving them to bands, sorting them into schedule order (which
 * must go through `prepareBands`, so after-midnight sets land last) and
 * rendering them is the caller's job — keeping this pure is what makes the set
 * logic testable without mounting anything.
 */
export function diffRoutes(mineIds, theirsIds) {
  const mine = Array.isArray(mineIds) ? mineIds : []
  const theirs = Array.isArray(theirsIds) ? theirsIds : []

  const mineSet = new Set(mine)
  const theirsSet = new Set(theirs)

  // Deduplicate while preserving each source's own order: the caller re-sorts
  // by schedule position, and imposing an order here would silently reorder
  // sets for any caller that trusts these arrays as-is.
  const uniqueInOrder = (ids, keep) => {
    const seen = new Set()
    return ids.filter(id => {
      if (seen.has(id) || !keep(id)) return false
      seen.add(id)
      return true
    })
  }

  return {
    together: uniqueInOrder(theirs, id => mineSet.has(id)),
    gain: uniqueInOrder(theirs, id => !mineSet.has(id)),
    lose: uniqueInOrder(mine, id => !theirsSet.has(id)),
  }
}

/**
 * `diffRoutes`, with the ids resolved to band objects and ordered for display.
 *
 * Sorting is on `startMs`, which `prepareBands` has already offset by a day for
 * sets starting before 06:00 — so a 1 AM set lands at the end of the evening
 * where it belongs. Sorting on raw `startTime` here would float it to the top,
 * which is the recurring after-midnight bug class in CLAUDE.md.
 *
 * Ids with no matching band are dropped rather than rendered blank: a shared
 * route can name a performance that has since been deleted (#733).
 */
export function resolveRouteDiff(mineIds, theirsIds, bands) {
  const byId = new Map((Array.isArray(bands) ? bands : []).map(band => [band.id, band]))
  const resolve = ids =>
    ids
      .map(id => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.startMs - b.startMs)

  const diff = diffRoutes(mineIds, theirsIds)
  return {
    // Computed from the UNFILTERED diff, unlike the arrays below. A stored id
    // whose performance was since deleted resolves to no band, so it vanishes
    // from `lose` — and if it were the only difference, a check on the resolved
    // arrays would claim the routes are identical while Replace still drops it
    // from storage. The difference is invisible to the fan (a deleted set
    // renders nothing either way), but "identical" should mean identical
    // rather than happen to be true.
    hasRouteChanges: diff.gain.length > 0 || diff.lose.length > 0,
    together: resolve(diff.together),
    gain: resolve(diff.gain),
    lose: resolve(diff.lose),
  }
}
