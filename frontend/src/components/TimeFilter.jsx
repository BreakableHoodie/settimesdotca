import { useState } from 'react'
import { getTimeFilterOptions } from '../utils/timeFilter'

/**
 * TimeFilter - Component for filtering performances by time periods
 *
 * Features:
 * - Dropdown/select for time period selection
 * - Mobile-friendly design
 * - Shows current selection with description
 */
export default function TimeFilter({ selectedFilter, onFilterChange, className = '' }) {
  const [isOpen, setIsOpen] = useState(false)
  const options = getTimeFilterOptions()
  const selectedOption = options.find(opt => opt.value === selectedFilter) || options[0]

  const handleSelect = option => {
    onFilterChange(option.value)
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`}>
      {/* Filter Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full sm:w-auto px-4 py-2 rounded-lg font-semibold transition-all duration-150 
          hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 
          focus-visible:ring-offset-2 focus-visible:ring-accent-400
          ${
            selectedFilter === 'all'
              ? 'bg-bg-purple/50 text-white hover:bg-bg-purple'
              : 'bg-accent-500 text-bg-navy shadow-lg'
          }
        `}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={selectedOption.description}
      >
        <div className="flex items-center justify-center gap-2">
          <span>{selectedOption.label}</span>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} aria-hidden="true" />

          {/* Menu */}
          <div className="absolute top-full left-0 right-0 sm:right-auto sm:w-64 mt-2 bg-bg-navy border border-accent-500/20 rounded-lg shadow-xl z-20 max-h-80 overflow-y-auto">
            {options.map(option => (
              <button
                key={option.value}
                onClick={() => handleSelect(option)}
                className={`
                  w-full px-4 py-3 text-left hover:bg-bg-purple/30 transition-colors
                  ${selectedFilter === option.value ? 'bg-accent-500/20 text-accent-400' : 'text-white'}
                  first:rounded-t-lg last:rounded-b-lg
                `}
                role="option"
                aria-selected={selectedFilter === option.value}
              >
                <div className="font-medium">{option.label}</div>
                <div className="text-xs text-white/70 mt-1">{option.description}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
