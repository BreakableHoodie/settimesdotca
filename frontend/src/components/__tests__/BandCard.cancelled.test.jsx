import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BandCard from '../BandCard'

expect.extend(toHaveNoViolations)

// A set that IS currently playing by the clock, so any suppression assertion
// below proves the guard fired -- not merely that the fixture lacked data.
const NOW = new Date('2026-08-07T20:30:00-04:00')
const baseBand = {
  id: 1,
  name: 'Deer Fang',
  venue: 'Room 47',
  startTime: '20:00',
  endTime: '21:00',
  startMs: +new Date('2026-08-07T20:00:00-04:00'),
  endMs: +new Date('2026-08-07T21:00:00-04:00'),
  is_cancelled: 0,
}

const renderCard = (overrides = {}, onToggle = vi.fn()) =>
  render(
    <MemoryRouter>
      <BandCard band={{ ...baseBand, ...overrides }} currentTime={NOW} onToggle={onToggle} />
    </MemoryRouter>
  )

describe('BandCard — cancelled sets', () => {
  // Deviation from the plan's literal test code: isHappeningNow() (in
  // utils/timeFilter.js) reads the real wall clock via getCurrentDateTime(),
  // which ONLY honours globalThis.__debugScheduleTime -- it never reads the
  // `currentTime` PROP passed to BandCard (that prop only feeds
  // isStartingSoon's minutesUntil math, see BandCard.jsx). Without pinning
  // this debug hook, the "playing" fixture below wouldn't actually be
  // "playing" whenever the suite happened to run on a different real-world
  // date, and "says Live Now for a playing set" would silently pass or fail
  // by coincidence rather than by design. This is the same override
  // timeFilter.test.js already uses for exactly this reason.
  beforeEach(() => {
    globalThis.__debugScheduleTime = NOW
  })
  afterEach(() => {
    delete globalThis.__debugScheduleTime
  })

  // WCAG 1.4.1 (Use of Colour): cancellation must NOT be carried by the
  // strikethrough alone. `text-decoration: line-through` is not announced by
  // NVDA or JAWS by default, so a screen-reader user would hear an ordinary
  // set. The visible "Cancelled" text is the accessible carrier; the <s> is
  // the sighted redundancy. Assert BOTH, and that they sit on the same card.
  it('conveys cancellation in text, not by strikethrough alone (WCAG 1.4.1)', async () => {
    const { container } = renderCard({ is_cancelled: 1 })

    const struck = container.querySelector('s')
    expect(struck).not.toBeNull()
    expect(struck.textContent).toContain('Deer Fang')

    // The state reaches the accessibility tree as text, independent of styling.
    expect(container.textContent).toMatch(/cancelled/i)

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations when NOT cancelled either (baseline)', async () => {
    const { container } = renderCard({ is_cancelled: 0 })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows a visible Cancelled pill', () => {
    renderCard({ is_cancelled: 1 })
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('strikes through the band name', () => {
    renderCard({ is_cancelled: 1 })
    expect(screen.getByText('Deer Fang').closest('s')).not.toBeNull()
  })

  it('says Live Now for a playing set that is NOT cancelled', () => {
    // Baseline: proves the fixture really is inside its set window.
    renderCard({ is_cancelled: 0 })
    expect(screen.getByText('Live Now')).toBeInTheDocument()
  })

  it('does NOT say Live Now when the same playing set is cancelled', () => {
    renderCard({ is_cancelled: 1 })
    expect(screen.queryByText('Live Now')).toBeNull()
  })

  it('hides the add/remove toggle', () => {
    renderCard({ is_cancelled: 1 })
    expect(screen.queryByRole('button', { name: /route/i })).toBeNull()
  })

  it('does not fire onToggle when a cancelled card is clicked', () => {
    // Deviation from the plan's literal test code: it clicked the band-name
    // text, which lives inside a <Link> that already calls
    // e.stopPropagation() on its own onClick (BandCard.jsx) for an unrelated
    // reason (so the profile link doesn't also toggle the card). That click
    // never reaches the wrapper div's onClick regardless of is_cancelled, so
    // the assertion would pass identically whether or not the suppression
    // below is implemented -- a vacuous test. Clicking the wrapper directly
    // (`container.firstChild`) is the same target the pre-existing
    // "click/keyboard toggle" describe block below already uses to prove
    // toggle suppression (see the `clickable: false` case in
    // BandCard.test.jsx), so this mirrors an established, non-vacuous
    // pattern instead.
    const onToggle = vi.fn()
    const { container } = renderCard({ is_cancelled: 1 }, onToggle)
    fireEvent.click(container.firstChild)
    expect(onToggle).not.toHaveBeenCalled()
  })
})
