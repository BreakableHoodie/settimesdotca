// Directions handoff (#742) — one universal Google Maps link rather than
// sniffing the User-Agent to choose between a `geo:` URI (Android) and an
// Apple Maps URL (iOS). Google documents this exact `api=1&query=` form
// (https://developers.google.com/maps/documentation/urls/get-started#search-action)
// as the one both iOS and Android intercept and offer to open in the
// device's own installed maps app, and it still resolves in a desktop
// browser — so it covers every target CLAUDE.md calls out without the
// fragility of parsing navigator.userAgent for what is, after all, just a
// link.
//
// Name + address (not address alone) so the pin lands on the venue itself
// rather than mid-street — a bare street address can resolve to the wrong
// side of the road or a neighbouring building.
export function buildDirectionsHref(name, address) {
  // Trim before the guard: a whitespace-only address is truthy, and it IS
  // reachable -- formatAddress() in functions/api/venues/[id].js builds the
  // string with filter(Boolean), which keeps a "   " address_line1. Without
  // this, bad admin data produces a link to an empty map query.
  const trimmedAddress = typeof address === 'string' ? address.trim() : ''
  if (!trimmedAddress) return null
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  const query = trimmedName ? `${trimmedName}, ${trimmedAddress}` : trimmedAddress
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

// Directions for a performance/band object shaped like the schedule API's
// payload (venue NAME + optional venue_lat/venue_lng — schedule.js never
// joins the venue's address). Prefers exact coordinates, which opens the
// device's native maps app rather than a Google web search; falls back to a
// "<venue> Waterloo ON" name search when coordinates aren't available.
//
// Consolidated from utils/nextMove.js's own copy of this exact function
// (#754) — issue #754's correction confirmed there were two directions-URL
// builders live simultaneously, not the one #753 assumed had already
// consolidated them. This is now the single builder both address-shaped
// (`buildDirectionsHref`) and coordinate-shaped (this function) venue data
// go through; do not reintroduce a third copy in a component file.
export function buildDirectionsHrefForBand(band) {
  if (!band) return null
  const { venue_lat: lat, venue_lng: lng, venue, venue_city: city } = band
  // Number.isFinite (not !Number.isNaN) — the latter accepts Infinity, which
  // would build a literal "destination=Infinity,Infinity" URL. Range-check to
  // WGS84 bounds too: an out-of-range pair is bad data, and a broken pin is
  // worse than the venue-name search below, which still gets a fan there.
  const hasUsableCoords = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  if (hasUsableCoords) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  }
  // Fallback for a venue without usable coordinates: search by name. Scope the
  // search to the venue's own city when known (#767) — never a hardcoded city,
  // which is confidently wrong for events outside Waterloo Region. When city is
  // unknown, a bare venue-name search is vaguer but never wrong.
  const trimmedVenue = typeof venue === 'string' ? venue.trim() : ''
  if (trimmedVenue) {
    const trimmedCity = typeof city === 'string' ? city.trim() : ''
    const query = trimmedCity ? `${trimmedVenue} ${trimmedCity}` : trimmedVenue
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  }
  return null
}
