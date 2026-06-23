import { Plus, TriangleAlert, X, Zap } from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router-dom'
import { buildBandProfileHref } from '../utils/bandProfileLink'
import { getTimeDescription, isHappeningNow, isStartingSoon } from '../utils/timeFilter'
import { formatTime } from '../utils/timeFormat'

function BandCard({
  band,
  isSelected,
  onToggle,
  showVenue = true,
  clickable = true,
  showToggleButton = true,
  eventSlug,
  onRemove,
  warningType,
  warningText,
  currentTime,
}) {
  const handleToggle = () => {
    if (!clickable) return
    onToggle?.(band.id)
  }

  const handleRemove = e => {
    e.stopPropagation()
    const handler = onRemove || onToggle
    handler?.(band.id)
  }

  const handleKeyDown = e => {
    if (!clickable) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleToggle()
    }
  }

  const isPlaying = isHappeningNow(band)
  const nowMs = +currentTime
  const startingSoon = isStartingSoon(band, currentTime)
  const minutesUntil = startingSoon ? Math.ceil((band.startMs - nowMs) / 60000) : 0

  // Both selected and playing states use the amber gradient — dark text required throughout
  const onAmber = isSelected || isPlaying

  const baseClasses = `w-full p-4 rounded-xl transition-all duration-200 ${
    isSelected
      ? 'bg-gradient-accent text-bg-navy shadow-lg scale-[1.02] ring-2 ring-warning-400 ring-offset-2 ring-offset-bg-navy'
      : isPlaying
        ? 'bg-gradient-accent text-bg-navy shadow-glow-accent playing-now'
        : 'bg-gradient-card text-text-primary hover:bg-bg-purple/80 hover:scale-[1.01] shadow-md border border-border'
  } relative`

  const labelBase = isSelected ? `Remove ${band.name} from my route` : `Add ${band.name} to my route`
  const bandProfileHref = band.name ? buildBandProfileHref(band.name, eventSlug) : null

  return (
    <div
      className={`${baseClasses} ${
        clickable ? 'cursor-pointer hover:brightness-110 active:scale-95' : 'cursor-default'
      }`}
      onClick={clickable ? handleToggle : undefined}
      onKeyDown={clickable ? handleKeyDown : undefined}
      tabIndex={clickable ? 0 : undefined}
      role={clickable ? undefined : 'group'}
      aria-label={clickable ? undefined : `${band.name} at ${band.venue}`}
    >
      {showToggleButton && (
        <button
          type="button"
          onClick={handleRemove}
          className={`absolute top-2 right-2 h-11 w-11 flex items-center justify-center text-lg font-bold rounded-full transition-all duration-150 z-10 ${
            onAmber
              ? 'bg-bg-navy/20 hover:bg-bg-navy/30 text-bg-navy'
              : 'bg-surface hover:bg-surface text-text-secondary hover:text-text-primary'
          } focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500`}
          aria-label={labelBase}
          title={labelBase}
        >
          {isSelected ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
        </button>
      )}

      <div className={`flex flex-col items-center gap-2 ${showToggleButton ? 'pr-10' : ''}`}>
        {band.photo_url && (
          <img
            src={band.photo_url}
            alt=""
            loading="lazy"
            className={`h-16 w-16 rounded-full object-cover ring-2 ${onAmber ? 'ring-bg-navy/20' : 'ring-border'}`}
          />
        )}
        {startingSoon && (
          <span
            className={`soon-pill${onAmber ? ' soon-pill--dark' : ''}`}
            aria-label={`Starts in ${minutesUntil} ${minutesUntil === 1 ? 'minute' : 'minutes'} at ${formatTime(band.startTime)}`}
          >
            Starts in {minutesUntil}m · {formatTime(band.startTime)}
          </span>
        )}
        <div className={`inline-block px-3 py-1.5 rounded-lg mb-1 ${onAmber ? 'bg-bg-navy/15' : 'bg-bg-navy/60'}`}>
          {band.name ? (
            <Link
              to={bandProfileHref}
              state={eventSlug ? { fromEventSlug: eventSlug } : undefined}
              onClick={e => e.stopPropagation()}
              className={`font-display font-bold text-base md:text-lg leading-snug transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500 ${
                onAmber ? 'text-bg-navy' : 'text-text-primary hover:text-accent-400'
              }`}
            >
              {band.name}
            </Link>
          ) : (
            <h3
              className={`font-display font-bold text-base md:text-lg leading-snug ${onAmber ? 'text-bg-navy' : 'text-text-primary'}`}
            >
              Unnamed Artist
            </h3>
          )}
        </div>
        <p
          className={`text-sm md:text-base font-medium leading-snug ${
            isPlaying ? 'text-bg-navy font-semibold' : onAmber ? 'text-bg-navy' : 'text-text-secondary'
          }`}
        >
          {getTimeDescription(band)}
          {isPlaying && <span className="ml-2 text-xs uppercase tracking-wide">Live Now</span>}
        </p>
        {showVenue && (
          <p className={`text-sm font-medium leading-snug ${onAmber ? 'text-bg-navy' : 'text-text-tertiary'}`}>
            {band.venue}
          </p>
        )}
        {/* Inline warning - always visible, no interaction needed */}
        {warningType && warningText && (
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mt-1 ${
              onAmber
                ? warningType === 'overlap'
                  ? 'bg-yellow-900/80 text-yellow-100'
                  : 'bg-red-900/70 text-red-100'
                : warningType === 'overlap'
                  ? 'bg-yellow-500/30 text-yellow-200'
                  : 'bg-red-500/30 text-red-200'
            }`}
          >
            {warningType === 'overlap' ? (
              <Zap size={14} aria-hidden="true" />
            ) : (
              <TriangleAlert size={14} aria-hidden="true" />
            )}
            <span>{warningText}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(BandCard)
