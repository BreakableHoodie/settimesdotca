import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { Button, Badge, Card, Alert, Loading } from '../components/ui'
import DOMPurify from 'isomorphic-dompurify'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faLocationDot,
  faCalendarDays,
  faClock,
  faChartLine,
  faArrowLeft,
  faGlobe,
  faGuitar,
  faPlus,
  faCheck,
} from '@fortawesome/free-solid-svg-icons'
import { faInstagram, faFacebook, faBandcamp } from '@fortawesome/free-brands-svg-icons'
import BandStats from '../components/BandStats'
import BandFacts from '../components/BandFacts'
import Breadcrumbs from '../components/Breadcrumbs'
import PrivacyBanner from '../components/PrivacyBanner'
import { formatTimeRange, parseLocalDate } from '../utils/timeFormat'
import { trackArtistView, trackPageView, trackSocialClick } from '../utils/metrics'
import { getSelectedBands, saveSelectedBands, hasAnySchedule, getScheduleEventSlug } from '../utils/scheduleStorage'

const ZERO_WIDTH_ENTITY_REGEX = /&shy;|&#173;|&#xad;|&ZeroWidthSpace;|&#8203;|&#x200B;/gi
const NBSP_ENTITY_REGEX = /&nbsp;|&#160;|&#xA0;/gi

function stripZeroWidthCharacters(text) {
  if (!text) return text
  return text
    .replace(ZERO_WIDTH_ENTITY_REGEX, '')
    .replace(/\u00AD/g, '')
    .replace(/\u200B/g, '')
    .replace(/\u200C/g, '')
    .replace(/\u200D/g, '')
    .replace(/\uFEFF/g, '')
}

function normalizeNonBreakingSpaces(text) {
  if (!text) return text
  return text.replace(NBSP_ENTITY_REGEX, ' ').replace(/\u00A0/g, ' ')
}

// Generate the same ID format used by the schedule
function generateScheduleId(bandName, performanceId) {
  return `${bandName.toLowerCase().replace(/\s+/g, '-')}-${performanceId}`
}

// Reject non-HTTP(S) URLs to prevent javascript: / data: XSS via social links
function safeHref(url) {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return null
}

/**
 * BandProfilePage - Enhanced band profile with design system
 * Sprint 2.2: SEO optimization, design system integration, performance history
 *
 * Features:
 * - Trading card aesthetic with photo and badges
 * - Performance statistics and visualizations
 * - Upcoming shows and comprehensive performance history
 * - Social media integration
 * - SEO meta tags and structured data
 */
export default function BandProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const hasRedirectedRef = useRef(false)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [scheduleSelections, setScheduleSelections] = useState({}) // { eventSlug: Set of bandIds }
  const [userHasSchedule] = useState(() => hasAnySchedule())
  const scheduleEventSlug = useMemo(() => getScheduleEventSlug(), [])

  const isNumericId = useMemo(() => /^\d+$/.test(id || ''), [id])

  const sanitizedDescription = useMemo(() => {
    if (!profile?.description) return ''
    let cleaned = DOMPurify.sanitize(profile.description, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
    })
    // Normalize text: convert multiple <br> tags to paragraph breaks
    cleaned = cleaned.replace(/(<br\s*\/?>\s*){2,}/gi, '</p><p>')
    // Replace single <br> tags with spaces for proper text flow
    cleaned = cleaned.replace(/<br\s*\/?>/gi, ' ')
    cleaned = normalizeNonBreakingSpaces(cleaned)
    // Collapse multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim()
    cleaned = stripZeroWidthCharacters(cleaned)
    // Wrap in paragraph if not already structured
    if (cleaned && !cleaned.startsWith('<p>') && !cleaned.startsWith('<ul>') && !cleaned.startsWith('<ol>')) {
      cleaned = `<p>${cleaned}</p>`
    }
    return cleaned
  }, [profile?.description])

  const plainDescription = useMemo(() => {
    if (!profile?.description) return ''
    return DOMPurify.sanitize(profile.description, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    })
      .replace(NBSP_ENTITY_REGEX, ' ')
      .replace(/\u00A0/g, ' ')
      .replace(ZERO_WIDTH_ENTITY_REGEX, '')
      .replace(/\u00AD/g, '')
      .replace(/\u200B/g, '')
      .replace(/\u200C/g, '')
      .replace(/\u200D/g, '')
      .replace(/\uFEFF/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }, [profile?.description])

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/bands/stats/${encodeURIComponent(id)}`)

        if (!response.ok) {
          throw new Error('Band not found')
        }

        const data = await response.json()
        setProfile(data)

        if (!isNumericId && data?.id && !hasRedirectedRef.current) {
          hasRedirectedRef.current = true
          navigate(`/band/${data.id}`, { replace: true })
        }
      } catch (err) {
        console.error('Failed to load band profile:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      loadProfile()
    }
  }, [id, isNumericId, navigate])

  useEffect(() => {
    trackPageView(`/band/${id || ''}`)
  }, [id])

  useEffect(() => {
    if (profile?.id) {
      trackArtistView(profile.id)
    }
  }, [profile?.id])

  // Load schedule selections for upcoming performances
  useEffect(() => {
    if (!profile?.upcoming?.length) return

    const selections = {}
    profile.upcoming.forEach(perf => {
      if (perf.event_slug) {
        const selected = getSelectedBands(perf.event_slug)
        selections[perf.event_slug] = new Set(selected)
      }
    })
    setScheduleSelections(selections)
  }, [profile?.upcoming])

  // Toggle a performance in the schedule
  const toggleSchedule = useCallback(
    performance => {
      if (!performance.event_slug || !performance.id || !profile?.name) return

      const scheduleId = generateScheduleId(profile.name, performance.id)
      const eventSlug = performance.event_slug

      setScheduleSelections(prev => {
        const currentSet = new Set(prev[eventSlug] || [])
        if (currentSet.has(scheduleId)) {
          currentSet.delete(scheduleId)
        } else {
          currentSet.add(scheduleId)
        }

        // Save to localStorage
        saveSelectedBands(eventSlug, Array.from(currentSet))

        return { ...prev, [eventSlug]: currentSet }
      })
    },
    [profile?.name]
  )

  // Check if a performance is in the schedule
  const isInSchedule = useCallback(
    performance => {
      if (!performance.event_slug || !performance.id || !profile?.name) return false
      const scheduleId = generateScheduleId(profile.name, performance.id)
      return scheduleSelections[performance.event_slug]?.has(scheduleId) || false
    },
    [scheduleSelections, profile?.name]
  )
  if (loading) {
    return (
      <div className="min-h-screen bg-band-navy flex items-center justify-center">
        <Loading size="lg" text="Loading band profile..." />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-band-navy">
        <div className="container mx-auto px-4 py-12 max-w-2xl">
          <Alert variant="error" className="mb-6">
            <h2 className="text-xl font-bold mb-2">Band Not Found</h2>
            <p>We couldn&apos;t find a profile for this band. {error && `Error: ${error}`}</p>
          </Alert>
          <div className="text-center">
            <Button
              as={Link}
              to="/"
              variant="secondary"
              icon={<FontAwesomeIcon icon={faArrowLeft} />}
              iconPosition="left"
            >
              Back to Schedule
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-band-navy">
        {/* SEO Meta Tags */}
        <Helmet>
          <title>{profile.name} - Band Profile | SetTimes</title>
          <meta
            name="description"
            content={
              plainDescription
                ? `${plainDescription.slice(0, 155)}...`
                : `${profile.name} profile on SetTimes. ${profile.genre ? `Genre: ${profile.genre}. ` : ''}${profile.stats ? `${profile.stats.total_performances} performances.` : ''}`
            }
          />
          <meta
            name="keywords"
            content={`${profile.name}, ${profile.genre || 'music'}, ${profile.origin || 'band'}, live music, SetTimes`}
          />

          {/* OpenGraph */}
          <meta property="og:title" content={`${profile.name} - Band Profile`} />
          <meta property="og:description" content={plainDescription || `${profile.name} on SetTimes`} />
          <meta property="og:type" content="profile" />
          {profile.photo_url && <meta property="og:image" content={profile.photo_url} />}
          <meta property="og:url" content={`https://settimes.ca/band/${profile?.id || id}`} />
          <link rel="canonical" href={`https://settimes.ca/band/${profile?.id || id}`} />

          {/* Twitter Card */}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={`${profile.name} - Band Profile`} />
          <meta name="twitter:description" content={plainDescription || `${profile.name} on SetTimes`} />
          {profile.photo_url && <meta name="twitter:image" content={profile.photo_url} />}

          {/* Structured Data (JSON-LD) */}
          <script type="application/ld+json">
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'MusicGroup',
              name: profile.name,
              genre: profile.genre,
              description: plainDescription,
              image: profile.photo_url,
              url: `https://settimes.ca/band/${profile?.id || id}`,
              ...(profile.origin && { foundingLocation: profile.origin }),
              ...(profile.social && {
                sameAs: [
                  profile.social.website,
                  profile.social.instagram && `https://instagram.com/${profile.social.instagram.replace('@', '')}`,
                  profile.social.facebook,
                  profile.social.bandcamp,
                ].filter(Boolean),
              }),
            })}
          </script>
        </Helmet>

        {/* Sticky Navigation Header */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-bg-navy/95 backdrop-blur-sm">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="flex items-center justify-between h-14">
              <Link to="/" className="text-xl font-bold font-display hover:opacity-80 transition-opacity">
                <span className="text-accent-500">Set</span>
                <span className="text-white">Times</span>
              </Link>
              {userHasSchedule && (
                <Link
                  to={scheduleEventSlug ? `/event/${scheduleEventSlug}` : '/'}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-500/20 text-accent-400 hover:bg-accent-500/30 transition-colors text-sm font-medium"
                >
                  <FontAwesomeIcon icon={faCalendarDays} />
                  My Schedule
                </Link>
              )}
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 pt-4 max-w-6xl">
          {/* Breadcrumbs */}
          <Breadcrumbs
            items={[
              { label: 'Events', href: '/' },
              ...(profile.upcoming?.[0]?.event_slug
                ? [{ label: profile.upcoming[0].event_name, href: `/event/${profile.upcoming[0].event_slug}` }]
                : []),
              { label: profile.name },
            ]}
          />
        </div>

        <div className="container mx-auto px-4 pb-8 max-w-6xl">
          {/* Sports Card Hero Section */}
          <div className="bg-band-purple rounded-xl border-2 border-band-orange/30 overflow-hidden mb-6 shadow-xl">
            {/* Band Photo with Overlay */}
            {profile.photo_url ? (
              <div className="relative h-80 bg-gradient-to-b from-band-navy via-band-purple to-band-navy overflow-hidden">
                <img
                  src={profile.photo_url}
                  alt={profile.name}
                  loading="lazy"
                  className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-band-purple via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h1 className="text-5xl font-bold text-white drop-shadow-lg mb-3">{profile.name}</h1>
                  <div className="flex flex-wrap gap-3">
                    {profile.genre && (
                      <span className="px-4 py-2 bg-band-orange text-white rounded-lg font-bold text-sm shadow-lg">
                        <FontAwesomeIcon icon={faGuitar} className="mr-2" aria-hidden="true" />
                        {profile.genre}
                      </span>
                    )}
                    {profile.origin && (
                      <span className="px-4 py-2 bg-band-purple border-2 border-white/30 text-white rounded-lg font-bold text-sm shadow-lg">
                        <FontAwesomeIcon icon={faLocationDot} className="mr-2" aria-hidden="true" />
                        {profile.origin}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 bg-gradient-to-br from-band-purple to-band-navy">
                <h1 className="text-5xl font-bold text-white mb-3">{profile.name}</h1>
                <div className="flex flex-wrap gap-3">
                  {profile.genre && (
                    <span className="px-4 py-2 bg-band-orange text-white rounded-lg font-bold text-sm">
                      <FontAwesomeIcon icon={faGuitar} className="mr-2" aria-hidden="true" />
                      {profile.genre}
                    </span>
                  )}
                  {profile.origin && (
                    <span className="px-4 py-2 bg-band-navy border-2 border-white/30 text-white rounded-lg font-bold text-sm">
                      <FontAwesomeIcon icon={faLocationDot} className="mr-2" aria-hidden="true" />
                      {profile.origin}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Bio and Social Links */}
            {(profile.description || profile.social) && (
              <div className="p-6 bg-band-purple/50 border-t border-white/10">
                {profile.description && (
                  <div
                    className="mb-4 text-white/90 text-sm leading-relaxed [&_p]:my-2 [&_a]:text-accent-500 [&_a:hover]:underline"
                    style={{
                      wordBreak: 'normal',
                      overflowWrap: 'break-word',
                      whiteSpace: 'normal',
                      hyphens: 'none',
                      WebkitHyphens: 'none',
                      MozHyphens: 'none',
                      msHyphens: 'none',
                    }}
                    dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
                  />
                )}
                {profile.social && (
                  <div className="flex flex-wrap gap-3">
                    {safeHref(profile.social.website) && (
                      <a
                        href={safeHref(profile.social.website)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors text-sm font-medium inline-flex items-center gap-2"
                        onClick={() => trackSocialClick(profile.id, 'website')}
                      >
                        <FontAwesomeIcon icon={faGlobe} />
                        Website
                      </a>
                    )}
                    {profile.social.instagram && (
                      <a
                        href={`https://instagram.com/${profile.social.instagram.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded hover:opacity-90 transition-colors text-sm font-medium inline-flex items-center gap-2"
                        onClick={() => trackSocialClick(profile.id, 'instagram')}
                      >
                        <FontAwesomeIcon icon={faInstagram} />
                        Instagram
                      </a>
                    )}
                    {safeHref(profile.social.bandcamp) && (
                      <a
                        href={safeHref(profile.social.bandcamp)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium inline-flex items-center gap-2"
                        onClick={() => trackSocialClick(profile.id, 'bandcamp')}
                      >
                        <FontAwesomeIcon icon={faBandcamp} />
                        Bandcamp
                      </a>
                    )}
                    {safeHref(profile.social.facebook) && (
                      <a
                        href={safeHref(profile.social.facebook)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-medium inline-flex items-center gap-2"
                        onClick={() => trackSocialClick(profile.id, 'facebook')}
                      >
                        <FontAwesomeIcon icon={faFacebook} />
                        Facebook
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Two Column Layout: Stats/Facts + Shows */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Left Column - Stats & Facts */}
            <div className="lg:col-span-1 space-y-6">
              {profile.stats && <BandStats stats={profile.stats} />}
              {profile.stats && <BandFacts band={profile} stats={profile.stats} />}
            </div>

            {/* Right Column - Upcoming & Past Shows */}
            <div className="lg:col-span-2 space-y-6">
              {/* Upcoming Shows */}
              {profile.upcoming && profile.upcoming.length > 0 && (
                <Card variant="elevated" className="border-2 border-accent-500/30">
                  <div className="pb-4 mb-4 border-b border-white/10">
                    <h2 className="text-2xl font-bold text-accent-500 flex items-center gap-2">
                      <FontAwesomeIcon icon={faCalendarDays} />
                      <span>Upcoming Shows</span>
                      <Badge variant="primary" className="ml-2">
                        {profile.upcoming.length}
                      </Badge>
                    </h2>
                  </div>
                  <div className="space-y-4">
                    {profile.upcoming.map((performance, idx) => (
                      <Card key={idx} variant="outline" hoverable className="p-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-xl font-semibold text-accent-500 mb-2">{performance.event_name}</h3>
                            <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
                              {performance.event_date && (
                                <span className="flex items-center gap-2">
                                  <FontAwesomeIcon icon={faCalendarDays} className="text-accent-500" />
                                  {(
                                    parseLocalDate(performance.event_date) || new Date(performance.event_date)
                                  ).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                  })}
                                </span>
                              )}
                              {performance.venue_name && (
                                <span className="flex items-center gap-2">
                                  <FontAwesomeIcon icon={faLocationDot} className="text-accent-500" />
                                  {performance.venue_name}
                                </span>
                              )}
                              {performance.start_time && performance.end_time && (
                                <span className="flex items-center gap-2">
                                  <FontAwesomeIcon icon={faClock} className="text-accent-500" />
                                  {formatTimeRange(performance.start_time, performance.end_time)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Button
                              onClick={() => toggleSchedule(performance)}
                              variant={isInSchedule(performance) ? 'success' : 'secondary'}
                              size="sm"
                              className="whitespace-nowrap"
                            >
                              <FontAwesomeIcon icon={isInSchedule(performance) ? faCheck : faPlus} className="mr-2" />
                              {isInSchedule(performance) ? 'In Schedule' : 'Add to Schedule'}
                            </Button>
                            {performance.event_slug && (
                              <Button as={Link} to={`/event/${performance.event_slug}`} variant="primary" size="sm">
                                View Event →
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </Card>
              )}

              {/* Past Performance History */}
              {profile.past && profile.past.length > 0 && (
                <Card variant="elevated">
                  <div className="pb-4 mb-4 border-b border-white/10">
                    <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
                      <FontAwesomeIcon icon={faChartLine} />
                      <span>Performance History</span>
                      <Badge variant="secondary" className="ml-2">
                        {profile.past.length}
                      </Badge>
                    </h2>
                  </div>
                  <div className="space-y-4">
                    {profile.past.map((performance, idx) => (
                      <Card key={idx} variant="outline" hoverable className="p-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-xl font-semibold text-accent-500 mb-2">{performance.event_name}</h3>
                            <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
                              {performance.event_date && (
                                <span className="flex items-center gap-2">
                                  <FontAwesomeIcon icon={faCalendarDays} className="text-text-tertiary" />
                                  {(
                                    parseLocalDate(performance.event_date) || new Date(performance.event_date)
                                  ).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                  })}
                                </span>
                              )}
                              {performance.venue_name && (
                                <span className="flex items-center gap-2">
                                  <FontAwesomeIcon icon={faLocationDot} className="text-text-tertiary" />
                                  {performance.venue_name}
                                </span>
                              )}
                              {performance.start_time && performance.end_time && (
                                <span className="flex items-center gap-2">
                                  <FontAwesomeIcon icon={faClock} className="text-text-tertiary" />
                                  {formatTimeRange(performance.start_time, performance.end_time)}
                                </span>
                              )}
                            </div>
                          </div>
                          {performance.event_slug && (
                            <Button as={Link} to={`/event/${performance.event_slug}`} variant="secondary" size="sm">
                              View Event →
                            </Button>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>

          {/* Back to Events */}
          <div className="mt-6 text-center">
            <Button
              as={Link}
              to="/"
              variant="secondary"
              icon={<FontAwesomeIcon icon={faArrowLeft} />}
              iconPosition="left"
            >
              Back to Events
            </Button>
          </div>
        </div>
        <PrivacyBanner />
      </div>
    </>
  )
}
