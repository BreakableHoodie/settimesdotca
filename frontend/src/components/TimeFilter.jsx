import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import { getTimeFilterOptions } from '../utils/timeFilter'

/**
 * TimeFilter - Component for filtering performances by time periods
 *
 * Features:
 * - Dropdown/select for time period selection
 * - Mobile-friendly design
 * - Shows current selection with description
 */
export default function TimeFilter({ selectedFilter, onFilterChange, className = '', visibleLabel = false }) {
  const filterId = useId()
  const options = getTimeFilterOptions()
  const selectedOption = options.find(opt => opt.value === selectedFilter) || options[0]

  return (
    <div className={`relative ${className}`}>
      {/* visibleLabel: inside the event page's filter panel every control carries
          a plain-text label; elsewhere the select is self-evident and the label
          stays screen-reader only. */}
      <label
        htmlFor={filterId}
        className={visibleLabel ? 'mb-1 block text-sm font-medium text-text-secondary' : 'sr-only'}
      >
        {visibleLabel ? 'Time' : 'Time filter'}
      </label>
      <div className="relative">
        <select
          id={filterId}
          value={selectedOption.value}
          onChange={event => onFilterChange?.(event.target.value)}
          title={selectedOption.description}
          className={`min-h-[44px] w-full appearance-none ${visibleLabel ? 'rounded-lg' : 'rounded-full'} border px-4 py-2 pr-10 text-sm font-medium transition-colors focus:border-accent-500 focus:outline-hidden ${
            selectedFilter === 'all'
              ? 'border-border bg-surface text-text-primary hover:bg-surface-hover'
              : 'border-accent-500/35 bg-accent-500/10 text-accent-400'
          }`}
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
      </div>
    </div>
  )
}
