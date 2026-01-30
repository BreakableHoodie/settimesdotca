import {
  faCalendarDays,
  faGuitar,
  faUsers,
  faWarehouse,
  faGear,
  faList,
  faSliders,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import PropTypes from 'prop-types'

const buildNavItems = ({ showLineup, showUsers, showPlatform }) => [
  { id: 'events', label: 'Events', icon: faCalendarDays },
  ...(showLineup ? [{ id: 'lineup', label: 'Lineup', icon: faList }] : []),
  { id: 'roster', label: 'Roster', icon: faGuitar },
  { id: 'venues', label: 'Venues', icon: faWarehouse },
  ...(showUsers ? [{ id: 'users', label: 'Users', icon: faUsers }] : []),
  { id: 'settings', label: 'Settings', icon: faGear },
  ...(showPlatform ? [{ id: 'platform', label: 'Platform', icon: faSliders }] : []),
]

export default function BottomNav({ activeTab, onTabChange, showLineup, showUsers, showPlatform }) {
  const navItems = buildNavItems({ showLineup, showUsers, showPlatform })
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-purple/95 border-t border-white/10 backdrop-blur-sm z-40">
      <div className="grid grid-flow-col auto-cols-fr">
        {navItems.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={`bottom-nav-button flex flex-col items-center justify-center py-3 text-xs font-medium transition-all min-h-[56px] ${
              activeTab === item.id ? 'text-accent-500 bg-accent-500/10' : 'text-text-tertiary hover:text-white'
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
  showLineup: PropTypes.bool,
  showUsers: PropTypes.bool,
  showPlatform: PropTypes.bool,
}

BottomNav.defaultProps = {
  showLineup: false,
  showUsers: false,
  showPlatform: false,
}
