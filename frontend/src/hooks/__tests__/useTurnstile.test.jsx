import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useTurnstile } from '../useTurnstile'

// A real (placeholder) site key so `enabled` is true — the components' own
// tests cover the disabled path via an empty key.
vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-placeholder-site-key')

function Harness({ active }) {
  const { enabled, token, status, errorCode, containerRef, reset, submitWhenReady } = useTurnstile(active)
  return (
    <div>
      <div data-testid="container" ref={containerRef} />
      <span data-testid="token">{token}</span>
      <span data-testid="status">{status}</span>
      <span data-testid="error-code">{errorCode || ''}</span>
      <span data-testid="enabled">{String(enabled)}</span>
      <button type="button" onClick={reset}>
        reset
      </button>
      <button type="button" onClick={() => submitWhenReady(vi.fn())}>
        queue
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

  // A content blocker usually blocks the script itself: no widget, so no
  // error-callback. The hook must notice the script's own `error` event.
  it('retries a failed script load once, then reports script_load_failed', () => {
    delete window.turnstile
    document.querySelectorAll('script[data-turnstile-script="true"]').forEach(s => s.remove())
    render(<Harness active />)
    const scripts = () => document.querySelectorAll('script[data-turnstile-script="true"]')
    expect(scripts()).toHaveLength(1)
    const first = scripts()[0]

    act(() => first.dispatchEvent(new Event('error')))
    expect(scripts()).toHaveLength(1)
    expect(scripts()[0]).not.toBe(first)
    expect(screen.getByTestId('status').textContent).toBe('pending')

    act(() => scripts()[0].dispatchEvent(new Event('error')))
    expect(scripts()).toHaveLength(0)
    expect(screen.getByTestId('status').textContent).toBe('error')
    expect(screen.getByTestId('error-code').textContent).toBe('script_load_failed')
  })

  it("configures retry: 'never' so the hook's one retry is the whole budget", () => {
    render(<Harness active />)
    expect(renderMock.mock.calls[0][1].retry).toBe('never')
  })

  it('returns to idle when deactivated before the widget ever renders', () => {
    delete window.turnstile
    const { rerender } = render(<Harness active />)
    expect(screen.getByTestId('status').textContent).toBe('pending')
    rerender(<Harness active={false} />)
    expect(screen.getByTestId('status').textContent).toBe('idle')
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
    expect(screen.getByTestId('status').textContent).toBe('ready')

    act(() => config['expired-callback']())
    expect(screen.getByTestId('token').textContent).toBe('')
    expect(screen.getByTestId('status').textContent).toBe('pending')
  })

  it('retries the first error and exposes the second error', () => {
    render(<Harness active={true} />)
    const [, config] = renderMock.mock.calls[0]

    act(() => config['error-callback']('network-error'))
    expect(window.turnstile.reset).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status').textContent).toBe('pending')

    act(() => config['error-callback']('blocked'))
    expect(window.turnstile.reset).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status').textContent).toBe('error')
    expect(screen.getByTestId('error-code').textContent).toBe('blocked')
  })

  it('clears an error when a token arrives', () => {
    render(<Harness active={true} />)
    const [, config] = renderMock.mock.calls[0]

    act(() => config['error-callback']('blocked'))
    act(() => config.callback('tok-recovered'))

    expect(screen.getByTestId('status').textContent).toBe('ready')
    expect(screen.getByTestId('error-code').textContent).toBe('')
  })

  it('submits a queued callback exactly once when a token arrives', () => {
    const submit = vi.fn()
    function SubmitHarness() {
      const { containerRef, submitWhenReady } = useTurnstile(true)
      return (
        <>
          <div ref={containerRef} />
          <button type="button" onClick={() => submitWhenReady(submit)}>
            queue submit
          </button>
        </>
      )
    }

    render(<SubmitHarness />)
    const [, config] = renderMock.mock.calls[0]
    fireEvent.click(screen.getByRole('button', { name: 'queue submit' }))
    expect(submit).not.toHaveBeenCalled()

    act(() => config.callback('tok-queued'))
    expect(submit).toHaveBeenCalledOnce()
    expect(submit).toHaveBeenCalledWith('tok-queued')
  })

  it('drops a queued submit when the widget errors or deactivates', () => {
    const submit = vi.fn()
    function SubmitHarness({ active }) {
      const { containerRef, submitWhenReady } = useTurnstile(active)
      return (
        <>
          <div ref={containerRef} />
          <button type="button" onClick={() => submitWhenReady(submit)}>
            queue submit
          </button>
        </>
      )
    }

    const { rerender } = render(<SubmitHarness active={true} />)
    const [, config] = renderMock.mock.calls[0]
    fireEvent.click(screen.getByRole('button', { name: 'queue submit' }))
    act(() => config['error-callback']('first'))
    act(() => config['error-callback']('second'))
    act(() => config.callback('tok-after-error'))
    expect(submit).not.toHaveBeenCalled()

    rerender(<SubmitHarness active={false} />)
    rerender(<SubmitHarness active={true} />)
    const [, nextConfig] = renderMock.mock.calls[1]
    fireEvent.click(screen.getByRole('button', { name: 'queue submit' }))
    rerender(<SubmitHarness active={false} />)
    act(() => nextConfig.callback('tok-after-deactivate'))
    expect(submit).not.toHaveBeenCalled()
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
