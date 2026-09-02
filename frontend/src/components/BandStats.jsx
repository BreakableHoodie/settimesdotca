import { CalendarRange, MapPin, Music2, TrendingUp } from 'lucide-react'
import PropTypes from 'prop-types'
import { Card } from './ui'
import { parseLocalDate } from '../utils/timeFormat'

const LABELS = {
  total_performances: 'Shows listed',
  unique_venues: 'Venues played',
  unique_events: 'Events played',
  debut_date: 'First listed show',
  latest_date: 'Latest listed show',
  signature_venue: 'Most played venue',
  average_set_minutes: 'Avg set',
}

// Compact numeric metrics render two-up in a tight grid. The "wide" keys hold
// longer values (formatted dates, venue names) that wrap badly in a narrow
// half-width cell, so they each get a full-width row of their own.
const COMPACT_ORDER = ['total_performances', 'unique_venues', 'unique_events', 'average_set_minutes']
const WIDE_ORDER = ['debut_date', 'latest_date', 'signature_venue']

const DATE_KEYS = new Set(['debut_date', 'latest_date'])

function formatLabel(key) {
  return LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

// Compact, non-wrapping date: "Aug 4, 2024" instead of the raw "2024-08-04",
// which the browser would otherwise break across two lines in a narrow card.
function formatStatDate(value) {
  const parsed = parseLocalDate(value) || new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatNumber(value) {
  if (Number.isInteger(value)) return value.toLocaleString()
  return value.toFixed(1)
}

export default function BandStats({ stats }) {
  const totalShows = Number(stats?.total_performances || 0)
  const uniqueEvents = Number(stats?.unique_events || 0)

  const hasEnoughData = totalShows >= 3 || uniqueEvents >= 2
  if (!hasEnoughData) {
    return null
  }

  const has = key => {
    const value = stats?.[key]
    if (value === null || value === undefined) return false
    if (key === 'average_set_minutes' && totalShows < 3) return false
    if ((key === 'debut_date' || key === 'latest_date' || key === 'signature_venue') && uniqueEvents < 2) {
      return false
    }
    return true
  }

  const compact = COMPACT_ORDER.filter(has)
  const wide = WIDE_ORDER.filter(has)

  if (compact.length === 0 && wide.length === 0) {
    return null
  }

  return (
    <Card variant="elevated">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-text-primary">
        <TrendingUp size={18} className="text-accent-500" aria-hidden="true" />
        Performance Snapshot
      </h3>

      {/* Each group is its own <dl> rather than one <dl> wrapping two layout
          divs. axe-core's dlitem check walks up exactly ONE div from a dt/dd
          before requiring a <dl>, and the Card is already that one div -- an
          outer layout div made it two, so every dt/dd here failed dlitem
          (serious) and the list failed definition-list. Keep the layout
          classes ON the <dl> so no wrapper creeps back in. */}
      <div className="space-y-3">
        {compact.length > 0 && (
          <dl className="grid grid-cols-2 gap-3">
            {compact.map(key => {
              const value = stats[key]
              const display =
                key === 'average_set_minutes' ? `${Math.round(Number(value))} min` : formatNumber(Number(value))
              return (
                <Card key={key} padding="none" variant="outline" className="flex flex-col justify-between gap-1 p-3">
                  <dt className="text-[0.7rem] font-medium uppercase tracking-wide text-text-tertiary">
                    {formatLabel(key)}
                  </dt>
                  <dd className="text-2xl font-bold tabular-nums leading-none text-text-primary">{display}</dd>
                </Card>
              )
            })}
          </dl>
        )}

        {wide.length > 0 && (
          <dl className="space-y-2">
            {wide.map(key => {
              const value = stats[key]
              const isDate = DATE_KEYS.has(key)
              const isVenue = key === 'signature_venue'
              const Icon = isVenue ? MapPin : key === 'debut_date' ? Music2 : CalendarRange

              return (
                <Card
                  key={key}
                  padding="none"
                  variant="outline"
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <dt className="flex items-center gap-2 text-[0.7rem] font-medium uppercase tracking-wide text-text-tertiary">
                    <Icon size={13} className="shrink-0 text-accent-500" aria-hidden="true" />
                    {formatLabel(key)}
                  </dt>
                  <dd
                    className={`min-w-0 text-right text-sm font-semibold text-text-primary ${
                      isDate ? 'whitespace-nowrap tabular-nums' : 'break-words'
                    }`}
                  >
                    {isDate
                      ? formatStatDate(value)
                      : isVenue && value?.name
                        ? `${value.name}${value.count !== undefined ? ` · ${value.count}×` : ''}`
                        : '—'}
                  </dd>
                </Card>
              )
            })}
          </dl>
        )}
      </div>
    </Card>
  )
}

BandStats.propTypes = {
  stats: PropTypes.object,
}
