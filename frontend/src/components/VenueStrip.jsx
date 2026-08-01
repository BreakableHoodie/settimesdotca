// Transit-map spine for the 6 King St N venues.
// Renders a horizontal subway-style line with venue stops;
// venues where the fan has scheduled bands are highlighted as "active stops."
import { memo } from 'react'

// Ordered south→north along King St N, Waterloo.
// Kept as a constant so the visual ordering is always consistent.
const KING_ST_VENUES = ['Prohibition Warehouse', 'Princess Cafe', 'Blue Room', 'Room 47', 'Revive Karaoke', 'Roost']

function VenueStrip({ activeVenues = [] }) {
  const active = new Set(activeVenues)
  const count = KING_ST_VENUES.length

  // SVG layout constants
  const W = 600
  const H = 64
  const PAD_X = 40
  const CY = 28
  const STEP = (W - PAD_X * 2) / (count - 1)
  const R_STOP = 6
  const R_ACTIVE = 8

  return (
    <div className="w-full overflow-x-auto" role="img" aria-label="Venue route along King St N">
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
        {KING_ST_VENUES.map((v, i) => {
          if (i === count - 1) return null
          const bothActive = active.has(v) && active.has(KING_ST_VENUES[i + 1])
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
        {KING_ST_VENUES.map((venue, i) => {
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

        {/* "KING ST N →" label */}
        <text
          x={W - PAD_X + 6}
          y={CY + 4}
          fontSize="8"
          fontFamily="'SF Mono', monospace"
          letterSpacing="0.05em"
          fill="var(--color-text-tertiary)"
          fillOpacity={0.4}
        >
          N
        </text>
      </svg>
    </div>
  )
}

export default memo(VenueStrip)
export { KING_ST_VENUES }
