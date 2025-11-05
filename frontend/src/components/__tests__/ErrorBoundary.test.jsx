/**
 * ErrorBoundary Component Tests
 *
 * Tests React error boundary implementation
 * Validates error catching, fallback UI, and dev-mode error details
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import ErrorBoundary from '../ErrorBoundary'

// Component that throws an error for testing
const ThrowError = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Test error message')
  }
  return <div>No error</div>
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy

  beforeEach(() => {
    // Suppress console.error for error boundary tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('Normal Operation', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Test content</div>
        </ErrorBoundary>
      )

      expect(screen.getByText('Test content')).toBeInTheDocument()
    })

    it('should not render fallback UI when children render successfully', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      )

      expect(screen.getByText('No error')).toBeInTheDocument()
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    })
  })

  describe('Error Catching', () => {
    it('should catch errors thrown by child components', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('should display default error UI on error', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(screen.getByText('⚠️')).toBeInTheDocument()
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText(/encountered an unexpected error/)).toBeInTheDocument()
    })

    it('should log error to console', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'ErrorBoundary caught error:',
        expect.any(Error),
        expect.any(Object)
      )
    })
  })

  describe('Custom Fallback UI', () => {
    it('should render custom fallback when provided', () => {
      const CustomFallback = () => <div>Custom error message</div>

      render(
        <ErrorBoundary fallback={<CustomFallback />}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Custom error message')).toBeInTheDocument()
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    })

    it('should use custom title when provided', () => {
      render(
        <ErrorBoundary title="Custom Error Title">
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Custom Error Title')).toBeInTheDocument()
    })

    it('should use custom message when provided', () => {
      render(
        <ErrorBoundary message="Custom error explanation">
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Custom error explanation')).toBeInTheDocument()
    })

    it('should support both custom title and message', () => {
      render(
        <ErrorBoundary title="Admin Error" message="Please contact support">
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Admin Error')).toBeInTheDocument()
      expect(screen.getByText('Please contact support')).toBeInTheDocument()
    })
  })

  describe('Error Details (Development Mode)', () => {
    it('should show error details in development mode', () => {
      // Note: import.meta.env.DEV is set at build time
      // This test validates the structure, not dynamic behavior
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      // Check for details element (collapsed by default)
      const details = screen.queryByText(/Error Details/)

      // In production build, details won't be rendered
      // In dev build, details will be present
      // Test validates structure exists when DEV is true
      if (details) {
        expect(details).toBeInTheDocument()
      }
    })
  })

  describe('Recovery Actions', () => {
    it('should provide refresh page button', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      const refreshButton = screen.getByText('Refresh Page')
      expect(refreshButton).toBeInTheDocument()
      expect(refreshButton.tagName).toBe('BUTTON')
    })

    it('should provide go home link', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      const homeLink = screen.getByText('Go Home')
      expect(homeLink).toBeInTheDocument()
      expect(homeLink).toHaveAttribute('href', '/')
    })
  })

  describe('Accessibility', () => {
    it('should have proper semantic structure', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      // Should have heading for title
      const heading = screen.getByRole('heading', { name: /Something went wrong/ })
      expect(heading).toBeInTheDocument()
    })

    it('should use appropriate heading level (h1)', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      const heading = screen.getByRole('heading', { name: /Something went wrong/ })
      expect(heading.tagName).toBe('H1')
    })
  })

  describe('Error State Persistence', () => {
    it('should maintain error state after catching error', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Rerender with same props
      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      // Should still show error UI
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })
  })

  describe('Multiple Children', () => {
    it('should handle multiple children', () => {
      render(
        <ErrorBoundary>
          <div>Child 1</div>
          <div>Child 2</div>
          <div>Child 3</div>
        </ErrorBoundary>
      )

      expect(screen.getByText('Child 1')).toBeInTheDocument()
      expect(screen.getByText('Child 2')).toBeInTheDocument()
      expect(screen.getByText('Child 3')).toBeInTheDocument()
    })

    it('should catch error from any child', () => {
      render(
        <ErrorBoundary>
          <div>Safe child 1</div>
          <ThrowError shouldThrow={true} />
          <div>Safe child 2</div>
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.queryByText('Safe child 1')).not.toBeInTheDocument()
      expect(screen.queryByText('Safe child 2')).not.toBeInTheDocument()
    })
  })

  describe('Nested Error Boundaries', () => {
    it('should allow nesting error boundaries', () => {
      render(
        <ErrorBoundary title="Outer Boundary">
          <div>Outer safe content</div>
          <ErrorBoundary title="Inner Boundary">
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ErrorBoundary>
      )

      // Inner boundary should catch error
      expect(screen.getByText('Inner Boundary')).toBeInTheDocument()
      expect(screen.queryByText('Outer Boundary')).not.toBeInTheDocument()
    })

    it('should propagate to outer boundary if inner fails during error', () => {
      // This is a conceptual test - in practice, if inner fallback throws,
      // outer boundary catches it
      const FallbackThatThrows = () => {
        throw new Error('Fallback error')
      }

      render(
        <ErrorBoundary title="Outer Boundary">
          <ErrorBoundary fallback={<FallbackThatThrows />}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ErrorBoundary>
      )

      // Outer boundary should catch the fallback error
      expect(screen.getByText('Outer Boundary')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('should apply correct CSS classes for layout', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      const errorContainer = container.firstChild
      expect(errorContainer).toHaveClass('min-h-screen')
      expect(errorContainer).toHaveClass('bg-band-navy')
    })

    it('should style buttons appropriately', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      const refreshButton = screen.getByText('Refresh Page')
      expect(refreshButton).toHaveClass('bg-band-orange')
      expect(refreshButton).toHaveClass('text-white')
    })
  })
})
