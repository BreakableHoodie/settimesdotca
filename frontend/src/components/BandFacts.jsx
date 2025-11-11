import PropTypes from 'prop-types'

function buildFacts(band = {}, stats = {}) {
  const facts = []

  if (band.origin) {
    facts.push(`${band.name || 'This band'} calls ${band.origin} home.`)
  }

  if (band.genre) {
    facts.push(`Known for ${band.genre.toLowerCase()} vibes.`)
  }

  if (stats.totalShows || stats.shows_played) {
    const shows = stats.totalShows ?? stats.shows_played
    facts.push(`Has performed ${shows}+ shows across Long Weekend events.`)
  }

  if (stats.average_set_length || stats.avg_duration_minutes) {
    const minutes = stats.average_set_length ?? stats.avg_duration_minutes
    if (minutes) {
      facts.push(`Typical set lasts about ${Math.round(minutes)} minutes.`)
    }
  }

  if (stats.most_played_venue) {
    facts.push(`Crowd favorite at ${stats.most_played_venue}.`)
  }

  if (!facts.length && band.description) {
    facts.push(band.description)
  }

  if (!facts.length) {
    facts.push('Fresh on the lineup—come back soon for more trivia!')
  }

  return facts.slice(0, 4)
}

export default function BandFacts({ band, stats }) {
  const facts = buildFacts(band, stats)

  if (!facts.length) {
    return null
  }

  return (
    <section className="bg-white/5 rounded-2xl border border-white/10 p-4">
      <h3 className="text-lg font-semibold text-white mb-3">Fast Facts</h3>
      <ul className="space-y-2">
        {facts.map((fact, index) => (
          <li key={index} className="text-white/80 text-sm leading-relaxed">
            • {fact}
          </li>
        ))}
      </ul>
    </section>
  )
}

BandFacts.propTypes = {
  band: PropTypes.object,
  stats: PropTypes.object,
}
