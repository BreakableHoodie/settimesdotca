import PropTypes from 'prop-types'

const HELP_CONTENT = {
  events: {
    title: 'Event Management Tips',
    items: [
      'Use the filter dropdown to scope actions to a single event.',
      'Draft events stay hidden from the public schedule until published.',
      'The Event Wizard walks you through creating venues and performers in sequence.',
    ],
  },
  bands: {
    title: 'Performer Management Tips',
    items: [
      'Bulk select bands to reschedule or update venues at once.',
      'Conflict warnings appear when time slots overlap within the same venue.',
      'Admin-only notes are never exposed to the public API.',
    ],
  },
}

export default function HelpPanel({ topic = 'events', isOpen, onClose }) {
  if (!isOpen) {
    return null
  }

  const content = HELP_CONTENT[topic] || {
    title: 'Admin Help',
    items: ['Use the toolbar actions to create, edit, or remove records.'],
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-band-purple border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/60">Quick Reference</p>
            <h3 className="text-2xl font-bold text-white">{content.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white text-xl"
            aria-label="Close help panel"
          >
            &times;
          </button>
        </div>

        <ul className="list-disc list-inside space-y-2 text-white/80">
          {content.items.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <div className="bg-white/5 rounded-xl border border-white/10 p-3 text-sm text-white/70">
          Need more help? Reach out to the core team on Slack or update the docs in `/docs/admin-guide.md`.
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full bg-band-orange text-white font-semibold py-2 px-4 rounded-lg hover:bg-orange-500 transition"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

HelpPanel.propTypes = {
  topic: PropTypes.oneOf(['events', 'bands']),
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
}
