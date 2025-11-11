/**
 * Performance Utilities Tests
 *
 * Tests console.log removal for production builds
 * Validates DEV-only logging and performance measurement
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Performance Utilities - Console Logging', () => {
  let consoleLogSpy
  let consoleTableSpy

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleTableSpy = vi.spyOn(console, 'table').mockImplementation(() => {})

    // Clear the listener flag on window to allow fresh listeners in each test
    const LISTENER_ADDED = Symbol.for('performanceListenerAdded')
    if (window[LISTENER_ADDED]) {
      delete window[LISTENER_ADDED]
    }

    // Clear module cache to get fresh imports
    vi.resetModules()
  })

  describe('Development Mode (DEV=true)', () => {
    beforeEach(() => {
      // Mock Vite's import.meta.env.DEV BEFORE importing module
      vi.stubGlobal('import.meta', {
        env: { DEV: true }
      })
      vi.resetModules()
    })

    it('should log performance metrics in dev mode', async () => {
      // Mock performance API
      global.performance = {
        timing: {
          domainLookupStart: 0,
          domainLookupEnd: 10,
          connectStart: 10,
          connectEnd: 20,
          requestStart: 20,
          responseStart: 30,
          responseEnd: 40,
          domContentLoadedEventStart: 40,
          domContentLoadedEventEnd: 50,
          navigationStart: 0,
          loadEventEnd: 100
        },
        getEntriesByType: vi.fn().mockImplementation((type) => {
          if (type === 'navigation') {
            return [{
              domainLookupStart: 0,
              domainLookupEnd: 10,
              connectStart: 10,
              connectEnd: 20,
              requestStart: 20,
              responseStart: 30,
              responseEnd: 40,
              domContentLoadedEventStart: 40,
              domContentLoadedEventEnd: 50,
              fetchStart: 0,
              loadEventEnd: 100
            }]
          } else if (type === 'paint') {
            return [{ name: 'first-contentful-paint', startTime: 50 }]
          }
          return []
        })
      }

      const { measurePageLoad } = await import('../performance.js')

      // Set up listener BEFORE dispatching load event
      measurePageLoad()

      // Trigger load event after listener is set up
      window.dispatchEvent(new Event('load'))

      // Wait for setTimeout(0) callback
      await new Promise(resolve => setTimeout(resolve, 10))

      // Should call console.table in dev mode
      expect(consoleTableSpy).toHaveBeenCalled()
    })

    it('should log LCP metric in dev mode', async () => {
      // Mock PerformanceObserver
      global.PerformanceObserver = class {
        constructor(callback) {
          this.callback = callback
          // Immediately trigger callback for testing
          setTimeout(() => {
            this.callback({
              getEntries: () => [{ startTime: 1500 }]
            })
          }, 0)
        }
        observe() {}
      }

      const { measurePageLoad } = await import('../performance.js')
      
      // Set up listener BEFORE dispatching load event
      measurePageLoad()

      // Trigger load event so getLargestContentfulPaint() is called
      window.dispatchEvent(new Event('load'))

      // Wait for PerformanceObserver callback
      await new Promise(resolve => setTimeout(resolve, 10))

      // Should log LCP in dev mode
      expect(consoleLogSpy).toHaveBeenCalledWith('LCP:', expect.any(Number), 'ms')
    })
  })

  describe('Production Mode (DEV=false)', () => {
    beforeEach(() => {
      // Mock production environment BEFORE importing module
      vi.stubGlobal('import.meta', {
        env: { DEV: false }
      })
      vi.resetModules()
    })

    it('should NOT log performance metrics in production', async () => {
      global.performance = {
        timing: {
          domainLookupStart: 0,
          domainLookupEnd: 10,
          connectStart: 10,
          connectEnd: 20,
          requestStart: 20,
          responseStart: 30,
          responseEnd: 40,
          domContentLoadedEventStart: 40,
          domContentLoadedEventEnd: 50,
          navigationStart: 0,
          loadEventEnd: 100
        },
        getEntriesByType: vi.fn().mockImplementation((type) => {
          if (type === 'navigation') {
            return [{
              domainLookupStart: 0,
              domainLookupEnd: 10,
              connectStart: 10,
              connectEnd: 20,
              requestStart: 20,
              responseStart: 30,
              responseEnd: 40,
              domContentLoadedEventStart: 40,
              domContentLoadedEventEnd: 50,
              fetchStart: 0,
              loadEventEnd: 100
            }]
          } else if (type === 'paint') {
            return [{ name: 'first-contentful-paint', startTime: 50 }]
          }
          return []
        })
      }

      const { measurePageLoad } = await import('../performance.js')

      // Set up listener BEFORE dispatching load event
      measurePageLoad()

      // Trigger load event after listener is set up
      window.dispatchEvent(new Event('load'))
      await new Promise(resolve => setTimeout(resolve, 10))

      // Should NOT call console.table in production
      expect(consoleTableSpy).not.toHaveBeenCalled()
    })

    it('should NOT log LCP metric in production', async () => {
      global.PerformanceObserver = class {
        constructor(callback) {
          this.callback = callback
          setTimeout(() => {
            this.callback({
              getEntries: () => [{ startTime: 1500 }]
            })
          }, 0)
        }
        observe() {}
      }

      const { measurePageLoad } = await import('../performance.js')
      measurePageLoad()

      await new Promise(resolve => setTimeout(resolve, 10))

      // Should NOT log LCP in production
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('Graceful Degradation', () => {
    it('should handle missing Performance API', async () => {
      // Remove performance API
      delete global.performance

      const { measurePageLoad } = await import('../performance.js')

      // Should not throw
      expect(() => measurePageLoad()).not.toThrow()
    })

    it('should handle missing timing property', async () => {
      global.performance = {}

      const { measurePageLoad } = await import('../performance.js')

      expect(() => measurePageLoad()).not.toThrow()
    })

    it('should handle missing PerformanceObserver', async () => {
      delete global.PerformanceObserver

      const { measurePageLoad } = await import('../performance.js')

      expect(() => measurePageLoad()).not.toThrow()
    })
  })

  describe('Metric Calculations', () => {
    beforeEach(() => {
      vi.stubGlobal('import.meta', { env: { DEV: true } })

      // Mock getEntriesByType to return different entries based on type
      global.performance = {
        timing: {
          domainLookupStart: 100,
          domainLookupEnd: 120,
          connectStart: 120,
          connectEnd: 150,
          requestStart: 150,
          responseStart: 200,
          responseEnd: 250,
          domContentLoadedEventStart: 250,
          domContentLoadedEventEnd: 300,
          navigationStart: 0,
          loadEventEnd: 500
        },
        getEntriesByType: vi.fn().mockImplementation((type) => {
          if (type === 'navigation') {
            return [{
              domainLookupStart: 100,
              domainLookupEnd: 120,
              connectStart: 120,
              connectEnd: 150,
              requestStart: 150,
              responseStart: 200,
              responseEnd: 250,
              domContentLoadedEventStart: 250,
              domContentLoadedEventEnd: 300,
              fetchStart: 0,
              loadEventEnd: 500
            }]
          } else if (type === 'paint') {
            return [{ name: 'first-contentful-paint', startTime: 300 }]
          }
          return []
        })
      }
    })

    it('should calculate DNS time correctly', async () => {
      const { measurePageLoad } = await import('../performance.js')

      // Set up listener BEFORE dispatching load event
      measurePageLoad()

      // Trigger load event after listener is set up
      window.dispatchEvent(new Event('load'))
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(consoleTableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          dns: 20 // 120 - 100
        })
      )
    })

    it('should calculate TCP time correctly', async () => {
      const { measurePageLoad } = await import('../performance.js')

      // Set up listener BEFORE dispatching load event
      measurePageLoad()

      // Trigger load event after listener is set up
      window.dispatchEvent(new Event('load'))
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(consoleTableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tcp: 30 // 150 - 120
        })
      )
    })

    it('should calculate total load time correctly', async () => {
      const { measurePageLoad } = await import('../performance.js')

      // Set up listener BEFORE dispatching load event
      measurePageLoad()

      // Trigger load event after listener is set up
      window.dispatchEvent(new Event('load'))
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(consoleTableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          load: 500 // 500 - 0
        })
      )
    })

    it('should extract FCP metric', async () => {
      const { measurePageLoad } = await import('../performance.js')

      // Set up listener BEFORE dispatching load event
      measurePageLoad()

      // Trigger load event after listener is set up
      window.dispatchEvent(new Event('load'))
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(consoleTableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fcp: 300
        })
      )
    })

    it('should return null for missing FCP', async () => {
      global.performance.getEntriesByType = vi.fn().mockImplementation((type) => {
        if (type === 'navigation') {
          return [{
            domainLookupStart: 100,
            domainLookupEnd: 120,
            connectStart: 120,
            connectEnd: 150,
            requestStart: 150,
            responseStart: 200,
            responseEnd: 250,
            domContentLoadedEventStart: 250,
            domContentLoadedEventEnd: 300,
            fetchStart: 0,
            loadEventEnd: 500
          }]
        }
        return [] // No paint entries
      })

      const { measurePageLoad } = await import('../performance.js')

      // Set up listener BEFORE dispatching load event
      measurePageLoad()

      // Trigger load event after listener is set up
      window.dispatchEvent(new Event('load'))
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(consoleTableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fcp: null
        })
      )
    })
  })

  describe('Zero Console.log in Production Build', () => {
    beforeEach(() => {
      // Mock production environment BEFORE importing module
      vi.stubGlobal('import.meta', { env: { DEV: false } })
      
      // Clear the listener flag on window to ensure fresh state
      const LISTENER_ADDED = Symbol.for('performanceListenerAdded')
      if (window[LISTENER_ADDED]) {
        delete window[LISTENER_ADDED]
      }
      
      vi.resetModules()
    })

    it('should have no console.log calls when DEV=false', async () => {

      global.performance = {
        timing: {
          domainLookupStart: 0,
          domainLookupEnd: 10,
          connectStart: 10,
          connectEnd: 20,
          requestStart: 20,
          responseStart: 30,
          responseEnd: 40,
          domContentLoadedEventStart: 40,
          domContentLoadedEventEnd: 50,
          navigationStart: 0,
          loadEventEnd: 100
        },
        getEntriesByType: vi.fn().mockImplementation((type) => {
          if (type === 'navigation') {
            return [{
              domainLookupStart: 0,
              domainLookupEnd: 10,
              connectStart: 10,
              connectEnd: 20,
              requestStart: 20,
              responseStart: 30,
              responseEnd: 40,
              domContentLoadedEventStart: 40,
              domContentLoadedEventEnd: 50,
              fetchStart: 0,
              loadEventEnd: 100
            }]
          } else if (type === 'paint') {
            return [{ name: 'first-contentful-paint', startTime: 50 }]
          }
          return []
        })
      }

      // Don't mock PerformanceObserver for production test - it should not be created
      delete global.PerformanceObserver

      const { measurePageLoad } = await import('../performance.js')

      // Set up listener BEFORE dispatching load event
      measurePageLoad()

      // Trigger load event after listener is set up
      window.dispatchEvent(new Event('load'))
      await new Promise(resolve => setTimeout(resolve, 50))

      // Production build should have ZERO console calls
      expect(consoleLogSpy).not.toHaveBeenCalled()
      expect(consoleTableSpy).not.toHaveBeenCalled()
    })
  })
})
