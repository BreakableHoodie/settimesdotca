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
  if (!address) return null
  const query = name ? `${name}, ${address}` : address
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
