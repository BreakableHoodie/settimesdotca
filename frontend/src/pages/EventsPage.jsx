import { useEffect } from 'react'
import EventTimeline from '../components/EventTimeline'
import Footer from '../components/Footer'
import PrivacyBanner from '../components/PrivacyBanner'
import { trackPageView } from '../utils/metrics'

export default function EventsPage() {
  useEffect(() => {
    trackPageView('/')
  }, [])

  return (
    <div className="min-h-screen bg-gradient-dark">
      <header className="py-8 px-4 text-center border-b border-accent-500/30">
        <h1 className="text-4xl font-bold text-white font-display mb-2">
          <span className="text-accent-500">Set</span>Times
        </h1>
        <p className="text-accent-400 text-lg">Discover · Plan · Experience</p>
      </header>

      <EventTimeline />
      <Footer />
      <PrivacyBanner />
    </div>
  )
}
