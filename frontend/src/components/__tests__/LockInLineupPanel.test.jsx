import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LockInLineupPanel from '../LockInLineupPanel'

// Turnstile is not available in jsdom — ensure the env var is empty so the
// component treats Turnstile as disabled (no site key = bot protection off).
// This lets us exercise the full submit path without mocking the Turnstile API.
vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')

const PERFORMANCE_IDS = [10, 20, 30]
const BAND_COUNT = 3

function renderPanel(props = {}) {
  return render(<LockInLineupPanel performanceIds={PERFORMANCE_IDS} bandCount={BAND_COUNT} {...props} />)
}

describe('LockInLineupPanel', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  // ── Render guard ───────────────────────────────────────────────────────────

  it('renders nothing when performanceIds is empty', () => {
    const { container } = render(<LockInLineupPanel performanceIds={[]} bandCount={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when performanceIds is undefined', () => {
    // Defensive: callers might not pass the prop during initial load
    const { container } = render(<LockInLineupPanel performanceIds={undefined} bandCount={0} />)
    expect(container.firstChild).toBeNull()
  })

  // ── Idle render ────────────────────────────────────────────────────────────

  it('renders the "Lock in your lineup" heading', () => {
    renderPanel()
    expect(screen.getByRole('heading', { name: /lock in your lineup/i })).toBeInTheDocument()
  })

  it('shows the correct band count in the CTA copy', () => {
    renderPanel({ bandCount: 5 })
    expect(screen.getByText(/5/)).toBeInTheDocument()
    expect(screen.getByText(/bands/)).toBeInTheDocument()
  })

  it('uses singular "band" copy when bandCount is 1', () => {
    renderPanel({ performanceIds: [42], bandCount: 1 })
    // Should say "1 band plays" (singular)
    expect(screen.getByText(/1/)).toBeInTheDocument()
    // "bands" should NOT appear in the description
    const desc = screen.getByText(/plays\. One click confirms/i)
    expect(desc.textContent).toMatch(/\b1\b/)
    expect(desc.textContent).not.toMatch(/bands/)
  })

  it('renders the email input and Notify me button', () => {
    renderPanel()
    expect(screen.getByLabelText(/your email address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument()
  })

  it('button is enabled when Turnstile is disabled (no site key)', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /notify me/i })).not.toBeDisabled()
  })

  // ── Submit ─────────────────────────────────────────────────────────────────

  it('POST /api/bands/follow-batch with the right body on submit', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })

    renderPanel()
    fireEvent.change(screen.getByLabelText(/your email address/i), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /notify me/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/bands/follow-batch')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.email).toBe('fan@example.com')
    expect(body.performance_ids).toEqual(PERFORMANCE_IDS)
    // turnstileToken should be '' (disabled in test env)
    expect(body.turnstileToken).toBe('')
  })

  it('shows the success state after a successful submit', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })

    renderPanel()
    fireEvent.change(screen.getByLabelText(/your email address/i), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /notify me/i }))

    await waitFor(() => {
      expect(screen.getByText(/check your email to confirm/i)).toBeInTheDocument()
    })
    // Form should be gone
    expect(screen.queryByRole('button', { name: /notify me/i })).not.toBeInTheDocument()
  })

  it('success copy mentions the correct band count', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })

    renderPanel({ bandCount: 7 })
    fireEvent.change(screen.getByLabelText(/your email address/i), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /notify me/i }))

    await waitFor(() => {
      expect(screen.getByText(/7 bands/i)).toBeInTheDocument()
    })
  })

  // ── Error handling ─────────────────────────────────────────────────────────

  it('shows an error message when the API returns a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Rate limit exceeded' }),
    })

    renderPanel()
    fireEvent.change(screen.getByLabelText(/your email address/i), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /notify me/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('Rate limit exceeded')
    })
    // Form should still be visible so the user can retry
    expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument()
  })

  it('shows a fallback error when the API response has no error field', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    })

    renderPanel()
    fireEvent.change(screen.getByLabelText(/your email address/i), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /notify me/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('shows an error message when fetch itself throws (network error)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network failure'))

    renderPanel()
    fireEvent.change(screen.getByLabelText(/your email address/i), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /notify me/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network failure')
    })
  })

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows "Saving…" while the request is in flight', async () => {
    let resolve
    fetchMock.mockReturnValueOnce(new Promise(res => (resolve = res)))

    renderPanel()
    fireEvent.change(screen.getByLabelText(/your email address/i), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /notify me/i }))

    expect(await screen.findByText('Saving…')).toBeInTheDocument()

    // Clean up: resolve the pending fetch so no state updates leak
    resolve({ ok: true, json: async () => ({ success: true }) })
    await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument())
  })
})
