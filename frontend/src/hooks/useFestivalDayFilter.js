import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { resolveActiveFestivalDay } from '../utils/festivalDays'

/**
 * Sticky day-tab filter state for multi-day events (#542 PR-3): resolves
 * which festival day is active — `?day=N` URL param (1-indexed) > today's
 * festival day if the event is in progress > day 1, via
 * `resolveActiveFestivalDay` — and exposes a setter that updates the URL via
 * history *replace* (shareable at any time, but a run of tab clicks doesn't
 * spam the back-button stack with one stop per click).
 *
 * `days` must be the FULL ordered list of the event's festival days (e.g.
 * `orderedFestivalDays(fullEventBands)`) — not a possibly-partial subset.
 * `ScheduleView` and `MySchedule` both call this hook so a shared `?day=N`
 * keeps them showing the same day when the fan toggles between "Full
 * Lineup" and "My Route"; if `days` diverged between the two calls (e.g.
 * MySchedule deriving it from only the fan's *selected* bands) the same URL
 * would resolve to a different day number in each — hence
 * MySchedule accepts an authoritative `festivalDays` prop from the parent
 * instead of re-deriving it from its own possibly-partial `bands`.
 *
 * Single-day events (`days.length <= 1`) resolve to `isMultiDay: false` and
 * `activeDate: null` — callers must gate all day-tab UI and filtering on
 * `isMultiDay` and never render for a single day (repo invariant: no lone
 * "Day 1" label/selector).
 */
export function useFestivalDayFilter(days, { currentTime, startDate = null, endDate = null } = {}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const isMultiDay = days.length > 1
  const dayParam = searchParams.get('day')

  // Toronto-local "today" per CLAUDE.md convention — derived from the same
  // `currentTime`/`effectiveNow` prop the caller already uses for every
  // other "now" calculation (Now Playing, countdowns, debug-time override),
  // so the smart default reacts to the same clock QA already drives via
  // `?debugTime=`.
  const todayStr = useMemo(() => {
    const date = currentTime instanceof Date ? currentTime : new Date(currentTime)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-CA')
  }, [currentTime])

  const activeDayNumber = useMemo(() => {
    if (!isMultiDay) return null
    return resolveActiveFestivalDay({ days, dayParam, todayStr, startDate, endDate })
  }, [isMultiDay, days, dayParam, todayStr, startDate, endDate])

  const activeDate = isMultiDay && activeDayNumber ? days[activeDayNumber - 1] : null

  const setActiveDayNumber = useCallback(
    nextDayNumber => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          next.set('day', String(nextDayNumber))
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  return { isMultiDay, activeDayNumber, activeDate, setActiveDayNumber }
}
