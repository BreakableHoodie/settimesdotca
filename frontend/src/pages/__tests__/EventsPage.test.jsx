import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import EventsPage from '../EventsPage.jsx'
import { THEME_KEY, ThemeProvider } from '../../components/ThemeProvider.jsx'

vi.mock('../../components/EventTimeline', () => ({
  default: () => <div>Event timeline</div>,
}))

vi.mock('../../utils/metrics', () => ({
  trackPageView: vi.fn(),
}))

function renderEventsPage() {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter>
          <EventsPage />
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

describe('EventsPage', () => {
  it('shows the theme toggle on the homepage', () => {
    renderEventsPage()

    // Open the minimal swatch picker, then pick the cool-dark (arctic-night) theme.
    fireEvent.click(screen.getByRole('button', { name: /colour theme/i }))
    fireEvent.click(screen.getByRole('button', { name: /cool dark theme/i }))

    expect(document.documentElement.dataset.theme).toBe('arctic-night')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('arctic-night')
  })
})
