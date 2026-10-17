import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPanel from '../AdminPanel'
import { eventsApi } from '../../utils/adminApi'

const authSubscribers = []
vi.mock('../../utils/adminApi', () => ({
  eventsApi: { getAll: vi.fn() },
  subscribeAdminAuthState: vi.fn(subscriber => {
    authSubscribers.push(subscriber)
    return () => {}
  }),
}))

vi.mock('../EventsTab', () => ({
  default: ({ events, loadError, onEventsChange }) => (
    <div>
      Events tab ({events.length}){loadError && <span>Events load error</span>}
      <button onClick={onEventsChange}>Retry events</button>
    </div>
  ),
}))
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
vi.mock('../components/MfaSettingsModal', () => ({
  default: ({ isOpen, required, onLogout }) =>
    isOpen ? (
      <div>
        {required ? 'MFA enrolment required' : 'MFA settings'}
        {required && onLogout && (
          <button type="button" onClick={onLogout}>
            Log out of enrolment
          </button>
        )}
      </div>
    ) : null,
}))
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
    expect(await screen.findByText('Events tab (4)')).toBeInTheDocument()
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

  // Write controls follow explicit roles: an unknown role gets none, matching
  // the server's fail-closed checkPermission (it was "anything but viewer").
  it('gives an unknown role no write controls', async () => {
    renderPanel('superuser')
    await screen.findByText('Events tab (4)')

    expect(screen.queryByRole('tab', { name: 'Users' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Event' })).not.toBeInTheDocument()
  })

  it('switches tabs from the desktop navigation and mobile navigation', async () => {
    renderPanel()
    await screen.findByText('Events tab (4)')

    fireEvent.click(screen.getByRole('tab', { name: 'Venues' }))
    expect(await screen.findByText('Venues tab')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Roster' }))
    expect(await screen.findByText('Roster tab')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mobile venues' }))
    expect(await screen.findByText('Venues tab')).toBeInTheDocument()
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

  // #1323: the toast fades after 5s and events stays [], which EventsTab used
  // to render as "No events yet". The panel must hand the tab a durable flag.
  it('flags the events tab as failed (not empty) when loading events fails, and clears it on retry', async () => {
    eventsApi.getAll.mockReset()
    eventsApi.getAll.mockRejectedValueOnce(new Error('boom'))
    eventsApi.getAll.mockResolvedValueOnce({ events })
    renderPanel()

    expect(await screen.findByText('Events load error')).toBeInTheDocument()
    expect(screen.getByText(/Events tab \(0\)/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry events' }))

    await waitFor(() => expect(eventsApi.getAll).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/Events tab \(4\)/)).toBeInTheDocument()
    expect(screen.queryByText('Events load error')).toBeNull()
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

// #1253: admins and editors must enrol in 2FA before using the admin area.
describe('AdminPanel 2FA enrolment', () => {
  it('logging out from required enrolment clears persisted admin context', async () => {
    const onLogout = vi.fn()
    sessionStorage.setItem('adminActiveTab', 'roster')
    sessionStorage.setItem('adminSelectedEventId', '7')
    sessionStorage.setItem('adminEventWizardDraft', JSON.stringify({ currentStep: 2, eventData: { name: 'Draft' } }))
    render(
      <AdminPanel currentUser={{ role: 'editor', mfaEnrolmentRequired: true, mfaEnabled: false }} onLogout={onLogout} />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Log out of enrolment' }))

    expect(onLogout).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('adminActiveTab')).toBeNull()
    expect(sessionStorage.getItem('adminSelectedEventId')).toBeNull()
    expect(sessionStorage.getItem('adminEventWizardDraft')).toBeNull()
  })

  it('opens the required enrolment modal for an admin without 2FA', async () => {
    render(
      <AdminPanel currentUser={{ role: 'admin', mfaEnrolmentRequired: true, mfaEnabled: false }} onLogout={vi.fn()} />
    )
    expect(await screen.findByText('MFA enrolment required')).toBeInTheDocument()
  })

  it('does not open it for an enrolled admin or a viewer without 2FA', async () => {
    render(
      <AdminPanel currentUser={{ role: 'admin', mfaEnrolmentRequired: true, mfaEnabled: true }} onLogout={vi.fn()} />
    )
    render(
      <AdminPanel currentUser={{ role: 'viewer', mfaEnrolmentRequired: false, mfaEnabled: false }} onLogout={vi.fn()} />
    )
    await screen.findAllByLabelText('Filter:')
    expect(screen.queryByText('MFA enrolment required')).not.toBeInTheDocument()
  })

  it('opens it when the server answers MFA_SETUP_REQUIRED', async () => {
    authSubscribers.length = 0
    render(<AdminPanel currentUser={{ role: 'editor' }} onLogout={vi.fn()} />)
    expect(screen.queryByText('MFA enrolment required')).not.toBeInTheDocument()
    act(() => authSubscribers.forEach(subscriber => subscriber.onMfaSetupRequired?.()))
    expect(await screen.findByText('MFA enrolment required')).toBeInTheDocument()
  })

  // #1320: every admin route answers 403 until enrolment, so loading the panel
  // behind the modal only raised a toast repeating what the modal says.
  it('loads no panel data and mounts no tab while the session requires enrolment', async () => {
    render(
      <AdminPanel currentUser={{ role: 'editor', mfaEnrolmentRequired: true, mfaEnabled: false }} onLogout={vi.fn()} />
    )
    expect(await screen.findByText('MFA enrolment required')).toBeInTheDocument()
    expect(eventsApi.getAll).not.toHaveBeenCalled()
    expect(screen.queryByText(/Events tab/)).toBeNull()
    expect(screen.queryByText('Loading admin panel...')).toBeNull()
  })

  it('raises no error toast when the server is the one that reports enrolment is required', async () => {
    authSubscribers.length = 0
    eventsApi.getAll.mockImplementation(async () => {
      // The real client notifies the gate, then throws to the caller.
      authSubscribers.forEach(subscriber => subscriber.onMfaSetupRequired?.())
      throw Object.assign(new Error('Set up two-factor authentication to continue.'), { status: 403 })
    })
    render(<AdminPanel currentUser={{ role: 'editor' }} onLogout={vi.fn()} />)

    expect(await screen.findByText('MFA enrolment required')).toBeInTheDocument()
    await waitFor(() => expect(eventsApi.getAll).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Failed to load events/)).toBeNull()
    expect(screen.queryByText(/Events tab/)).toBeNull()
  })

  it('hides already-loaded event data once the server reports enrolment is required', async () => {
    authSubscribers.length = 0
    render(<AdminPanel currentUser={{ role: 'editor' }} onLogout={vi.fn()} />)
    expect(await screen.findByRole('option', { name: 'Published Event (Published)' })).toBeInTheDocument()

    act(() => authSubscribers.forEach(subscriber => subscriber.onMfaSetupRequired?.()))

    expect(await screen.findByText('MFA enrolment required')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filter:')).toBeNull()
    expect(screen.queryByRole('option', { name: /Published Event/ })).toBeNull()
  })
})
