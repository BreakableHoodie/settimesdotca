import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

const createStorageMock = () => {
  let store = new Map()

  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(String(key), String(value))
    },
    removeItem: key => {
      store.delete(String(key))
    },
    clear: () => {
      store.clear()
    },
  }
}

const localStorageMock = createStorageMock()
const sessionStorageMock = createStorageMock()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
})
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  configurable: true,
})

beforeEach(() => {
  localStorageMock.clear()
  sessionStorageMock.clear()
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
