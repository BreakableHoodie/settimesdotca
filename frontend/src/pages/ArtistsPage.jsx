import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { ArrowLeft, Globe, Search } from 'lucide-react'
import {
  AppleMusicIcon,
  BandcampIcon,
  FacebookIcon,
  InstagramIcon,
  LinktreeIcon,
  SpotifyIcon,
  YouTubeIcon,
} from '../components/ui/SocialIcons'
import Footer from '../components/Footer'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { fetchPublicJson } from '../utils/publicApi'
import { trackPageView, trackSocialClick } from '../utils/metrics'
import { buildBandProfileHref } from '../utils/bandProfileLink'
import { safeExternalHref, safeInstagramHref } from '../utils/urlSafety'

const PAGE_SIZE = 24
const PAGE_TITLE = 'Artists – SetTimes'

// Priority order for the roster card icon cluster: hear the band first,
// follow second. Only the first MAX_CARD_ICONS valid links show — overflow
// lives on the profile page, which owns the full set with brand colours.
const MAX_CARD_ICONS = 4
const SOCIAL_LINK_DESCRIPTORS = [
  { key: 'bandcamp', label: 'Bandcamp', Icon: BandcampIcon, getHref: social => safeExternalHref(social.bandcamp) },
  { key: 'spotify', label: 'Spotify', Icon: SpotifyIcon, getHref: social => safeExternalHref(social.spotify) },
  {
    key: 'instagram',
    label: 'Instagram',
    Icon: InstagramIcon,
    getHref: social => safeInstagramHref(social.instagram),
  },
  { key: 'website', label: 'Website', Icon: Globe, getHref: social => safeExternalHref(social.website) },
  { key: 'youtube', label: 'YouTube', Icon: YouTubeIcon, getHref: social => safeExternalHref(social.youtube) },
  { key: 'facebook', label: 'Facebook', Icon: FacebookIcon, getHref: social => safeExternalHref(social.facebook) },
  {
    key: 'apple_music',
    label: 'Apple Music',
    Icon: AppleMusicIcon,
    getHref: social => safeExternalHref(social.apple_music),
  },
  { key: 'linktree', label: 'Linktree', Icon: LinktreeIcon, getHref: social => safeExternalHref(social.linktree) },
]

function getCardSocialLinks(social) {
  if (!social) return []
  return SOCIAL_LINK_DESCRIPTORS.map(descriptor => ({ ...descriptor, href: descriptor.getHref(social) }))
    .filter(link => link.href !== '#')
    .slice(0, MAX_CARD_ICONS)
}

function ArtistCard({ artist }) {
  const meta = [artist.genre, artist.origin].filter(Boolean).join(' · ')
  const shows = `${artist.performance_count} ${artist.performance_count === 1 ? 'show' : 'shows'}`
  const socialLinks = getCardSocialLinks(artist.social)

  return (
    <div className="rounded-xl border border-border bg-gradient-card p-4 transition hover:border-accent-400/50">
      <Link
        to={buildBandProfileHref(artist.name)}
        className="flex min-w-0 items-center gap-4 rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        {artist.photo_url ? (
          <img
            src={artist.photo_url}
            alt=""
            loading="lazy"
            className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-border"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-500/20 text-2xl font-bold text-accent-400">
            {(artist.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-bold text-text-primary">{artist.name}</h2>
          {meta && <p className="truncate text-sm text-text-tertiary">{meta}</p>}
          <p className="mt-0.5 text-xs text-text-tertiary">{shows}</p>
        </div>
      </Link>
      {/* Icons live on their own row below the text so a long band name never
          competes with them for width (the card grows vertically instead —
          per Dre). pl-[68px] lines the icon glyphs up with the text column:
          64px photo + 16px gap, minus the 12px inset of the 40px hit area. */}
      {socialLinks.length > 0 && (
        <div className="mt-1 flex items-center gap-1 pl-[68px]">
          {socialLinks.map(({ key, label, Icon, href }) => (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${artist.name} on ${label}`}
              title={label}
              onClick={() => trackSocialClick(artist.id, key)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              <Icon size={16} />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ArtistsPage() {
  const [query, setQuery] = useState('')
  const [artists, setArtists] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const offsetRef = useRef(0)

  useEffect(() => {
    document.title = PAGE_TITLE
    trackPageView('/artists')
  }, [])

  const load = useCallback(async (q, offset, append) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(offset))
    const data = await fetchPublicJson(`/api/artists?${params.toString()}`, {}, 'Failed to load artists')
    setHasMore(Boolean(data.hasMore))
    setArtists(prev => (append ? [...prev, ...data.artists] : data.artists))
  }, [])

  // Debounced search — refetch from the start whenever the query changes.
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    offsetRef.current = 0
    const handle = setTimeout(() => {
      load(query.trim(), 0, false)
        .catch(err => {
          if (active) setError(err)
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 250)
    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [query, load])

  const handleLoadMore = async () => {
    setLoadingMore(true)
    const nextOffset = offsetRef.current + PAGE_SIZE
    try {
      await load(query.trim(), nextOffset, true)
      offsetRef.current = nextOffset
    } catch (err) {
      setError(err)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-gradient-dark">
      <Helmet>
        <title>{PAGE_TITLE}</title>
        <meta
          name="description"
          content="Browse and search every artist who has played a SetTimes event — explore their profiles, past sets, and upcoming shows."
        />
        <link rel="canonical" href="https://settimes.ca/artists" />
        <meta property="og:title" content="Artists – SetTimes" />
        <meta property="og:description" content="Browse and search every artist who has played a SetTimes event." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://settimes.ca/artists" />
      </Helmet>

      <header className="border-b border-accent-500/30 px-4 py-8">
        <div className="container mx-auto flex max-w-7xl items-start justify-between gap-4">
          <div>
            <Link
              to="/"
              className="mb-2 inline-flex items-center gap-1.5 text-sm text-accent-400 transition-colors hover:text-accent-300"
            >
              <ArrowLeft size={14} aria-hidden="true" /> SetTimes
            </Link>
            <h1 className="font-display text-4xl font-bold text-text-primary">Artists</h1>
            <p className="mt-1 text-lg text-accent-400">Every act that&apos;s graced a SetTimes stage</p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="relative mb-8 max-w-md">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search artists by name or genre…"
            aria-label="Search artists by name or genre"
            className="min-h-[44px] w-full rounded-full border border-border bg-bg-purple/60 py-3 pl-10 pr-4 text-text-primary placeholder:text-text-tertiary focus:border-accent-400 focus:outline-hidden"
          />
        </div>

        {error ? (
          <p className="py-16 text-center text-text-secondary">{error.message}</p>
        ) : loading ? (
          <p className="py-16 text-center text-text-tertiary">Loading artists…</p>
        ) : artists.length === 0 ? (
          <p className="py-16 text-center text-text-secondary">
            {query.trim() ? `No artists match “${query.trim()}”.` : 'No artists to show yet.'}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {artists.map(artist => (
                <ArtistCard key={artist.id} artist={artist} />
              ))}
            </div>
            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="min-h-[44px] rounded-full border border-accent-500/50 bg-accent-500/15 px-6 py-3 font-semibold text-accent-400 transition hover:bg-accent-500/25 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Footer />
    </main>
  )
}
