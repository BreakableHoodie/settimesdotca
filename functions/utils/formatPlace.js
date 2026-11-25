// Single home for place formatting (#1492). Mirrors the trimming rules of the
// frontend's formatOrigin (frontend/src/admin/utils/bandFields.js): every part
// is trimmed and an empty or whitespace-only part is skipped, so a
// whitespace-only city never prints ", ON".

const clean = (value) => String(value ?? "").trim();
const joinParts = (parts, sep) => parts.map(clean).filter(Boolean).join(sep);

/** "City, Region", else the legacy free-text `origin`, else null. */
export function formatOrigin(profile) {
  if (!profile) return null;
  return joinParts([profile.origin_city, profile.origin_region], ", ") || clean(profile.origin) || null;
}

/**
 * One-line venue address, or null for a missing venue. An existing venue with
 * no address parts yields "". Expects `city`/`region`; map other column names
 * (e.g. the admin stats query's venue_city/venue_region) at the call site.
 */
export function formatVenueAddress(venue) {
  if (!venue) return null;
  const line1 = joinParts([venue.address_line1, venue.address_line2], ", ");
  const line2 = joinParts([venue.city, venue.region], ", ");
  const line3 = joinParts([venue.postal_code, venue.country], " ");
  return [line1, line2, line3].filter(Boolean).join(", ");
}
