import { Lightbulb } from 'lucide-react'
import PropTypes from 'prop-types'
import { Card } from './ui'

function buildFacts(band = {}, stats = {}) {
  const facts = []

  if (band.origin) {
    facts.push(`${band.name || 'This band'} calls ${band.origin} home.`)
  }

  if (band.genre) {
    facts.push(`Known for ${band.genre.toLowerCase()} vibes.`)
  }

  if (stats.total_performances >= 3) {
    facts.push(`Has played ${stats.total_performances} listed shows so far.`)
  }

  if (
    (stats.average_set_minutes || stats.average_set_length || stats.avg_duration_minutes) &&
    stats.total_performances >= 3
  ) {
    const minutes = stats.average_set_minutes ?? stats.average_set_length ?? stats.avg_duration_minutes
    if (minutes) {
      facts.push(`Typical set lasts about ${Math.round(minutes)} minutes.`)
    }
  }

  if (stats.signature_venue?.name && stats.unique_events >= 2) {
    facts.push(`Most played venue: ${stats.signature_venue.name}.`)
  }

  if (!facts.length) {
    return []
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
      <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-text-primary">
        <Lightbulb size={18} className="text-accent-500" aria-hidden="true" />
        Fast Facts
      </h3>
      <ul className="space-y-2.5">
        {facts.map((fact, index) => (
          <li key={index} className="flex items-start gap-2.5 text-sm leading-relaxed text-text-secondary">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden="true" />
            <span className="break-words">{fact}</span>
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
