import { memo } from 'react'
import PropTypes from 'prop-types'
import { formatFestivalDate } from '../../utils/festivalDays'

/**
 * DayDivider - Design System v1.0
 *
 * Festival-day header shown between sets on different days of a multi-day
 * event (#541): "DAY N · Saturday, August 2". Public / theme-following
 * surface — semantic tokens only, never hardcoded white.
 *
 * Shared between ScheduleView and MySchedule so both fan-facing surfaces
 * render identical day-divider styling.
 *
 * @example
 * <DayDivider date="2026-08-02" dayNumber={1} />
 */
const DayDivider = memo(function DayDivider({ date, dayNumber, className = '' }) {
  return (
    <div
      className={`flex items-center gap-3 pt-2 ${className}`.trim()}
      role="separator"
      aria-label={`Day ${dayNumber}`}
    >
      <span className="text-xs font-bold tracking-widest uppercase text-text-primary bg-surface border border-border px-3 py-1.5 rounded-full whitespace-nowrap">
        Day {dayNumber} &middot; {formatFestivalDate(date, 'long')}
      </span>
      <div className="flex-1 h-px bg-border"></div>
    </div>
  )
})

DayDivider.propTypes = {
  date: PropTypes.string.isRequired,
  dayNumber: PropTypes.number,
  className: PropTypes.string,
}

export default DayDivider
