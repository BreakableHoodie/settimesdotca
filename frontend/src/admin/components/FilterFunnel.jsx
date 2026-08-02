import PropTypes from 'prop-types'
import { ListFilter } from 'lucide-react'

// Both class strings are complete literals -- Tailwind v4 scans source text
// for whole class-name tokens, so building either state via a template
// literal with an interpolated segment (e.g. a colour variable) would
// generate no CSS at all and silently drop the accent state.
const INACTIVE_CLASS =
  'inline-flex items-center justify-center h-6 w-6 rounded cursor-pointer text-white/70 hover:text-white hover:bg-white/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-500'

const ACTIVE_CLASS =
  'inline-flex items-center justify-center h-6 w-6 rounded cursor-pointer text-accent-400 bg-accent-500/20 hover:bg-accent-500/30 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-500'

// Shared trigger for every column's filter dropdown. Deliberately just the
// button -- the panel (ColumnFilter / LinksColumnFilter) is a separate
// component rendered by the caller, so open/close state and the checklist
// content both live one level up. See those components' docblocks for how
// `triggerRef` is used to keep a click on THIS button from being treated as
// an "outside click" by the panel it controls.
export default function FilterFunnel({ label, active = false, open = false, panelId, onClick, triggerRef }) {
  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={`Filter by ${label}`}
      className={active ? ACTIVE_CLASS : INACTIVE_CLASS}
    >
      <ListFilter size={16} aria-hidden="true" />
    </button>
  )
}

FilterFunnel.propTypes = {
  label: PropTypes.string.isRequired,
  active: PropTypes.bool,
  open: PropTypes.bool,
  panelId: PropTypes.string,
  onClick: PropTypes.func.isRequired,
  triggerRef: PropTypes.oneOfType([PropTypes.func, PropTypes.shape({ current: PropTypes.any })]),
}
