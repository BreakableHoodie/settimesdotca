import { BandCardSkeleton } from './ui/Skeleton'

export default function ScheduleSkeleton() {
  return (
    <div className="min-h-screen py-8 px-4" role="status" aria-label="Loading schedule">
      <div className="w-full max-w-6xl mx-auto">
        {/* Fake section banner */}
        <div className="flex items-center mb-6">
          <div className="bg-surface animate-shimmer h-10 w-36 rounded-lg" aria-hidden="true" />
          <div className="flex-1 h-1 bg-surface ml-4" aria-hidden="true" />
        </div>
        {/* Fake time-group pill */}
        <div className="flex items-center mb-4">
          <div className="bg-surface animate-shimmer h-9 w-28 rounded-lg" aria-hidden="true" />
          <div className="flex-1 h-0.5 bg-surface ml-4" aria-hidden="true" />
        </div>
        {/* 5 fake band cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 ml-0 sm:ml-4">
          {Array.from({ length: 5 }, (_, i) => (
            <BandCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
