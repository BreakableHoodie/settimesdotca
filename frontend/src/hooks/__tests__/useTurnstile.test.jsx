import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useTurnstile } from '../useTurnstile'

// A real (placeholder) site key so `enabled` is true — the components' own
// tests cover the disabled path via an empty key.
vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-placeholder-site-key')

function Harness({ active }) {
  const { enabled, token, containerRef, reset } = useTurnstile(active)
  return (
    <div>
      <div data-testid="container" ref={containerRef} />
      <span data-testid="token">{token}</span>
      <span data-testid="enabled">{String(enabled)}</span>
      <button type="button" onClick={reset}>
        reset
      </button>
    </div>
  )
}

describe('useTurnstile', () => {
  let renderMock

  // Simulate the Turnstile script already being present and loaded — the
  // hook's script-injection branch waits for a real network `load` event,
  // which jsdom can't provide.
  const injectLoadedScript = () => {
    const script = document.createElement('script')
    script.setAttribute('data-turnstile-script', 'true')
    document.head.appendChild(script)
  }

  beforeEach(() => {
    renderMock = vi.fn(() => 'widget-1')
    window.turnstile = {
      render: renderMock,
      remove: vi.fn(),
      reset: vi.fn(),
    }
    injectLoadedScript()
  })

  afterEach(() => {
    cleanup()
    delete window.turnstile
    document.querySelectorAll('script[data-turnstile-script="true"]').forEach(s => s.remove())
  })

  it('stays fully dormant while active is false', () => {
    render(<Harness active={false} />)
    expect(renderMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('enabled').textContent).toBe('true')
  })

  it('renders the widget once active, with interaction-only appearance', () => {
    render(<Harness active={true} />)
    expect(renderMock).toHaveBeenCalledTimes(1)
    const [container, config] = renderMock.mock.calls[0]
    expect(container).toBe(screen.getByTestId('container'))
    expect(config.sitekey).toBe('test-placeholder-site-key')
    expect(config.appearance).toBe('interaction-only')
  })

  it('activating after mount defers the render until the flip', () => {
    const { rerender } = render(<Harness active={false} />)
    expect(renderMock).not.toHaveBeenCalled()
    rerender(<Harness active={true} />)
    expect(renderMock).toHaveBeenCalledTimes(1)
  })

  it('does not inject a second script tag for a second active instance', () => {
    render(
      <>
        <Harness active={true} />
        <Harness active={true} />
      </>
    )
    expect(document.querySelectorAll('script[data-turnstile-script="true"]')).toHaveLength(1)
    expect(renderMock).toHaveBeenCalledTimes(2)
  })

  it('exposes the token from the widget callback and clears it on expiry', () => {
    render(<Harness active={true} />)
    const [, config] = renderMock.mock.calls[0]

    fireEvent.click(screen.getByRole('button', { name: 'reset' })) // no-op before token, must not throw
    act(() => config.callback('tok-123'))
    expect(screen.getByTestId('token').textContent).toBe('tok-123')

    act(() => config['expired-callback']())
    expect(screen.getByTestId('token').textContent).toBe('')
  })

  it('reset() clears the token and resets the widget', () => {
    render(<Harness active={true} />)
    const [, config] = renderMock.mock.calls[0]
    act(() => config.callback('tok-456'))
    expect(screen.getByTestId('token').textContent).toBe('tok-456')

    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    expect(screen.getByTestId('token').textContent).toBe('')
    expect(window.turnstile.reset).toHaveBeenCalledWith('widget-1')
  })

  it('removes the widget on unmount', () => {
    const { unmount } = render(<Harness active={true} />)
    unmount()
    expect(window.turnstile.remove).toHaveBeenCalledWith('widget-1')
  })

  it('deactivating tears down and re-activating renders a fresh widget', () => {
    // The consumer contract for form remounts (band-to-band navigation, an
    // emptied list): flip active false, then a later focus re-activates.
    const { rerender } = render(<Harness active={true} />)
    const [, config] = renderMock.mock.calls[0]
    act(() => config.callback('tok-stale'))

    rerender(<Harness active={false} />)
    expect(window.turnstile.remove).toHaveBeenCalledWith('widget-1')
    expect(screen.getByTestId('token').textContent).toBe('') // stale token cleared

    rerender(<Harness active={true} />)
    expect(renderMock).toHaveBeenCalledTimes(2)
  })

  it('survives teardown of a widget whose DOM is already gone', () => {
    window.turnstile.remove.mockImplementation(() => {
      throw new Error('widget not found')
    })
    const { rerender } = render(<Harness active={true} />)
    expect(() => rerender(<Harness active={false} />)).not.toThrow()
    // A fresh activation still works after the failed teardown.
    rerender(<Harness active={true} />)
    expect(renderMock).toHaveBeenCalledTimes(2)
  })
})
