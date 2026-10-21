import { Clock } from 'lucide-react'

// "Blue Room is running about 15 minutes late" (#1249). The set times below
// it are already shifted; this tells the fan why. Shown only while the event
// is live (LiveContextBar gates it), so a banner left on after the show never
// lingers. Semantic tokens only: it must read on the light themes too.
export default function VenueDelayBanner({ delays }) {
  const late = (delays || []).filter(delay => delay?.minutes > 0 && delay?.venue)
  if (late.length === 0) return null

  return (
    <div
      role="status"
      className="mt-3 flex items-start gap-2 rounded-lg border border-warning-500/50 bg-warning-500/15 px-3 py-2 text-sm text-text-primary"
    >
      <Clock size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <ul className="space-y-0.5">
        {late.map(delay => (
          <li key={delay.venueId ?? delay.venue}>
            <span className="font-semibold">{delay.venue}</span> is running about {delay.minutes}{' '}
            {delay.minutes === 1 ? 'minute' : 'minutes'} late. Its times below are updated.
          </li>
        ))}
      </ul>
    </div>
  )
}
