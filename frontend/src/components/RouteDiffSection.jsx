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
            <li key={band.id} className="flex items-baseline justify-between gap-3">
              <span className={`text-sm ${isCancelled ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                {band.name}
                {isCancelled && (
                  <span className="ml-2 text-[10px] font-semibold text-warning-500 no-underline">Cancelled</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-text-tertiary">
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
