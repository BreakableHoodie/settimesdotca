import PropTypes from 'prop-types'
import FilterFunnel from './FilterFunnel'
import { isColumnFiltered } from '../utils/rosterColumns'

// `<th>` is not natively interactive -- a keyboard user cannot activate an
// onClick attached directly to it. Every sortable header instead puts the
// handler on a real <button> inside the <th>, and the <th> carries aria-sort
// reflecting the current state so assistive tech announces which column (and
// direction) the table is sorted by.
function ariaSortFor(sortConfig, key) {
  if (sortConfig.key !== key) return 'none'
  return sortConfig.direction === 'asc' ? 'ascending' : 'descending'
}

function SortIcon({ col, sortConfig }) {
  return (
    <span className="ml-1 inline-block w-4">
      {sortConfig.key === col ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
    </span>
  )
}

SortIcon.propTypes = {
  col: PropTypes.string.isRequired,
  sortConfig: PropTypes.shape({
    key: PropTypes.string,
    direction: PropTypes.string,
  }).isRequired,
}

// Single definition shared by every sortable + filterable Roster table
// column header (previously seven hand-duplicated <th> blocks that drifted
// out of vertical alignment with each other, #715). The caller owns the
// `triggerRef` for this column and must pass the SAME ref object to
// `renderColumnFilterPanel` for that column -- the panel treats a mousedown
// on that ref's element as "inside" rather than an outside click that should
// close it, so two different ref objects would break close-on-outside-click.
//
// `align: 'right'` is only used by the Followers column. Both className
// branches below are complete literal strings -- Tailwind v4 scans source
// text for whole class-name tokens, so building either one via string
// interpolation would generate no CSS and silently drop the alignment.
export default function FilterableHeader({
  sortKey,
  label,
  align = 'left',
  sortConfig,
  columnFilters,
  openFilterKey,
  onSort,
  onToggleFilter,
  triggerRef,
  renderColumnFilterPanel,
  stickyClassName = '',
}) {
  // Sticky columns (Name, pinned to the left edge of the roster's horizontal
  // scroll container -- #772) need `position: sticky` plus an opaque
  // background and z-index instead of the default `relative` (which exists
  // only to anchor the filter dropdown panel below). `sticky` is itself a
  // valid containing block for the panel's `absolute` positioning, so this
  // is a full replacement, never both at once -- stacking two `position`
  // utilities on one element leaves the winner to Tailwind's internal class
  // ordering rather than source order, and if `relative` won the column
  // would silently stop sticking.
  const positionClassName = stickyClassName || 'relative'
  const thClassName =
    align === 'right'
      ? `${positionClassName} px-3 py-3 text-right text-white font-semibold whitespace-nowrap align-middle`
      : `${positionClassName} px-3 py-3 text-left text-white font-semibold whitespace-nowrap align-middle`
  const wrapperClassName = align === 'right' ? 'flex items-center justify-end gap-1' : 'flex items-center gap-1'

  return (
    <th aria-sort={ariaSortFor(sortConfig, sortKey)} className={thClassName}>
      <div className={wrapperClassName}>
        <button type="button" onClick={() => onSort(sortKey)} className="cursor-pointer hover:text-accent-400">
          {label} <SortIcon col={sortKey} sortConfig={sortConfig} />
        </button>
        <FilterFunnel
          label={label}
          active={isColumnFiltered(columnFilters, sortKey)}
          open={openFilterKey === sortKey}
          panelId={`roster-filter-panel-${sortKey}`}
          triggerRef={triggerRef}
          onClick={() => onToggleFilter(sortKey)}
        />
      </div>
      {renderColumnFilterPanel(sortKey, triggerRef)}
    </th>
  )
}

FilterableHeader.propTypes = {
  sortKey: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  align: PropTypes.oneOf(['left', 'right']),
  sortConfig: PropTypes.shape({
    key: PropTypes.string,
    direction: PropTypes.string,
  }).isRequired,
  columnFilters: PropTypes.object.isRequired,
  openFilterKey: PropTypes.string,
  onSort: PropTypes.func.isRequired,
  onToggleFilter: PropTypes.func.isRequired,
  triggerRef: PropTypes.oneOfType([PropTypes.func, PropTypes.shape({ current: PropTypes.any })]),
  renderColumnFilterPanel: PropTypes.func.isRequired,
  stickyClassName: PropTypes.string,
}
