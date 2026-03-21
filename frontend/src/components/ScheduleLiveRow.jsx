import { faClock, faLocationDot, faMusic, faRoute, faStar, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { memo } from 'react'
import { Link } from 'react-router-dom'
import { formatTimeRange } from '../utils/timeFormat'
import { slugifyBandName } from '../utils/slugify'

function getStatusCopy(variant, band, nowMs) {
  if (!band.startMs || !band.endMs) {
    return { label: 'Time TBD', detail: formatTimeRange(band.startTime, band.endTime) }
  }

  if (variant === 'now') {
    const minutesLeft = Math.max(1, Math.ceil((band.endMs - nowMs) / (1000 * 60)))
    return {
      label: 'Now Playing',
      detail: `${minutesLeft} min left`,
    }
  }

  const minutesUntil = Math.max(1, Math.ceil((band.startMs - nowMs) / (1000 * 60)))
  return {
    label: 'Starting Soon',
    detail: `Starts in ${minutesUntil} min`,
  }
}

function ScheduleLiveRow({ band, variant, isSelected, onToggle, currentTime }) {
  const nowMs = currentTime instanceof Date ? currentTime.getTime() : new Date(currentTime).getTime()
  const status = getStatusCopy(variant, band, nowMs)
  const toggleLabel = isSelected ? `Remove ${band.name} from my route` : `Add ${band.name} to my route`

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 shadow-lg backdrop-blur-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${
                variant === 'now' ? 'bg-accent-500 text-bg-navy' : 'bg-secondary-500/20 text-secondary-500'
              }`}
            >
              <FontAwesomeIcon icon={variant === 'now' ? faMusic : faClock} aria-hidden="true" />
              {status.label}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-bg-navy/60 px-2.5 py-1 text-xs font-medium text-white/80">
              <FontAwesomeIcon icon={faLocationDot} aria-hidden="true" className="text-accent-400" />
              {band.venue}
            </span>
          </div>

          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                to={`/band/${slugifyBandName(band.name)}`}
                className="block truncate text-lg font-bold text-white transition-colors hover:text-accent-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-navy"
              >
                {band.name}
              </Link>
              <p className="mt-1 text-sm text-white/70">{formatTimeRange(band.startTime, band.endTime)}</p>
              <p className="mt-1 text-sm font-medium text-accent-300">{status.detail}</p>
            </div>

            <button
              type="button"
              onClick={() => onToggle?.(band.id)}
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-navy ${
                isSelected
                  ? 'border-accent-500/50 bg-accent-500/20 text-accent-400 hover:bg-accent-500/30'
                  : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
              }`}
              aria-label={toggleLabel}
              title={toggleLabel}
            >
              <FontAwesomeIcon icon={isSelected ? faXmark : faStar} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {isSelected && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent-500/25 bg-accent-500/10 px-2.5 py-1 text-xs font-medium text-accent-400">
          <FontAwesomeIcon icon={faRoute} aria-hidden="true" />
          In your route
        </div>
      )}
    </div>
  )
}

export default memo(ScheduleLiveRow)
