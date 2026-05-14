export default function GhostEasterEgg({ onDismiss }) {
  return (
    <div
      className="ghost-drift pointer-events-none fixed bottom-20 left-0 z-[9999]"
      onAnimationEnd={onDismiss}
      aria-hidden="true"
    >
      <div className="ghost-bob flex flex-col items-center gap-1.5">
        <span className="text-6xl leading-none">👻</span>
        <span className="whitespace-nowrap rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
          @the_ghost_of_band_crawl
        </span>
      </div>
    </div>
  )
}
