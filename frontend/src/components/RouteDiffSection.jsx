import { formatTimeRange } from '../utils/timeFormat'

/**
 * One labelled band-list in the shared-route comparison (#730) — "Together",
 * "You'd add", "Only yours".
 *
 * Renders nothing when empty. A recipient with no route of their own has two
 * empty categories, and showing their headers would explain nothing while
 * implying something went missing.
 *
 * `bands` arrives already resolved and already sorted by the caller, which
 * orders on `startMs` so prepareBands' after-midnight offset is respected —
 * do not re-sort here on raw start times.
 */
function RouteDiffSection({ title, hint, bands, tone }) {
  if (!bands || bands.length === 0) return null

  return (
    <section className="rounded-lg border border-border bg-surface p-3">
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>
        {title} <span className="text-text-tertiary">({bands.length})</span>
      </h3>
      <p className="mt-0.5 text-xs text-text-tertiary">{hint}</p>
      <ul className="mt-2 space-y-1.5 list-none">
        {bands.map(band => {
          // A shared route can carry a set cancelled after it was sent. It stays
          // listed rather than dropped (#732) — a fan who sees it vanish learns
          // nothing, whereas a struck-through row tells them what changed.
          const isCancelled = Boolean(band.is_cancelled)
          return (
            // Stacked, not name-left/meta-right. A side-by-side row needs the
            // meta to shrink, and "8:00 PM - 8:45 PM · Waterloo Music Hall" does
            // not fit beside a band name at 390px — it pushed 57px past the
            // modal edge and clipped the venue. Matches how MySchedule stacks.
            <li key={band.id}>
              {/* The strike goes on the name alone. text-decoration inherits to
                  descendants and a child cannot cancel an ancestor's — nesting
                  the badge inside struck it through too, which `no-underline`
                  was powerless to undo. The wrapper keeps them on one line. */}
              <span className="block text-sm">
                <span className={isCancelled ? 'text-text-tertiary line-through' : 'text-text-primary'}>
                  {band.name}
                </span>
                {isCancelled && <span className="ml-2 text-[10px] font-semibold text-warning-500">Cancelled</span>}
              </span>
              <span className="block text-xs text-text-tertiary">
                {formatTimeRange(band.startTime, band.endTime)}
                {band.venue ? ` · ${band.venue}` : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default RouteDiffSection
