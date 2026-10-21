// A venue's "hand stamp" (#1248): its real short name ("Blue Room", never a
// code) on the venue's fixed ink, the same on every edition. FILLED, white on
// ink, so it reads on any ground: every stamp ink clears 5.5:1 under white
// (functions/utils/__tests__/venueInk.test.js), while an outlined stamp in the
// red ink falls to ~4.1:1 on the palest poster grounds. The name is the cue;
// the ink is secondary, never the only one.
const HEX = /^#[0-9a-f]{6}$/i
// A small fixed tilt per venue, so a column of stamps looks hand-pressed
// without moving between renders.
const TILTS = [-1.5, 1, -0.5, 1.5, -1]

function tiltFor(name) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return TILTS[hash % TILTS.length]
}

export default function VenueStamp({ venue, short, ink, className = '' }) {
  const label = short || venue
  if (!label) return null
  const inked = typeof ink === 'string' && HEX.test(ink)
  return (
    <span
      title={venue && venue !== label ? venue : undefined}
      data-venue-ink={inked ? ink.toLowerCase() : undefined}
      className={`inline-block max-w-full truncate whitespace-nowrap rounded-sm px-1.5 py-px text-[11px] font-bold leading-snug ${
        inked ? 'text-white' : 'border border-border text-text-secondary'
      } ${className}`}
      style={{ ...(inked ? { backgroundColor: ink } : {}), transform: `rotate(${tiltFor(label)}deg)` }}
    >
      {label}
    </span>
  )
}
