// Parse pasted lineup text into band rows for bulk import.
// One band per line, comma-separated: name, start_time, end_time, venue, genre.
// Trailing fields may be omitted; blank lines and rows without a name are skipped.
export function parseBandRows(text) {
  if (typeof text !== 'string') return []
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const cells = line.split(',').map(c => c.trim())
      const [name = '', start_time = '', end_time = '', venue = '', genre = ''] = cells
      return { name, start_time, end_time, venue, genre }
    })
    .filter(row => row.name)
}
