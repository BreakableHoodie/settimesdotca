# Sprint 1.2 Completion: EventsTab Integration & Testing

**Duration**: 4-6 hours
**Dependencies**: Sprint 1.2 core implementation (merged)
**Status**: Ready to implement

---

## Overview

Complete Sprint 1.2 by integrating new event management components into EventsTab and adding comprehensive tests.

**What's Done**:

- ✅ Database migration (status, archived_at)
- ✅ All 5 API endpoints (create, update, publish, archive, delete)
- ✅ EventContext with localStorage persistence
- ✅ EventSelector, EventFormModal, EventStatusBadge components
- ✅ AdminApp integration with EventProvider

**What's Missing**:

- ❌ EventsTab.jsx updates to use new components
- ❌ Unit tests for API endpoints
- ❌ Integration tests for event lifecycle

---

## Part 1: EventsTab Integration (2-3 hours)

### Current State Analysis

**File**: `frontend/src/admin/EventsTab.jsx`

The current EventsTab likely uses the old `is_published` boolean field and doesn't integrate with the new EventContext or components.

### Required Updates

#### 1. Use EventContext

```jsx
import { useEventContext } from "../contexts/EventContext";

export default function EventsTab() {
  const { refreshEvents } = useEventContext();
  // ... rest of component
}
```

#### 2. Add EventFormModal Integration

```jsx
import EventFormModal from './EventFormModal'

const [showModal, setShowModal] = useState(false)
const [editingEvent, setEditingEvent] = useState(null)

// Create event button
<button onClick={() => { setEditingEvent(null); setShowModal(true) }}>
  Create Event
</button>

// Modal
<EventFormModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  event={editingEvent}
  onSave={handleEventSaved}
/>
```

#### 3. Add "Show Archived" Toggle

```jsx
const [showArchived, setShowArchived] = useState(false)

// Toggle checkbox
<label>
  <input
    type="checkbox"
    checked={showArchived}
    onChange={(e) => setShowArchived(e.target.checked)}
  />
  Show Archived Events
</label>

// Fetch with archived filter
const url = `/api/admin/events${showArchived ? '?archived=true' : ''}`
```

#### 4. Update Event Table

Replace boolean `is_published` checks with `status` field:

```jsx
// OLD
{
  event.is_published ? "Published" : "Draft";
}

// NEW
<EventStatusBadge status={event.status} />;
```

#### 5. Add Action Dropdown

```jsx
<div className="relative">
  <button onClick={() => setOpenDropdown(event.id)}>⋮</button>
  {openDropdown === event.id && (
    <div className="dropdown-menu">
      <button onClick={() => handleEdit(event)}>Edit</button>
      <button onClick={() => handleTogglePublish(event)}>
        {event.status === "published" ? "Unpublish" : "Publish"}
      </button>
      {currentUser.role === "admin" && (
        <>
          <button onClick={() => handleArchive(event)}>Archive</button>
          <button onClick={() => handleDelete(event)}>Delete</button>
        </>
      )}
    </div>
  )}
</div>
```

#### 6. Implement Action Handlers

```jsx
const handleTogglePublish = async (event) => {
  const publish = event.status !== "published";

  try {
    const response = await fetch(`/api/admin/events/${event.id}/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ publish }),
    });

    if (response.ok) {
      refreshEvents();
      fetchEvents(); // Refresh local list
    } else {
      const data = await response.json();
      alert(data.message || "Failed to update event");
    }
  } catch (error) {
    console.error("Publish error:", error);
    alert("Failed to update event");
  }
};

const handleArchive = async (event) => {
  if (
    !confirm(
      `Archive "${event.name}"? It will be hidden from the default view.`,
    )
  ) {
    return;
  }

  try {
    const response = await fetch(`/api/admin/events/${event.id}/archive`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    if (response.ok) {
      refreshEvents();
      fetchEvents();
    }
  } catch (error) {
    console.error("Archive error:", error);
  }
};

const handleDelete = async (event) => {
  const bandCount = event.band_count || 0;
  const message =
    bandCount > 0
      ? `Delete "${event.name}"? This will orphan ${bandCount} band(s) (they won't be deleted but will need to be reassigned).`
      : `Delete "${event.name}"? This action cannot be undone.`;

  if (!confirm(message)) {
    return;
  }

  try {
    const response = await fetch(`/api/admin/events/${event.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    if (response.ok) {
      refreshEvents();
      fetchEvents();
      const data = await response.json();
      alert(data.message);
    }
  } catch (error) {
    console.error("Delete error:", error);
  }
};
```

#### 7. Update Table Columns

```jsx
// Table structure
<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Date</th>
      <th>Status</th>
      <th>Bands</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {events.map((event) => (
      <tr key={event.id}>
        <td>{event.name}</td>
        <td>{new Date(event.date).toLocaleDateString()}</td>
        <td>
          <EventStatusBadge status={event.status} />
        </td>
        <td>{event.band_count || 0}</td>
        <td>{/* Action dropdown */}</td>
      </tr>
    ))}
  </tbody>
</table>
```

### Success Criteria

- [ ] EventFormModal opens on "Create Event" button
- [ ] Can edit events by clicking edit action
- [ ] Publish/unpublish works with status badges updating
- [ ] Archive action hides event from default view (admin only)
- [ ] Delete action shows confirmation with band count
- [ ] "Show Archived" checkbox reveals archived events
- [ ] EventContext.refreshEvents() called after mutations
- [ ] Status badges show correct colors (draft=yellow, published=green, archived=gray)

---

## Part 2: Unit Tests (2 hours)

### File Structure

```
tests/
└── functions/
    └── api/
        └── admin/
            └── events/
                ├── __tests__/
                │   ├── create.test.js
                │   ├── update.test.js
                │   ├── publish.test.js
                │   ├── archive.test.js
                │   └── delete.test.js
                └── [id]/
                    └── __tests__/
                        ├── publish.test.js
                        └── archive.test.js
```

### Test: Create Event (POST /api/admin/events)

**File**: `tests/functions/api/admin/events/__tests__/create.test.js`

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("POST /api/admin/events", () => {
  let mockDB;
  let mockEnv;
  let mockRequest;

  beforeEach(() => {
    // Setup mocks
    mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn(),
          run: vi.fn(),
        }),
      }),
    };

    mockEnv = {
      DB: mockDB,
      JWT_SECRET: "test-secret",
    };
  });

  it("should create event with valid data", async () => {
    // Arrange: Mock authenticated editor user
    mockRequest = new Request("http://localhost/api/admin/events", {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
      body: JSON.stringify({
        name: "Test Event",
        slug: "test-event",
        date: "2025-12-31",
        status: "draft",
      }),
    });

    // Mock checkPermission to return editor user
    // Mock DB.prepare to return no existing event with slug
    // Mock DB.prepare to return created event

    // Act
    const response = await onRequestPost({
      request: mockRequest,
      env: mockEnv,
    });

    // Assert
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.event.name).toBe("Test Event");
    expect(data.event.status).toBe("draft");
  });

  it("should reject duplicate slug", async () => {
    // Mock existing event with same slug
    // Expect 409 Conflict
  });

  it("should reject past date", async () => {
    mockRequest = new Request("http://localhost/api/admin/events", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Event",
        slug: "test-event",
        date: "2020-01-01", // Past date
        status: "draft",
      }),
    });

    // Expect 400 Bad Request
  });

  it("should reject invalid status", async () => {
    // Test with status='invalid'
    // Expect 400 Bad Request
  });

  it("should default status to draft", async () => {
    // Create without status field
    // Expect status='draft'
  });

  it("should require editor role", async () => {
    // Mock viewer user
    // Expect 403 Forbidden
  });
});
```

### Test: Publish Event (POST /api/admin/events/:id/publish)

**File**: `tests/functions/api/admin/events/[id]/__tests__/publish.test.js`

```javascript
describe("POST /api/admin/events/:id/publish", () => {
  it("should publish draft event with bands", async () => {
    // Mock event with status='draft'
    // Mock band count > 0
    // Expect status updated to 'published'
  });

  it("should unpublish published event", async () => {
    // Mock event with status='published'
    // Expect status updated to 'draft'
  });

  it("should reject publishing event with 0 bands", async () => {
    // Mock band count = 0
    // Expect 400 Bad Request with message about adding bands
  });

  it("should require editor role", async () => {
    // Mock viewer user
    // Expect 403 Forbidden
  });
});
```

### Test: Archive Event (POST /api/admin/events/:id/archive)

**File**: `tests/functions/api/admin/events/[id]/__tests__/archive.test.js`

```javascript
describe("POST /api/admin/events/:id/archive", () => {
  it("should archive event (admin only)", async () => {
    // Mock admin user
    // Mock event with status='published'
    // Expect status='archived' and archived_at timestamp set
  });

  it("should set archived_at timestamp", async () => {
    // Verify archived_at is set to current timestamp
  });

  it("should reject if already archived", async () => {
    // Mock event with status='archived'
    // Expect 400 Bad Request
  });

  it("should require admin role", async () => {
    // Mock editor user
    // Expect 403 Forbidden
  });
});
```

### Test: Delete Event (DELETE /api/admin/events/:id)

**File**: `tests/functions/api/admin/events/__tests__/delete.test.js`

```javascript
describe("DELETE /api/admin/events/:id", () => {
  it("should delete event and orphan bands", async () => {
    // Mock event with 3 bands
    // Verify bands are not deleted (ON DELETE SET NULL)
    // Expect success message with band count
  });

  it("should require admin role", async () => {
    // Mock editor user
    // Expect 403 Forbidden
  });

  it("should return 404 for non-existent event", async () => {
    // Mock no event found
    // Expect 404 Not Found
  });
});
```

### Coverage Target

**Minimum**: 80% line coverage for all event endpoints
**Stretch**: 90%+ line coverage

Run tests:

```bash
npm test -- functions/api/admin/events
npm run test:coverage -- functions/api/admin/events
```

---

## Part 3: Integration Tests (1 hour)

### File: `tests/integration/event-lifecycle.test.js`

```javascript
import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("Event Lifecycle Integration", () => {
  let adminToken;
  let editorToken;
  let eventId;

  beforeAll(async () => {
    // Login as admin and editor to get tokens
    // Setup test database
  });

  afterAll(async () => {
    // Cleanup test database
  });

  it("should complete full event lifecycle", async () => {
    // 1. Create draft event (editor)
    const createResponse = await fetch("/api/admin/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${editorToken}` },
      body: JSON.stringify({
        name: "Integration Test Event",
        slug: "integration-test",
        date: "2025-12-31",
        status: "draft",
      }),
    });
    expect(createResponse.status).toBe(201);
    const { event } = await createResponse.json();
    eventId = event.id;

    // 2. Add a band to the event
    await fetch("/api/admin/bands", {
      method: "POST",
      body: JSON.stringify({
        event_id: eventId,
        name: "Test Band",
        venue_id: 1,
        start_time: "20:00",
        end_time: "21:00",
      }),
    });

    // 3. Publish event (editor)
    const publishResponse = await fetch(
      `/api/admin/events/${eventId}/publish`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${editorToken}` },
        body: JSON.stringify({ publish: true }),
      },
    );
    expect(publishResponse.status).toBe(200);

    // 4. Verify public visibility
    const publicResponse = await fetch("/api/events/public");
    const publicData = await publicResponse.json();
    expect(publicData.events.some((e) => e.id === eventId)).toBe(true);

    // 5. Archive event (admin)
    const archiveResponse = await fetch(
      `/api/admin/events/${eventId}/archive`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    expect(archiveResponse.status).toBe(200);

    // 6. Verify hidden from default view
    const eventsResponse = await fetch("/api/admin/events", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const eventsData = await eventsResponse.json();
    expect(eventsData.events.some((e) => e.id === eventId)).toBe(false);

    // 7. Verify visible with archived filter
    const archivedResponse = await fetch("/api/admin/events?archived=true", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const archivedData = await archivedResponse.json();
    expect(archivedData.events.some((e) => e.id === eventId)).toBe(true);
  });

  it("should prevent publishing event with no bands", async () => {
    // Create event without bands
    // Attempt to publish
    // Expect 400 with message about adding bands
  });

  it("should maintain band references when event deleted", async () => {
    // Create event with bands
    // Delete event
    // Verify bands still exist with event_id=NULL
  });
});
```

---

## Implementation Order

### Phase 1: EventsTab Integration (2-3 hours)

1. Update imports and add EventContext
2. Add EventFormModal integration
3. Update table to use status and EventStatusBadge
4. Add "Show Archived" toggle
5. Implement action handlers (publish, archive, delete)
6. Test manually in browser

### Phase 2: Unit Tests (2 hours)

1. Create test directory structure
2. Write create event tests
3. Write publish/unpublish tests
4. Write archive tests
5. Write delete tests
6. Run coverage report

### Phase 3: Integration Tests (1 hour)

1. Write event lifecycle test
2. Write band count validation test
3. Write orphaned bands test
4. Run full test suite

---

## Acceptance Criteria

### EventsTab Integration

- [ ] "Create Event" button opens EventFormModal
- [ ] Can edit events inline
- [ ] Publish/unpublish actions work
- [ ] Archive action works (admin only)
- [ ] Delete action with confirmation
- [ ] "Show Archived" toggle works
- [ ] Status badges display correctly
- [ ] No console errors

### Unit Tests

- [ ] 80%+ line coverage for all event endpoints
- [ ] All CRUD operations tested
- [ ] Permission checks tested
- [ ] Validation tests passing
- [ ] Business logic tests (0 bands, orphaned bands)

### Integration Tests

- [ ] Full lifecycle test passes
- [ ] Public API integration verified
- [ ] Multi-user scenario tested
- [ ] Database state verified after each step

---

## Manual Testing Checklist

### As Editor

- [ ] Create new draft event
- [ ] Edit event details
- [ ] Publish event with bands
- [ ] Try to publish event without bands (should fail)
- [ ] Unpublish event
- [ ] Cannot archive events (button hidden)
- [ ] Cannot delete events (button hidden)

### As Admin

- [ ] All editor actions work
- [ ] Can archive published event
- [ ] Archived event hidden from default view
- [ ] Can show archived events with toggle
- [ ] Can delete event
- [ ] Deletion message shows band count
- [ ] Orphaned bands can be reassigned

### As Viewer

- [ ] Can see events list (read-only)
- [ ] Cannot create events
- [ ] Cannot edit events
- [ ] Cannot publish/archive/delete

---

## Expected Timeline

- **EventsTab Integration**: 2-3 hours
- **Unit Tests**: 2 hours
- **Integration Tests**: 1 hour
- **Manual Testing**: 30 minutes
- **Total**: 5.5-6.5 hours

---

## Success Metrics

**Completion Criteria**:

1. EventsTab fully integrated with Sprint 1.2 components
2. 80%+ test coverage on event endpoints
3. Integration tests pass for full lifecycle
4. Manual testing checklist 100% complete
5. No console errors or warnings
6. Sprint 1.2 marked as ✅ COMPLETE in ROADMAP_TO_DEMO.md

**Ready for Sprint 1.3** (Band Profile Management)
