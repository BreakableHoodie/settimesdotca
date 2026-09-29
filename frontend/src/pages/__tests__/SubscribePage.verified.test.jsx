import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SubscribePage from '../SubscribePage.jsx'

vi.mock('../../hooks/useTurnstile', () => ({
  useTurnstile: () => ({ enabled: false, token: '', containerRef: { current: null }, reset: () => {} }),
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
})
