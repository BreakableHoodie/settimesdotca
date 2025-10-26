import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { formatTime } from '../utils/timeFormat'
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

  const baseClasses = `w-full p-4 rounded-xl transition-transform duration-150 ${
    isSelected
      ? 'bg-band-orange text-band-navy shadow-lg scale-105 border-2 border-yellow-400'
      : 'bg-band-orange/90 text-band-navy hover:bg-band-orange hover:scale-102 shadow-md'
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
        className="absolute top-2 right-2 h-12 w-12 flex items-center justify-center text-xl font-bold rounded-full bg-black/10 hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-300 transition-colors z-10"
        aria-label={labelBase}
        title={labelBase}
      >
        <FontAwesomeIcon icon={isSelected ? faXmark : faPlus} aria-hidden="true" />
      </button>

      <div className="flex flex-col items-center gap-2">
        <div className="inline-block bg-black px-3 py-1.5 rounded mb-1">
          {band.url ? (
            <a
              href={band.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="font-mono font-bold text-white text-base md:text-lg leading-snug hover:text-band-orange transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-300"
            >
              {band.name}
            </a>
          ) : (
            <h3 className="font-mono font-bold text-white text-base md:text-lg leading-snug">{band.name}</h3>
          )}
        </div>
        <p className={`text-sm md:text-base font-mono font-semibold leading-snug ${
          isHappeningNow(band) ? 'text-yellow-200 animate-pulse' : ''
        }`}>
          {getTimeDescription(band)}
        </p>
        {showVenue && <p className="text-sm opacity-80 font-medium leading-snug">{band.venue}</p>}
      </div>
    </div>
  )
}

export default BandCard
