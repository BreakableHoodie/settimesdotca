import { Compass } from 'lucide-react'
import { useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import Footer from '../components/Footer'

export default function NotFoundPage() {
  // react-helmet-async does not reliably set document.title in React 19 — set it
  // directly to match the <Helmet> title below. See BandProfilePage.jsx.
  useEffect(() => {
    document.title = 'Page Not Found | SetTimes'
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-br from-bg-navy to-bg-purple">
      <Helmet>
        <title>Page Not Found | SetTimes</title>
      </Helmet>
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="text-accent-400 mb-4" aria-hidden="true">
            <Compass size={60} />
          </div>
          <h1 className="text-text-primary text-3xl font-bold mb-2">Page Not Found</h1>
          <p className="text-text-secondary mb-8">
            The page you&apos;re looking for doesn&apos;t exist or may have moved.
          </p>
          <Link
            to="/"
            className="inline-block px-6 py-3 bg-accent-500 text-bg-navy font-semibold rounded-lg hover:brightness-110 transition-all"
          >
            Back to Events
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  )
}
