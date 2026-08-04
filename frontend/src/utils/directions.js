// Directions handoff (#742) — one universal Google Maps link rather than
// sniffing the User-Agent to choose between a `geo:` URI (Android) and an
// Apple Maps URL (iOS). Google documents this exact `api=1&query=` form
// (https://developers.google.com/maps/documentation/urls/get-started#search-action)
// as the one both iOS and Android intercept and offer to open in the
// device's own installed maps app, and it still resolves in a desktop
// browser — so it covers every target CLAUDE.md calls out without the
// fragility of parsing navigator.userAgent for what is, after all, just a
// link. Matches the existing precedent in utils/nextMove.js's
// directionsHref(), which uses the same api=1 Google Maps URL family.
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
