import PropTypes from 'prop-types'
import { Card } from './ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLightbulb } from '@fortawesome/free-solid-svg-icons'

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
    <Card variant="elevated">
      <h3 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
        <FontAwesomeIcon icon={faLightbulb} className="text-accent-500" />
        Fast Facts
      </h3>
      <ul className="space-y-2">
        {facts.map((fact, index) => (
          <li key={index} className="text-text-secondary text-sm leading-relaxed flex items-start gap-2">
            <span className="text-accent-500 mt-0.5">•</span>
            <span>{fact}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

BandFacts.propTypes = {
  band: PropTypes.object,
  stats: PropTypes.object,
}
