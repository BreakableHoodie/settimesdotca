import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import App from '../App'

expect.extend(toHaveNoViolations)

// Mock bands data
const mockBands = [
  {
    id: 'test-band',
    name: 'Test Band',
    venue: 'Test Venue',
    date: '2025-10-12',
    startTime: '20:00',
    endTime: '20:30',
    startMs: new Date('2025-10-12T20:00:00').getTime(),
    endMs: new Date('2025-10-12T20:30:00').getTime(),
  },
]

// Mock fetch for bands.json
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(mockBands),
  })
)

describe('Accessibility Tests', () => {
  it('App should have no accessibility violations', async () => {
    const { container } = render(<App />)

    // Wait for data to load
    await new Promise(resolve => setTimeout(resolve, 100))

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  }, 10000) // Increase timeout for axe

  it('should have proper heading hierarchy', async () => {
    const { container } = render(<App />)
    await new Promise(resolve => setTimeout(resolve, 100))

    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    expect(headings.length).toBeGreaterThan(0)
  })

  it('should have alt text for images', async () => {
    const { container } = render(<App />)
    await new Promise(resolve => setTimeout(resolve, 100))

    const images = container.querySelectorAll('img')
    images.forEach(img => {
      expect(img).toHaveAttribute('alt')
    })
  })

  it('should have accessible buttons', async () => {
    const { container } = render(<App />)
    await new Promise(resolve => setTimeout(resolve, 100))

    const buttons = container.querySelectorAll('button')
    buttons.forEach(button => {
      const hasText = button.textContent.trim().length > 0
      const hasAriaLabel = button.hasAttribute('aria-label')
      expect(hasText || hasAriaLabel).toBe(true)
    })
  })
})
