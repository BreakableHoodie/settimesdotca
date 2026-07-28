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
