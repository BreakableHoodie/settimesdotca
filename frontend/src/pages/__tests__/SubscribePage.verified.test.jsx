import { render, screen } from '@testing-library/react'
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
  afterEach(() => window.history.replaceState(null, '', '/'))

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
})
