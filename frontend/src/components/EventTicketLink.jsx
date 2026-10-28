import { Ticket } from 'lucide-react'
import { trackTicketClick } from '../utils/metrics'
import { safeExternalHref } from '../utils/urlSafety'

/**
 * EventTicketLink - the event page's ticket link (#1384).
 *
 * The event page is where fans are on show night (LWBC18: 116 of 194 views on
 * show day), and until #1384 it had no ticket link, so the edition's ticket
 * clicks read 0 for want of anything to click. Counted through the same
 * `ticket_click` metric as the homepage card.
 *
 * Renders nothing for a concluded event (`concluded`), or when the URL does
 * not survive safeExternalHref.
 *
 * Outlined, not tinted: the text sits on the page ground, which posterTheme.js
 * checks accent-400 against for every poster palette (along with the card
 * surfaces and the hover tints, since #1396). On a 20% accent tint it
 * measured 3.9-4.4:1 on light palettes (#1384 review).
 */
function EventTicketLink({ eventId, ticketUrl, eventName, concluded = false }) {
  if (concluded) return null
  const href = safeExternalHref(ticketUrl)
  if (href === '#') return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={eventName ? `Get tickets for ${eventName}` : 'Get tickets'}
      onClick={() => trackTicketClick(eventId)}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md border border-accent-400/60 px-3 text-sm font-semibold text-accent-400 transition-colors hover:border-accent-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
    >
      <Ticket size={16} aria-hidden="true" />
      Tickets
    </a>
  )
}

export default EventTicketLink
