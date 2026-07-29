import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useScrollCollapse } from '../useScrollCollapse'

function Harness({ start, end }) {
  const progress = useScrollCollapse(start, end)
  return <span data-testid="progress">{progress}</span>
}

function setScrollY(y) {
  Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: y })
}

// The hook batches its measurement into a requestAnimationFrame, so dispatching
// the event synchronously is not enough — the frame has to be flushed before the
// committed progress can be asserted.
async function fireScroll() {
  await act(async () => {
    window.dispatchEvent(new Event('scroll'))
    await new Promise(resolve => requestAnimationFrame(resolve))
  })
}

async function fireResize() {
  await act(async () => {
    window.dispatchEvent(new Event('resize'))
    await new Promise(resolve => requestAnimationFrame(resolve))
  })
}

describe('useScrollCollapse', () => {
  afterEach(() => {
    setScrollY(0)
  })

  it('reports 0 before scrolling starts', () => {
    setScrollY(0)
    render(<Harness start={40} end={140} />)
    expect(screen.getByTestId('progress')).toHaveTextContent('0')
  })

  it('clamps to 0 below the start threshold', async () => {
    setScrollY(20)
    render(<Harness start={40} end={140} />)
    await fireScroll()
    expect(screen.getByTestId('progress')).toHaveTextContent('0')
  })

  // These two mount at scrollY 0 and only then scroll, so the asserted value
  // can ONLY have come from the scroll listener — mounting with the target
  // scrollY already set would pass on the mount-time update alone and prove
  // nothing about the listener.
  it('ramps linearly between start and end', async () => {
    setScrollY(0)
    render(<Harness start={40} end={140} />)
    expect(screen.getByTestId('progress')).toHaveTextContent('0')

    setScrollY(90) // halfway between 40 and 140
    await fireScroll()
    expect(screen.getByTestId('progress')).toHaveTextContent('0.5')
  })

  it('does not re-expand when scroll drifts back up mid-page', async () => {
    setScrollY(0)
    render(<Harness start={40} end={140} />)

    setScrollY(140) // fully collapsed
    await fireScroll()
    expect(screen.getByTestId('progress')).toHaveTextContent('1')

    setScrollY(90) // URL-bar-sized jump back up, still mid-page
    await fireScroll()
    expect(screen.getByTestId('progress')).toHaveTextContent('1')

    setScrollY(78) // small drift
    await fireScroll()
    expect(screen.getByTestId('progress')).toHaveTextContent('1')
  })

  it('recomputes on resize alone, without any scroll event', async () => {
    // iOS fires resize when the URL bar collapses. Dispatch ONLY resize, so
    // this fails if the listener is dropped even while scroll still works.
    setScrollY(0)
    render(<Harness start={40} end={140} />)
    expect(screen.getByTestId('progress')).toHaveTextContent('0')

    setScrollY(140)
    await fireResize()
    expect(screen.getByTestId('progress')).toHaveTextContent('1')
  })

  it('releases on a deliberate upward drag and then expands gradually', async () => {
    // A pure ratchet left scrolling up dead until scrollY reached `start`, then
    // snapped open. Small successive upward steps are a finger drag and must
    // release it, after which progress tracks scroll again.
    setScrollY(0)
    render(<Harness start={40} end={140} />)
    setScrollY(140)
    await fireScroll()
    expect(screen.getByTestId('progress')).toHaveTextContent('1')

    // Drag up in drag-sized increments: 8px x 8 = 64px, reaching the threshold.
    let y = 140
    for (let i = 0; i < 8; i++) {
      y -= 8
      setScrollY(y)
      await fireScroll()
    }
    // y is now 76, so raw = (76-40)/100 = 0.36. Assert that exact value: `< 1`
    // would also pass if a regression snapped progress straight to 0.
    expect(Number(screen.getByTestId('progress').textContent)).toBeCloseTo(0.36, 2)
  })

  it('a single URL-bar-sized upward jump never releases it', async () => {
    // ~60px arriving as ONE discontinuity is a viewport shift, not a drag. It
    // exceeds the per-step cap and must contribute nothing, however often it
    // repeats — this is the #690 flicker.
    setScrollY(0)
    render(<Harness start={40} end={140} />)
    setScrollY(140)
    await fireScroll()

    // The jump must exceed the 64px release threshold, or the per-step cap is
    // never exercised. Assert before scrolling back down: downward movement
    // re-ratchets to 1 and would mask a mid-loop release.
    for (let i = 0; i < 5; i++) {
      setScrollY(60) // 80px up in a single step
      await fireScroll()
      expect(screen.getByTestId('progress')).toHaveTextContent('1')
      setScrollY(140)
      await fireScroll()
    }
  })

  it('downward movement resets the upward accumulator', async () => {
    // Otherwise upward jitter would accumulate across an entire long scroll and
    // eventually release the ratchet for no deliberate reason.
    setScrollY(0)
    render(<Harness start={40} end={140} />)
    setScrollY(140)
    await fireScroll()

    // Alternate up 8 / down 8: never a sustained upward drag.
    for (let i = 0; i < 12; i++) {
      setScrollY(132)
      await fireScroll()
      setScrollY(140)
      await fireScroll()
    }
    expect(screen.getByTestId('progress')).toHaveTextContent('1')
  })

  it('releases the ratchet once the user is back at the top', async () => {
    setScrollY(0)
    render(<Harness start={40} end={140} />)

    setScrollY(140)
    await fireScroll()
    expect(screen.getByTestId('progress')).toHaveTextContent('1')

    setScrollY(40) // at the start threshold — release
    await fireScroll()
    expect(screen.getByTestId('progress')).toHaveTextContent('0')
  })

  it('clamps to 1 at and beyond the end threshold', async () => {
    setScrollY(0)
    render(<Harness start={40} end={140} />)
    expect(screen.getByTestId('progress')).toHaveTextContent('0')

    setScrollY(500)
    await fireScroll()
    expect(screen.getByTestId('progress')).toHaveTextContent('1')
  })

  // The anti-jitter guarantee this hook exists for (#665): progress is a
  // pure function of `window.scrollY` alone, never of anything the
  // collapsing element itself renders — so a caller re-rendering in
  // response to a progress change can't feed back into another scroll
  // measurement and oscillate.
  it('is driven only by scrollY, not by re-renders with no scroll event', () => {
    setScrollY(90)
    const { rerender } = render(<Harness start={40} end={140} />)
    fireScroll()
    expect(screen.getByTestId('progress')).toHaveTextContent('0.5')

    // A prop change causing a re-render without a new scroll event must not
    // change the reported progress.
    rerender(<Harness start={40} end={140} />)
    expect(screen.getByTestId('progress')).toHaveTextContent('0.5')
  })
})
