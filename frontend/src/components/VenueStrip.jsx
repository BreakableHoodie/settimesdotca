// Transit-map spine for the 6 King St N venues.
// Renders a horizontal subway-style line with venue stops;
// venues where the fan has scheduled bands are highlighted as "active stops."
import { memo } from 'react'

// Ordered south→north along King St N, Waterloo.
// Kept as a constant so the visual ordering is always consistent.
/**
 * The walk route for ONE event, drawn from that event's own venues.
 *
 * This used to render a hardcoded six-venue King St N list on every event it
 * appeared on. Vol 18 has FOUR venues, so the strip advertised Room 47 and
 * Roost -- two venues with no sets on that bill -- to anyone reading it. The
 * labels happened to be clipped by the header (see Header.jsx), which is the
 * only reason nobody had walked to the wrong door.
 *
 * `venues` is the organiser's declared order from `events.venue_info`, which
 * for a crawl is the walk order along the street. Do not sort it.
 */
function VenueStrip({ venues = [], activeVenues = [] }) {
  const active = new Set(activeVenues)
  const count = venues.length

  // A route needs at least two stops to be a route. One venue is a location,
  // and zero is an event whose venues are not announced yet -- neither is worth
  // a line across the header.
  if (count < 2) return null

  // SVG layout constants
  const W = 600
  const H = 64
  const PAD_X = 40
  const CY = 28
  const STEP = (W - PAD_X * 2) / (count - 1)
  const R_STOP = 6
  const R_ACTIVE = 8

  return (
    // The accessible name carries the venues themselves. The inner <svg> is
    // aria-hidden, so without this a screen-reader user got a street name and
    // nothing else -- and "along King St N" was hardcoded, so on any event that
    // is not a King St crawl it was simply wrong, the same defect as the venue
    // list it labelled.
    <div className="w-full overflow-x-auto" role="img" aria-label={`Venue route: ${venues.join(', ')}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full max-w-2xl mx-auto block"
        role="img"
        aria-hidden="true"
      >
        {/* Track line — full span */}
        <line
          x1={PAD_X}
          y1={CY}
          x2={W - PAD_X}
          y2={CY}
          stroke="var(--color-accent-500)"
          strokeOpacity="0.25"
          strokeWidth="2"
        />

        {/* Highlighted segments between consecutive active stops */}
        {venues.map((v, i) => {
          if (i === count - 1) return null
          const bothActive = active.has(v) && active.has(venues[i + 1])
          if (!bothActive) return null
          return (
            <line
              key={`seg-${i}`}
              x1={PAD_X + i * STEP}
              y1={CY}
              x2={PAD_X + (i + 1) * STEP}
              y2={CY}
              stroke="var(--color-accent-500)"
              strokeWidth="3"
              filter="url(#glow)"
            />
          )
        })}

        {/* Glow filter */}
        <defs>
          <filter id="glow" x="-20%" y="-80%" width="140%" height="260%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Stops */}
        {venues.map((venue, i) => {
          const cx = PAD_X + i * STEP
          const isActive = active.has(venue)
          const r = isActive ? R_ACTIVE : R_STOP
          // Shorten long names for label
          const label = venue.replace(' Warehouse', '').replace(' Cafe', '')

          return (
            <g key={venue}>
              {/* Outer glow ring for active stops */}
              {isActive && (
                <circle
                  cx={cx}
                  cy={CY}
                  r={r + 5}
                  fill="none"
                  stroke="var(--color-accent-500)"
                  strokeOpacity="0.35"
                  strokeWidth="2"
                  filter="url(#glow)"
                />
              )}
              {/* Stop circle */}
              <circle
                cx={cx}
                cy={CY}
                r={r}
                fill={isActive ? 'var(--color-accent-500)' : 'var(--color-bg-purple)'}
                stroke="var(--color-accent-500)"
                strokeOpacity={isActive ? 1 : 0.4}
                strokeWidth="2"
                filter={isActive ? 'url(#glow)' : undefined}
              />
              {/* Venue label */}
              <text
                x={cx}
                y={CY + r + 13}
                textAnchor="middle"
                fontSize="9"
                fontFamily="'SF Mono', monospace"
                letterSpacing="0.03em"
                fill={isActive ? 'var(--color-accent-500)' : 'var(--color-text-tertiary)'}
                fillOpacity={isActive ? 0.9 : 1}
              >
                {label.toUpperCase()}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default memo(VenueStrip)
