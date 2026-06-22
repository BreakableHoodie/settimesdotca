// Approximate walking time between two venues from their lat/lng coordinates.
// Uses the haversine great-circle distance and a steady ~80 m/min walking pace
// (~4.8 km/h) — a reasonable default for the compact King St venue cluster.

const WALK_METERS_PER_MINUTE = 80
const EARTH_RADIUS_M = 6371000

function toRadians(deg) {
  return (deg * Math.PI) / 180
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

function hasCoords(v) {
  return (
    v &&
    typeof v.latitude === 'number' &&
    typeof v.longitude === 'number' &&
    !Number.isNaN(v.latitude) &&
    !Number.isNaN(v.longitude)
  )
}

// Approximate walking time in whole minutes between two venue-like objects
// ({ latitude, longitude }), or null if either lacks usable coordinates.
export function walkMinutesBetween(a, b) {
  if (!hasCoords(a) || !hasCoords(b)) return null
  const meters = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude)
  return Math.max(1, Math.round(meters / WALK_METERS_PER_MINUTE))
}
