import { useState } from 'react'
import BandCard from './BandCard'

function ScheduleView({
  bands,
  selectedBands,
  onToggleBand,
  onSelectAll,
  currentTime,
  showPast,
  onToggleShowPast
}) {
  const [copyAllLabel, setCopyAllLabel] = useState('Copy Full Schedule')
  const [isCopyingAll, setIsCopyingAll] = useState(false)
  const now = currentTime instanceof Date ? currentTime : new Date(currentTime)

  const finishedCount = bands.reduce((count, band) => {
    const bandEnd = new Date(`${band.date}T${band.endTime}:00`)
    return bandEnd <= now ? count + 1 : count
  }, 0)

  const visibleBands = showPast
    ? bands
    : bands.filter(band => {
        const bandEnd = new Date(`${band.date}T${band.endTime}:00`)
        return bandEnd > now
      })

  // Format 24-hour time to 12-hour format
  const formatTime = (time24) => {
    const [hours, minutes] = time24.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const hours12 = hours % 12 || 12
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  // Sort bands by date + time, then group by start time
  const sortedBands = [...visibleBands].sort((a, b) => {
    const aTime = new Date(`${a.date}T${a.startTime}:00`)
    const bTime = new Date(`${b.date}T${b.startTime}:00`)
    return aTime - bTime
  })

  // Get unique time slots from sorted bands (preserving chronological order)
  const timeSlots = []
  const seenTimes = new Set()
  sortedBands.forEach(band => {
    if (!seenTimes.has(band.startTime)) {
      timeSlots.push(band.startTime)
      seenTimes.add(band.startTime)
    }
  })

  // Group bands by start time
  const bandsByTime = timeSlots.map(time => ({
    time,
    bands: sortedBands.filter(b => b.startTime === time).sort((a, b) =>
      a.venue.localeCompare(b.venue)
    )
  }))

  const allSelected = bands.length > 0 && selectedBands.length === bands.length
  const hiddenFinished = !showPast ? finishedCount : 0
  const noVisibleBands = sortedBands.length === 0
  const formatRange = (start, end) => {
    const to12Hour = (time24) => {
      const [hours, minutes] = time24.split(':').map(Number)
      const period = hours >= 12 ? 'PM' : 'AM'
      const hours12 = hours % 12 || 12
      return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
    }
    return `${to12Hour(start)} - ${to12Hour(end)}`
  }

  const copyBands = async (bandsToCopy) => {
    if (bandsToCopy.length === 0) return false
    const text = bandsToCopy
      .map(band => `${band.name} — ${formatRange(band.startTime, band.endTime)} @ ${band.venue}`)
      .join('\n')
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch (_) {
      /* fallback below */
    }

    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'absolute'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      const selection = document.getSelection()
      const originalRange =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
      textarea.select()
      const successful = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (originalRange && selection) {
        selection.removeAllRanges()
        selection.addRange(originalRange)
      }
      return successful
    } catch (_) {
      return false
    }
  }

  const handleCopyAll = async () => {
    if (isCopyingAll) return
    setIsCopyingAll(true)
    const success = await copyBands(bands)
    if (success) {
      setCopyAllLabel('Copied!')
      setTimeout(() => {
        setCopyAllLabel('Copy Full Schedule')
        setIsCopyingAll(false)
      }, 2000)
    } else {
      setIsCopyingAll(false)
    }
  }

  return (
    <div className="py-6 space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1 text-center sm:text-left">
          <h2 className="text-2xl font-bold text-white text-center">
            Full Lineup
          </h2>
          {!showPast && hiddenFinished > 0 && (
            <p className="text-xs text-band-orange/80 mt-1 text-center sm:text-left">
              {hiddenFinished} finished {hiddenFinished === 1 ? 'set hidden' : 'sets hidden'}
            </p>
          )}
        </div>
        <div className="flex justify-center sm:justify-end gap-3 flex-wrap">
          {finishedCount > 0 && (
            <button
              onClick={onToggleShowPast}
              className={`text-xs px-3 py-1.5 rounded transition-transform duration-150 hover:brightness-110 active:scale-95 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-band-orange ${
                showPast
                  ? 'bg-band-orange/20 border-band-orange/50 text-band-orange hover:bg-band-orange/30'
                  : 'bg-band-purple/50 border-band-orange/50 text-band-orange hover:bg-band-purple'
              }`}
              title={showPast ? 'Hide finished sets' : 'Show finished sets'}
              aria-label={showPast ? 'Hide finished sets' : 'Show finished sets'}
            >
              {showPast ? 'Hide finished sets' : 'Show finished sets'}
            </button>
          )}
          <button
            onClick={handleCopyAll}
            className="text-xs px-3 py-1.5 min-h-[44px] rounded bg-band-purple/60 border border-band-purple/40 text-white flex items-center gap-2 transition-transform duration-150 hover:bg-band-purple/80 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-band-orange"
            title={copyAllLabel === 'Copied!' ? 'Full schedule copied to clipboard' : 'Copy the full schedule'}
            aria-label="Copy the full schedule"
            disabled={isCopyingAll}
          >
            <i
              className={copyAllLabel === 'Copied!' ? 'fa-solid fa-check' : 'fa-regular fa-copy'}
              aria-hidden="true"
            ></i>
            <span className="transition-opacity duration-200 ease-in-out">{copyAllLabel}</span>
          </button>
          <button
            onClick={onSelectAll}
            disabled={allSelected}
            className={`text-xs px-3 py-1.5 rounded transition-transform duration-150 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-band-orange ${
              allSelected
                ? 'bg-gray-500/20 border border-gray-500/50 text-gray-400 cursor-not-allowed'
                : 'bg-band-orange/20 border border-band-orange/50 text-band-orange hover:bg-band-orange/30'
            }`}
            title={allSelected ? 'All bands already selected' : 'Select all bands'}
          >
            {allSelected ? 'All Selected' : 'Select All'}
          </button>
        </div>
      </div>

      {noVisibleBands ? (
        <div className="text-center text-white/70 py-12">
          {showPast
            ? 'No bands in this lineup right now.'
            : finishedCount > 0
              ? 'All finished sets are hidden. Show them to revisit earlier performances.'
              : 'No upcoming bands at the moment.'}
        </div>
      ) : (
        <div className="space-y-8">
          {bandsByTime.map(({ time, bands: timeBands }) => (
            <div key={time} className="relative">
              {/* Time label */}
              <div className="flex items-center mb-4">
                <div className="bg-band-orange text-band-navy font-mono font-bold text-lg md:text-xl px-4 py-2 rounded-lg shadow-lg">
                  {formatTime(time)}
                </div>
                <div className="flex-1 h-0.5 bg-band-orange/30 ml-4"></div>
              </div>

              {/* Bands at this time - responsive grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 ml-0 sm:ml-4">
                {timeBands.map(band => (
                  <BandCard
                    key={band.id}
                    band={band}
                    isSelected={selectedBands.includes(band.id)}
                    onToggle={onToggleBand}
                    showVenue={true}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ScheduleView
