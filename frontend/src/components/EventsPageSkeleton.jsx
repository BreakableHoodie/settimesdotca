import { EventCardSkeletonList } from './ui/Skeleton'

export default function EventsPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Fake header */}
      <div className="mb-8">
        <div className="bg-surface animate-shimmer h-10 w-40 mb-2 rounded" aria-hidden="true" />
        <div className="bg-surface animate-shimmer h-5 w-72 rounded" aria-hidden="true" />
      </div>
      <EventCardSkeletonList count={3} />
    </div>
  )
}
