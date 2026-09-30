import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BandProfilePage from '../BandProfilePage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

const turnstileMock = vi.hoisted(() => ({}))

// Keep the module's real exports (the shared message copy) and fake only the hook.
vi.mock('../../hooks/useTurnstile', async importOriginal => ({
  ...(await importOriginal()),
  useTurnstile: () => turnstileMock,
}))

const PROFILE = {
  id: 206,
  name: 'ALL',
  photo_url: null,
  photo_alt_text: null,
  description: null,
  genre: 'Punk',
  origin: null,
  social: {},
  stats: null,
  upcoming: [],
  past: [],
}

const tree = () => (
  <ThemeProvider>
    <HelmetProvider>
      <MemoryRouter initialEntries={['/band/206']}>
        <Routes>
          <Route path="/band/:id" element={<BandProfilePage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  </ThemeProvider>
)

async function submitFollow() {
  const view = render(tree())
  const email = await screen.findByPlaceholderText('your@email.com')
  fireEvent.change(email, { target: { value: 'fan@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
  return view
}

// The Turnstile hand-off on the band page (#1224): the same code as the
// subscribe form and the lineup panel, tested here at page level.
describe('BandProfilePage follow form while Turnstile is still checking', () => {
  let queued
  let fetchSpy

  beforeEach(() => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue(PROFILE)
    queued = undefined
    Object.assign(turnstileMock, {
      enabled: true,
      token: '',
      status: 'pending',
      errorCode: null,
      containerRef: { current: null },
      reset: vi.fn(),
      submitWhenReady: submit => {
        queued = submit
        return false
      },
    })
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows "Checking…", then posts the follow once with the token that arrives', async () => {
    await submitFollow()
    expect(screen.getByText("Checking you're human…")).toHaveAttribute('role', 'status')
    expect(fetchSpy).not.toHaveBeenCalled()

    await queued('token-xyz')

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/bands/206/follow')
    expect(JSON.parse(init.body)).toEqual({ email: 'fan@example.com', turnstileToken: 'token-xyz' })
  })

  it('switches to the announced content-blocker message if Turnstile fails after the click', async () => {
    const view = await submitFollow()
    expect(screen.getByText("Checking you're human…")).toBeInTheDocument()

    turnstileMock.status = 'error'
    view.rerender(tree())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Verification couldn't load. Turn off content blockers for this page, or try another browser."
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
