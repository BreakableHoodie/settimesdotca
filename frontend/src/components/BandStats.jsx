import PropTypes from 'prop-types'
import { Card } from './ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChartLine } from '@fortawesome/free-solid-svg-icons'

const LABELS = {
  total_performances: 'Shows listed',
  unique_venues: 'Venues played',
  unique_events: 'Events played',
  debut_date: 'First listed show',
  latest_date: 'Latest listed show',
  signature_venue: 'Most played venue',
  average_set_minutes: 'Avg set (min)',
}

const ORDER = [
  'total_performances',
  'unique_venues',
  'unique_events',
  'debut_date',
  'latest_date',
  'signature_venue',
  'average_set_minutes',
]

function formatLabel(key) {
  return LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return '—'
  }

  if (typeof value === 'number') {
    const isInteger = Number.isInteger(value)
    return isInteger ? value.toLocaleString() : value.toFixed(1)
  }

  if (typeof value === 'object') {
    if (value.name && value.count !== undefined) {
      return `${value.name} (${value.count}x)`
    }
    if (value.name) {
      return value.name
    }
    return '—'
  }

  return value
}

export default function BandStats({ stats }) {
  const totalShows = Number(stats?.total_performances || 0)
  const uniqueEvents = Number(stats?.unique_events || 0)

  const hasEnoughData = totalShows >= 3 || uniqueEvents >= 2
  if (!hasEnoughData) {
    return null
  }

  const entries = ORDER.map(key => [key, stats?.[key]])
    .filter(([, value]) => value !== null && value !== undefined)
    .filter(([key]) => {
      if (key === 'average_set_minutes' && totalShows < 3) return false
      if ((key === 'debut_date' || key === 'latest_date' || key === 'signature_venue') && uniqueEvents < 2) {
        return false
      }
      return true
    })

  if (entries.length === 0) {
    return null
  }

  return (
    <Card variant="elevated">
      <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <FontAwesomeIcon icon={faChartLine} className="text-accent-500" />
        Performance Snapshot
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {entries.map(([key, value]) => (
          <Card key={key} padding="sm" variant="outline" className="text-center">
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-1">{formatLabel(key)}</p>
            <p className="text-2xl font-bold text-text-primary">{formatValue(value)}</p>
          </Card>
        ))}
      </div>
    </Card>
  )
}

BandStats.propTypes = {
  stats: PropTypes.object,
}
