import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import EventTimeline from '../components/EventTimeline'
import Footer from '../components/Footer'
import PrivacyBanner from '../components/PrivacyBanner'
import { trackPageView } from '../utils/metrics'
import { hasAnySchedule, getScheduleEventSlug } from '../utils/scheduleStorage'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCalendarDays, faArrowRight } from '@fortawesome/free-solid-svg-icons'

export default function EventsPage() {
  useEffect(() => {
    trackPageView('/')
  }, [])

  const showBanner = useMemo(() => hasAnySchedule(), [])
  const scheduleSlug = useMemo(() => getScheduleEventSlug(), [])

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Helmet>
        <title>SetTimes</title>
      </Helmet>
      <header className="py-8 px-4 text-center border-b border-accent-500/30">
        <h1 className="text-4xl font-bold text-white font-display mb-2">
          <span className="text-accent-500">Set</span>Times
        </h1>
        <p className="text-accent-400 text-lg">Discover · Plan · Experience</p>
      </header>

      {showBanner && scheduleSlug && (
        <div className="container mx-auto px-4 max-w-7xl pt-6">
          <Link
            to={`/event/${scheduleSlug}`}
            className="flex items-center justify-between gap-3 px-5 py-3 rounded-lg bg-accent-500/15 border border-accent-500/30 hover:bg-accent-500/25 transition-colors group"
          >
            <div className="flex items-center gap-3 text-accent-400">
              <FontAwesomeIcon icon={faCalendarDays} />
              <span className="text-sm font-medium">You have a schedule in progress</span>
            </div>
            <span className="text-accent-400 text-sm font-medium flex items-center gap-2 group-hover:gap-3 transition-all">
              Continue building
              <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
            </span>
          </Link>
        </div>
      )}

      <EventTimeline />
      <Footer />
      <PrivacyBanner />
    </div>
  )
}
