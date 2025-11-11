import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock PerformanceObserver globally for tests (only if not already defined)
if (typeof global.PerformanceObserver === 'undefined') {
  global.PerformanceObserver = class PerformanceObserver {
    constructor(callback) {
      this.callback = callback
      // Don't auto-trigger callback - let tests control this
    }
    observe() {
      // No-op by default - tests can override
    }
    disconnect() {}
    takeRecords() {
      return []
    }
  }
}
