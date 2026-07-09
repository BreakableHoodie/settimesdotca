import {
  Bell,
  CalendarPlus,
  Camera,
  Car,
  Check,
  Clock,
  Copy,
  Droplet,
  Footprints,
  Guitar,
  Hourglass,
  Link,
  Music,
  Pizza,
  Smile,
  Split,
  Star,
  Trash2,
  Zap,
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { HIGHLIGHTED_BANDS, getHighlightMessage } from '../config/highlights.jsx'
import { copyToClipboard } from '../utils/clipboard'
import { dayNumberByDate, isMultiDay } from '../utils/festivalDays'
import { formatTimeRange } from '../utils/timeFormat'
import BandCard from './BandCard'
import LockInLineupPanel from './LockInLineupPanel'
import { DayDivider } from './ui'
import { walkMinutesBetween } from '../utils/walkTime'

// Label a break between two sets at the same venue.
function formatBreakLabel(mins) {
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m break` : `${h}h break`
  }
  return `${mins} min break`
}

// "Buffer" = minutes of slack after walking to the next venue (gap − walk) — the
// crawl's core decision value: can I watch this set and still make the next one?
function bufferLabel(buffer) {
  if (buffer < 0) return `overlaps by ${Math.abs(buffer)} min`
  if (buffer < 3) return 'leave right after'
  return `${buffer} min to spare`
}

// Conflict resolution card — shows two same-start bands side by side so the fan can pick one.
// "Keep this one" removes the OTHER band from the schedule via onToggleBand.
function ForkCard({ band1, band2, onToggleBand }) {
  const sides = [
    { band: band1, removeId: band2.id },
    { band: band2, removeId: band1.id },
  ]

  return (
    <div className="rounded-xl border border-error-500/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-error-500/20 border-b border-error-500/30">
        <Split size={15} className="text-error-400 shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold text-text-primary">Fork in the road — same start time</span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-error-500/30 bg-error-500/10">
        {sides.map(({ band, removeId }) => (
          <div key={band.id} className="px-3 py-3 flex flex-col gap-1.5">
            <p className="font-bold text-text-primary text-sm leading-snug">{band.name}</p>
            {band.genre && (
              <span className="self-start text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-text-secondary leading-normal">
                {band.genre}
              </span>
            )}
            {band.venue && <p className="text-xs text-text-secondary">{band.venue}</p>}
            <p className="text-xs text-text-tertiary">{formatTimeRange(band.startTime, band.endTime)}</p>
            <button
              onClick={() => onToggleBand(removeId)}
              aria-label={`Keep ${band.name}, remove ${removeId === band2.id ? band2.name : band1.name}`}
              className="mt-2 w-full py-2 text-xs font-semibold rounded-lg bg-accent-500/20 border border-accent-500/50 text-accent-400 hover:bg-accent-500/30 active:scale-95 transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500 min-h-[44px]"
            >
              Keep this one
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function MySchedule({
  bands,
  onToggleBand,
  onClearSchedule,
  showPast,
  onToggleShowPast,
  nowOverride,
  onBrowseAll,
  eventSlug,
  eventId,
}) {
  const [currentTime, setCurrentTime] = useState(() => (nowOverride ? new Date(nowOverride) : new Date()))
  const [copyButtonLabel, setCopyButtonLabel] = useState('Copy Schedule')
  const [isCopyingSchedule, setIsCopyingSchedule] = useState(false)
  const [shareButtonLabel, setShareButtonLabel] = useState('Share Schedule')

  // Update current time every minute
  useEffect(() => {
    if (nowOverride) {
      setCurrentTime(new Date(nowOverride))
      return undefined
    }

    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [nowOverride])

  const effectiveNow = useMemo(() => {
    return nowOverride ? new Date(nowOverride) : currentTime
  }, [currentTime, nowOverride])
  const highlightedBandIds = useMemo(() => new Set(HIGHLIGHTED_BANDS), [])
  const normalizedBands = useMemo(() => {
    const oneDayMs = 24 * 60 * 60 * 1000

    return bands.map(band => {
      const parsedStartMs = Date.parse(`${band.date}T${band.startTime}:00`)
      const parsedEndMs = Date.parse(`${band.date}T${band.endTime}:00`)
      const startMs =
        Number.isFinite(band.startMs) && band.startMs > 0
          ? band.startMs
          : Number.isNaN(parsedStartMs)
            ? 0
            : parsedStartMs

      let endMs =
        Number.isFinite(band.endMs) && band.endMs > 0 ? band.endMs : Number.isNaN(parsedEndMs) ? 0 : parsedEndMs

      if (startMs > 0 && endMs > 0 && endMs < startMs) {
        endMs += oneDayMs
      }

      return {
        ...band,
        startMs,
        endMs,
      }
    })
  }, [bands])

  // Calculate time until/since a band
  const getTimeStatus = band => {
    const nowMs = effectiveNow.getTime()
    const diffToStart = band.startMs - nowMs
    const diffToEnd = band.endMs - nowMs

    // Band is happening now
    if (diffToStart <= 0 && diffToEnd > 0) {
      const minutesLeft = Math.ceil(diffToEnd / 1000 / 60)
      return {
        status: 'now',
        icon: Guitar,
        text: `Playing now - ${minutesLeft} min left`,
        color: 'bg-success-500/20 border-success-500/50 text-text-primary',
      }
    }

    // Band has finished
    if (diffToEnd <= 0) {
      return {
        status: 'past',
        icon: Check,
        text: 'Finished',
        color: 'bg-surface border-border text-text-tertiary',
      }
    }

    // Band is upcoming
    const minutesUntil = Math.ceil(diffToStart / 1000 / 60)
    if (minutesUntil <= 15) {
      return {
        status: 'soon',
        icon: Bell,
        text: 'Starting soon!',
        color: 'bg-warning-500/20 border-warning-500/50 text-text-primary',
      }
    } else if (minutesUntil <= 60) {
      return {
        status: 'upcoming',
        icon: Clock,
        text: `In ${minutesUntil} min`,
        color: 'bg-info-500/20 border-info-500/50 text-text-primary',
      }
    } else if (minutesUntil >= 1440) {
      const days = Math.floor(minutesUntil / 1440)
      const remainder = minutesUntil % 1440
      const hours = Math.floor(remainder / 60)
      const mins = remainder % 60
      const parts = [`${days}d`]
      if (hours > 0) parts.push(`${hours}h`)
      if (mins > 0) parts.push(`${mins}m`)
      return {
        status: 'later',
        icon: Hourglass,
        text: `In ${parts.join(' ')}`,
        color: 'bg-info-500/20 border-info-500/50 text-text-primary',
      }
    } else {
      const hours = Math.floor(minutesUntil / 60)
      const mins = minutesUntil % 60
      const timeLabel = mins === 0 ? `${hours}h` : `${hours}h ${mins}m`
      return {
        status: 'later',
        icon: Hourglass,
        text: `In ${timeLabel}`,
        color: 'bg-info-500/20 border-info-500/50 text-text-primary',
      }
    }
  }

  // Sort bands chronologically using date + time
  const sortedBands = [...normalizedBands].sort((a, b) => a.startMs - b.startMs)

  const visibleBands = showPast ? sortedBands : sortedBands.filter(band => band.endMs > effectiveNow.getTime())

  const hiddenFinishedCount = sortedBands.length - visibleBands.length

  // Day-divider support (#541): a flat time-sorted list, so day boundaries are
  // detected by comparing each rendered band's `.date` to the previous one
  // (see the render loop below). Numbering + the multi-day gate use the full
  // `sortedBands` (not the `showPast`-filtered `visibleBands`) so a day's number
  // never shifts when past sets are hidden — keeping it consistent with
  // ScheduleView. Single-day schedules render zero dividers, byte-identical.
  const dayNumberByDateMap = useMemo(() => dayNumberByDate(sortedBands), [sortedBands])
  const multiDayEvent = useMemo(() => isMultiDay(sortedBands), [sortedBands])

  // Find first highlighted band ID (only show reminder for the first one)
  const firstHighlightedBandId = useMemo(() => {
    return visibleBands.find(band => highlightedBandIds.has(band.id))?.id || null
  }, [visibleBands, highlightedBandIds])

  const bandById = useMemo(() => new Map(visibleBands.map(b => [b.id, b])), [visibleBands])
  const bandNameById = useMemo(() => new Map(visibleBands.map(b => [b.id, b.name])), [visibleBands])

  // Extract numeric performance IDs from band composite IDs (e.g. "event-slug-perf-42" → 42).
  // Mirrors the same split used in handleShareSchedule so the two stay in sync.
  const performanceIds = useMemo(() => {
    return bands.reduce((acc, band) => {
      const parts = band.id.split('-')
      const id = parseInt(parts[parts.length - 1], 10)
      if (Number.isFinite(id) && id > 0) acc.push(id)
      return acc
    }, [])
  }, [bands])

  // Detect overlaps and conflicts
  const { conflicts, overlaps, overlapCount } = useMemo(() => {
    const conflicts = []
    const overlaps = []

    for (let i = 0; i < visibleBands.length; i++) {
      const current = visibleBands[i]
      const currentStart = current.startMs
      const currentEnd = current.endMs

      // Check against all other bands for overlaps
      for (let j = i + 1; j < visibleBands.length; j++) {
        const other = visibleBands[j]
        const otherStart = other.startMs
        const otherEnd = other.endMs

        // Check if times overlap
        if (currentStart < otherEnd && otherStart < currentEnd) {
          if (currentStart === otherStart) {
            // Same start time = must choose = red conflict
            conflicts.push({ band1: current.id, band2: other.id })
          } else {
            // Partial overlap = can catch most of both = yellow warning
            overlaps.push({ band1: current.id, band2: other.id })
          }
        }
      }
    }

    const overlapCount = new Set(overlaps.flatMap(c => [c.band1, c.band2])).size

    return { conflicts, overlaps, overlapCount }
  }, [visibleBands])

  if (sortedBands.length === 0) {
    return (
      <div className="py-16 text-center space-y-4">
        <div className="text-text-disabled mb-2">
          <CalendarPlus size={60} aria-hidden="true" />
        </div>
        <p className="text-text-primary text-xl font-semibold">No bands selected yet</p>
        <p className="text-accent-400 text-sm">Tap a band to start building your schedule</p>
        {onBrowseAll && (
          <button
            onClick={onBrowseAll}
            className="mt-2 px-6 py-3 min-h-[44px] rounded-lg bg-accent-500/20 border border-accent-500/50 text-accent-400 font-semibold hover:bg-accent-500/30 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500"
          >
            Browse Lineup
          </button>
        )}
      </div>
    )
  }

  if (!showPast && visibleBands.length === 0 && hiddenFinishedCount > 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-text-primary text-xl mb-2">All your selected bands have wrapped up</p>
        <p className="text-accent-400">Tap &ldquo;Show finished sets&rdquo; to revisit what you already caught.</p>
        <div className="mt-4">
          <button
            onClick={onToggleShowPast}
            className="text-xs px-3 py-1.5 rounded bg-accent-500/20 border border-accent-500/50 text-accent-400 hover:bg-accent-500/30 transition-colors"
          >
            Show finished sets
          </button>
        </div>
      </div>
    )
  }

  // Get contextual reminders based on schedule and time
  const getScheduleReminder = () => {
    if (sortedBands.length === 0) return null

    const now = effectiveNow
    const currentHour = now.getHours()

    // Find longest break in schedule
    let longestBreak = 0
    for (let i = 0; i < visibleBands.length - 1; i++) {
      const current = visibleBands[i]
      const next = visibleBands[i + 1]
      const breakMinutes = (next.startMs - current.endMs) / 1000 / 60
      longestBreak = Math.max(longestBreak, breakMinutes)
    }

    // Show different messages based on context
    if (longestBreak >= 60) {
      return {
        icon: Pizza,
        text: "You've got some longer breaks - perfect time to grab food or hang with friends!",
      }
    } else if (currentHour >= 21 && currentHour < 22) {
      return {
        icon: Droplet,
        text: 'Stay hydrated! Grab some water and maybe a snack',
      }
    } else if (currentHour >= 22 && currentHour < 23) {
      return {
        icon: Camera,
        text: "Don't forget to take some pictures and videos!",
      }
    } else if (currentHour >= 23 || currentHour < 1) {
      return {
        icon: Camera,
        text: 'Capture the memories - snap some selfies with your friends!',
      }
    } else if (currentHour >= 1 && currentHour < 3) {
      return {
        icon: Music,
        text: 'Late night energy! Have fun and enjoy the music!',
      }
    } else if (visibleBands.length >= 5) {
      return {
        icon: Star,
        text: 'Stacked lineup! Keep the fun rolling all night.',
      }
    }

    return null
  }

  const reminder = getScheduleReminder()
  const hasFinishedBands = hiddenFinishedCount > 0

  const copyBands = async bandsToCopy => {
    if (bandsToCopy.length === 0) {
      return false
    }

    const text = bandsToCopy
      .map(band => `${band.name} — ${formatTimeRange(band.startTime, band.endTime)} @ ${band.venue}`)
      .join('\n')

    return copyToClipboard(text)
  }

  const handleShareSchedule = async () => {
    const { performanceIds, bandNames } = bands.reduce(
      (acc, band) => {
        const parts = band.id.split('-')
        const id = parseInt(parts[parts.length - 1], 10)
        if (Number.isFinite(id) && id > 0) {
          acc.performanceIds.push(id)
          acc.bandNames.push(band.name || '')
        }
        return acc
      },
      { performanceIds: [], bandNames: [] }
    )

    if (performanceIds.length === 0) return

    try {
      const res = await fetch('/api/schedule/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          event_slug: eventSlug,
          performance_ids: performanceIds,
          band_names: bandNames,
        }),
      })

      if (res.ok) {
        const { slug } = await res.json()
        const url = `${window.location.origin}/s/${slug}`
        const success = await copyToClipboard(url)
        if (success) {
          setShareButtonLabel('Link Copied!')
          setTimeout(() => setShareButtonLabel('Share Schedule'), 2000)
        }
        return
      }
    } catch (_err) {
      // fall through to legacy ?s= URL
    }

    const legacyIds = performanceIds.join(',')
    const fallbackUrl = `${window.location.origin}${window.location.pathname}?s=${legacyIds}`
    const success = await copyToClipboard(fallbackUrl)
    if (success) {
      setShareButtonLabel('Link Copied!')
      setTimeout(() => setShareButtonLabel('Share Schedule'), 2000)
    }
  }

  return (
    <div className="py-6 space-y-6 sm:space-y-8">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-text-primary text-center">My Route</h2>
            <p className="text-center text-accent-400 text-sm">
              {showPast
                ? `${sortedBands.length} ${sortedBands.length === 1 ? 'band' : 'bands'} selected`
                : `${visibleBands.length} upcoming ${visibleBands.length === 1 ? 'band' : 'bands'}`}
              {!showPast && hiddenFinishedCount > 0 && (
                <span className="block text-xs text-accent-400/80">
                  ({hiddenFinishedCount} finished {hiddenFinishedCount === 1 ? 'set hidden' : 'sets hidden'})
                </span>
              )}
            </p>
          </div>
        </div>
        {sortedBands.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-3 sm:gap-4 mt-3">
            {hasFinishedBands && (
              <button
                onClick={onToggleShowPast}
                className={`text-xs px-3 py-1.5 rounded border transition-transform duration-150 hover:brightness-110 active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500 ${
                  showPast
                    ? 'bg-accent-500/20 border-accent-500/50 text-accent-400 hover:bg-accent-500/30'
                    : 'bg-bg-purple/50 border-accent-500/50 text-accent-400 hover:bg-bg-purple'
                }`}
                title={showPast ? 'Hide finished sets' : 'Show finished sets'}
              >
                {showPast ? 'Hide finished sets' : 'Show finished sets'}
              </button>
            )}
            <div className="flex justify-center gap-3 sm:gap-4">
              <button
                onClick={async () => {
                  if (isCopyingSchedule) return
                  setIsCopyingSchedule(true)
                  const success = await copyBands(showPast ? sortedBands : visibleBands)
                  if (success) {
                    setCopyButtonLabel('Copied!')
                    setTimeout(() => {
                      setCopyButtonLabel('Copy Schedule')
                      setIsCopyingSchedule(false)
                    }, 2000)
                  } else {
                    setIsCopyingSchedule(false)
                  }
                }}
                className="text-xs px-3 py-1.5 rounded bg-bg-purple/60 border border-bg-purple/40 text-text-primary flex items-center gap-2 transition-transform duration-150 hover:bg-bg-purple/80 hover:brightness-110 active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500 min-h-[44px]"
                title={copyButtonLabel === 'Copied!' ? 'Schedule copied to clipboard' : 'Copy your schedule'}
                disabled={isCopyingSchedule}
              >
                {copyButtonLabel === 'Copied!' ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
                <span className="transition-opacity duration-200 ease-in-out">{copyButtonLabel}</span>
              </button>
              {bands.length > 0 && (
                <button
                  onClick={handleShareSchedule}
                  className="text-xs px-3 py-1.5 rounded bg-bg-purple/60 border border-bg-purple/40 text-text-primary flex items-center gap-2 transition-transform duration-150 hover:bg-bg-purple/80 hover:brightness-110 active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500 min-h-[44px]"
                  title={shareButtonLabel === 'Link Copied!' ? 'Share link copied to clipboard' : 'Share your schedule'}
                  aria-label="Copy shareable link to your schedule"
                >
                  {shareButtonLabel === 'Link Copied!' ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Link size={14} aria-hidden="true" />
                  )}
                  <span className="transition-opacity duration-200 ease-in-out">{shareButtonLabel}</span>
                </button>
              )}
              <button
                onClick={onClearSchedule}
                className="text-xs px-3 py-1.5 rounded bg-error-500/20 border border-error-500/50 text-text-primary flex items-center gap-2 transition-transform duration-150 hover:bg-error-500/30 hover:brightness-110 active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-error-400"
                title="Clear all selected bands"
              >
                <Trash2 size={14} aria-hidden="true" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Contextual reminder */}
      {reminder && (
        <div className="max-w-5xl mx-auto">
          <div className="text-xs text-text-primary bg-success-500/15 px-4 py-2 rounded border border-success-500/40 text-center flex items-center justify-center gap-2 leading-normal">
            {(() => {
              const ReminderIcon = reminder.icon
              return <ReminderIcon size={14} aria-hidden="true" />
            })()}
            <span>{reminder.text}</span>
          </div>
        </div>
      )}

      {(conflicts.length > 0 || overlaps.length > 0) && (
        <div className="space-y-4 max-w-5xl mx-auto">
          {conflicts.length > 0 &&
            conflicts.map(({ band1: b1id, band2: b2id }) => {
              const b1 = bandById.get(b1id)
              const b2 = bandById.get(b2id)
              if (!b1 || !b2) return null
              return <ForkCard key={`${b1id}-${b2id}`} band1={b1} band2={b2} onToggleBand={onToggleBand} />
            })}
          {overlaps.length > 0 && (
            <div className="bg-warning-500/20 border border-warning-500/50 rounded-lg p-4 leading-normal">
              <div className="flex items-center gap-3 text-text-primary font-semibold">
                <Zap size={20} className="text-warning-400 shrink-0" aria-hidden="true" />
                <p className="text-sm sm:text-base leading-normal">
                  {overlapCount} band{overlapCount !== 1 ? 's' : ''} with overlapping set{overlapCount !== 1 ? 's' : ''}{' '}
                  — you may not catch every full set.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4 max-w-5xl mx-auto">
        {visibleBands.map((band, idx) => {
          const hasConflict = conflicts.some(c => c.band1 === band.id || c.band2 === band.id)
          const hasOverlap = overlaps.some(c => c.band1 === band.id || c.band2 === band.id)
          const showDreReminder = band.id === firstHighlightedBandId

          // Day-divider: render above this band when its festival day differs
          // from the previously-rendered band's day (#541).
          const previousDate = idx > 0 ? visibleBands[idx - 1].date : undefined
          const showDayDivider = multiDayEvent && band.date !== previousDate

          // Walk + buffer from the previous set — the crawl's "can I make it?" math.
          let transition = null
          if (idx > 0) {
            const prevBand = visibleBands[idx - 1]
            const gapMinutes = Math.floor((band.startMs - prevBand.endMs) / 1000 / 60)
            const venueChanged = Boolean(band.venue && prevBand.venue && band.venue !== prevBand.venue)
            const walkMin = venueChanged
              ? walkMinutesBetween(
                  { latitude: prevBand.venue_lat, longitude: prevBand.venue_lng },
                  { latitude: band.venue_lat, longitude: band.venue_lng }
                )
              : null
            const buffer = walkMin != null ? gapMinutes - walkMin : null
            // Show a transition when there's a walk to make, or a notable (15+ min) break.
            if (walkMin != null || gapMinutes >= 15) {
              transition = { gapMinutes, walkMin, buffer, venue: band.venue }
            }
          }

          return (
            <Fragment key={band.id}>
              {showDayDivider && <DayDivider date={band.date} dayNumber={dayNumberByDateMap.get(band.date)} />}
              <div className="relative mb-6">
                {/* Walk / break transition from the previous set */}
                {transition && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 py-3 text-xs">
                    {transition.walkMin != null ? (
                      <span className="inline-flex flex-wrap items-center justify-center gap-1.5 text-text-tertiary">
                        <Footprints size={14} aria-hidden="true" />
                        <span>
                          ~{transition.walkMin} min walk to {transition.venue}
                        </span>
                        {transition.buffer != null && (
                          <span
                            className={transition.buffer < 3 ? 'font-semibold text-error-600' : 'text-text-tertiary'}
                          >
                            · {bufferLabel(transition.buffer)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="italic text-text-tertiary">{formatBreakLabel(transition.gapMinutes)}</span>
                    )}
                  </div>
                )}
                {showDreReminder && (
                  <div className="text-center text-text-secondary text-xs italic pb-2 flex items-center justify-center gap-2">
                    <Smile size={14} className="text-warning-400" aria-hidden="true" />
                    <span>{getHighlightMessage()}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <div className={getTimeStatus(band).status === 'now' ? 'playing-now rounded-xl' : ''}>
                    <BandCard
                      band={band}
                      isSelected={true}
                      onToggle={onToggleBand}
                      onRemove={onToggleBand}
                      showVenue={true}
                      clickable={false}
                      eventSlug={eventSlug}
                      currentTime={effectiveNow}
                      warningType={hasConflict ? 'conflict' : hasOverlap ? 'overlap' : null}
                      warningText={(() => {
                        if (!hasConflict && !hasOverlap) return null
                        const getNamesFrom = list => [
                          ...new Set(
                            list
                              .filter(c => c.band1 === band.id || c.band2 === band.id)
                              .map(c => {
                                const otherId = c.band1 === band.id ? c.band2 : c.band1
                                return bandNameById.get(otherId)
                              })
                              .filter(Boolean)
                          ),
                        ]
                        const conflictNames = getNamesFrom(conflicts)
                        const overlapNames = getNamesFrom(overlaps)
                        const parts = []
                        if (conflictNames.length > 0) parts.push(`Same time as ${conflictNames.join(', ')}`)
                        if (overlapNames.length > 0) parts.push(`Overlaps with ${overlapNames.join(', ')}`)
                        return parts.join(' · ')
                      })()}
                    />
                  </div>

                  {/* Countdown timer - appears BELOW the band card */}
                  {(() => {
                    const timeStatus = getTimeStatus(band)
                    return (
                      <div
                        className={`text-xs font-semibold px-3 py-1.5 rounded border ${timeStatus.color} flex items-center gap-2 leading-normal`}
                      >
                        {(() => {
                          const StatusIcon = timeStatus.icon
                          return <StatusIcon size={14} aria-hidden="true" />
                        })()}
                        <span>{timeStatus.text}</span>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </Fragment>
          )
        })}
      </div>

      <div className="max-w-5xl mx-auto">
        <LockInLineupPanel performanceIds={performanceIds} bandCount={performanceIds.length} />
      </div>

      <div className="max-w-5xl mx-auto mt-8 text-center text-xs text-text-tertiary">
        <Car size={14} aria-hidden="true" className="mr-2 inline" />
        Home safe plan: grab a rideshare, call a friend, or line up a sober ride—no drinking and driving.
      </div>
    </div>
  )
}

export default MySchedule
