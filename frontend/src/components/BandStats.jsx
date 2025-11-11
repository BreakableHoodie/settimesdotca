import PropTypes from 'prop-types'

function formatLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
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
      <section className="bg-white/5 rounded-2xl border border-white/10 p-4">
        <h3 className="text-lg font-semibold text-white mb-2">Performance Stats</h3>
        <p className="text-sm text-white/70">No performance data yet. Check back after the next show.</p>
      </section>
    )
  }

  return (
    <section className="bg-white/5 rounded-2xl border border-white/10 p-4">
      <h3 className="text-lg font-semibold text-white mb-4">Performance Stats</h3>
      <div className="grid grid-cols-2 gap-3">
        {entries.map(([key, value]) => (
          <div key={key} className="bg-white/5 rounded-xl border border-white/10 p-3">
            <p className="text-xs uppercase tracking-wide text-white/60 mb-1">{formatLabel(key)}</p>
            <p className="text-2xl font-bold text-white">{formatValue(value)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

BandStats.propTypes = {
  stats: PropTypes.object,
}
