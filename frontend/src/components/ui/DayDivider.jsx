import { DoorOpen } from 'lucide-react'
import { memo } from 'react'
import PropTypes from 'prop-types'
import { getDoorsTimeForDate } from '../../utils/doorsTime'
import { formatFestivalDate } from '../../utils/festivalDays'
import { formatTime } from '../../utils/timeFormat'

/**
 * DayDivider - Design System v1.0
 *
 * Festival-day header shown between sets on different days of a multi-day
 * event (#541): "DAY N · August 2" (no weekday, #681 — see
 * `formatFestivalDate`'s docblock for why). Public / theme-following
 * surface — semantic tokens only, never hardcoded white.
 *
 * When `doorsJson` (the event's `doors_json`) has a time for this day's
 * `date`, appends a "Gates 4:00 PM"-style label (#569) — absent/malformed
 * doorsJson renders nothing extra.
 *
 * Shared between ScheduleView and MySchedule so both fan-facing surfaces
 * render identical day-divider styling.
 *
 * @example
 * <DayDivider date="2026-08-02" dayNumber={1} doorsJson={event.doors_json} />
 */
const DayDivider = memo(function DayDivider({ date, dayNumber, doorsJson = null, className = '' }) {
  const doorsTime = getDoorsTimeForDate(doorsJson, date)

  return (
    <div
      className={`flex items-center gap-3 pt-2 ${className}`.trim()}
      role="separator"
      aria-label={`Day ${dayNumber}`}
    >
      <span className="text-xs font-bold tracking-widest uppercase text-text-primary bg-surface border border-border px-3 py-1.5 rounded-full whitespace-nowrap">
        Day {dayNumber} &middot; {formatFestivalDate(date, 'long')}
      </span>
      {doorsTime && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary whitespace-nowrap">
          <DoorOpen size={12} aria-hidden="true" className="text-text-tertiary" />
          Gates {formatTime(doorsTime)}
        </span>
      )}
      <div className="flex-1 h-px bg-border"></div>
    </div>
  )
})

DayDivider.propTypes = {
  date: PropTypes.string.isRequired,
  dayNumber: PropTypes.number,
  doorsJson: PropTypes.string,
  className: PropTypes.string,
}

export default DayDivider
