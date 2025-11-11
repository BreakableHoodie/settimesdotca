import PropTypes from 'prop-types'

export default function PerformerPicker({ eventId, eventVenues }) {
  const venues = eventVenues?.slice(0, 3) || []

  return (
    <section className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/60">Quick Scheduling</p>
          <h3 className="text-xl font-semibold text-white">Pick a performer</h3>
        </div>
        <span className="px-3 py-1 text-xs font-medium rounded-full bg-band-orange/20 text-band-orange">
          Event #{eventId}
        </span>
      </div>

      <p className="text-white/70 text-sm mt-3">
        This panel will evolve into a bulk importer that lets you drop an existing performer onto an open slot in just a
        few clicks. For now, use the <strong>Add Band</strong> button above to create performances manually.
      </p>

      {venues.length > 0 && (
        <div className="mt-4 text-sm text-white/60">
          <p className="font-medium text-white mb-2">Venues in this event:</p>
          <div className="flex flex-wrap gap-2">
            {venues.map(venue => (
              <span key={venue.id} className="px-3 py-1 rounded-full bg-white/10 border border-white/15">
                {venue.name}
              </span>
            ))}
            {eventVenues.length > venues.length && (
              <span className="px-3 py-1 rounded-full bg-white/5 border border-dashed border-white/20">
                +{eventVenues.length - venues.length} more
              </span>
            )}
          </div>
        </div>
      )}

      <a
        href="https://github.com/BreakableHoodie/longweekend-bandcrawl/tree/dev/docs"
        target="_blank"
        rel="noreferrer"
        className="inline-flex mt-4 px-4 py-2 rounded-lg bg-band-orange text-white font-medium hover:bg-orange-500 transition"
      >
        View scheduling guide
      </a>
    </section>
  )
}

PerformerPicker.propTypes = {
  eventId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  eventVenues: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      name: PropTypes.string,
    })
  ),
}
