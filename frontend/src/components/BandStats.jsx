import PropTypes from 'prop-types'
import { Card, Badge } from './ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChartLine } from '@fortawesome/free-solid-svg-icons'

function formatLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return '—'
  }

  if (typeof value === 'number') {
    const isInteger = Number.isInteger(value)
    return isInteger ? value.toLocaleString() : value.toFixed(1)
  }

  return value
}

export default function BandStats({ stats }) {
  const entries = Object.entries(stats || {}).filter(([, value]) => value !== null && value !== undefined)

  if (entries.length === 0) {
    return (
      <Card variant="elevated">
        <h3 className="text-lg font-semibold text-text-primary mb-2 flex items-center gap-2">
          <FontAwesomeIcon icon={faChartLine} className="text-accent-500" />
          Performance Stats
        </h3>
        <p className="text-sm text-text-secondary">No performance data yet. Check back after the next show.</p>
      </Card>
    )
  }

  return (
    <Card variant="elevated">
      <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <FontAwesomeIcon icon={faChartLine} className="text-accent-500" />
        Performance Stats
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
