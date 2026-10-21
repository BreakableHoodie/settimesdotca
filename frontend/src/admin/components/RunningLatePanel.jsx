import { useCallback, useEffect, useRef, useState } from 'react'
import { eventsApi } from '../../utils/adminApi'

// "Venue running late" (#1249): one tap moves every remaining set at a venue
// and shows fans a banner. Built for a phone mid-show: presets, a custom
// amount (negative pulls sets back earlier), and "Back on time", which clears
// the banner and leaves the times alone. No confirm dialog on purpose: a
// mis-tap is undone with the opposite shift, faster than a modal.
const PRESETS = [10, 15, 30]

// The server's reason, made specific where it sent specifics.
function describeError(err) {
  const details = err?.details || {}
  if (details.code === 'SHIFT_CROSSES_FESTIVAL_DAY' && Array.isArray(details.sets) && details.sets.length > 0) {
    const names = details.sets.map(set => set.name || `set ${set.id}`).join(', ')
    return `${err.message} (${names})`
  }
  if (Array.isArray(details.conflicts) && details.conflicts.length > 0) {
    const { a, b } = details.conflicts[0]
    return `Not moved: ${a?.name ?? 'a set'} would overlap ${b?.name ?? 'another set'}. Nothing was changed.`
  }
  return err?.message || 'Could not update the venue.'
}

export default function RunningLatePanel({ eventId, readOnly = false, showToast, onShifted }) {
  const [delays, setDelays] = useState([])
  // Venues with a request in flight. A SET, not one id: tapping B while A is
  // in flight must not let A's reply re-enable B, or a second tap on B shifts
  // it twice (the endpoint is deliberately not idempotent).
  const [pendingVenueIds, setPendingVenueIds] = useState(() => new Set())
  const markPending = (venueId, pending) =>
    setPendingVenueIds(current => {
      const next = new Set(current)
      if (pending) next.add(venueId)
      else next.delete(venueId)
      return next
    })
  const [custom, setCustom] = useState({})
  // The admin panel switches events without unmounting the lineup, so a reply
  // for event A can land after B is selected. Every await re-checks the event
  // before touching state, as LineupTab's loadData does; otherwise A's venues
  // would show under B and the next tap would post A's venue ids against B.
  const currentEventRef = useRef(eventId)
  // Declared before the load effect, so it runs first on an event switch.
  useEffect(() => {
    currentEventRef.current = eventId
  }, [eventId])
  const isStale = forEventId => currentEventRef.current !== forEventId

  const load = useCallback(async () => {
    if (!eventId) return
    try {
      const res = await eventsApi.getVenueDelays(eventId)
      if (isStale(eventId)) return
      setDelays(res.delays || [])
    } catch (err) {
      if (isStale(eventId)) return
      showToast?.(`Could not load running-late status: ${err.message}`, 'error')
    }
  }, [eventId, showToast])

  useEffect(() => {
    setDelays([])
    setPendingVenueIds(new Set())
    setCustom({})
    load()
  }, [load])

  const setMinutes = (venueId, minutes) =>
    setDelays(current => current.map(row => (row.venueId === venueId ? { ...row, minutes } : row)))

  const shift = async (row, minutes) => {
    const forEventId = eventId
    markPending(row.venueId, true)
    try {
      const res = await eventsApi.shiftVenue(forEventId, row.venueId, minutes)
      if (isStale(forEventId)) return
      setMinutes(row.venueId, res.delayMinutes)
      const moved = res.shifted?.length ?? 0
      showToast?.(
        `${row.venue}: ${moved} set${moved === 1 ? '' : 's'} moved ${minutes > 0 ? 'later' : 'earlier'} by ${Math.abs(minutes)} min.`,
        'success'
      )
      setCustom(current => ({ ...current, [row.venueId]: '' }))
      await onShifted?.()
    } catch (err) {
      if (!isStale(forEventId)) showToast?.(describeError(err), 'error')
    } finally {
      if (!isStale(forEventId)) markPending(row.venueId, false)
    }
  }

  const clear = async row => {
    const forEventId = eventId
    markPending(row.venueId, true)
    try {
      await eventsApi.clearVenueDelay(forEventId, row.venueId)
      if (isStale(forEventId)) return
      setMinutes(row.venueId, 0)
      showToast?.(`${row.venue} is back on time. Set times were left as they are.`, 'success')
    } catch (err) {
      if (!isStale(forEventId)) showToast?.(describeError(err), 'error')
    } finally {
      if (!isStale(forEventId)) markPending(row.venueId, false)
    }
  }

  if (delays.length === 0) return null

  return (
    <section aria-labelledby="running-late-heading" className="mb-6 rounded-lg border border-white/10 bg-white/5 p-4">
      <h3 id="running-late-heading" className="text-base font-semibold text-white">
        Running late?
      </h3>
      <p className="mb-3 text-sm text-white/70">
        Moves every set at the venue that has not started yet, and tells fans on the event page.
      </p>
      <ul className="space-y-3">
        {delays.map(row => {
          const busy = pendingVenueIds.has(row.venueId)
          const customValue = custom[row.venueId] ?? ''
          const customMinutes = Number(customValue)
          const customValid = customValue !== '' && Number.isInteger(customMinutes) && customMinutes !== 0
          return (
            <li key={row.venueId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-medium text-white">{row.venue}</span>{' '}
                <span className={row.minutes > 0 ? 'text-amber-300' : 'text-white/60'}>
                  {row.minutes > 0 ? `running about ${row.minutes} min late` : 'on time'}
                </span>
              </div>
              {!readOnly && (
                <div className="flex flex-wrap items-center gap-2">
                  {PRESETS.map(minutes => (
                    <button
                      key={minutes}
                      type="button"
                      disabled={busy}
                      onClick={() => shift(row, minutes)}
                      aria-label={`+${minutes} minutes later: ${row.venue}`}
                      className="min-h-[44px] rounded bg-amber-500/20 px-3 text-sm font-semibold text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
                    >
                      +{minutes}
                    </button>
                  ))}
                  <label className="sr-only" htmlFor={`late-custom-${row.venueId}`}>
                    {`${row.venue}: custom minutes (negative moves sets earlier)`}
                  </label>
                  <input
                    id={`late-custom-${row.venueId}`}
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="-180"
                    max="180"
                    value={customValue}
                    onChange={event => setCustom(current => ({ ...current, [row.venueId]: event.target.value }))}
                    placeholder="± min"
                    className="min-h-[44px] w-20 rounded border border-white/20 bg-transparent px-2 text-sm text-white"
                  />
                  <button
                    type="button"
                    disabled={busy || !customValid}
                    onClick={() => shift(row, customMinutes)}
                    className="min-h-[44px] rounded bg-white/10 px-3 text-sm text-white hover:bg-white/20 disabled:opacity-50"
                  >
                    Shift
                  </button>
                  {row.minutes > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => clear(row)}
                      className="min-h-[44px] rounded px-3 text-sm text-white/80 underline hover:text-white disabled:opacity-50"
                    >
                      Back on time
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
