import { faFacebook, faInstagram } from '@fortawesome/free-brands-svg-icons'
import { faLocationDot, faTicket } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

function VenueInfo({ eventData }) {
  // Parse event venue info and social links from JSON
  const venues = eventData?.venue_info ? JSON.parse(eventData.venue_info) : []
  const socialLinks = eventData?.social_links ? JSON.parse(eventData.social_links) : {}
  const ticketUrl = eventData?.ticket_url || socialLinks.ticketLink
  return (
    <footer className="py-10 sm:py-12 mt-12 sm:mt-16 border-t border-band-orange/20 bg-band-navy/30">
      <div className="container mx-auto px-4 max-w-6xl space-y-6 sm:space-y-8">
        {/* Venue Locations - Only show if venues exist */}
        {venues.length > 0 && (
          <>
            <h3 className="text-xl font-bold text-white mb-4 text-center">Venue Locations</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-4xl mx-auto mb-8">
              {venues.map(venue => (
                <a
                  key={venue.name}
                  href={venue.googleMaps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-band-purple/50 hover:bg-band-purple transition-colors p-3 rounded-lg border border-band-orange/30 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-orange"
                  title={`Open directions to ${venue.name}`}
                >
                  <h4 className="font-bold text-white text-sm mb-1">{venue.name}</h4>
                  <p className="text-band-orange text-xs mb-1 flex items-center justify-center gap-2">
                    <FontAwesomeIcon icon={faLocationDot} aria-hidden="true" />
                    <span>{venue.address}</span>
                  </p>
                  {venue.note && <p className="text-white/60 text-xs italic">{venue.note}</p>}
                </a>
              ))}
            </div>
          </>
        )}

        {/* Links section - Only show if any links exist */}
        {(ticketUrl || socialLinks.instagram || socialLinks.facebook) && (
          <div className="text-center space-y-3 mb-6">
            <div className="flex justify-center gap-4 text-sm flex-wrap">
              {ticketUrl && (
                <a
                  href={ticketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-band-orange hover:text-yellow-400 transition-colors font-semibold flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-orange"
                  title="Buy tickets"
                >
                  <FontAwesomeIcon icon={faTicket} aria-hidden="true" />
                  <span>Get Tickets</span>
                </a>
              )}
              {socialLinks.instagram && (
                <a
                  href={socialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-band-orange hover:text-yellow-400 transition-colors font-semibold flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-orange"
                  title="Follow on Instagram"
                >
                  <FontAwesomeIcon icon={faInstagram} aria-hidden="true" />
                  <span>Instagram</span>
                </a>
              )}
              {socialLinks.facebook && (
                <a
                  href={socialLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-band-orange hover:text-yellow-400 transition-colors font-semibold flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-orange"
                  title="View event on Facebook"
                >
                  <FontAwesomeIcon icon={faFacebook} aria-hidden="true" />
                  <span>Facebook</span>
                </a>
              )}
            </div>
            <p className="text-white/70 text-sm">
              Presented by{' '}
              <a
                href="https://www.instagram.com/fatscheid"
                target="_blank"
                rel="noopener noreferrer"
                className="text-band-orange hover:text-yellow-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-orange"
                title="Fat Scheid Instagram"
              >
                Fat Scheid
              </a>{' '}
              &{' '}
              <a
                href="https://www.instagram.com/pink.lemonade.records"
                target="_blank"
                rel="noopener noreferrer"
                className="text-band-orange hover:text-yellow-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-orange"
                title="Pink Lemonade Records Instagram"
              >
                Pink Lemonade Records
              </a>
            </p>
            <p className="text-white/50 text-xs italic">Times are subject to change - late starts happen!</p>
            <p className="text-white/50 text-xs flex items-center justify-center gap-2">
              Website by{' '}
              <a
                href="https://www.instagram.com/artificialclancy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-band-orange/70 hover:text-band-orange transition-colors inline-flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-orange"
              >
                <FontAwesomeIcon icon={faInstagram} aria-hidden="true" />
                <span>Dre</span>
              </a>
            </p>
          </div>
        )}
      </div>
    </footer>
  )
}

export default VenueInfo
