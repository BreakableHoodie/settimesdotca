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
  const originalResizeObserver = window.ResizeObserver
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'offsetHeight')
  const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine')

  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.style.removeProperty(PRIVACY_BANNER_HEIGHT_VAR)
    window.ResizeObserver = ResizeObserverMock
    Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        return 72
      },
    })
  })

  afterEach(() => {
    document.documentElement.style.removeProperty(PRIVACY_BANNER_HEIGHT_VAR)

    if (originalResizeObserver) {
      window.ResizeObserver = originalResizeObserver
    } else {
      delete window.ResizeObserver
    }

    if (originalOffsetHeight) {
      Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
    } else {
      delete window.HTMLElement.prototype.offsetHeight
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

    // Assert the inline style the component declares, not the computed one.
    // toHaveStyle() routes through getComputedStyle, and jsdom 30's rewritten
    // CSS engine throws on this value ("object null is not iterable") because
    // it tries to resolve the 1rem inside a calc() whose var() is unresolved.
    // Reading .style.bottom skips the CSS engine and is the more precise
    // assertion anyway — it checks what the component sets, not what jsdom
    // derives from it.
    expect(screen.getByText(/you're offline/i).parentElement.style.bottom).toBe(
      'calc(1rem + var(--privacy-banner-height, 0px))'
    )
  })
})
