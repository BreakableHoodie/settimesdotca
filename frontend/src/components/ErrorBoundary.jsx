import { Component } from 'react'
import { Link, useInRouterContext } from 'react-router-dom'

/**
 * ErrorBoundary - Catches React component errors and displays fallback UI
 *
 * Usage:
 * <ErrorBoundary fallback={<CustomError />}>
 *   <ComponentThatMightError />
 * </ErrorBoundary>
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('ErrorBoundary caught error:', error, errorInfo)

    this.setState({
      error,
      errorInfo,
    })

    // Could send to error tracking service (Sentry, etc.)
    // trackError(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const showDevDetails = import.meta.env.DEV
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-band-navy flex items-center justify-center px-4">
          <div className="max-w-lg w-full bg-band-purple rounded-xl border-2 border-red-500/30 p-8 text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-3xl font-bold text-white mb-4">{this.props.title || 'Something went wrong'}</h1>
            <p className="text-white/70 mb-6">
              {this.props.message || 'The application encountered an unexpected error. Please try refreshing the page.'}
            </p>

            {/* Show error details in development */}
            {showDevDetails && this.state.error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-band-orange hover:text-orange-400 mb-2">
                  Error Details (Dev Only)
                </summary>
                <div className="bg-band-navy p-4 rounded text-sm text-white/80 overflow-auto max-h-60">
                  <p className="font-mono text-red-400 mb-2">{this.state.error.toString()}</p>
                  {this.state.errorInfo && (
                    <pre className="text-xs whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                  )}
                </div>
              </details>
            )}

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors font-medium"
              >
                Refresh Page
              </button>
              <HomeLink className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors font-medium" />
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function HomeLink({ className }) {
  const inRouter = useInRouterContext()

  if (!inRouter) {
    return (
      <a href="/" className={className}>
        Go Home
      </a>
    )
  }

  return (
    <Link to="/" className={className}>
      Go Home
    </Link>
  )
}

export default ErrorBoundary
