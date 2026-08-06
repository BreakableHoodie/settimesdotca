import { MapPin, Navigation } from 'lucide-react'
import { buildDirectionsHref } from '../utils/directions'
import { safeExternalHref } from '../utils/urlSafety'

function VenueInfo({ eventData }) {
  let venues
  try {
    venues = eventData?.venue_info ? JSON.parse(eventData.venue_info) : []
  } catch (error) {
    console.error('Failed to parse venue_info JSON:', error)
    venues = []
  }

  // Only render if there are venues to show
  if (venues.length === 0) {
    return null
  }

  return (
    <section className="py-8 sm:py-10 mt-8 border-t border-accent-500/20 bg-bg-purple/30">
      <div className="container mx-auto px-4 max-w-6xl">
        <h3 className="text-xl font-bold text-text-primary mb-4 text-center">Venue Locations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl mx-auto">
          {venues.map(venue => {
            const mapHref = safeExternalHref(venue.googleMaps)
            // Guard the address row on the TRIMMED value, in BOTH branches.
            // buildDirectionsHref trims before deciding, so an untrimmed
            // truthiness check renders a MapPin next to an empty span for a
            // whitespace-only address — an icon labelling nothing.
            const hasAddress = typeof venue.address === 'string' && venue.address.trim() !== ''
            const cardClassName =
              'bg-bg-purple/50 hover:bg-bg-purple transition-colors p-4 rounded-lg border border-accent-500/30 text-center focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500'

            if (mapHref === '#') {
              // No admin-set googleMaps link (missing or an unsafe/invalid
              // URL) — fall back to a directions link built from name +
              // address rather than leaving the address as inert text
              // (#754). Reuses the same builder as VenuePage.jsx; returns
              // null (no link rendered) when address is missing/blank.
              const fallbackDirectionsHref = buildDirectionsHref(venue.name, venue.address)
              return (
                <div key={venue.name} className={cardClassName}>
                  <h4 className="font-bold text-text-primary text-sm mb-2">{venue.name}</h4>
                  {hasAddress && (
                    <p className="text-accent-400 text-xs mb-1 flex items-center justify-center gap-2">
                      <MapPin size={12} aria-hidden="true" />
                      <span>{venue.address}</span>
                    </p>
                  )}
                  {fallbackDirectionsHref && (
                    <a
                      href={fallbackDirectionsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Directions to ${venue.name}`}
                      className="inline-flex items-center justify-center gap-1.5 text-accent-400 hover:text-accent-300 text-xs mt-1"
                    >
                      <Navigation size={12} aria-hidden="true" />
                      Directions
                    </a>
                  )}
                  {venue.note && <p className="text-text-tertiary text-xs italic mt-2">{venue.note}</p>}
                </div>
              )
            }

            return (
              <a
                key={venue.name}
                href={mapHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cardClassName}
                title={`Open directions to ${venue.name}`}
                aria-label={`Open directions to ${venue.name}`}
              >
                <h4 className="font-bold text-text-primary text-sm mb-2">{venue.name}</h4>
                {hasAddress && (
                  <p className="text-accent-400 text-xs mb-1 flex items-center justify-center gap-2">
                    <MapPin size={14} aria-hidden="true" />
                    <span>{venue.address}</span>
                  </p>
                )}
                {venue.note && <p className="text-text-tertiary text-xs italic mt-2">{venue.note}</p>}
              </a>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default VenueInfo
