import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import OfflineIndicator from '../OfflineIndicator'
import PrivacyBanner from '../PrivacyBanner'

const PRIVACY_BANNER_HEIGHT_VAR = '--privacy-banner-height'

class ResizeObserverMock {
  constructor(callback) {
    this.callback = callback
  }

  observe() {
    this.callback([])
  }

  disconnect() {}
}

describe('Privacy banner layout coordination', () => {
  const originalResizeObserver = global.ResizeObserver
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine')

  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.style.removeProperty(PRIVACY_BANNER_HEIGHT_VAR)
    global.ResizeObserver = ResizeObserverMock
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        return 72
      },
    })
  })

  afterEach(() => {
    document.documentElement.style.removeProperty(PRIVACY_BANNER_HEIGHT_VAR)

    if (originalResizeObserver) {
      global.ResizeObserver = originalResizeObserver
    } else {
      delete global.ResizeObserver
    }

    if (originalOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
    } else {
      delete HTMLElement.prototype.offsetHeight
    }

    if (originalOnLine) {
      Object.defineProperty(window.navigator, 'onLine', originalOnLine)
    }
  })

  it('publishes its height as a CSS variable and clears it when dismissed', async () => {
    render(
      <MemoryRouter>
        <PrivacyBanner />
      </MemoryRouter>
    )

    expect(await screen.findByText(/we collect anonymous usage data/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue(PRIVACY_BANNER_HEIGHT_VAR)).toBe('72px')
    })

    fireEvent.click(screen.getByRole('button', { name: /got it/i }))

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue(PRIVACY_BANNER_HEIGHT_VAR)).toBe('')
    })
  })

  it('offsets the offline indicator above the privacy banner space', () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    })

    render(<OfflineIndicator />)

    expect(screen.getByText(/you're offline/i).parentElement).toHaveStyle({
      bottom: 'calc(1rem + var(--privacy-banner-height, 0px))',
    })
  })
})
