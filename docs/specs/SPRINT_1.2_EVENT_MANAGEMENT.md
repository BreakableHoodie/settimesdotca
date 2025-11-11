# Sprint 1.2: Event Management Complete

**Duration**: 2 days
**Dependencies**: Sprint 1.1 (RBAC)
**Output**: Full event lifecycle with context switching

---

## Overview

Complete event creation, editing, publishing, archival workflows. Add context switching UI so users always know which event they're managing.

## Database Schema (Already Exists)

```sql
-- events table exists, add status field
ALTER TABLE events ADD COLUMN status TEXT DEFAULT 'draft';
-- Values: 'draft', 'published', 'archived'

ALTER TABLE events ADD COLUMN archived_at TEXT;
```

---

## API Endpoints

### 1. Create Event
**Endpoint**: `POST /api/admin/events`
**Permission**: Editor+
**File**: `functions/api/admin/events.js`

```javascript
// Request:
{
  "name": "Long Weekend Band Crawl Vol. 6",
  "slug": "vol-6",
  "date": "2025-12-15",
  "status": "draft" // optional, defaults to draft
}

// Response:
{
  "id": 1,
  "name": "Long Weekend Band Crawl Vol. 6",
  "slug": "vol-6",
  "date": "2025-12-15",
  "status": "draft",
  "createdAt": "2025-11-11T...",
  "createdByUserId": 1
}

// Validation:
// - Name required, min 3 chars
// - Slug required, lowercase, hyphens only, unique
// - Date required, YYYY-MM-DD format, not in past
// - Status must be: draft, published, archived
```

### 2. Update Event
**Endpoint**: `PATCH /api/admin/events/:id`
**Permission**: Editor+
**File**: `functions/api/admin/events/[id].js`

```javascript
// Request (all fields optional):
{
  "name": "Updated Name",
  "date": "2025-12-20",
  "status": "published"
}

// Response: Updated event object

// Business Rules:
// - Cannot change slug (breaks URLs)
// - Can unpublish (published → draft)
// - Can archive (any status → archived)
// - Cannot unarchive via API (manual DB operation)
```

### 3. Publish/Unpublish Event
**Endpoint**: `POST /api/admin/events/:id/publish`
**Permission**: Editor+
**File**: `functions/api/admin/events/[id]/publish.js`

```javascript
// Request:
{
  "publish": true // or false to unpublish
}

// Response:
{
  "id": 1,
  "status": "published"
}

// Business Rules:
// - Sets status to 'published' or 'draft'
// - Audit log action
// - Check event has at least 1 band before publishing
```

### 4. Archive Event
**Endpoint**: `POST /api/admin/events/:id/archive`
**Permission**: Admin only
**File**: `functions/api/admin/events/[id]/archive.js`

```javascript
// Request: None

// Response:
{
  "id": 1,
  "status": "archived",
  "archivedAt": "2025-11-11T..."
}

// Business Rules:
// - Sets status to 'archived'
// - Sets archived_at timestamp
// - Hides from admin list by default
// - Still accessible via /events/:id
```

### 5. Delete Event
**Endpoint**: `DELETE /api/admin/events/:id`
**Permission**: Admin only
**File**: `functions/api/admin/events/[id].js`

```javascript
// Request: None

// Response:
{
  "success": true,
  "bandsOrphaned": 12 // count of bands now without event
}

// Business Rules:
// - Cascade: bands.event_id set to NULL (orphaned)
// - Confirm dialog required in UI
// - Audit log with event details
```

---

## Frontend Components

### 1. Event Selector (Context Switcher)

**File**: `frontend/src/admin/EventSelector.jsx`

```jsx
// Props: None
// State:
// - currentEventId: number (from context or localStorage)
// - events: Array of events
// - loading: boolean

// Features:
// - Dropdown in admin header (always visible)
// - Shows current event name
// - List all non-archived events
// - "Create New Event" option at bottom
// - Clicking event switches context (updates localStorage + context)
// - Badge showing event status (draft/published/archived)

// UI:
// - Position: Top-left of admin header
// - Style: Dropdown with event list
// - Highlight current event
// - Show event date next to name

// Context Provider:
// - Create EventContext.jsx
// - Provider wraps AdminApp
// - Provides: currentEventId, setCurrentEventId, currentEvent

// API calls:
// - GET /api/admin/events (on mount)
```

### 2. Context Banner

**File**: `frontend/src/admin/ContextBanner.jsx`

```jsx
// Props:
// - currentEvent: Event object

// Features:
// - Fixed banner below header
// - Shows: "Managing: [Event Name] ([Date]) - [Status Badge]"
// - Background color based on status:
//   - draft: yellow-100
//   - published: green-100
//   - archived: gray-100
// - Dismissible (hide with X button, remember in localStorage)

// UI:
// - Full width banner
// - Padding: py-2 px-4
// - Text center
// - Close button on right
```

### 3. Event Form Modal

**File**: `frontend/src/admin/EventFormModal.jsx`

```jsx
// Props:
// - isOpen: boolean
// - onClose: function
// - event: Event object (null for create)
// - onSave: function(eventData)

// Form fields:
// - Event Name (text input, required)
// - Slug (text input, required, auto-generated from name)
// - Date (date picker, required)
// - Status (select: draft, published, archived)

// Features:
// - Auto-generate slug from name (lowercase, replace spaces with hyphens)
// - Validate slug (no spaces, special chars)
// - Date picker with min date = today
// - If editing, show created date and creator
// - Save button disabled until valid

// Validation:
// - Name min 3 chars
// - Slug lowercase, hyphens only
// - Date not in past

// API calls:
// - POST /api/admin/events (create)
// - PATCH /api/admin/events/:id (update)
```

### 4. Events Tab

**File**: `frontend/src/admin/EventsTab.jsx`

```jsx
// Props: None
// State:
// - events: Array
// - showArchived: boolean (toggle)
// - loading: boolean
// - showModal: boolean
// - editingEvent: Event object or null

// Features:
// - Table with columns: Name | Date | Status | Actions
// - "Create Event" button (opens modal)
// - "Show Archived" checkbox toggle
// - Status badges (color-coded)
// - Actions dropdown:
//   - Edit (opens modal)
//   - Publish/Unpublish (inline action)
//   - Archive (admin only, confirm dialog)
//   - Delete (admin only, confirm dialog)
// - Sort by date (newest first)
// - Empty state if no events

// UI:
// - Responsive table (mobile: stack rows)
// - Action dropdown on hover/click
// - Confirm dialogs for destructive actions

// API calls:
// - GET /api/admin/events?archived=true (if showArchived)
// - GET /api/admin/events (default)
// - POST /api/admin/events/:id/publish
// - POST /api/admin/events/:id/archive
// - DELETE /api/admin/events/:id
```

### 5. Event Status Badge

**File**: `frontend/src/admin/EventStatusBadge.jsx`

```jsx
// Props:
// - status: string ('draft', 'published', 'archived')

// Styling:
// - draft: bg-yellow-100 text-yellow-800
// - published: bg-green-100 text-green-800
// - archived: bg-gray-100 text-gray-800
// - Pill shape with padding
```

---

## Context Management

### File: `frontend/src/contexts/EventContext.jsx`

```jsx
import React, { createContext, useContext, useState, useEffect } from 'react';

const EventContext = createContext();

export function EventProvider({ children }) {
  const [currentEventId, setCurrentEventId] = useState(() => {
    return localStorage.getItem('currentEventId') || null;
  });

  const [currentEvent, setCurrentEvent] = useState(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    // Fetch events list
    fetch('/api/admin/events')
      .then(res => res.json())
      .then(data => {
        setEvents(data.events);
        if (currentEventId) {
          const event = data.events.find(e => e.id == currentEventId);
          setCurrentEvent(event);
        }
      });
  }, [currentEventId]);

  const switchEvent = (eventId) => {
    setCurrentEventId(eventId);
    localStorage.setItem('currentEventId', eventId);
  };

  return (
    <EventContext.Provider value={{
      currentEventId,
      currentEvent,
      events,
      switchEvent
    }}>
      {children}
    </EventContext.Provider>
  );
}

export function useEventContext() {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEventContext must be used within EventProvider');
  }
  return context;
}
```

---

## Testing Specifications

### Unit Tests

**File**: `tests/functions/api/admin/events.test.js`

```javascript
describe('Event Management API', () => {
  describe('POST /api/admin/events', () => {
    it('should create event with valid data', async () => {});
    it('should reject duplicate slug', async () => {});
    it('should reject past date', async () => {});
    it('should default status to draft', async () => {});
  });

  describe('PATCH /api/admin/events/:id', () => {
    it('should update event name', async () => {});
    it('should not allow slug change', async () => {});
    it('should update status', async () => {});
  });

  describe('POST /api/admin/events/:id/publish', () => {
    it('should publish draft event', async () => {});
    it('should unpublish published event', async () => {});
    it('should require at least 1 band', async () => {});
  });

  describe('POST /api/admin/events/:id/archive', () => {
    it('should archive event (admin only)', async () => {});
    it('should set archived_at timestamp', async () => {});
  });

  describe('DELETE /api/admin/events/:id', () => {
    it('should delete event and orphan bands', async () => {});
    it('should require admin role', async () => {});
  });
});
```

### Integration Tests

**File**: `tests/integration/event-lifecycle.test.js`

```javascript
describe('Event Lifecycle', () => {
  it('should create, publish, and archive event', async () => {
    // Create draft
    // Add bands
    // Publish
    // Verify public visibility
    // Archive
    // Verify hidden from public
  });

  it('should prevent publishing event with no bands', async () => {});

  it('should maintain band references when event deleted', async () => {});
});
```

---

## Acceptance Criteria

### Backend
- [ ] Create event endpoint working
- [ ] Update event endpoint working
- [ ] Publish/unpublish toggle working
- [ ] Archive event working (admin only)
- [ ] Delete event orphans bands correctly
- [ ] Cannot publish event with 0 bands
- [ ] Audit logging on all actions

### Frontend
- [ ] EventContext provider wraps AdminApp
- [ ] Event selector dropdown in header
- [ ] Context banner shows current event
- [ ] Events tab with table
- [ ] Create/edit event modal with validation
- [ ] Publish/unpublish inline action
- [ ] Archive action (admin only, confirm dialog)
- [ ] Delete action (admin only, confirm dialog)
- [ ] Event status badges color-coded
- [ ] Show archived events toggle

### UX
- [ ] Always know which event you're managing
- [ ] Switching events updates all tabs
- [ ] Breadcrumbs show: Events > [Event Name] > [Tab]
- [ ] Confirm dialogs for destructive actions
- [ ] Success/error toasts on actions
- [ ] Cannot create duplicate slugs

### Testing
- [ ] Unit tests for all endpoints (80%+ coverage)
- [ ] Integration tests for lifecycle
- [ ] Manual test: Create event flow
- [ ] Manual test: Publish event with/without bands
- [ ] Manual test: Context switching
- [ ] Manual test: Archive and show archived

---

## Implementation Order

1. **Database** (15 min)
   - Add status and archived_at columns
   - Test migration

2. **API Endpoints** (3 hours)
   - Create event
   - Update event
   - Publish/unpublish
   - Archive
   - Delete (update to orphan bands)

3. **Context Management** (1 hour)
   - EventContext.jsx
   - EventProvider wrap AdminApp
   - useEventContext hook

4. **Frontend Components** (5 hours)
   - EventSelector dropdown
   - ContextBanner
   - EventsTab (table + actions)
   - EventFormModal
   - EventStatusBadge

5. **Integration** (1 hour)
   - Wire up all components
   - Test context switching
   - Test all CRUD operations

6. **Testing** (2 hours)
   - Unit tests
   - Integration tests
   - Manual testing

**Total Estimate**: 12-14 hours (1.5-2 days)

---

## Handoff Notes for Cursor/Copilot

### Start Here:
1. Run migration to add status/archived_at columns
2. Update `functions/api/admin/events.js` with new endpoints
3. Create `frontend/src/contexts/EventContext.jsx`
4. Update `frontend/src/admin/AdminApp.jsx` to wrap with EventProvider
5. Create `frontend/src/admin/EventSelector.jsx` component
6. Create `frontend/src/admin/EventsTab.jsx` component

### Key Files to Create:
- `functions/api/admin/events/[id]/publish.js`
- `functions/api/admin/events/[id]/archive.js`
- `frontend/src/contexts/EventContext.jsx`
- `frontend/src/admin/EventSelector.jsx`
- `frontend/src/admin/ContextBanner.jsx`
- `frontend/src/admin/EventFormModal.jsx`
- `frontend/src/admin/EventStatusBadge.jsx`
- `frontend/src/admin/EventsTab.jsx`

### Key Files to Update:
- `functions/api/admin/events.js` (add create endpoint)
- `functions/api/admin/events/[id].js` (update/delete)
- `frontend/src/admin/AdminApp.jsx` (wrap with EventProvider, add EventSelector)
- `database/schema-v2.sql` (add status and archived_at)

### UI/UX Notes:
- Event selector always visible in header
- Context banner can be dismissed but persists preference
- All admin tabs filtered by current event
- Status badges use Tailwind color classes
- Confirm dialogs for publish (if no bands), archive, delete
