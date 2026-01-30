/**
 * EventStatusBadge - Visual indicator for event status
 *
 * Shows a color-coded badge indicating the event's current status.
 *
 * @param {string} status - Event status ('draft', 'published', 'archived')
 * @param {string} className - Optional additional CSS classes
 */
export default function EventStatusBadge({ status, className = '' }) {
  // Default to draft if status is not recognized or missing
  const normalizedStatus = status || 'draft'

  // Define color classes for each status
  const statusColors = {
    draft: 'bg-yellow-100 text-yellow-800',
    published: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-800',
  }

  // Get the appropriate color classes, default to draft styling
  const colorClass = statusColors[normalizedStatus] || statusColors.draft

  // Capitalize first letter for display
  const displayText = normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1)

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorClass} ${className}`}
    >
      {displayText}
    </span>
  )
}
