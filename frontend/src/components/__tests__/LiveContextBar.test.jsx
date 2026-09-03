import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LiveContextBar, { computeIdentityCollapseStyle, IDENTITY_COLLAPSE_TRANSITION_CLASS } from '../LiveContextBar'

describe('computeIdentityCollapseStyle (#690 scroll-collapse bounce)', () => {
  const px = style => parseFloat(style.maxHeight)

  it('never grows maxHeight as scrollProgress increases', () => {
    // The #690 bug was a NON-MONOTONIC collapse: while scrolling down, the
    // block shrank then grew back ~18px, producing a visible flicker and
    // CLS 0.2875 in production. Height must be a non-increasing function of
    // progress across the whole range, not merely smaller at the endpoints.
    let previous = Infinity
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const current = px(computeIdentityCollapseStyle(Math.min(p, 1)))
      expect(current).toBeLessThanOrEqual(previous)
      previous = current
    }
  })

  it('opts out of scroll anchoring, the actual cause of the bounce', () => {
    // Chrome's scroll-anchoring compensates for the shrinking block by
    // adjusting window.scrollY — the very value the collapse is driven from.
    // That feedback loop is what produced the non-monotonic scrollY.
    // Removing this opts the subtree back into anchor candidacy and the
    // bounce returns, so it is asserted rather than left as a bare style.
    expect(computeIdentityCollapseStyle(0.5).overflowAnchor).toBe('none')
  })

  it('is fully collapsed at progress 1 and fully open at 0', () => {
    expect(px(computeIdentityCollapseStyle(0))).toBeGreaterThan(0)
    expect(px(computeIdentityCollapseStyle(1))).toBe(0)
  })

  it('disables pointer events the moment the block becomes invisible, not later', () => {
    // The fade multiplier (1.75) drives opacity to 0 at progress ~0.571, but
    // pointerEvents was separately hardcoded to flip at 0.7 — leaving a window
    // where the block was fully transparent yet still clickable and focusable.
    // 0.6 sits inside that old window and is the regression guard.
    expect(computeIdentityCollapseStyle(0.5).pointerEvents).toBe('auto')
    expect(computeIdentityCollapseStyle(0.5).opacity).toBeGreaterThan(0)

    expect(computeIdentityCollapseStyle(0.6).opacity).toBe(0)
    expect(computeIdentityCollapseStyle(0.6).pointerEvents).toBe('none')
    expect(computeIdentityCollapseStyle(0.8).pointerEvents).toBe('none')
  })

  it('never leaves the block invisible while still interactive', () => {
    // The general property behind the case above: opacity 0 implies
    // non-interactive, at every progress value.
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const style = computeIdentityCollapseStyle(Math.min(p, 1))
      if (style.opacity === 0) {
        expect(style.pointerEvents).toBe('none')
      }
    }
  })

  // #690 residual jank fix: scrollProgress only advances once per animation
  // frame, and iOS momentum scrolling delivers `scroll` events irregularly,
  // so without smoothing the rendered values snap in uneven steps rather
  // than tracking continuously. `willChange` hints the compositor-friendly
  // properties onto their own layer; `maxHeight` is deliberately excluded —
  // it's a layout property (the whole point of #665 is reclaiming real
  // vertical space), so promoting it buys nothing and costs memory.
  it('hints only the compositor-friendly properties via willChange, never maxHeight', () => {
    const style = computeIdentityCollapseStyle(0.5)
    expect(style.willChange).toContain('opacity')
    expect(style.willChange).toContain('transform')
    expect(style.willChange).not.toContain('max-height')
    expect(style.willChange).not.toContain('height')
  })
})

// #690 residual jank fix: a short CSS transition smooths the discrete,
// scroll-event-sized steps described above. Safe only because the #693
// ratchet makes scrollProgress monotonic while scrolling down — a
// transition on a value that could still decrease mid-scroll would ease a
// visible bounce instead of smoothing a one-directional collapse.
describe('IDENTITY_COLLAPSE_TRANSITION_CLASS (#690 residual jank)', () => {
  it('transitions exactly the properties the collapse animates, not maxHeight alone or "all"', () => {
    // A bare "transition-all" would also animate hover/focus states this
    // block doesn't have, and "duration-0" or a missing duration class would
    // silently regress to no smoothing at all.
    expect(IDENTITY_COLLAPSE_TRANSITION_CLASS).toMatch(/transition-\[.*max-height.*opacity.*transform.*\]/)
    // [1-9]\d* (not \d+): "duration-0" is exactly the silent-no-smoothing
    // regression this guards against and must NOT satisfy the pattern.
    expect(IDENTITY_COLLAPSE_TRANSITION_CLASS).toMatch(/duration-[1-9]\d*/)
  })
})

const eventData = {
  name: 'Long Weekend Band Crawl',
  date: '2026-05-06',
}

const bands = [
  { id: '1', venue: 'Stage A' },
  { id: '2', venue: 'Stage B' },
]

function setViewportWidth(width) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
}

function setScrollY(y) {
  Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: y })
}

// useScrollCollapse batches its measurement into a requestAnimationFrame, so
// the frame has to be flushed before the committed progress reaches the
// rendered style/attributes.
async function fireScroll() {
  await act(async () => {
    window.dispatchEvent(new Event('scroll'))
    await new Promise(resolve => requestAnimationFrame(resolve))
  })
}

describe('LiveContextBar', () => {
  it('surfaces route, venue, and time controls in the sticky bar', () => {
    const onViewChange = vi.fn()
    const onVenueFilterChange = vi.fn()
    const onTimeFilterChange = vi.fn()

    render(
      <LiveContextBar
        eventData={eventData}
        currentTime={new Date('2026-05-06T19:30:00')}
        bands={bands}
        selectedCount={2}
        view="all"
        onViewChange={onViewChange}
        venueFilter={null}
        onVenueFilterChange={onVenueFilterChange}
        timeFilter="all"
        onTimeFilterChange={onTimeFilterChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /My Route/i }))
    expect(onViewChange).toHaveBeenCalledWith('mine')

    fireEvent.change(screen.getByLabelText(/Venue switcher/i), {
      target: { value: 'Stage B' },
    })
    expect(onVenueFilterChange).toHaveBeenCalledWith('Stage B')

    fireEvent.change(screen.getByLabelText(/Time filter/i), {
      target: { value: 'now' },
    })

    expect(onTimeFilterChange).toHaveBeenCalledWith('now')
  })

  it('collapses and expands the filter panel when the toggle is clicked', () => {
    render(
      <LiveContextBar
        eventData={eventData}
        currentTime={new Date('2026-05-06T19:30:00')}
        bands={bands}
        selectedCount={0}
        view="all"
        onViewChange={vi.fn()}
        venueFilter={null}
        onVenueFilterChange={vi.fn()}
        timeFilter="all"
        onTimeFilterChange={vi.fn()}
      />
    )

    // Filters are open by default — panel and aria-expanded=true are present
    const toggles = screen.getAllByRole('button', { name: /hide filters/i })
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText(/Time filter/i)).toBeInTheDocument()

    // Click to collapse
    fireEvent.click(toggles[0])
    expect(screen.getAllByRole('button', { name: /show filters/i })[0]).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText(/Time filter/i)).not.toBeInTheDocument()

    // Click again to re-expand
    fireEvent.click(screen.getAllByRole('button', { name: /show filters/i })[0])
    expect(screen.getByLabelText(/Time filter/i)).toBeInTheDocument()
  })

  it('does not show a Doors chip when the event has no doors_json (#569)', () => {
    render(
      <LiveContextBar
        eventData={eventData}
        currentTime={new Date('2026-05-06T19:30:00')}
        bands={bands}
        selectedCount={0}
        view="all"
        onViewChange={vi.fn()}
        venueFilter={null}
        onVenueFilterChange={vi.fn()}
        timeFilter="all"
        onTimeFilterChange={vi.fn()}
      />
    )

    expect(screen.queryByText(/Doors \d/i)).not.toBeInTheDocument()
  })

  it('shows a "Doors" chip for the event\'s first date when doors_json has a time for it (#569)', () => {
    const eventWithDoors = { ...eventData, doors_json: JSON.stringify({ '2026-05-06': '18:30' }) }

    render(
      <LiveContextBar
        eventData={eventWithDoors}
        currentTime={new Date('2026-05-06T12:00:00')}
        bands={bands}
        selectedCount={0}
        view="all"
        onViewChange={vi.fn()}
        venueFilter={null}
        onVenueFilterChange={vi.fn()}
        timeFilter="all"
        onTimeFilterChange={vi.fn()}
      />
    )

    expect(screen.getAllByText('Doors 6:30 PM').length).toBeGreaterThan(0)
  })

  it('shows "Tonight" instead of "0 days away" pre-doors on the event\'s own day (#596)', () => {
    const eventWithDoors = { ...eventData, doors_json: JSON.stringify({ '2026-05-06': '18:30' }) }

    render(
      <LiveContextBar
        eventData={eventWithDoors}
        currentTime={new Date('2026-05-06T12:00:00')}
        bands={bands}
        selectedCount={0}
        view="all"
        onViewChange={vi.fn()}
        venueFilter={null}
        onVenueFilterChange={vi.fn()}
        timeFilter="all"
        onTimeFilterChange={vi.fn()}
      />
    )

    expect(screen.getAllByText('Tonight').length).toBeGreaterThan(0)
    expect(screen.queryByText(/0 days away/)).not.toBeInTheDocument()
  })

  // #1063: age_restriction and presented_by are public, optional free-text
  // columns that render as chips on desktop and into the mobile summary line.
  // They must appear when set and render NOTHING when absent.
  describe('age restriction and presenter (#1063)', () => {
    it('renders an age restriction chip while hiding the presenter when only age is set', () => {
      render(
        <LiveContextBar
          eventData={{ ...eventData, age_restriction: '19+' }}
          currentTime={new Date('2026-05-06T19:30:00')}
          bands={bands}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )

      expect(screen.getAllByText('19+').length).toBeGreaterThan(0)
      expect(screen.queryByText(/Presented by/i)).not.toBeInTheDocument()
    })

    it('renders presented by when set and no age restriction', () => {
      render(
        <LiveContextBar
          eventData={{ ...eventData, presented_by: 'Downtown Waterloo BIA' }}
          currentTime={new Date('2026-05-06T19:30:00')}
          bands={bands}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )

      // Labelled, not bare. The Flag icon on the desktop chip is aria-hidden, so
      // an unlabelled organisation name told a screen reader nothing about what it
      // was -- both surfaces now say "Presented by".
      expect(screen.getAllByText(/Presented by Downtown Waterloo BIA/).length).toBeGreaterThan(0)
      expect(screen.queryByText('19+')).not.toBeInTheDocument()
    })

    it('appears in the mobile summary line when the presenter is set (#1063)', () => {
      setViewportWidth(375)
      render(
        <LiveContextBar
          eventData={{ ...eventData, presented_by: 'SetTimes' }}
          currentTime={new Date('2026-05-06T19:30:00')}
          bands={bands}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )

      // The mobile summary is a joined string rendered in two paragraphs —
      // one always-visible and one sm:hidden. Assert the joined text includes
      // the presenter and that an sm:hidden copy exists (the mobile-only one).
      //
      // ORDER IS PART OF THE CONTRACT, not incidental. This line is clamped to two
      // lines on a phone, so whatever sits at the end is what nobody reads --
      // #1084 was exactly that, silently cutting "Presented by ...". The
      // consequential facts (age restriction, doors, presenter) therefore lead,
      // and the venue/set counts follow. Pinning the order here is what stops a
      // future tidy-up from quietly undoing the fix.
      const summaries = screen.getAllByText(/Presented by SetTimes • \d+ venues • \d+ sets/)
      expect(summaries.some(el => el.classList.contains('sm:hidden'))).toBe(true)
      setViewportWidth(1024)
    })

    it('renders nothing for either when neither is set', () => {
      render(
        <LiveContextBar
          eventData={eventData}
          currentTime={new Date('2026-05-06T19:30:00')}
          bands={bands}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )

      expect(screen.queryByText('19+')).not.toBeInTheDocument()
      expect(screen.queryByText(/Presented by/i)).not.toBeInTheDocument()
    })
  })

  // #665: Tabs and the filters toggle are the functional controls and must
  // stay reachable regardless of the venue/time filter panel's open state —
  // previously they were rendered INSIDE the same `isFiltersOpen` gate as
  // the selects, so closing filters also hid the Live Lineup/My Route tabs.
  describe('Tabs stay reachable independent of the filter panel (#665)', () => {
    afterEach(() => {
      setViewportWidth(1024)
    })

    it('keeps the Tabs visible after collapsing the venue/time filters', () => {
      render(
        <LiveContextBar
          eventData={eventData}
          currentTime={new Date('2026-05-06T19:30:00')}
          bands={bands}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )

      const toggles = screen.getAllByRole('button', { name: /hide filters/i })
      fireEvent.click(toggles[0])

      expect(screen.queryByLabelText(/Time filter/i)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Live Lineup/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /My Route/i })).toBeInTheDocument()
      // The toggle itself must also stay reachable once collapsed.
      expect(screen.getAllByRole('button', { name: /show filters/i }).length).toBeGreaterThan(0)
    })

    it('defaults the filter panel open on a desktop-width viewport', () => {
      setViewportWidth(1024)
      render(
        <LiveContextBar
          eventData={eventData}
          currentTime={new Date('2026-05-06T19:30:00')}
          bands={bands}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )

      expect(screen.getByLabelText(/Time filter/i)).toBeInTheDocument()
    })

    it('defaults the filter panel collapsed on a phone-width viewport, Tabs still present', () => {
      setViewportWidth(375)
      render(
        <LiveContextBar
          eventData={eventData}
          currentTime={new Date('2026-05-06T19:30:00')}
          bands={bands}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )

      expect(screen.queryByLabelText(/Time filter/i)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Live Lineup/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /My Route/i })).toBeInTheDocument()
    })
  })

  // #666: the poster is rendered inline (beside the title/stats) inside
  // LiveContextBar's mobile identity block rather than as its own row.
  describe('inline poster (#666)', () => {
    it('renders the poster button when posterUrl is provided', () => {
      render(
        <LiveContextBar
          eventData={eventData}
          currentTime={new Date('2026-05-06T19:30:00')}
          bands={bands}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
          posterUrl="https://band-photos.settimes.ca/event-posters/1-test.jpg"
          onPosterOpen={vi.fn()}
        />
      )

      expect(screen.getByRole('button', { name: /View .*poster/i })).toBeInTheDocument()
    })

    it('renders no poster button when posterUrl is absent — the meta column stays unaffected', () => {
      render(
        <LiveContextBar
          eventData={eventData}
          currentTime={new Date('2026-05-06T19:30:00')}
          bands={bands}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )

      expect(screen.queryByRole('button', { name: /View .*poster/i })).not.toBeInTheDocument()
      expect(screen.getAllByText(eventData.name).length).toBeGreaterThan(0)
    })

    it('calls onPosterOpen when the inline poster is clicked', () => {
      const onPosterOpen = vi.fn()
      render(
        <LiveContextBar
          eventData={eventData}
          currentTime={new Date('2026-05-06T19:30:00')}
          bands={bands}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
          posterUrl="https://band-photos.settimes.ca/event-posters/1-test.jpg"
          onPosterOpen={onPosterOpen}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /View .*poster/i }))
      expect(onPosterOpen).toHaveBeenCalledTimes(1)
    })
  })

  // Live region for lifecycle transitions (Upcoming → Live Tonight → Recap → Archive),
  // announced to screen readers when the event status changes.
  describe('lifecycle status announcements', () => {
    it('renders a hidden live region with role="status" aria-live="polite"', () => {
      const { container } = render(
        <LiveContextBar
          eventData={eventData}
          currentTime={new Date('2026-05-06T19:30:00')}
          bands={bands}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )

      const liveRegion = container.querySelector('[role="status"][aria-live="polite"].sr-only')
      expect(liveRegion).toBeInTheDocument()
    })

    it('announces and clears when transitioning to "Live Tonight"', () => {
      vi.useFakeTimers()

      // Bands with startMs/endMs set to put event in "Upcoming" state before 19:00
      const bandsWithTimes = [
        {
          id: '1',
          venue: 'Stage A',
          startMs: new Date('2026-05-06T19:00:00').getTime(),
          endMs: new Date('2026-05-06T19:45:00').getTime(),
        },
        {
          id: '2',
          venue: 'Stage B',
          startMs: new Date('2026-05-06T20:00:00').getTime(),
          endMs: new Date('2026-05-06T20:45:00').getTime(),
        },
      ]

      const { rerender } = render(
        <LiveContextBar
          eventData={eventData}
          currentTime={new Date('2026-05-06T18:30:00')} // Before first set starts
          bands={bandsWithTimes}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )

      const liveRegion = screen.getByRole('status')
      // Initially Upcoming — no announcement
      expect(liveRegion.textContent).toBe('')

      // Move time past first set start — transitions to "Live Tonight"
      act(() => {
        rerender(
          <LiveContextBar
            eventData={eventData}
            currentTime={new Date('2026-05-06T19:15:00')} // Event is live
            bands={bandsWithTimes}
            selectedCount={0}
            view="all"
            onViewChange={vi.fn()}
            venueFilter={null}
            onVenueFilterChange={vi.fn()}
            timeFilter="all"
            onTimeFilterChange={vi.fn()}
          />
        )
      })

      // Announcement is set before the 5s timeout clears it
      expect(liveRegion.textContent).toContain('Long Weekend Band Crawl')
      expect(liveRegion.textContent).toContain('is now live')

      // Advance past the 5s (5000ms) timeout
      act(() => {
        vi.advanceTimersByTime(5100)
      })
      expect(liveRegion.textContent).toBe('')

      vi.useRealTimers()
    })

    // MINOR finding on #720: a Live Tonight → Upcoming transition matches
    // neither `if` branch, so the old code never called setLifecycleAnnouncement
    // at all — the stale "is now live" text from the PRIOR transition was left
    // sitting in the live region (a fresh 5s timer did eventually clear it, but
    // only by accident, and a screen reader polling in that window would read
    // status that no longer matches reality). The fix clears the region
    // immediately on any transition that isn't itself announceable.
    it('clears a stale "is now live" announcement when transitioning back from "Live Tonight" to "Upcoming" (#720)', () => {
      vi.useFakeTimers()

      const bandsWithTimes = [
        {
          id: '1',
          venue: 'Stage A',
          startMs: new Date('2026-05-06T19:00:00').getTime(),
          endMs: new Date('2026-05-06T19:45:00').getTime(),
        },
        {
          id: '2',
          venue: 'Stage B',
          startMs: new Date('2026-05-06T20:00:00').getTime(),
          endMs: new Date('2026-05-06T20:45:00').getTime(),
        },
      ]

      const { rerender } = render(
        <LiveContextBar
          eventData={eventData}
          currentTime={new Date('2026-05-06T18:30:00')} // Upcoming, before first set
          bands={bandsWithTimes}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )

      const liveRegion = screen.getByRole('status')
      expect(liveRegion.textContent).toBe('')

      // Upcoming -> Live Tonight: announces "is now live".
      act(() => {
        rerender(
          <LiveContextBar
            eventData={eventData}
            currentTime={new Date('2026-05-06T19:15:00')} // Live Tonight
            bands={bandsWithTimes}
            selectedCount={0}
            view="all"
            onViewChange={vi.fn()}
            venueFilter={null}
            onVenueFilterChange={vi.fn()}
            timeFilter="all"
            onTimeFilterChange={vi.fn()}
          />
        )
      })
      expect(liveRegion.textContent).toContain('is now live')

      // Live Tonight -> Upcoming: neither announceable branch matches, but the
      // stale "is now live" text must not be left behind — assert this BEFORE
      // advancing any timers, since the old bug only cleared it "by accident"
      // after a further 5s delay.
      act(() => {
        rerender(
          <LiveContextBar
            eventData={eventData}
            currentTime={new Date('2026-05-06T18:45:00')} // back to Upcoming
            bands={bandsWithTimes}
            selectedCount={0}
            view="all"
            onViewChange={vi.fn()}
            venueFilter={null}
            onVenueFilterChange={vi.fn()}
            timeFilter="all"
            onTimeFilterChange={vi.fn()}
          />
        )
      })
      expect(liveRegion.textContent).toBe('')

      vi.useRealTimers()
    })

    it('does not announce when transitioning within or back to "Upcoming"', () => {
      vi.useFakeTimers()

      const bandsWithTimes = [
        {
          id: '1',
          venue: 'Stage A',
          startMs: new Date('2026-05-06T19:00:00').getTime(),
          endMs: new Date('2026-05-06T19:45:00').getTime(),
        },
      ]

      const { rerender } = render(
        <LiveContextBar
          eventData={eventData}
          currentTime={new Date('2026-05-06T18:00:00')} // Before event
          bands={bandsWithTimes}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )

      const liveRegion = screen.getByRole('status')
      expect(liveRegion.textContent).toBe('')

      // Transition to a different "Upcoming" time — no announcement
      act(() => {
        rerender(
          <LiveContextBar
            eventData={eventData}
            currentTime={new Date('2026-05-06T18:30:00')}
            bands={bandsWithTimes}
            selectedCount={0}
            view="all"
            onViewChange={vi.fn()}
            venueFilter={null}
            onVenueFilterChange={vi.fn()}
            timeFilter="all"
            onTimeFilterChange={vi.fn()}
          />
        )
      })

      expect(liveRegion.textContent).toBe('')

      vi.useRealTimers()
    })
  })

  // #690 residual jank fix, at the rendered-component level (the tests above
  // exercise the pure functions in isolation).
  describe('scroll-driven identity block (#690)', () => {
    afterEach(() => {
      setScrollY(0)
      setViewportWidth(1024)
    })

    it('carries the collapse transition class on the identity block, mount included', () => {
      setViewportWidth(375)
      const { container } = render(
        <LiveContextBar
          eventData={eventData}
          currentTime={new Date('2026-05-06T19:30:00')}
          bands={bands}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )

      const identityBlock = container.querySelector('.sm\\:hidden > div')
      expect(identityBlock).toHaveClass('transition-[max-height,opacity,transform]')
      expect(identityBlock).toHaveClass('duration-150')
    })

    // `inert`/`pointerEvents` flip on the committed scrollProgress value the
    // instant it crosses IDENTITY_GONE_PROGRESS — they are NOT driven by the
    // CSS transition, which now animates the visual opacity/maxHeight toward
    // that state over ~150ms. So for a brief window the block can be
    // slightly visible-but-already-inert (safe: fading out) or briefly
    // non-zero-opacity-but-not-yet-inert only on the way IN (also safe: it's
    // interactive exactly while it's visible). What must never happen, and
    // what this test actually guards, is the old bug: fully invisible
    // (opacity 0) while still interactive/focusable.
    it('flips inert the instant scrollProgress crosses the gone threshold, in step with pointerEvents', async () => {
      setViewportWidth(375)
      setScrollY(0)
      const { container } = render(
        <LiveContextBar
          eventData={eventData}
          currentTime={new Date('2026-05-06T19:30:00')}
          bands={bands}
          selectedCount={0}
          view="all"
          onViewChange={vi.fn()}
          venueFilter={null}
          onVenueFilterChange={vi.fn()}
          timeFilter="all"
          onTimeFilterChange={vi.fn()}
        />
      )
      const identityBlock = () => container.querySelector('.sm\\:hidden > div')

      // Fully open: interactive, not inert.
      expect(identityBlock()).not.toHaveAttribute('inert')
      expect(identityBlock()).toHaveStyle({ pointerEvents: 'auto' })

      // scrollProgress thresholds are useScrollCollapse(48, 240); 0.6 * (240-48) + 48 = ~163,
      // comfortably past IDENTITY_GONE_PROGRESS (~0.571) where the block goes invisible.
      setScrollY(163)
      await fireScroll()
      expect(identityBlock()).toHaveAttribute('inert')
      expect(identityBlock()).toHaveStyle({ pointerEvents: 'none' })
    })
  })
})
