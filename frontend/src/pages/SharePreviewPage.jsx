import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BandCardSkeleton } from '../components/ui'
import { fetchPublicJson } from '../utils/publicApi'

export default function SharePreviewPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [shareData, setShareData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetchPublicJson(`/api/schedule/share/${encodeURIComponent(slug)}`)
      .then(setShareData)
      .catch(err => {
        if (err.status === 404) setNotFound(true)
      })
      .finally(() => setLoading(false))
  }, [slug])

  const handleImport = () => {
    navigate(`/event/${shareData.event_slug}?share=${slug}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <BandCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-bg-navy to-bg-purple px-4 text-center">
        <Helmet>
          <title>Route Not Found | SetTimes</title>
        </Helmet>
        <p className="text-2xl font-semibold text-white">This route has expired or doesn&apos;t exist.</p>
        <p className="mt-2 text-text-secondary">Share links are valid for 30 days.</p>
        <Link to="/" className="mt-6 text-accent-400 hover:underline">
          Browse events
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple">
      <Helmet>
        <title>Shared Route — {shareData.event_name} | SetTimes</title>
      </Helmet>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link
          to={`/event/${shareData.event_slug}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-white"
        >
          <ArrowLeft size={14} />
          Back to {shareData.event_name}
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            {shareData.band_names.length}-stop route
          </h1>
          <p className="mt-1 text-text-secondary">{shareData.event_name}</p>
        </div>

        <div className="mb-8 space-y-3">
          {shareData.band_names.map((name, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <p className="font-semibold text-white">{name}</p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleImport}
          className="w-full min-h-[48px] rounded-xl bg-accent-500 px-6 py-3 font-semibold text-bg-navy transition-colors hover:brightness-110"
        >
          Add {shareData.band_names.length} stop{shareData.band_names.length !== 1 ? 's' : ''} to my route for {shareData.event_name}
        </button>
      </div>
    </div>
  )
}
