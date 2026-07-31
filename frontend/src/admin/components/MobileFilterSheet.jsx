import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import PropTypes from 'prop-types'
import Modal from '../../components/ui/Modal'
import ColumnFilter from './ColumnFilter'
import LinksColumnFilter from './LinksColumnFilter'
import { EMPTY_GAP_FILTER } from '../utils/bandFields'
import { FILTERABLE_COLUMNS, valueCountsFor, linkCountsFor } from '../utils/rosterColumns'

export default function MobileFilterSheet({ isOpen, onClose, columnFilters, setColumnFilters, searchFiltered }) {
  const [expandedSections, setExpandedSections] = useState({})

  const toggleSection = key => {
    setExpandedSections(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const updateColumnFilter = (key, value) => {
    setColumnFilters(prev => ({ ...prev, [key]: value }))
  }

  const clearColumnFilter = key => {
    setColumnFilters(prev => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
  }

  const collapseSection = key => {
    setExpandedSections(prev => ({ ...prev, [key]: false }))
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filters" size="sm" className="md:hidden">
      <div className="space-y-2">
        {FILTERABLE_COLUMNS.map(column => (
          <div key={column.key} className="border border-white/10 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection(column.key)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
              aria-expanded={expandedSections[column.key]}
              aria-controls={`filter-panel-${column.key}`}
            >
              <span className="font-medium text-white">{column.label}</span>
              <ChevronDown
                size={20}
                className={`text-white/70 transition-transform ${expandedSections[column.key] ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Conditionally mount the filter panel */}
            {expandedSections[column.key] && (
              <div
                id={`roster-mobile-filter-panel-${column.key}`}
                className="border-t border-white/10 px-4 py-3 bg-bg-navy"
              >
                {column.key === 'link_count' ? (
                  <LinksColumnFilter
                    value={columnFilters.link_count ?? EMPTY_GAP_FILTER}
                    counts={linkCountsFor(searchFiltered, columnFilters)}
                    onChange={value => updateColumnFilter('link_count', value)}
                    onClear={() => clearColumnFilter('link_count')}
                    onClose={() => collapseSection('link_count')}
                    triggerRef={null}
                    panelId={`roster-mobile-filter-panel-link_count`}
                    closeOnEscape={false}
                  />
                ) : (
                  <ColumnFilter
                    column={column}
                    counts={valueCountsFor(column.key, searchFiltered, columnFilters)}
                    value={columnFilters[column.key]?.values}
                    onChange={values => updateColumnFilter(column.key, { values })}
                    onClear={() => clearColumnFilter(column.key)}
                    onClose={() => collapseSection(column.key)}
                    triggerRef={null}
                    panelId={`roster-mobile-filter-panel-${column.key}`}
                    closeOnEscape={false}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}

MobileFilterSheet.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  columnFilters: PropTypes.object.isRequired,
  setColumnFilters: PropTypes.func.isRequired,
  searchFiltered: PropTypes.array.isRequired,
}
