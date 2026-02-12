function SkeletonBlock({ className = '' }) {
  return <div className={`animate-pulse bg-white/10 rounded ${className}`} />
}

export function BandCardSkeleton() {
  return (
    <div className="w-full p-4 rounded-xl bg-gradient-card border border-white/10 relative">
      {/* Toggle button circle top-right */}
      <SkeletonBlock className="absolute top-2 right-2 h-11 w-11 rounded-full" />
      <div className="flex flex-col items-center gap-2 pr-10">
        {/* Name block */}
        <SkeletonBlock className="h-6 w-32 rounded-lg" />
        {/* Time line */}
        <SkeletonBlock className="h-4 w-24" />
        {/* Venue line */}
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6" role="status" aria-label="Loading event">
      {/* Title bar */}
      <SkeletonBlock className="h-7 w-48 mb-3" />
      {/* Date line */}
      <SkeletonBlock className="h-4 w-36 mb-4" />
      {/* Stats row */}
      <div className="flex gap-6 mb-4">
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="h-4 w-20" />
      </div>
      {/* Button placeholders */}
      <div className="flex gap-2">
        <SkeletonBlock className="h-10 w-32 rounded-lg" />
        <SkeletonBlock className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  )
}

export function EventCardSkeletonList({ count = 2 }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading events">
      {Array.from({ length: count }, (_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  )
}
