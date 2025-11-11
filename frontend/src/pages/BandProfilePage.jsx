import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import Header from '../components/Header'
import BandStats from '../components/BandStats'
import BandFacts from '../components/BandFacts'

/**
 * BandProfilePage - Sports card-inspired band profile
 *
 * Features:
 * - Trading card aesthetic with photo and badges
 * - Performance statistics grid
 * - Upcoming shows and past performance history
 * - Auto-generated facts and trivia
 */
export default function BandProfilePage() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/bands/stats/${id}`)

        if (!response.ok) {
          throw new Error('Band not found')
        }

        const data = await response.json()
        setProfile(data)
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
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-band-navy">
        <div className="container mx-auto px-4 py-12">
          <div className="text-band-orange text-lg text-center">Loading band profile...</div>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-band-navy">
        <Header />
        <div className="container mx-auto px-4 py-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-4">Band Not Found</h1>
            <p className="text-gray-400 mb-6">We couldn&apos;t find a profile for this band.</p>
            <Link
              to="/"
              className="inline-block px-6 py-3 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors font-medium"
            >
              Back to Schedule
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-band-navy">
      <Header />

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Sports Card Hero Section */}
        <div className="bg-band-purple rounded-xl border-2 border-band-orange/30 overflow-hidden mb-6 shadow-xl">
          {/* Band Photo with Overlay */}
          {profile.photo_url ? (
            <div className="relative h-80 bg-gradient-to-b from-band-navy via-band-purple to-band-navy overflow-hidden">
              <img src={profile.photo_url} alt={profile.name} className="w-full h-full object-cover opacity-60" />
              <div className="absolute inset-0 bg-gradient-to-t from-band-purple via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h1 className="text-5xl font-bold text-white drop-shadow-lg mb-3">{profile.name}</h1>
                <div className="flex flex-wrap gap-3">
                  {profile.genre && (
                    <span className="px-4 py-2 bg-band-orange text-white rounded-lg font-bold text-sm shadow-lg">
                      🎸 {profile.genre}
                    </span>
                  )}
                  {profile.origin && (
                    <span className="px-4 py-2 bg-band-purple border-2 border-white/30 text-white rounded-lg font-bold text-sm shadow-lg">
                      📍 {profile.origin}
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
                    🎸 {profile.genre}
                  </span>
                )}
                {profile.origin && (
                  <span className="px-4 py-2 bg-band-navy border-2 border-white/30 text-white rounded-lg font-bold text-sm">
                    📍 {profile.origin}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Bio and Social Links */}
          {(profile.description || profile.social) && (
            <div className="p-6 bg-band-purple/50 border-t border-white/10">
              {profile.description && (
                <p className="text-white/90 mb-4 leading-relaxed whitespace-pre-wrap">{profile.description}</p>
              )}
              {profile.social && (
                <div className="flex flex-wrap gap-3">
                  {profile.social.website && (
                    <a
                      href={profile.social.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors text-sm font-medium"
                    >
                      🌐 Website
                    </a>
                  )}
                  {profile.social.instagram && (
                    <a
                      href={`https://instagram.com/${profile.social.instagram.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded hover:opacity-90 transition-colors text-sm font-medium"
                    >
                      📷 Instagram
                    </a>
                  )}
                  {profile.social.bandcamp && (
                    <a
                      href={profile.social.bandcamp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      🎵 Bandcamp
                    </a>
                  )}
                  {profile.social.facebook && (
                    <a
                      href={profile.social.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      📘 Facebook
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
              <div className="bg-band-purple rounded-xl border-2 border-band-orange/30 overflow-hidden">
                <div className="px-6 py-4 bg-band-purple/50 border-b border-white/10">
                  <h2 className="text-2xl font-bold text-band-orange flex items-center gap-2">
                    <span>🎯</span>
                    <span>Upcoming Shows ({profile.upcoming.length})</span>
                  </h2>
                </div>
                <div className="divide-y divide-white/10">
                  {profile.upcoming.map((performance, idx) => (
                    <div key={idx} className="p-6 hover:bg-band-navy/30 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-band-orange mb-2">{performance.event_name}</h3>
                          <div className="flex flex-wrap gap-3 text-sm text-white/70">
                            {performance.event_date && (
                              <span className="flex items-center gap-1">
                                📅{' '}
                                {new Date(performance.event_date).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                              </span>
                            )}
                            {performance.venue_name && (
                              <span className="flex items-center gap-1">📍 {performance.venue_name}</span>
                            )}
                            {performance.start_time && performance.end_time && (
                              <span className="flex items-center gap-1">
                                🕐 {performance.start_time} - {performance.end_time}
                              </span>
                            )}
                          </div>
                        </div>
                        {performance.event_slug && (
                          <Link
                            to={`/embed/${performance.event_slug}`}
                            className="px-6 py-3 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors font-medium whitespace-nowrap"
                          >
                            View Event →
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Past Performance History */}
            {profile.past && profile.past.length > 0 && (
              <div className="bg-band-purple rounded-xl border border-band-orange/20 overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10">
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <span>📜</span>
                    <span>Performance History ({profile.past.length})</span>
                  </h2>
                </div>
                <div className="divide-y divide-white/10">
                  {profile.past.map((performance, idx) => (
                    <div key={idx} className="p-6 hover:bg-band-navy/30 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-band-orange mb-2">{performance.event_name}</h3>
                          <div className="flex flex-wrap gap-3 text-sm text-white/70">
                            {performance.event_date && (
                              <span className="flex items-center gap-1">
                                📅{' '}
                                {new Date(performance.event_date).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                              </span>
                            )}
                            {performance.venue_name && (
                              <span className="flex items-center gap-1">📍 {performance.venue_name}</span>
                            )}
                            {performance.start_time && performance.end_time && (
                              <span className="flex items-center gap-1">
                                🕐 {performance.start_time} - {performance.end_time}
                              </span>
                            )}
                          </div>
                        </div>
                        {performance.event_slug && (
                          <Link
                            to={`/embed/${performance.event_slug}`}
                            className="px-6 py-3 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors font-medium whitespace-nowrap"
                          >
                            View Event →
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Back to Events */}
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="inline-block px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors font-medium"
          >
            ← Back to Events
          </Link>
        </div>
      </div>
    </div>
  )
}
