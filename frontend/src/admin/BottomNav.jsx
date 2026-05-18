import { CalendarDays, Guitar, List, Settings, SlidersHorizontal, Users, Warehouse } from 'lucide-react'
import PropTypes from 'prop-types'

const buildNavItems = ({ showLineup, showUsers, showPlatform }) => [
  { id: 'events', label: 'Events', icon: CalendarDays },
  ...(showLineup ? [{ id: 'lineup', label: 'Lineup', icon: List }] : []),
  { id: 'roster', label: 'Roster', icon: Guitar },
  { id: 'venues', label: 'Venues', icon: Warehouse },
  ...(showUsers ? [{ id: 'users', label: 'Users', icon: Users }] : []),
  { id: 'settings', label: 'Settings', icon: Settings },
  ...(showPlatform ? [{ id: 'platform', label: 'Platform', icon: SlidersHorizontal }] : []),
]

export default function BottomNav({
  activeTab,
  onTabChange,
  showLineup = false,
  showUsers = false,
  showPlatform = false,
}) {
  const navItems = buildNavItems({ showLineup, showUsers, showPlatform })
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-purple/95 border-t border-white/10 backdrop-blur-xs z-40"
      style={{ paddingBottom: 'var(--spacing-safe-bottom)' }}
    >
      <div className="grid grid-flow-col auto-cols-fr">
        {navItems.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeTab === item.id}
            onClick={() => onTabChange(item.id)}
            className={`bottom-nav-button flex flex-col items-center justify-center py-3 text-xs font-medium transition-all min-h-[56px] ${
              activeTab === item.id ? 'text-accent-500 bg-accent-500/10' : 'text-text-tertiary hover:text-white'
            }`}
          >
            <item.icon size={18} className="mb-1" />
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
