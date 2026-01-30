import { faLocationDot } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

function VenueInfo({ eventData }) {
  // Parse event venue info from JSON with error handling
  let venues = []

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
        <h3 className="text-xl font-bold text-white mb-4 text-center">Venue Locations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl mx-auto">
          {venues.map(venue => (
            <a
              key={venue.name}
              href={venue.googleMaps}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-bg-purple/50 hover:bg-bg-purple transition-colors p-4 rounded-lg border border-accent-500/30 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
              title={`Open directions to ${venue.name}`}
            >
              <h4 className="font-bold text-white text-sm mb-2">{venue.name}</h4>
              <p className="text-accent-400 text-xs mb-1 flex items-center justify-center gap-2">
                <FontAwesomeIcon icon={faLocationDot} aria-hidden="true" />
                <span>{venue.address}</span>
              </p>
              {venue.note && <p className="text-text-tertiary text-xs italic mt-2">{venue.note}</p>}
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

export default VenueInfo
