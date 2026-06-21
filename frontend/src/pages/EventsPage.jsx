import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import EventTimeline from '../components/EventTimeline'
import Footer from '../components/Footer'
import PrivacyBanner from '../components/PrivacyBanner'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { trackPageView } from '../utils/metrics'
import { hasAnySchedule, getScheduleEventSlug, SELECTED_BANDS_KEY } from '../utils/scheduleStorage'
import { ArrowRight, CalendarDays, Users } from 'lucide-react'

export default function EventsPage() {
  useEffect(() => {
    trackPageView('/')
  }, [])

  const [showBanner, setShowBanner] = useState(() => hasAnySchedule())
  const [scheduleSlug, setScheduleSlug] = useState(() => getScheduleEventSlug())

  const refreshBanner = useCallback(() => {
    setShowBanner(hasAnySchedule())
    setScheduleSlug(getScheduleEventSlug())
  }, [])

  useEffect(() => {
    const handleStorage = e => {
      if (e.key === SELECTED_BANDS_KEY) refreshBanner()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshBanner()
    }
    window.addEventListener('storage', handleStorage)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [refreshBanner])

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-gradient-dark">
      <Helmet>
        <title>SetTimes – Live Music Events &amp; Show Schedules</title>
        <meta
          name="description"
          content="Discover upcoming live music events and build your personalized show schedule. Browse artists, venues, and set times all in one place."
        />
        <link rel="canonical" href="https://settimes.ca/" />
        <meta property="og:title" content="SetTimes – Live Music Events & Show Schedules" />
        <meta
          property="og:description"
          content="Discover upcoming live music events and build your personalized show schedule. Browse artists, venues, and set times all in one place."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://settimes.ca/" />
        <meta property="og:site_name" content="SetTimes" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="SetTimes – Live Music Events & Show Schedules" />
        <meta
          name="twitter:description"
          content="Discover upcoming live music events and build your personalized show schedule."
        />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'SetTimes',
            url: 'https://settimes.ca',
            description: 'Discover live music events and build your personalized show schedule.',
          })}
        </script>
      </Helmet>
      <header className="border-b border-accent-500/30 px-4 py-8">
        <div className="container mx-auto flex max-w-7xl items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 text-4xl font-bold text-text-primary font-display">
              <span className="text-accent-500">Set</span>Times
            </h1>
            <p className="text-lg text-accent-400">Discover · Plan · Experience</p>
            <Link
              to="/artists"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-400 transition-colors hover:text-accent-300"
            >
              <Users size={15} aria-hidden="true" /> Browse all artists
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {showBanner && scheduleSlug && (
        <div className="container mx-auto px-4 max-w-7xl pt-6">
          <Link
            to={`/event/${scheduleSlug}`}
            className="flex items-center justify-between gap-3 px-5 py-3 rounded-lg bg-accent-500/15 border border-accent-500/30 hover:bg-accent-500/25 transition-colors group"
          >
            <div className="flex items-center gap-3 text-accent-400">
              <CalendarDays size={16} />
              <span className="text-sm font-medium">You have a schedule in progress</span>
            </div>
            <span className="text-accent-400 text-sm font-medium flex items-center gap-2 group-hover:gap-3 transition-all">
              Continue building
              <ArrowRight size={12} />
            </span>
          </Link>
        </div>
      )}

      <EventTimeline />
      <Footer />
      <PrivacyBanner />
    </main>
  )
}
