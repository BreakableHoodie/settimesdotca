/**
 * Performance Utilities Tests
 *
 * Validates DEV-only logging and performance measurement
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const LISTENER_ADDED = Symbol.for('performanceListenerAdded')

describe('Performance Utilities - Console Logging', () => {
  let consoleLogSpy
  let consoleTableSpy

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleTableSpy = vi.spyOn(console, 'table').mockImplementation(() => {})

    if (window[LISTENER_ADDED]) {
      delete window[LISTENER_ADDED]
    }

    delete globalThis.__APP_DEV__
    vi.resetModules()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleTableSpy.mockRestore()
    delete globalThis.__APP_DEV__
  })

  describe('Development Mode (DEV=true)', () => {
    beforeEach(() => {
      globalThis.__APP_DEV__ = true
      vi.resetModules()
    })

    it('should log performance metrics in dev mode', async () => {
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
          loadEventEnd: 100,
          fetchStart: 0,
        },
        getEntriesByType: vi.fn().mockImplementation(type => {
          if (type === 'navigation') {
            return [
              {
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
                loadEventEnd: 100,
              },
            ]
          }
          if (type === 'paint') {
            return [{ name: 'first-contentful-paint', startTime: 50 }]
          }
          return []
        }),
      }

      const { measurePageLoad } = await import('../performance.js')
      measurePageLoad()
      window.dispatchEvent(new Event('load'))
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(consoleTableSpy).toHaveBeenCalled()
    })

    it('should log LCP metric in dev mode', async () => {
      global.PerformanceObserver = class {
        constructor(callback) {
          this.callback = callback
          setTimeout(() => {
            this.callback({ getEntries: () => [{ startTime: 1500 }] })
          }, 0)
        }
        observe() {}
      }

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
          loadEventEnd: 100,
          fetchStart: 0,
        },
        getEntriesByType: vi.fn().mockReturnValue([{ name: 'first-contentful-paint', startTime: 50 }]),
      }

      const { measurePageLoad } = await import('../performance.js')
      measurePageLoad()
      window.dispatchEvent(new Event('load'))
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(consoleLogSpy).toHaveBeenCalledWith('LCP:', expect.any(Number), 'ms')
    })
  })

  describe('Production Mode (DEV=false)', () => {
    beforeEach(() => {
      globalThis.__APP_DEV__ = false
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
          loadEventEnd: 100,
          fetchStart: 0,
        },
        getEntriesByType: vi.fn().mockReturnValue([]),
      }

      const { measurePageLoad } = await import('../performance.js')
      measurePageLoad()
      window.dispatchEvent(new Event('load'))
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(consoleTableSpy).not.toHaveBeenCalled()
    })

    it('should NOT log LCP metric in production', async () => {
      global.PerformanceObserver = class {
        constructor(callback) {
          this.callback = callback
          setTimeout(() => {
            this.callback({ getEntries: () => [{ startTime: 1500 }] })
          }, 0)
        }
        observe() {}
      }

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
          loadEventEnd: 100,
          fetchStart: 0,
        },
        getEntriesByType: vi.fn().mockReturnValue([]),
      }

      const { measurePageLoad } = await import('../performance.js')
      measurePageLoad()
      window.dispatchEvent(new Event('load'))
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('Graceful Degradation', () => {
    it('should handle missing Performance API', async () => {
      delete global.performance

      const { measurePageLoad } = await import('../performance.js')

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
      globalThis.__APP_DEV__ = true
      vi.resetModules()

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
          loadEventEnd: 500,
          fetchStart: 0,
        },
        getEntriesByType: vi.fn().mockImplementation(type => {
          if (type === 'navigation') {
            return [
              {
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
                loadEventEnd: 500,
              },
            ]
          }
          if (type === 'paint') {
            return [{ name: 'first-contentful-paint', startTime: 300 }]
          }
          return []
        }),
      }
    })

    async function runAndFlush() {
      const { measurePageLoad } = await import('../performance.js')
      measurePageLoad()
      window.dispatchEvent(new Event('load'))
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    it('should calculate DNS time correctly', async () => {
      await runAndFlush()
      expect(consoleTableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          dns: 20,
        })
      )
    })

    it('should calculate TCP time correctly', async () => {
      await runAndFlush()
      expect(consoleTableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tcp: 30,
        })
      )
    })

    it('should calculate total load time correctly', async () => {
      await runAndFlush()
      expect(consoleTableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          load: 500,
        })
      )
    })

    it('should extract FCP metric', async () => {
      await runAndFlush()
      expect(consoleTableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fcp: 300,
        })
      )
    })

    it('should return null for missing FCP', async () => {
      global.performance.getEntriesByType = vi.fn().mockReturnValue([])
      await runAndFlush()
      expect(consoleTableSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fcp: null,
        })
      )
    })
  })

  describe('Zero Console.log in Production Build', () => {
    it('should have no console.log calls when DEV=false', async () => {
      globalThis.__APP_DEV__ = false
      vi.resetModules()

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
          loadEventEnd: 100,
          fetchStart: 0,
        },
        getEntriesByType: vi.fn().mockReturnValue([]),
      }

      const { measurePageLoad } = await import('../performance.js')
      measurePageLoad()
      window.dispatchEvent(new Event('load'))
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(consoleLogSpy).not.toHaveBeenCalled()
      expect(consoleTableSpy).not.toHaveBeenCalled()
    })
  })
})
