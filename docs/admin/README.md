# Admin Panel Components

Complete admin panel UI for managing the Long Weekend Band Crawl events, venues, and bands.

## Components Overview

### 1. AdminLogin.jsx
Entry point for admin authentication. Handles login, password recovery, and session management.

**Features:**
- Password-based authentication
- Lockout protection after failed attempts
- Master password recovery system
- Session storage for authenticated state

### 2. AdminPanel.jsx
Main container for the admin interface with tab navigation and event selection.

**Features:**
- Tab navigation (Events, Venues, Bands)
- Event selector dropdown
- Toast notification system
- Logout functionality
- Responsive mobile-first design

**Props:**
- `onLogout`: Function - Callback when user logs out

### 3. EventsTab.jsx
Manage events including creation, duplication, and publishing.

**Features:**
- List all events with details (name, date, slug, status, band count)
- Create new events with validation
- Duplicate existing events
- Toggle publish/unpublish status
- Auto-generate URL-friendly slugs
- Mobile-responsive table/cards

**Props:**
- `events`: Array - List of all events
- `onEventsChange`: Function - Callback to reload events after changes
- `showToast`: Function - Display toast notifications

### 4. VenuesTab.jsx
Manage venue information across all events.

**Features:**
- List all venues with name, address, and band count
- Add new venues
- Edit existing venues
- Delete venues (disabled if bands are assigned)
- Mobile-responsive design

**Props:**
- `showToast`: Function - Display toast notifications

### 5. BandsTab.jsx
Manage bands for a specific event.

**Features:**
- Event-specific band management
- Add bands with name, venue, times, and optional URL
- Edit and delete bands
- Time conflict detection at venue level
- Visual warnings for scheduling conflicts
- Sorted by start time
- Duration calculation
- Mobile-responsive design

**Props:**
- `selectedEventId`: Number - Currently selected event ID
- `selectedEvent`: Object - Currently selected event data
- `showToast`: Function - Display toast notifications

## Integration Example

```jsx
import { useState } from 'react'
import AdminLogin from './admin/AdminLogin'
import AdminPanel from './admin/AdminPanel'

function AdminApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const handleLoginSuccess = () => {
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
  }

  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />
  }

  return <AdminPanel onLogout={handleLogout} />
}

export default AdminApp
```

## Routing Integration

If using React Router:

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import AdminApp from './AdminApp'

function Root() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  )
}
```

## Color Scheme

All components use the established band crawl color palette:

- **band-navy** (#1a1845) - Primary background
- **band-purple** (#2d2554) - Card/panel backgrounds
- **band-orange** (#f5a962) - Primary accents, CTAs
- **band-neon** (#c0ff00) - Reserved for special highlights

## Toast Notifications

The toast system provides user feedback for all operations:

```javascript
showToast('Operation successful!', 'success')
showToast('Operation failed: error message', 'error')
```

Toasts auto-dismiss after 5 seconds and appear in the bottom-right corner.

## API Integration

All components use the `adminApi.js` utilities for API communication:

- `authApi` - Authentication operations
- `eventsApi` - Event CRUD operations
- `venuesApi` - Venue CRUD operations
- `bandsApi` - Band CRUD operations

All API calls include the admin password from `sessionStorage` in request headers.

## Validation & Edge Cases

### Events
- Slug validation (lowercase, hyphens only)
- Auto-slug generation from event name
- Date validation

### Venues
- Cannot delete venues with assigned bands
- Tooltip explanations for disabled actions

### Bands
- Time conflict detection at venue level
- Visual warnings for overlapping times
- Required venue selection
- URL validation for optional links
- Duration calculation display

## Mobile Responsiveness

All components are mobile-first with responsive breakpoints:

- **Mobile (<768px)**: Card-based layouts, stacked forms
- **Desktop (≥768px)**: Table layouts, multi-column forms

## Accessibility

- Semantic HTML structure
- Keyboard navigation support
- Focus states on interactive elements
- Loading states with clear messaging
- Error states with descriptive messages
- Color contrast meets WCAG standards

## Testing Checklist

- [ ] Login with correct/incorrect passwords
- [ ] Create new event with auto-slug generation
- [ ] Duplicate event with custom data
- [ ] Publish/unpublish events
- [ ] Add/edit/delete venues
- [ ] Verify venue deletion blocked when bands exist
- [ ] Add bands with time conflict detection
- [ ] Edit bands and verify conflict updates
- [ ] Delete bands
- [ ] Test all operations on mobile viewport
- [ ] Verify toast notifications for all operations
- [ ] Test logout functionality
- [ ] Verify session persistence across page refreshes
