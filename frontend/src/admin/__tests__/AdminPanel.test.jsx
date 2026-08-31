import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPanel from '../AdminPanel'
import { eventsApi } from '../../utils/adminApi'

vi.mock('../../utils/adminApi', () => ({
  eventsApi: { getAll: vi.fn() },
}))

vi.mock('../EventsTab', () => ({ default: ({ events }) => <div>Events tab ({events.length})</div> }))
vi.mock('../VenuesTab', () => ({ default: () => <div>Venues tab</div> }))
vi.mock('../RosterTab', () => ({ default: () => <div>Roster tab</div> }))
vi.mock('../LineupTab', () => ({ default: () => <div>Lineup tab</div> }))
vi.mock('../UserManagement', () => ({ default: () => <div>Users tab</div> }))
vi.mock('../UserSettings', () => ({ default: () => <div>Settings tab</div> }))
vi.mock('../PlatformSettings', () => ({ default: () => <div>Platform tab</div> }))
vi.mock('../EventWizard', () => ({ default: () => <div>Event wizard</div> }))
vi.mock('../components/BottomNav', () => ({
  default: ({ onTabChange }) => <button onClick={() => onTabChange('venues')}>Mobile venues</button>,
}))
vi.mock('../components/ContextBanner', () => ({ default: () => null }))
vi.mock('../components/Breadcrumbs', () => ({ default: () => null }))
vi.mock('../components/MfaSettingsModal', () => ({ default: () => null }))
vi.mock('../../components/ui', () => ({
  Alert: ({ children }) => <div>{children}</div>,
  Button: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
  ConfirmDialog: ({ isOpen, onConfirm, onCancel, title, confirmText, cancelText }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <button onClick={onConfirm}>{confirmText}</button>
        <button onClick={onCancel}>{cancelText}</button>
      </div>
    ) : null,
  Loading: ({ text }) => <div>{text}</div>,
  Modal: ({ isOpen, title, children }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}))

const events = [
  { id: 7, name: 'Published Event', status: 'published' },
  { id: 8, name: 'Archived Event', status: 'archived' },
  { id: 9, name: 'Draft Event', status: 'draft' },
  { id: 10, name: 'Legacy Event', status: 'unknown' },
]

function renderPanel(role = 'admin', onLogout = vi.fn()) {
  return render(<AdminPanel currentUser={{ role }} onLogout={onLogout} />)
}

beforeEach(() => {
  eventsApi.getAll.mockResolvedValue({ events })
  sessionStorage.clear()
})

afterEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe('AdminPanel', () => {
  it('loads events and labels each lifecycle state in the event selector', async () => {
    renderPanel()

    const selector = await screen.findByLabelText('Filter:')
    expect(within(selector).getByRole('option', { name: 'Published Event (Published)' })).toBeInTheDocument()
    expect(within(selector).getByRole('option', { name: 'Archived Event (Archived)' })).toBeInTheDocument()
    expect(within(selector).getByRole('option', { name: 'Draft Event (Draft)' })).toBeInTheDocument()
    expect(within(selector).getByRole('option', { name: 'Legacy Event (Draft)' })).toBeInTheDocument()
    expect(screen.getByText('Events tab (4)')).toBeInTheDocument()
  })

  it('moves to lineup when an event is selected and clears the filter back to events', async () => {
    renderPanel()
    const selector = await screen.findByLabelText('Filter:')

    fireEvent.change(selector, { target: { value: '7' } })
    expect(await screen.findByText('Lineup tab')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear Filter' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filter' }))
    expect(await screen.findByText('Events tab (4)')).toBeInTheDocument()
  })

  it('hides admin-only tabs and creation controls for viewers', async () => {
    renderPanel('viewer')
    await screen.findByText('Events tab (4)')

    expect(screen.queryByRole('tab', { name: 'Users' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Platform' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Event' })).not.toBeInTheDocument()
  })

  it('switches tabs from the desktop navigation and mobile navigation', async () => {
    renderPanel()
    await screen.findByText('Events tab (4)')

    fireEvent.click(screen.getByRole('tab', { name: 'Venues' }))
    expect(screen.getByText('Venues tab')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Roster' }))
    expect(screen.getByText('Roster tab')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mobile venues' }))
    expect(screen.getByText('Venues tab')).toBeInTheDocument()
  })

  it('confirms logout and clears persisted admin context', async () => {
    const onLogout = vi.fn()
    sessionStorage.setItem('adminActiveTab', 'roster')
    sessionStorage.setItem('adminSelectedEventId', '7')
    sessionStorage.setItem('adminEventWizardDraft', JSON.stringify({ currentStep: 2, eventData: { name: 'Draft' } }))
    renderPanel('admin', onLogout)
    await screen.findByText('Roster tab')
    expect(screen.getByRole('dialog', { name: 'Create Event' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirm Logout' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Logout' }))

    expect(onLogout).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('adminActiveTab')).toBeNull()
    expect(sessionStorage.getItem('adminSelectedEventId')).toBeNull()
    expect(sessionStorage.getItem('adminEventWizardDraft')).toBeNull()
  })

  it('logs out when loading events reports an expired session', async () => {
    const onLogout = vi.fn()
    eventsApi.getAll.mockRejectedValueOnce({ status: 401, message: 'expired' })
    renderPanel('admin', onLogout)

    await waitFor(() => expect(onLogout).toHaveBeenCalledOnce())
  })

  it('shows a toast for a non-authentication loading failure', async () => {
    eventsApi.getAll.mockRejectedValueOnce(new Error('network down'))
    renderPanel()

    expect(await screen.findByText('Failed to load events: network down')).toBeInTheDocument()
  })

  it('routes custom filter events to the matching tab and session storage', async () => {
    renderPanel()
    await screen.findByText('Events tab (4)')

    window.dispatchEvent(new CustomEvent('filterVenue', { detail: { venueId: 42 } }))
    expect(await screen.findByText('Venues tab')).toBeInTheDocument()
    expect(sessionStorage.getItem('filterVenueId')).toBe('42')

    window.dispatchEvent(new CustomEvent('filterBand', { detail: { bandName: 'Alpha Wolves' } }))
    expect(await screen.findByText('Roster tab')).toBeInTheDocument()
    expect(sessionStorage.getItem('filterBandName')).toBe('Alpha Wolves')
  })
})
