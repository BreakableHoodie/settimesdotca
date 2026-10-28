import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useScrollCollapse } from '../hooks/useScrollCollapse.js'
import { getDaysAwayLabel } from '../utils/daysAway'
import { getDoorsTimeForDate } from '../utils/doorsTime'
import { getLifecycleLabel } from '../utils/liveLabel'
import { torontoDate } from '../utils/festivalDays'
import { formatTime } from '../utils/timeFormat'
import EventPosterThumbnail from './EventPosterThumbnail'
import EventSocialLinks from './EventSocialLinks'
import EventTicketLink from './EventTicketLink'
import GhostEasterEgg from './GhostEasterEgg'
import TimeFilter from './TimeFilter'
import Modal from './ui/Modal'
import VenueDelayBanner from './VenueDelayBanner'
import { parseVenueInfo } from '../utils/venueInfo.js'

function formatCurrentTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Toronto',
  })
}

// The identity block fades out faster than it shrinks, so opacity reaches 0
// before maxHeight does.
const IDENTITY_FADE_MULTIPLIER = 1.75
const IDENTITY_OPEN_HEIGHT_PX = 200

/**
 * The `scrollProgress` at which the identity block becomes fully transparent.
 * Derived from the fade multiplier rather than hardcoded so it cannot drift:
 * anything invisible must be non-interactive AND out of the tab order, and a
 * separately-tuned constant previously left a window where the block was
 * opacity 0 but still clickable and focusable.
 */
export const IDENTITY_GONE_PROGRESS = 1 / IDENTITY_FADE_MULTIPLIER

/** True once the identity block is visually gone — drives pointerEvents and `inert`. */
export function isIdentityVisuallyGone(scrollProgress) {
  return scrollProgress >= IDENTITY_GONE_PROGRESS
}

/**
 * Style for the mobile identity block's scroll-collapse (#665).
 *
 * Pure and exported so the monotonicity invariant is unit-testable: as
 * `scrollProgress` goes 0 -> 1, `maxHeight` must never increase. jsdom does no
 * real layout, so the test targets this function rather than rendered geometry.
 *
 * `scrollProgress` itself only advances once per `requestAnimationFrame`
 * (`useScrollCollapse`), and iOS momentum scrolling delivers `scroll` events
 * irregularly — so without smoothing, these values would visibly *step*
 * between commits rather than track continuously (#690 residual jank, after
 * the bounce itself was fixed by the ratchet in #693). The
 * `IDENTITY_COLLAPSE_TRANSITION_CLASS` Tailwind class applied alongside this
 * style (not baked in here, to match the `Header.jsx` collapse precedent)
 * interpolates between those discrete commits. That is only safe *because*
 * the ratchet makes `scrollProgress` monotonic while scrolling down — a CSS
 * transition on a value that can also decrease mid-scroll would ease a
 * visible bounce instead of smoothing a one-directional collapse.
 *
 * @param {number} scrollProgress - 0 (fully open) to 1 (fully collapsed).
 * @returns {object} React style: `opacity`, `transform`, `maxHeight`,
 *   `overflow`, `overflowAnchor`, `pointerEvents`, `willChange`.
 */
export function computeIdentityCollapseStyle(scrollProgress) {
  const identityFadeProgress = Math.min(1, scrollProgress * IDENTITY_FADE_MULTIPLIER)
  return {
    opacity: 1 - identityFadeProgress,
    transform: `translateY(${scrollProgress * -6}px)`,
    maxHeight: `${Math.round(IDENTITY_OPEN_HEIGHT_PX * (1 - scrollProgress))}px`,
    overflow: 'hidden',
    // #690: opts this subtree out of scroll-anchor candidacy. Shrinking
    // maxHeight mid-scroll makes the browser adjust window.scrollY to hold an
    // anchor node steady — which perturbs the very scrollY this collapse reads,
    // regrowing it. Without this the collapse is not monotonic and visibly
    // bounces.
    overflowAnchor: 'none',
    pointerEvents: isIdentityVisuallyGone(scrollProgress) ? 'none' : 'auto',
    // Hints the compositor-friendly properties onto their own layer, so at
    // least the opacity/transform portion of the transition (below) can run
    // off the main thread. `maxHeight` is deliberately excluded from this
    // hint — it's a layout property (the entire point of #665 — collapsing
    // it reclaims real vertical space) and stays in the transition's
    // property list regardless, so the block below it still gets a
    // layout+repaint every frame either way; promoting it here would just
    // cost memory for no benefit.
    willChange: 'opacity, transform',
  }
}

/**
 * Tailwind transition applied to the identity block in JSX, not baked into
 * `computeIdentityCollapseStyle` above — mirrors how `Header.jsx` pairs its
 * own scroll-collapse inline style with a static transition class. Duration
 * matches the codebase's dominant micro-interaction speed (`duration-150`,
 * used throughout for hover/press transitions). The sitewide
 * `prefers-reduced-motion` rule (`index.css`) clamps all transition
 * durations to ~0 with `!important`, so this class collapses instantly for
 * users who request less motion without any extra handling here.
 */
export const IDENTITY_COLLAPSE_TRANSITION_CLASS = 'transition-[max-height,opacity,transform] duration-150 ease-out'

function LiveContextBar({
  eventData,
  currentTime,
  bands = [],
  selectedCount = 0,
  view = 'all',
  onViewChange,
  venueFilter = null,
  onVenueFilterChange,
  timeFilter = 'all',
  onTimeFilterChange,
  genreFilter = null,
  onGenreFilterChange,
  genreOptions = [],
  groupBy = 'time',
  onGroupByChange,
  showPast = false,
  onToggleShowPast,
  finishedCount = 0,
  visibleCount = 0,
  posterUrl = null,
  onPosterOpen,
}) {
  // venueOptions stays on the FULL `bands` list, deliberately -- a venue
  // whose only set is cancelled must stay filterable so fans can actually
  // find the cancellation (#732).
  const venueOptions = useMemo(() => [...new Set(bands.map(band => band.venue).filter(Boolean))].sort(), [bands])
  const hasVenueFilter = venueOptions.length > 1
  const uniqueVenues = useMemo(() => {
    const venueInfo = parseVenueInfo(eventData?.venue_info)
    if (venueInfo.length > 0) {
      return venueInfo.length
    }

    return venueOptions.length
  }, [eventData?.venue_info, venueOptions.length])

  // Cancelled sets must not sustain a "Happening Now" lifecycle label or
  // inflate the set count in the summary line (#732).
  const activeBands = useMemo(() => bands.filter(b => !b.is_cancelled), [bands])

  const lifecycle = useMemo(
    () => getLifecycleLabel(eventData?.date, currentTime, activeBands, eventData?.doors_json, eventData?.end_date),
    [activeBands, currentTime, eventData?.date, eventData?.doors_json, eventData?.end_date]
  )

  // Running late is a show-day fact (#1249): from the event's local midnight
  // until it is over. Gating on "Live Tonight" alone hid the commonest case, a
  // venue running late to START, while the label still reads "Upcoming"
  // (found in a real-browser check). Ending at Recap/Archive means a banner
  // left on after the show never lingers. Compared on the TORONTO date, not the
  // viewer's: the show runs on Toronto time wherever the fan is reading from.
  const showVenueDelays =
    Boolean(eventData?.date) &&
    lifecycle.label !== 'Recap' &&
    lifecycle.label !== 'Archive' &&
    torontoDate(currentTime) >= eventData.date

  // Tickets sell until the show is over (#1384), the same edge as the banner
  // above. An archived edition is over whatever its set times say.
  const ticketsConcluded =
    Boolean(eventData?.is_archived) || lifecycle.label === 'Recap' || lifecycle.label === 'Archive'

  // Doors time for the event's FIRST date only (#569) — this header isn't
  // per-day, so it always reflects day 1's gates-open time. Later festival
  // days show their own doors time on the DayDivider instead.
  const doorsTime = useMemo(
    () => getDoorsTimeForDate(eventData?.doors_json, eventData?.date),
    [eventData?.doors_json, eventData?.date]
  )
  // The one filter panel (venue, genre, time, grouping, finished sets). A
  // dialog rather than a disclosure so it costs no height in the sticky bar.
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [showGhost, setShowGhost] = useState(false)
  const [lifecycleAnnouncement, setLifecycleAnnouncement] = useState('')
  const prevLifecycleLabelRef = useRef(lifecycle.label)

  // Announce lifecycle transitions (Upcoming → Live Tonight → Recap → Archive)
  // to screen readers. On transition, set the announcement text in a hidden
  // live region. Do not announce on every render — only when the label actually
  // changes. Announce only on meaningful transitions (to Live Tonight / Recap),
  // not on initial render (Upcoming) or cycle-back transitions. A transition
  // into a non-announced label (e.g. Live Tonight → Upcoming) must still clear
  // whatever announcement is currently sitting in the live region — otherwise
  // it's stale text that no longer matches reality, left behind by the
  // previous transition's now-cleaned-up timer.
  useEffect(() => {
    if (lifecycle.label !== prevLifecycleLabelRef.current) {
      prevLifecycleLabelRef.current = lifecycle.label
      let announcement = ''
      if (lifecycle.label === 'Live Tonight') {
        announcement = `${eventData?.name || 'Event'} is now live`
      } else if (lifecycle.label === 'Recap' || lifecycle.label === 'Archive') {
        announcement = `${eventData?.name || 'Event'} has ended`
      }
      if (!announcement) {
        setLifecycleAnnouncement('')
        return
      }
      setLifecycleAnnouncement(announcement)
      // Clear after 5s so assistive tech has time to poll and read it.
      // Shorter delays risk the announcement never being announced at all.
      const timer = setTimeout(() => setLifecycleAnnouncement(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [lifecycle.label, eventData?.name])

  // Collapses the mobile-only identity block (status badge, clock, title,
  // poster, stats line) once the fan scrolls past it — #665. The view switch and
  // Filter button below are NOT part of this collapse; they render in their
  // own always-visible block further down. Thresholds are wider than the
  // site header's (20-140) because this block starts taller: fully
  // collapsed well before `scrollY` reaches the ~600px this was measured at.
  const scrollProgress = useScrollCollapse(48, 240)
  // Same threshold the style uses for pointerEvents: `pointerEvents: none`
  // alone would still leave focusable children (the status badge) in the tab
  // order, so a keyboard user could focus an invisible control. `inert`
  // removes them from focus and the a11y tree too, and both must flip at the
  // moment the block becomes invisible — not later.
  const isIdentityCollapsed = isIdentityVisuallyGone(scrollProgress)
  const identityCollapseStyle = computeIdentityCollapseStyle(scrollProgress)
  const tapCountRef = useRef(0)
  const firstTapTimeRef = useRef(0)

  const handleLifecycleTap = () => {
    const now = Date.now()
    if (tapCountRef.current === 0) firstTapTimeRef.current = now
    if (now - firstTapTimeRef.current > 3000) {
      tapCountRef.current = 1
      firstTapTimeRef.current = now
    } else {
      tapCountRef.current += 1
    }
    if (tapCountRef.current >= 7) {
      tapCountRef.current = 0
      setShowGhost(true)
    }
  }

  useEffect(() => {
    const KONAMI = [
      'ArrowUp',
      'ArrowUp',
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'b',
      'a',
    ]
    let pos = 0
    const onKey = e => {
      if (e.key === KONAMI[pos]) {
        pos += 1
        if (pos === KONAMI.length) {
          pos = 0
          setShowGhost(true)
        }
      } else {
        pos = e.key === KONAMI[0] ? 1 : 0
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const daysUntil = (() => {
    if (lifecycle.label !== 'Upcoming' || !eventData?.date) return null
    const nowDate = currentTime instanceof Date ? currentTime : new Date(+currentTime)
    const [year, month, day] = eventData.date.split('-').map(Number)
    const eventDay = Date.UTC(year, month - 1, day)
    const today = torontoDate(nowDate)
    const [todayYear, todayMonth, todayDayOfMonth] = today.split('-').map(Number)
    const todayDay = Date.UTC(todayYear, todayMonth - 1, todayDayOfMonth)
    return Math.ceil((eventDay - todayDay) / 86400000)
  })()
  const mobileSummary = useMemo(() => {
    // ORDERED BY CONSEQUENCE, not by convenience. On mobile this string is
    // clamped to two lines, so whatever sits at the end is what a fan never
    // reads. Showing up underage to a 19+ show is a wasted trip; the venue and
    // set counts are visible on the page itself a few hundred pixels below.
    // #1084 was this line silently cutting "Presented by ..." every time.
    // Plain sentences, not a bullet-joined string (#1248): "19+. Doors at
    // 6:30 PM. Presented by SetTimes. 4 venues, 15 sets. 3 days away."
    // Free-text fields: an admin may already end one with . ! or ?, so keep
    // their punctuation ("19+." must not become "19+..") and add a stop only
    // when there is none.
    const asSentence = text => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`)
    const sentences = []
    if (eventData?.age_restriction) sentences.push(asSentence(eventData.age_restriction))
    if (doorsTime) sentences.push(`Doors at ${formatTime(doorsTime)}.`)
    if (eventData?.presented_by) sentences.push(asSentence(`Presented by ${eventData.presented_by}`))
    sentences.push(
      `${uniqueVenues} ${uniqueVenues === 1 ? 'venue' : 'venues'}, ${activeBands.length} ${activeBands.length === 1 ? 'set' : 'sets'}.`
    )

    if (daysUntil !== null) {
      sentences.push(`${getDaysAwayLabel(daysUntil)}.`)
    }

    return sentences.join(' ')
    // eventData in full, NOT the two fields this memo reads. Narrowing the deps
    // is the obvious optimisation and this project rejects it: the React Compiler
    // infers `eventData` and errors with "Inferred less specific property than
    // source", skipping optimisation of the whole component. The compiler owns
    // memoisation here -- a hand-narrowed dep list buys nothing and costs the
    // component its automatic memoisation entirely.
  }, [activeBands.length, daysUntil, doorsTime, eventData, uniqueVenues])

  // Filters that differ from the default view. This is the number on the
  // Filter button and in its accessible name; the panel's "Clear all" resets
  // exactly these.
  const activeFilterCount =
    (venueFilter ? 1 : 0) +
    (genreFilter ? 1 : 0) +
    (timeFilter !== 'all' ? 1 : 0) +
    (groupBy !== 'time' ? 1 : 0) +
    (showPast ? 1 : 0)
  const genreChoices =
    genreFilter && !genreOptions.includes(genreFilter) ? [...genreOptions, genreFilter] : genreOptions
  // Same for a venue that left the list (data refresh): the select must show
  // the filter that is still applied, not read "All venues".
  const venueChoices =
    typeof venueFilter === 'string' && venueFilter && !venueOptions.includes(venueFilter)
      ? [...venueOptions, venueFilter]
      : venueOptions

  const clearAllFilters = () => {
    onVenueFilterChange?.(null)
    onGenreFilterChange?.(null)
    onTimeFilterChange?.('all')
    onGroupByChange?.('time')
    if (showPast) onToggleShowPast?.()
  }

  if (!eventData?.name) {
    return null
  }

  const selectClass =
    'min-h-[44px] w-full appearance-none rounded-lg border border-border bg-surface px-4 py-2 pr-10 text-sm font-medium text-text-primary focus:border-accent-500 focus:outline-hidden'
  const labelClass = 'mb-1 block text-sm font-medium text-text-secondary'

  return (
    <>
      <section className="sticky top-[57px] z-40 border-b border-border bg-bg-navy">
        <div role="status" aria-live="polite" className="sr-only">
          {lifecycleAnnouncement}
        </div>
        <div className="container mx-auto px-4 max-w-(--breakpoint-2xl) py-1.5 sm:py-3">
          <div className="sm:hidden">
            {/* Identity block: status badge, clock, poster, title, stats.
              Collapses on scroll (#665, style computed above) — everything
              a fan needs once they're scrolling the lineup (Tabs, filter
              toggle) lives in the always-visible block below, outside this
              wrapper. */}
            <div
              className={IDENTITY_COLLAPSE_TRANSITION_CLASS}
              style={identityCollapseStyle}
              inert={isIdentityCollapsed}
            >
              {/* Poster beside the title/stats rather than stacked above them
                (#666) — reclaims the dead width a poster-alone row left
                empty and drops a whole ~142px row from the mobile vertical
                budget. Absent posterUrl (the common case) just leaves this
                column at full width; nothing here depends on the poster
                being present. */}
              <div className="flex gap-3">
                {posterUrl && (
                  <EventPosterThumbnail
                    posterUrl={posterUrl}
                    eventName={eventData.name}
                    onOpen={onPosterOpen}
                    variant="inline"
                  />
                )}
                <div className="min-w-0 flex-1">
                  {/* Status pill shares the title's line rather than owning a row
                    above it, and the mobile clock is gone: the phone's own status
                    bar already shows the time, and that row cost ~44px directly
                    above the lineup. Desktop keeps both, unchanged. */}
                  <div className="flex items-start gap-2">
                    <span
                      role="button"
                      tabIndex={0}
                      className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-xs font-semibold ${lifecycle.classes}`}
                      aria-label={`Event status: ${lifecycle.label}`}
                      onClick={handleLifecycleTap}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleLifecycleTap()
                        }
                      }}
                    >
                      {lifecycle.label}
                    </span>
                    <h2
                      className="min-w-0 flex-1 overflow-hidden text-base font-semibold leading-snug text-text-primary"
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                    >
                      {eventData.name}
                    </h2>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <EventSocialLinks
                      socialLinks={eventData.social_links}
                      eventName={eventData.name}
                      className="-ml-2"
                    />
                    <EventTicketLink
                      eventId={eventData.id}
                      ticketUrl={eventData.ticket_url}
                      eventName={eventData.name}
                      concluded={ticketsConcluded}
                    />
                  </div>
                  {/* Was `truncate`: one line showing 43% of its own content at
                    390px, cutting "Presented by ..." every time (#1084). Two
                    lines costs ~14px and shows effectively all of it. */}
                  <p className="mt-1 line-clamp-2 text-xs text-text-tertiary">{mobileSummary}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden items-start justify-between gap-3 sm:flex">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  role="button"
                  tabIndex={0}
                  className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-xs font-semibold ${lifecycle.classes}`}
                  aria-label={`Event status: ${lifecycle.label}`}
                  onClick={handleLifecycleTap}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleLifecycleTap()
                    }
                  }}
                >
                  {lifecycle.label}
                </span>
                <h2 className="min-w-0 truncate text-base font-semibold text-text-primary md:text-lg">
                  {eventData.name}
                </h2>
                <EventSocialLinks
                  socialLinks={eventData.social_links}
                  eventName={eventData.name}
                  className="-ml-2 shrink-0"
                />
                <EventTicketLink
                  eventId={eventData.id}
                  ticketUrl={eventData.ticket_url}
                  eventName={eventData.name}
                  concluded={ticketsConcluded}
                />
              </div>
              <p className="mt-1 text-sm text-text-tertiary">{mobileSummary}</p>
            </div>

            <span aria-live="polite" className="shrink-0 text-sm font-medium tabular-nums text-text-secondary">
              {formatCurrentTime(currentTime)}
            </span>
          </div>

          {/* Running late (#1249): outside the collapsing identity block, so a
            fan scrolling the lineup still sees it. */}
          {showVenueDelays && <VenueDelayBanner delays={eventData?.venue_delays} />}

          {/* The one control row: view switch on the left, Filter on the right,
            at every width. Outside the collapsing identity block (#665) so it
            stays reachable while scrolling the lineup. */}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
            <div className="grid grid-cols-2 items-center rounded-lg border border-border bg-surface p-1">
              <button
                type="button"
                onClick={() => onViewChange?.('all')}
                aria-pressed={view === 'all'}
                className={`min-h-[44px] rounded-md px-4 text-sm font-semibold transition-colors ${
                  view === 'all' ? 'bg-accent-500 text-bg-navy' : 'text-text-tertiary hover:text-text-primary'
                }`}
              >
                Lineup
              </button>
              <button
                type="button"
                onClick={() => onViewChange?.('mine')}
                aria-pressed={view === 'mine'}
                className={`relative min-h-[44px] rounded-md px-4 text-sm font-semibold transition-colors ${
                  view === 'mine' ? 'bg-accent-500 text-bg-navy' : 'text-text-tertiary hover:text-text-primary'
                }`}
              >
                My route
                {selectedCount > 0 && (
                  <span className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-bg-navy/80 px-1.5 py-0.5 text-xs font-bold text-text-primary">
                    {selectedCount}
                  </span>
                )}
              </button>
            </div>

            {/* The filters shape the lineup only; My route has its own list. */}
            {view === 'all' && (
              <button
                type="button"
                onClick={() => setIsFilterOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={isFilterOpen}
                aria-label={activeFilterCount > 0 ? `Filter, ${activeFilterCount} active` : 'Filter'}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                <SlidersHorizontal size={16} aria-hidden="true" className="text-accent-400" />
                Filter
                {activeFilterCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-accent-500 px-1.5 py-0.5 text-xs font-bold text-bg-navy"
                  >
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
        {showGhost && <GhostEasterEgg onDismiss={() => setShowGhost(false)} />}
      </section>
      {/* Outside the <section> on purpose: the overlay belongs to the viewport,
        not to the sticky bar's stacking context. */}
      <Modal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="Filter the lineup"
        size="sm"
        placement="sheet"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <button
              type="button"
              onClick={clearAllFilters}
              disabled={activeFilterCount === 0}
              className="min-h-[44px] rounded-lg px-3 text-sm font-medium text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:text-text-disabled focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="min-h-[44px] rounded-lg bg-accent-500 px-5 text-sm font-semibold text-bg-navy hover:brightness-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2"
            >
              Show {visibleCount} {visibleCount === 1 ? 'set' : 'sets'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {hasVenueFilter && (
            <div>
              <label htmlFor="live-venue-switcher" className={labelClass}>
                Venue
              </label>
              <div className="relative">
                <select
                  id="live-venue-switcher"
                  value={venueFilter || ''}
                  onChange={event => onVenueFilterChange?.(event.target.value || null)}
                  className={selectClass}
                >
                  <option value="">All venues</option>
                  {venueChoices.map(venue => (
                    <option key={venue} value={venue}>
                      {venue}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary"
                />
              </div>
            </div>
          )}

          {genreChoices.length > 0 && (
            <div>
              <label htmlFor="schedule-genre-filter" className={labelClass}>
                Genre
              </label>
              <div className="relative">
                <select
                  id="schedule-genre-filter"
                  value={genreFilter || ''}
                  onChange={event => onGenreFilterChange?.(event.target.value || null)}
                  className={selectClass}
                >
                  <option value="">All genres</option>
                  {genreChoices.map(genre => (
                    <option key={genre} value={genre}>
                      {genre}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary"
                />
              </div>
            </div>
          )}

          <TimeFilter selectedFilter={timeFilter} onFilterChange={onTimeFilterChange} visibleLabel />

          {/* Real radios: arrow keys and group semantics come from the platform. */}
          <fieldset>
            <legend className={labelClass}>Group by</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface p-1">
              {[
                ['time', 'Time'],
                ['venue', 'Venue'],
              ].map(([mode, label]) => (
                <label key={mode} className="relative block">
                  <input
                    type="radio"
                    name="lineup-group-by"
                    value={mode}
                    checked={groupBy === mode}
                    onChange={() => onGroupByChange?.(mode)}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-3 text-sm font-semibold text-text-tertiary transition-colors hover:text-text-primary peer-checked:bg-accent-500 peer-checked:text-bg-navy peer-focus-visible:ring-2 peer-focus-visible:ring-accent-400">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Kept while ticked even with nothing finished in view, so a filter
              the badge counts always has a control that can clear it. */}
          {(finishedCount > 0 || showPast) && onToggleShowPast && (
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-medium text-text-primary">
              <input
                type="checkbox"
                checked={showPast}
                onChange={() => onToggleShowPast()}
                className="h-5 w-5 shrink-0 accent-accent-500"
              />
              <span>Show finished sets ({finishedCount})</span>
            </label>
          )}
        </div>
      </Modal>
    </>
  )
}

export default memo(LiveContextBar)
