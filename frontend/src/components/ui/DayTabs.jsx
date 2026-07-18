import { memo, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import { formatFestivalDate } from '../../utils/festivalDays'

/**
 * Segmented day-tab filter for multi-day events (#542 PR-3). Selecting a tab
 * is the single source of truth for which day's performances render — a
 * FILTER, not a scroll-anchor (locked product decision) — wired to the
 * shared `?day=N` URL param by `useFestivalDayFilter`.
 *
 * A proper tablist: `role="tablist"`/`"tab"`, `aria-selected`, roving
 * tabindex, and Left/Right/Home/End arrow-key navigation with visible focus.
 * Public / theme-following surface — semantic tokens only, no hardcoded
 * white. Each tab is a ≥44px tap target.
 *
 * Callers must gate rendering on `days.length > 1` themselves (never render
 * for a single-day event — repo invariant, no lone "Day 1" control).
 */
const DayTabs = memo(function DayTabs({ days, activeDayNumber, onSelectDay, className = '' }) {
  const tabRefs = useRef([])

  const handleKeyDown = useCallback(
    (event, index) => {
      let nextIndex
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (index + 1) % days.length
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (index - 1 + days.length) % days.length
      } else if (event.key === 'Home') {
        nextIndex = 0
      } else if (event.key === 'End') {
        nextIndex = days.length - 1
      } else {
        return
      }
      event.preventDefault()
      onSelectDay(nextIndex + 1)
      tabRefs.current[nextIndex]?.focus()
    },
    [days.length, onSelectDay]
  )

  return (
    <div
      role="tablist"
      aria-label="Festival day"
      className={`inline-flex items-center gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1 ${className}`.trim()}
    >
      {days.map((date, index) => {
        const dayNumber = index + 1
        const isActive = dayNumber === activeDayNumber
        return (
          <button
            key={date}
            ref={el => {
              tabRefs.current[index] = el
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelectDay(dayNumber)}
            onKeyDown={event => handleKeyDown(event, index)}
            className={`min-h-[44px] min-w-[44px] whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              isActive
                ? 'bg-accent-500 text-bg-navy'
                : 'text-text-tertiary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            {formatFestivalDate(date, 'short')}
          </button>
        )
      })}
    </div>
  )
})

DayTabs.propTypes = {
  days: PropTypes.arrayOf(PropTypes.string).isRequired,
  activeDayNumber: PropTypes.number,
  onSelectDay: PropTypes.func.isRequired,
  className: PropTypes.string,
}

export default DayTabs
