function BandCard({ band, isSelected, onToggle, showVenue = true }) {
  const handleClick = (e) => {
    e.stopPropagation()
    onToggle(band.id)
  }

  // Format 24-hour time to 12-hour format
  const formatTime = (time24) => {
    const [hours, minutes] = time24.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const hours12 = hours % 12 || 12
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  return (
    <button
      onClick={handleClick}
      type="button"
      aria-pressed={isSelected}
      aria-label={
        isSelected
          ? `Remove ${band.name} from my schedule`
          : `Add ${band.name} to my schedule`
      }
      title={
        isSelected
          ? `Remove ${band.name} from my schedule`
          : `Add ${band.name} to my schedule`
      }
      className={`w-full p-4 rounded-xl transition-transform duration-150 hover:brightness-110 active:scale-95 ${
        isSelected
          ? 'bg-band-orange text-band-navy shadow-lg scale-105 border-2 border-yellow-400'
          : 'bg-band-orange/90 text-band-navy hover:bg-band-orange hover:scale-102 shadow-md'
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-300 relative`}
    >
      <span
        className="absolute top-3 right-3 text-xl font-bold"
        aria-hidden="true"
      >
        {isSelected ? (
          <i className="fa-solid fa-xmark text-lg align-middle" aria-hidden="true" title="Remove from schedule"></i>
        ) : (
          <i className="fa-solid fa-plus text-lg align-middle" aria-hidden="true" title="Add to schedule"></i>
        )}
      </span>
      <div className="flex flex-col items-center gap-2">
        <div className="inline-block bg-black px-3 py-1.5 rounded mb-1">
          {band.url ? (
            <a
              href={band.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-mono font-bold text-white text-base md:text-lg leading-snug hover:text-band-orange transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-300"
            >
              {band.name}
            </a>
          ) : (
            <h3 className="font-mono font-bold text-white text-base md:text-lg leading-snug">
              {band.name}
            </h3>
          )}
        </div>
        <p className="text-sm md:text-base font-mono font-semibold leading-snug">
          {formatTime(band.startTime)} - {formatTime(band.endTime)}
        </p>
        {showVenue && (
          <p className="text-sm opacity-80 font-medium leading-snug">
            {band.venue}
          </p>
        )}
      </div>
    </button>
  )
}

export default BandCard
