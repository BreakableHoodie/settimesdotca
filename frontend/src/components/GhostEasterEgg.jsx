export default function GhostEasterEgg({ onDismiss }) {
  return (
    <>
      <style>{`
        @keyframes ghost-drift {
          0%   { transform: translateX(110vw); opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { transform: translateX(-20vw); opacity: 0; }
        }
        @keyframes ghost-bob {
          0%, 100% { transform: translateY(0px) rotate(-4deg); }
          50%       { transform: translateY(-14px) rotate(4deg); }
        }
        .ghost-drift { animation: ghost-drift 7s ease-in-out forwards; }
        .ghost-bob   { animation: ghost-bob 1.6s ease-in-out infinite; }
      `}</style>
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
    </>
  )
}
