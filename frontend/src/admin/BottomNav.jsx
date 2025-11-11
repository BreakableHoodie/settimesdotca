import { faCalendarDays, faGuitar, faUsers, faWarehouse } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import PropTypes from 'prop-types'

const NAV_ITEMS = [
  { id: 'events', label: 'Events', icon: faCalendarDays },
  { id: 'venues', label: 'Venues', icon: faWarehouse },
  { id: 'bands', label: 'Performers', icon: faGuitar },
  { id: 'users', label: 'Users', icon: faUsers },
]

export default function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-band-purple/95 border-t border-white/10 backdrop-blur z-40">
      <div className="grid grid-cols-4">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={`flex flex-col items-center justify-center py-3 text-xs font-medium transition-colors ${
              activeTab === item.id ? 'text-band-orange' : 'text-white/70'
            }`}
          >
            <FontAwesomeIcon icon={item.icon} className="text-lg mb-1" />
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

BottomNav.propTypes = {
  activeTab: PropTypes.string.isRequired,
  onTabChange: PropTypes.func.isRequired,
}
