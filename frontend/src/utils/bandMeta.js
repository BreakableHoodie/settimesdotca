export function bandHometown(band) {
  return band?.origin_city || band?.origin_region || band?.origin || ''
}

export function buildBandTitle(band) {
  const genre = band?.genre ? ` — ${band.genre}` : ''
  const hometown = bandHometown(band)
  return `${band?.name || 'Band'}${genre}${hometown ? ` from ${hometown}` : ''} | SetTimes`
}
