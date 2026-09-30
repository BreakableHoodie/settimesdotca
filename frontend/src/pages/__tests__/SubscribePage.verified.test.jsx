import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SubscribePage from '../SubscribePage.jsx'

const turnstileMock = vi.hoisted(() => ({
  enabled: false,
  token: '',
  status: 'idle',
  containerRef: { current: null },
  reset: vi.fn(),
  submitWhenReady: submit => submit(''),
  queuedSubmit: null,
}))

// trackPageView is faked so no metrics request is queued behind the tests'
// fetch assertions; the rest of the module (trackEvent) stays real.
const trackPageViewMock = vi.hoisted(() => vi.fn())
vi.mock('../../utils/metrics', async importOriginal => ({
  ...(await importOriginal()),
  trackPageView: trackPageViewMock,
}))

// Keep the module's real exports (the shared message copy) and fake only the hook.
vi.mock('../../hooks/useTurnstile', async importOriginal => ({
  ...(await importOriginal()),
  useTurnstile: () => turnstileMock,
}))

const renderAt = path => {
  window.history.replaceState(null, '', path)
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/subscribe']}>
        <SubscribePage />
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe('SubscribePage after the confirmation link', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    Object.assign(turnstileMock, {
      enabled: false,
      token: '',
      status: 'idle',
      reset: vi.fn(),
      submitWhenReady: submit => submit(''),
      queuedSubmit: null,
    })
    vi.restoreAllMocks()
  })

  it('confirms the subscription when the verify handler redirects with ?verified=true', () => {
    renderAt('/subscribe?verified=true')
    expect(screen.getByRole('status')).toHaveTextContent("You're subscribed")
  })

  it('drops ?verified from the URL so a later reload cannot claim a new address is confirmed', () => {
    renderAt('/subscribe?verified=true&utm_source=email')
    expect(window.location.search).toBe('?utm_source=email')
  })

  it('records its own page view, so /subscribe visits can be counted', () => {
    trackPageViewMock.mockClear()
    renderAt('/subscribe')
    expect(trackPageViewMock).toHaveBeenCalledWith('/subscribe')
  })

  it('shows no confirmation on a plain visit', () => {
    renderAt('/subscribe')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('submits only the email address', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Subscription created' }),
    })
    renderAt('/subscribe')

    expect(screen.getByRole('textbox', { name: 'Email Address' })).toBeInTheDocument()
    expect(screen.queryByLabelText('City')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Genre Preference')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Email Frequency')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Email Address' }), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const request = fetchSpy.mock.calls[0][1]
    expect(JSON.parse(request.body)).toEqual({ email: 'fan@example.com', turnstileToken: '' })
    fetchSpy.mockRestore()
  })

  it('queues a submit while Turnstile is pending and sends once a token arrives', async () => {
    let queuedSubmit
    Object.assign(turnstileMock, {
      enabled: true,
      status: 'pending',
      submitWhenReady: submit => {
        queuedSubmit = submit
        return false
      },
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Subscription created' }),
    })
    renderAt('/subscribe')
    fireEvent.change(screen.getByRole('textbox', { name: 'Email Address' }), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))

    expect(screen.getByRole('status')).toHaveTextContent("Checking you're human…")
    expect(fetchSpy).not.toHaveBeenCalled()
    await queuedSubmit('token-123')

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).turnstileToken).toBe('token-123')
  })

  // The dead end #1224 exists to remove: the visitor submits while the check
  // is still running, the check then fails, and the queued submit is dropped.
  // The form must say so instead of "Checking…" forever.
  it('switches from "Checking…" to the content-blocker message if Turnstile fails after a queued submit', () => {
    Object.assign(turnstileMock, { enabled: true, status: 'pending', submitWhenReady: () => false })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const view = renderAt('/subscribe')
    fireEvent.change(screen.getByRole('textbox', { name: 'Email Address' }), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))
    expect(screen.getByRole('status')).toHaveTextContent("Checking you're human…")

    turnstileMock.status = 'error'
    view.rerender(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/subscribe']}>
          <SubscribePage />
        </MemoryRouter>
      </HelmetProvider>
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      "Verification couldn't load. Turn off content blockers for this page, or try another browser."
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows the content-blocker message after Turnstile errors', () => {
    Object.assign(turnstileMock, {
      enabled: true,
      status: 'error',
      submitWhenReady: () => false,
    })
    renderAt('/subscribe')
    fireEvent.change(screen.getByRole('textbox', { name: 'Email Address' }), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      "Verification couldn't load. Turn off content blockers for this page, or try another browser."
    )
    expect(screen.getByRole('status')).not.toHaveTextContent('Please complete the bot verification challenge.')
  })
})
