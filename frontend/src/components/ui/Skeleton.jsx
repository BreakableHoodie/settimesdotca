function SkeletonBlock({ className = '' }) {
  return <div className={`animate-shimmer rounded ${className}`} aria-hidden="true" />
}

export function BandCardSkeleton() {
  return (
    <div className="w-full p-4 rounded-xl bg-gradient-card border border-white/10 relative">
      <SkeletonBlock className="absolute top-2 right-2 h-11 w-11 rounded-full" />
      <div className="flex flex-col items-center gap-2 pr-10">
        <SkeletonBlock className="h-6 w-32 rounded-lg" />
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-4 w-28" />
      </div>
    </div>
  )
}

export function BandCardSkeletonGrid({ count = 6 }) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6"
      role="status"
      aria-label="Loading lineup"
    >
      {Array.from({ length: count }, (_, i) => (
        <BandCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function EventCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 p-6" role="status" aria-label="Loading event">
      <SkeletonBlock className="h-7 w-48 mb-3" />
      <SkeletonBlock className="h-4 w-36 mb-4" />
      <div className="flex gap-6 mb-4">
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="h-4 w-20" />
      </div>
      <div className="flex gap-2">
        <SkeletonBlock className="h-10 w-32 rounded-lg" />
        <SkeletonBlock className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  )
}

export function EventCardSkeletonList({ count = 3 }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading events">
      {Array.from({ length: count }, (_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function BandProfileSkeleton() {
  return (
    <div className="min-h-screen py-8 px-4" role="status" aria-label="Loading band profile">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-6">
          <SkeletonBlock className="w-24 h-24 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-3">
            <SkeletonBlock className="h-8 w-48" />
            <SkeletonBlock className="h-5 w-32" />
          </div>
        </div>
        <SkeletonBlock className="h-32 w-full" />
        <SkeletonBlock className="h-12 w-full" />
        <SkeletonBlock className="h-48 w-full" />
      </div>
    </div>
  )
}
