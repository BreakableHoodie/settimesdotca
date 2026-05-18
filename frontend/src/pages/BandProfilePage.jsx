import { Archive, ArrowLeft, CalendarDays, Check, Clock, Globe, Guitar, MapPin, Plus, TrendingUp } from 'lucide-react'
import {
  AppleMusicIcon,
  BandcampIcon,
  FacebookIcon,
  InstagramIcon,
  LinktreeIcon,
  SpotifyIcon,
  YouTubeIcon,
} from '../components/ui/SocialIcons'
import DOMPurify from 'dompurify'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BandFacts from '../components/BandFacts'
import BandStats from '../components/BandStats'
import Breadcrumbs from '../components/Breadcrumbs'
import PrivacyBanner from '../components/PrivacyBanner'
import { Alert, Badge, Button, Card, BandProfileSkeleton } from '../components/ui'
import { trackArtistView, trackPageView, trackSocialClick } from '../utils/metrics'
import { fetchPublicJson } from '../utils/publicApi'
import { getSelectedBands, saveSelectedBands, hasAnySchedule, getScheduleEventSlug } from '../utils/scheduleStorage'
import { formatTimeRange, parseLocalDate } from '../utils/timeFormat'
import { safeExternalHref, safeInstagramHref } from '../utils/urlSafety'

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
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

function hasAnySocial(social) {
  if (!social) return false
  return (
    safeExternalHref(social.website) !== '#' ||
    safeInstagramHref(social.instagram) !== '#' ||
    safeExternalHref(social.bandcamp) !== '#' ||
    safeExternalHref(social.facebook) !== '#' ||
    safeExternalHref(social.youtube) !== '#' ||
    safeExternalHref(social.spotify) !== '#' ||
    safeExternalHref(social.apple_music) !== '#' ||
    safeExternalHref(social.linktree) !== '#'
  )
}

// Generate the same ID format used by the schedule
function generateScheduleId(bandName, performanceId) {
  return `${bandName.toLowerCase().replace(/\s+/g, '-')}-${performanceId}`
}

function formatEventSlugLabel(eventSlug) {
  if (!eventSlug) return 'Event Schedule'
  return eventSlug
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
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
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const hasRedirectedRef = useRef(false)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [scheduleSelections, setScheduleSelections] = useState({}) // { eventSlug: Set of bandIds }
  const [followEmail, setFollowEmail] = useState('')
  const [followStatus, setFollowStatus] = useState('idle') // 'idle' | 'loading' | 'success' | 'error'
  const [followError, setFollowError] = useState('')
  const turnstileContainerRef = useRef(null)
  const turnstileWidgetIdRef = useRef(null)
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
  const turnstileEnabled = Boolean(turnstileSiteKey)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [userHasSchedule] = useState(() => hasAnySchedule())
  const scheduleEventSlug = useMemo(() => getScheduleEventSlug(), [])
  const sourceEventSlug = searchParams.get('fromEvent') || location.state?.fromEventSlug || null

  const isNumericId = useMemo(() => /^\d+$/.test(id || ''), [id])
  const sourceEventContext = useMemo(() => {
    if (!sourceEventSlug || !profile) return null
    const allPerformances = [...(profile.upcoming || []), ...(profile.past || [])]
    return allPerformances.find(performance => performance.event_slug === sourceEventSlug) || null
  }, [profile, sourceEventSlug])
  const fallbackEventContext = useMemo(() => {
    if (!profile) return null
    return profile.upcoming?.[0] || profile.past?.[0] || null
  }, [profile])
  const returnEventSlug = sourceEventSlug || scheduleEventSlug || fallbackEventContext?.event_slug || null
  const returnEventName =
    sourceEventContext?.event_name || fallbackEventContext?.event_name || formatEventSlugLabel(returnEventSlug)
  const returnEventPath = returnEventSlug ? `/event/${returnEventSlug}` : '/'

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const sanitizedDescription = useMemo(() => {
    if (!profile?.description) return ''
    let cleaned = DOMPurify.sanitize(profile.description, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ADD_ATTR: ['rel'],
    })
    // Force rel="noopener noreferrer" on all outbound links to prevent window.opener access
    cleaned = cleaned.replace(/<a\s/gi, '<a rel="noopener noreferrer" ')
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

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
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

  const errorStatus = error?.status || null
  const isPublishGateError = errorStatus === 503
  const isNotFoundError = errorStatus === 404 || (!error && !profile)

  const pageTitle = loading
    ? 'Band Profile | SetTimes'
    : error || !profile
      ? isNotFoundError
        ? 'Band Not Found | SetTimes'
        : 'Band Profile | SetTimes'
      : `${profile.name} - Band Profile | SetTimes`

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)
        setError(null)

        const data = await fetchPublicJson(`/api/bands/stats/${encodeURIComponent(id)}`, {}, 'Band not found')
        setProfile(data)

        if (!isNumericId && data?.id && !hasRedirectedRef.current) {
          hasRedirectedRef.current = true
          navigate(
            {
              pathname: `/band/${data.id}`,
              search: location.search,
            },
            { replace: true, state: location.state }
          )
        }
      } catch (err) {
        console.error('Failed to load band profile:', err)
        setError(err instanceof Error ? err : new Error('Failed to load band profile'))
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      loadProfile()
    }
  }, [id, isNumericId, location.search, location.state, navigate])

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
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    performance => {
      if (!performance.event_slug || !performance.id) return

      const scheduleId = generateScheduleId(profile.name, performance.id)
      const eventSlug = performance.event_slug

      setScheduleSelections(prev => {
        const currentSet = new Set(prev[eventSlug] || [])
        if (currentSet.has(scheduleId)) {
          currentSet.delete(scheduleId)
        } else {
          currentSet.add(scheduleId)
        }

        // Save to localStorage with event date so stale past-event entries can be filtered
        saveSelectedBands(eventSlug, Array.from(currentSet), performance.event_date)

        return { ...prev, [eventSlug]: currentSet }
      })
    },
    [profile?.name]
  )

  // Check if a performance is in the schedule
  const isInSchedule = useCallback(
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    performance => {
      if (!performance.event_slug || !performance.id || !profile?.name) return false
      const scheduleId = generateScheduleId(profile.name, performance.id)
      return scheduleSelections[performance.event_slug]?.has(scheduleId) || false
    },
    [scheduleSelections, profile?.name]
  )

  useEffect(() => {
    if (!turnstileEnabled) {
      return undefined
    }

    let cancelled = false
    let scriptElement = document.querySelector('script[data-turnstile-script="true"]')

    const renderTurnstile = () => {
      if (cancelled || !window.turnstile || !turnstileContainerRef.current) {
        return
      }
      if (turnstileWidgetIdRef.current !== null) {
        return
      }

      turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: turnstileSiteKey,
        callback: token => {
          setTurnstileToken(token)
        },
        'expired-callback': () => {
          setTurnstileToken('')
        },
        'error-callback': () => {
          setTurnstileToken('')
        },
      })
    }

    if (scriptElement) {
      if (window.turnstile) {
        renderTurnstile()
      } else {
        scriptElement.addEventListener('load', renderTurnstile)
      }
    } else {
      const script = document.createElement('script')
      script.src = TURNSTILE_SCRIPT_SRC
      script.async = true
      script.defer = true
      script.setAttribute('data-turnstile-script', 'true')
      script.addEventListener('load', renderTurnstile)
      document.head.appendChild(script)
      scriptElement = script
    }

    return () => {
      cancelled = true
      if (scriptElement) {
        scriptElement.removeEventListener('load', renderTurnstile)
      }
      if (window.turnstile && turnstileWidgetIdRef.current !== null) {
        window.turnstile.remove(turnstileWidgetIdRef.current)
        turnstileWidgetIdRef.current = null
      }
    }
  }, [turnstileEnabled, turnstileSiteKey])

  useEffect(() => {
    document.title = pageTitle
  }, [pageTitle])

  const submitFollow = async e => {
    e.preventDefault()
    if (!followEmail.trim()) return
    if (turnstileEnabled && !turnstileToken) {
      setFollowStatus('error')
      setFollowError('Please complete the bot verification challenge.')
      return
    }
    setFollowStatus('loading')
    setFollowError('')
    try {
      const res = await fetch(`/api/bands/${profile.id}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: followEmail.trim(), turnstileToken }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Something went wrong')
      }
      setFollowStatus('success')
      setTurnstileToken('')
      if (turnstileEnabled && window.turnstile && turnstileWidgetIdRef.current !== null) {
        window.turnstile.reset(turnstileWidgetIdRef.current)
      }
    } catch (err) {
      setFollowStatus('error')
      setFollowError(err.message)
      setTurnstileToken('')
      if (turnstileEnabled && window.turnstile && turnstileWidgetIdRef.current !== null) {
        window.turnstile.reset(turnstileWidgetIdRef.current)
      }
    }
  }

  if (loading) {
    return <BandProfileSkeleton />
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-bg-navy">
        <div className="container mx-auto px-4 py-12 max-w-2xl">
          <Alert variant="error" className="mb-6">
            <h2 className="text-xl font-bold mb-2">
              {isPublishGateError
                ? 'Band Profiles Unavailable'
                : isNotFoundError
                  ? 'Band Not Found'
                  : 'Failed to load band profile'}
            </h2>
            <p>
              {isPublishGateError
                ? error.message
                : isNotFoundError
                  ? `We couldn't find a profile for this band.${error ? ` Error: ${error.message}` : ''}`
                  : error?.message || "We couldn't load this band profile right now."}
            </p>
          </Alert>
          <div className="text-center">
            <Button
              as={Link}
              to={returnEventPath}
              variant="secondary"
              icon={<ArrowLeft size={14} />}
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
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg-navy">
      {/* SEO Meta Tags */}
      <Helmet>
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
                safeInstagramHref(profile.social.instagram) !== '#'
                  ? safeInstagramHref(profile.social.instagram)
                  : null,
                profile.social.facebook,
                profile.social.bandcamp,
                profile.social.youtube,
                profile.social.spotify,
                profile.social.apple_music,
                profile.social.linktree,
              ].filter(Boolean),
            }),
          })}
        </script>
      </Helmet>

      {/* Sticky Navigation Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-bg-navy/95 backdrop-blur-xs">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="text-xl font-bold font-display hover:opacity-80 transition-opacity">
              <span className="text-accent-500">Set</span>
              <span className="text-white">Times</span>
            </Link>
            {(returnEventSlug || userHasSchedule) && (
              <Link
                to={returnEventPath}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-500/20 text-accent-400 hover:bg-accent-500/30 transition-colors text-sm font-medium"
              >
                <CalendarDays size={14} />
                {sourceEventSlug ? 'Back to Schedule' : 'My Schedule'}
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
            ...(returnEventSlug ? [{ label: returnEventName, href: returnEventPath }] : []),
            { label: profile.name },
          ]}
        />
      </div>

      <div className="container mx-auto px-4 pb-8 max-w-6xl">
        {/* Sports Card Hero Section */}
        <div className="bg-bg-purple rounded-xl border-2 border-accent-500/30 overflow-hidden mb-6 shadow-xl">
          {/* Band Photo with Overlay */}
          {profile.photo_url ? (
            <div className="relative h-80 bg-linear-to-b from-bg-navy via-bg-purple to-bg-navy overflow-hidden">
              <img
                src={profile.photo_url}
                alt={profile.name}
                loading="lazy"
                className="w-full h-full object-cover opacity-60"
              />
              <div className="absolute inset-0 bg-linear-to-t from-bg-purple via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h1 className="text-5xl font-bold text-white drop-shadow-lg mb-3">{profile.name}</h1>
                <div className="flex flex-wrap gap-3">
                  {profile.genre && (
                    <span className="px-4 py-2 bg-accent-500 text-white rounded-lg font-bold text-sm shadow-lg">
                      <Guitar size={14} className="mr-2" aria-hidden="true" />
                      {profile.genre}
                    </span>
                  )}
                  {profile.origin && (
                    <span className="px-4 py-2 bg-bg-purple border-2 border-white/30 text-white rounded-lg font-bold text-sm shadow-lg">
                      <MapPin size={14} className="mr-2" aria-hidden="true" />
                      {profile.origin}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 bg-linear-to-br from-bg-purple to-bg-navy">
              <h1 className="text-5xl font-bold text-white mb-3">{profile.name}</h1>
              <div className="flex flex-wrap gap-3">
                {profile.genre && (
                  <span className="px-4 py-2 bg-accent-500 text-white rounded-lg font-bold text-sm">
                    <Guitar size={14} className="mr-2 inline" aria-hidden="true" />
                    {profile.genre}
                  </span>
                )}
                {profile.origin && (
                  <span className="px-4 py-2 bg-bg-navy border-2 border-white/30 text-white rounded-lg font-bold text-sm">
                    <MapPin size={14} className="mr-2 inline" aria-hidden="true" />
                    {profile.origin}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Bio and Social Links */}
          <div className="p-6 bg-bg-purple/50 border-t border-white/10">
            {profile.description ? (
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
            ) : (
              !hasAnySocial(profile.social) && <p className="text-white/30 text-sm italic mb-4">No bio added yet.</p>
            )}
            {hasAnySocial(profile.social) ? (
              <div className="flex flex-wrap gap-3">
                {safeExternalHref(profile.social.website) !== '#' && (
                  <a
                    href={safeExternalHref(profile.social.website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-accent-500 text-white rounded hover:bg-accent-600 transition-colors text-sm font-medium inline-flex items-center gap-2"
                    onClick={() => trackSocialClick(profile.id, 'website')}
                  >
                    <Globe size={16} />
                    Website
                  </a>
                )}
                {safeInstagramHref(profile.social.instagram) !== '#' && (
                  <a
                    href={safeInstagramHref(profile.social.instagram)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-linear-to-br from-purple-500 to-pink-500 text-white rounded hover:opacity-90 transition-colors text-sm font-medium inline-flex items-center gap-2"
                    onClick={() => trackSocialClick(profile.id, 'instagram')}
                  >
                    <InstagramIcon size={16} />
                    Instagram
                  </a>
                )}
                {safeExternalHref(profile.social.bandcamp) !== '#' && (
                  <a
                    href={safeExternalHref(profile.social.bandcamp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium inline-flex items-center gap-2"
                    onClick={() => trackSocialClick(profile.id, 'bandcamp')}
                  >
                    <BandcampIcon size={16} />
                    Bandcamp
                  </a>
                )}
                {safeExternalHref(profile.social.facebook) !== '#' && (
                  <a
                    href={safeExternalHref(profile.social.facebook)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors text-sm font-medium inline-flex items-center gap-2"
                    onClick={() => trackSocialClick(profile.id, 'facebook')}
                  >
                    <FacebookIcon size={16} />
                    Facebook
                  </a>
                )}
                {safeExternalHref(profile.social.youtube) !== '#' && (
                  <a
                    href={safeExternalHref(profile.social.youtube)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-medium inline-flex items-center gap-2"
                    onClick={() => trackSocialClick(profile.id, 'youtube')}
                  >
                    <YouTubeIcon size={16} />
                    YouTube
                  </a>
                )}
                {safeExternalHref(profile.social.spotify) !== '#' && (
                  <a
                    href={safeExternalHref(profile.social.spotify)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm font-medium inline-flex items-center gap-2"
                    onClick={() => trackSocialClick(profile.id, 'spotify')}
                  >
                    <SpotifyIcon size={16} />
                    Spotify
                  </a>
                )}
                {safeExternalHref(profile.social.apple_music) !== '#' && (
                  <a
                    href={safeExternalHref(profile.social.apple_music)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-linear-to-br from-pink-500 to-red-600 text-white rounded hover:opacity-90 transition-colors text-sm font-medium inline-flex items-center gap-2"
                    onClick={() => trackSocialClick(profile.id, 'apple_music')}
                  >
                    <AppleMusicIcon size={16} />
                    Apple Music
                  </a>
                )}
                {safeExternalHref(profile.social.linktree) !== '#' && (
                  <a
                    href={safeExternalHref(profile.social.linktree)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-lime-500 text-white rounded hover:bg-lime-600 transition-colors text-sm font-medium inline-flex items-center gap-2"
                    onClick={() => trackSocialClick(profile.id, 'linktree')}
                  >
                    <LinktreeIcon size={16} />
                    Linktree
                  </a>
                )}
              </div>
            ) : (
              !profile.description && <p className="text-white/30 text-sm italic">No links added yet.</p>
            )}
          </div>
        </div>

        {/* Follow band */}
        <div className="mt-6 p-4 rounded-lg bg-white/5 border border-white/10">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Follow {profile.name}</h3>
          <p className="text-xs text-text-secondary mb-3">Get notified when they join a new lineup.</p>
          {followStatus === 'success' ? (
            <p className="text-sm text-green-400">
              <Check size={14} className="mr-1.5" />
              You&apos;re following {profile.name}! We&apos;ll email you when they join a lineup.
            </p>
          ) : (
            <form onSubmit={submitFollow} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  value={followEmail}
                  onChange={e => setFollowEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="flex-1 px-3 py-2 rounded bg-bg-navy text-white border border-white/20 focus:border-accent-500 focus:outline-none text-sm"
                  aria-label={`Email to follow ${profile.name}`}
                />
                <Button
                  type="submit"
                  disabled={followStatus === 'loading' || (turnstileEnabled && !turnstileToken)}
                  size="sm"
                >
                  {followStatus === 'loading' ? 'Saving…' : 'Follow'}
                </Button>
              </div>
              {turnstileEnabled && <div ref={turnstileContainerRef} className="mt-2" />}
            </form>
          )}
          {followStatus === 'error' && <p className="text-xs text-red-400 mt-1">{followError}</p>}
        </div>

        {/* Two Column Layout: Stats/Facts + Shows */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
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
                    <CalendarDays size={14} />
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
                                <CalendarDays size={14} className="text-accent-500" />
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
                                <MapPin size={14} className="text-accent-500" />
                                {performance.venue_name}
                              </span>
                            )}
                            {performance.start_time && performance.end_time && (
                              <span className="flex items-center gap-2">
                                <Clock size={14} className="text-accent-500" />
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
                            icon={isInSchedule(performance) ? <Check size={14} /> : <Plus size={14} />}
                          >
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
                    <TrendingUp size={14} />
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
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-xl font-semibold text-accent-500">{performance.event_name}</h3>
                            {performance.event_status === 'archived' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-white/10 text-white/50 border border-white/10">
                                <Archive size={12} aria-hidden="true" />
                                Archived
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
                            {performance.event_date && (
                              <span className="flex items-center gap-2">
                                <CalendarDays size={14} className="text-text-tertiary" />
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
                                <MapPin size={14} className="text-text-tertiary" />
                                {performance.venue_name}
                              </span>
                            )}
                            {performance.start_time && performance.end_time && (
                              <span className="flex items-center gap-2">
                                <Clock size={14} className="text-text-tertiary" />
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

            {/* Empty state: band exists but has no performances yet */}
            {(!profile.upcoming || profile.upcoming.length === 0) && (!profile.past || profile.past.length === 0) && (
              <Card variant="elevated" className="flex items-center justify-center py-12 text-center">
                <div>
                  <p className="text-white/40 text-lg mb-1">No performances on record yet.</p>
                  <p className="text-white/25 text-sm">Check back after the next event is announced.</p>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Back to Events */}
        <div className="mt-6 text-center">
          <Button as={Link} to={returnEventPath} variant="secondary" icon={<ArrowLeft size={14} />} iconPosition="left">
            {returnEventSlug ? 'Back to Schedule' : 'Back to Events'}
          </Button>
        </div>
      </div>
      <PrivacyBanner />
    </main>
  )
}
