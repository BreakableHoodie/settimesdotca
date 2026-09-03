import { CalendarDays, Plus, TriangleAlert, X, Zap } from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router-dom'
import { buildBandProfileHref } from '../utils/bandProfileLink'
import { BAND_PHOTO_CROP } from '../utils/bandPhoto'
import { getTimeDescription, isHappeningNow, isStartingSoon } from '../utils/timeFilter'
import { formatTime } from '../utils/timeFormat'

function BandCard({
  band,
  isSelected,
  onToggle,
  showVenue = true,
  showToggleButton = true,
  eventSlug,
  onRemove,
  warningType,
  warningText,
  currentTime,
  dayLabel,
  variant = 'card',
  venueCode,
}) {
  const handleRemove = e => {
    e.stopPropagation()
    const handler = onRemove || onToggle
    handler?.(band.id)
  }

  // A cancelled set is never live, never "starting soon", and never
  // selectable. Both isHappeningNow and isStartingSoon are pure time math
  // (#732) and will light up a cancelled row otherwise.
  const isCancelled = Boolean(band.is_cancelled)

  if (variant === 'board') {
    return (
      <div className="grid grid-cols-[56px_1fr_auto_auto] items-center gap-2 border-b border-border px-3 py-3">
        <span className="font-mono text-base font-bold tabular-nums text-text-primary">
          {band.startTime && band.startTime !== 'TBD' ? formatTime(band.startTime) : '—'}
        </span>
        <span className="min-w-0">
          <Link
            to={buildBandProfileHref(band.name, eventSlug)}
            className="block truncate font-semibold text-text-primary hover:underline"
          >
            {isCancelled ? <s>{band.name}</s> : band.name}
          </Link>
          {isCancelled && (
            <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-text-primary">
              <TriangleAlert size={12} aria-hidden="true" />
              Cancelled
            </span>
          )}
        </span>
        {venueCode && (
          <span
            title={band.venue}
            className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] font-bold text-text-secondary"
          >
            {venueCode}
          </span>
        )}
        {/* The board row REPLACES the card on mobile, so without this the core
            interaction the page advertises -- "Tap any performer to add them to
            My Route" -- would simply not exist on phones. Same semantics as the
            card's corner button (#726): a separate control rather than a
            clickable row, because the row already contains a profile Link and a
            button may not nest interactive children. Cancelled sets are not
            selectable, matching the card. */}
        {showToggleButton && !isCancelled && (
          <button
            type="button"
            onClick={handleRemove}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
            aria-label={
              isSelected
                ? `Remove ${band.name || 'Unnamed Artist'} from my route`
                : `Add ${band.name || 'Unnamed Artist'} to my route`
            }
          >
            {isSelected ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
          </button>
        )}
      </div>
    )
  }

  const isPlaying = !isCancelled && isHappeningNow(band)
  const nowMs = +currentTime
  const startingSoon = !isCancelled && isStartingSoon(band, currentTime)
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

  // ONE source of truth for the name shown and the name announced. The visible
  // fallback used to be a literal in the markup while the labels interpolated
  // band.name directly, so a nameless band rendered "Unnamed Artist" but
  // announced "undefined" — WCAG 2.5.3 (Label in Name) requires the accessible
  // name to contain the visible text. Derive both from this.
  const displayName = band.name || 'Unnamed Artist'
  const labelBase = isSelected ? `Remove ${displayName} from my route` : `Add ${displayName} to my route`
  const bandProfileHref = band.name ? buildBandProfileHref(band.name, eventSlug) : null

  // The card container is a labelled group, never a button or a click target:
  // it wraps a real <button> (corner add/remove toggle) and an <a> (profile
  // link), so making it interactive would either nest interactive content
  // (invalid) or announce as a control while containing focusable children.
  // The corner button is the sole toggle control (#726).
  return (
    <div className={baseClasses} role="group" aria-label={band.venue ? `${displayName} at ${band.venue}` : displayName}>
      {showToggleButton && !isCancelled && (
        <button
          type="button"
          onClick={handleRemove}
          className={`absolute top-2 right-2 h-11 w-11 flex items-center justify-center text-lg font-bold rounded-full transition-all duration-150 z-10 ${
            onAmber
              ? 'bg-bg-navy/20 hover:bg-bg-navy/30 text-bg-navy'
              : 'bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary'
          } focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500`}
          aria-label={labelBase}
          title={labelBase}
        >
          {isSelected ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
        </button>
      )}

      <div className={`flex flex-col items-center gap-2 ${showToggleButton ? 'px-10' : ''}`}>
        {band.photo_url && (
          <img
            src={band.photo_url}
            alt=""
            loading="lazy"
            className={`h-16 w-16 rounded-full object-cover ring-2 ${BAND_PHOTO_CROP} ${onAmber ? 'ring-bg-navy/20' : 'ring-border'}`}
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
        {/* Visible pill on the unselected card (#729): bg-bg-navy/60 blended
            into the card's own gradient, so the name-to-genre gap read as
            unexplained whitespace. Same pairing as the genre chip's. */}
        <div
          className={`inline-block px-3 py-1.5 rounded-lg mb-1 ${onAmber ? 'bg-bg-navy/15' : 'bg-surface border border-border'}`}
        >
          {band.name ? (
            <Link
              to={bandProfileHref}
              state={eventSlug ? { fromEventSlug: eventSlug } : undefined}
              onClick={e => e.stopPropagation()}
              className={`font-display font-bold text-base md:text-lg leading-snug transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500 ${
                onAmber
                  ? 'text-bg-navy'
                  : isCancelled
                    ? 'text-text-secondary'
                    : 'text-text-primary hover:text-accent-400'
              }`}
            >
              {isCancelled ? <s>{band.name}</s> : band.name}
            </Link>
          ) : (
            <h3
              className={`font-display font-bold text-base md:text-lg leading-snug ${
                onAmber ? 'text-bg-navy' : isCancelled ? 'text-text-secondary' : 'text-text-primary'
              }`}
            >
              {isCancelled ? <s>{displayName}</s> : displayName}
            </h3>
          )}
        </div>
        {isCancelled && (
          <span
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              onAmber ? 'bg-yellow-900/80 text-yellow-100' : 'bg-warning-500/25 text-text-primary'
            }`}
          >
            <TriangleAlert size={14} aria-hidden="true" />
            Cancelled
          </span>
        )}
        {band.genre && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full border leading-normal ${
              onAmber ? 'bg-bg-navy/15 border-bg-navy/20 text-bg-navy' : 'bg-surface border-border text-text-secondary'
            }`}
          >
            {band.genre}
          </span>
        )}
        {band.notes && (
          <p
            className={`text-xs italic text-center leading-snug line-clamp-2 ${onAmber ? 'text-bg-navy/80' : 'text-text-tertiary'}`}
          >
            {band.notes}
          </p>
        )}
        <p
          className={`text-sm md:text-base font-medium leading-snug ${
            isPlaying ? 'text-bg-navy font-semibold' : onAmber ? 'text-bg-navy' : 'text-text-secondary'
          }`}
        >
          {getTimeDescription(band)}
          {isPlaying && <span className="ml-2 text-xs uppercase tracking-wide">Live Now</span>}
        </p>
        {/* Optional per-set day indicator (#742, venue page). getTimeDescription
            above is date-blind within the same festival week -- three sets on
            three different days of a multi-day event at the same clock time all
            read as a bare "8:00 PM" with nothing to tell them apart. Callers on
            a single event already disambiguate via day tabs/dividers outside
            this card, so dayLabel is opt-in and every existing caller is
            unaffected. */}
        {dayLabel && (
          <p
            className={`flex items-center gap-1.5 text-xs font-medium leading-snug ${
              onAmber ? 'text-bg-navy/80' : 'text-text-tertiary'
            }`}
          >
            <CalendarDays size={12} aria-hidden="true" />
            {dayLabel}
          </p>
        )}
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
                  ? 'bg-warning-500/25 text-text-primary'
                  : 'bg-error-500/25 text-text-primary'
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
