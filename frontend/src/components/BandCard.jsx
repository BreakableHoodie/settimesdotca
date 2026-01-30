import { memo } from 'react'
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Link } from 'react-router-dom'
import { slugifyBandName } from '../utils/slugify'
import { getTimeDescription, isHappeningNow } from '../utils/timeFilter'

function BandCard({ band, isSelected, onToggle, showVenue = true, clickable = true, onRemove }) {
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

  const baseClasses = `w-full p-4 rounded-xl transition-all duration-200 ${
    isSelected
      ? 'bg-gradient-accent text-white shadow-lg scale-[1.02] ring-2 ring-warning-400 ring-offset-2 ring-offset-bg-navy'
      : isPlaying
        ? 'bg-gradient-accent text-white shadow-glow-accent playing-now'
        : 'bg-gradient-card text-white hover:bg-bg-purple/80 hover:scale-[1.01] shadow-md border border-white/10'
  } relative`

  const labelBase = isSelected ? `Remove ${band.name} from my schedule` : `Add ${band.name} to my schedule`

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
      <button
        type="button"
        onClick={handleRemove}
        className={`absolute top-2 right-2 h-11 w-11 flex items-center justify-center text-lg font-bold rounded-full transition-all duration-150 z-10 ${
          isSelected
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-white/10 hover:bg-white/20 text-white/80 hover:text-white'
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500`}
        aria-label={labelBase}
        title={labelBase}
      >
        <FontAwesomeIcon icon={isSelected ? faXmark : faPlus} aria-hidden="true" />
      </button>

      <div className="flex flex-col items-center gap-2 pr-10">
        <div className={`inline-block px-3 py-1.5 rounded-lg mb-1 ${isSelected ? 'bg-white/20' : 'bg-bg-navy/60'}`}>
          {band.name ? (
            <Link
              to={`/band/${slugifyBandName(band.name)}`}
              onClick={e => e.stopPropagation()}
              className="font-display font-bold text-white text-base md:text-lg leading-snug hover:text-accent-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500"
            >
              {band.name}
            </Link>
          ) : (
            <h3 className="font-display font-bold text-white text-base md:text-lg leading-snug">Unnamed Artist</h3>
          )}
        </div>
        <p
          className={`text-sm md:text-base font-medium leading-snug ${
            isPlaying ? 'text-warning-400 font-semibold' : 'text-text-secondary'
          }`}
        >
          {getTimeDescription(band)}
          {isPlaying && <span className="ml-2 text-xs uppercase tracking-wide">Live Now</span>}
        </p>
        {showVenue && <p className="text-sm text-text-tertiary font-medium leading-snug">{band.venue}</p>}
        {band.name && (
          <Link
            to={`/band/${slugifyBandName(band.name)}`}
            onClick={e => e.stopPropagation()}
            className="text-xs text-accent-400 hover:text-accent-300 underline underline-offset-4"
          >
            View profile
          </Link>
        )}
      </div>
    </div>
  )
}

export default memo(BandCard)
