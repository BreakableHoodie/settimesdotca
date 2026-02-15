import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCompass } from '@fortawesome/free-solid-svg-icons'
import Footer from '../components/Footer'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-band-navy to-band-purple">
      <Helmet>
        <title>Page Not Found | SetTimes</title>
      </Helmet>
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="text-band-orange text-6xl mb-4" aria-hidden="true">
            <FontAwesomeIcon icon={faCompass} />
          </div>
          <h1 className="text-white text-3xl font-bold mb-2">Page Not Found</h1>
          <p className="text-white/70 mb-8">The page you&apos;re looking for doesn&apos;t exist or may have moved.</p>
          <Link
            to="/"
            className="inline-block px-6 py-3 bg-band-orange text-band-navy font-semibold rounded-lg hover:brightness-110 transition-all"
          >
            Back to Events
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  )
}
