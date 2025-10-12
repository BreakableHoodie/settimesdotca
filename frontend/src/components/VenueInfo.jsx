const venues = [
  {
    name: 'Room 47',
    address: '47 King St N, Waterloo, ON N2J 2W9',
    googleMaps: 'https://maps.google.com/?q=47+King+St+N+Waterloo+ON+N2J+2W9',
    note: 'Across the street from other venues'
  },
  {
    name: 'Prohibition Warehouse',
    address: '56 King St N, Waterloo, ON N2J 2X1',
    googleMaps: 'https://maps.google.com/?q=56+King+St+N+Waterloo+ON+N2J+2X1'
  },
  {
    name: 'AristoCanine',
    address: '28 King St N, Waterloo, ON N2J 2W7',
    googleMaps: 'https://maps.google.com/?q=28+King+St+N+Waterloo+ON+N2J+2W7'
  },
  {
    name: 'Princess Cafe',
    address: '46 King St N, Waterloo, ON N2J 2W8',
    googleMaps: 'https://maps.google.com/?q=46+King+St+N+Waterloo+ON+N2J+2W8'
  }
]

function VenueInfo() {
  return (
    <footer className="py-10 sm:py-12 mt-12 sm:mt-16 border-t border-band-orange/20 bg-band-navy/30">
      <div className="container mx-auto px-4 max-w-6xl space-y-6 sm:space-y-8">
        <h3 className="text-xl font-bold text-white mb-4 text-center">
          Venue Locations
        </h3>
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
                <span aria-hidden="true">📍</span>
                <span>{venue.address}</span>
              </p>
              {venue.note && (
                <p className="text-white/60 text-xs italic">{venue.note}</p>
              )}
            </a>
          ))}
        </div>

        {/* Links section */}
        <div className="text-center space-y-3 mb-6">
          <div className="flex justify-center gap-4 text-sm">
            <a
              href="https://ticketscene.ca/events/55263/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-band-orange hover:text-yellow-400 transition-colors font-semibold flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-orange"
              title="Buy tickets"
            >
              <span aria-hidden="true">🎟️</span>
              <span>Get Tickets</span>
            </a>
            <a
              href="https://www.instagram.com/longweekendbandcrawl?igsh=eGN4ZW5sNjl4cnVr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-band-orange hover:text-yellow-400 transition-colors font-semibold flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-orange"
              title="Follow on Instagram"
            >
              <span aria-hidden="true">📸</span>
              <span>Instagram</span>
            </a>
            <a
              href="https://www.facebook.com/events/2539604946400304"
              target="_blank"
              rel="noopener noreferrer"
              className="text-band-orange hover:text-yellow-400 transition-colors font-semibold flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-orange"
              title="View event on Facebook"
            >
              <span aria-hidden="true">📘</span>
              <span>Facebook</span>
            </a>
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
            </a>
            {' '}&{' '}
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
          <p className="text-white/50 text-xs italic">
            Times are subject to change - late starts happen!
          </p>
          <p className="text-white/50 text-xs flex items-center justify-center gap-2">
            Website by{' '}
            <a
              href="https://www.instagram.com/artificialclancy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-band-orange/70 hover:text-band-orange transition-colors inline-flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-orange"
            >
              <span aria-hidden="true">📸</span>
              <span>Dre</span>
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}

export default VenueInfo
