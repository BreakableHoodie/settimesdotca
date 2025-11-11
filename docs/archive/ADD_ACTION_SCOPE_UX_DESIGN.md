# Add Action Scope UX Design

## Problem Statement

**Critical UX Ambiguity**: When users click "Add Performer" or "Add Venue" in the admin panel, the scope of the action is unclear:

- Are they adding to the **GLOBAL pool** (reusable across all events)?
- Are they adding **ONLY to this specific event**?
- Are they adding globally **AND scheduling** it for this event?

This ambiguity causes confusion, potential duplicate entries, and incorrect data organization.

## Current State Analysis

### Data Model

```
Venues:
  - Global entities (id, name, address, website, instagram, facebook)
  - Reusable across all events
  - Relationship: One venue → Many performances

Bands/Performers:
  - Global entities (id, name, url)
  - Reusable across all events
  - Relationship: One band → Many performances

Performances:
  - Event-specific links (band_id, event_id, venue_id, start_time, end_time)
  - Creates the scheduling relationship
```

### Context Mechanism

```javascript
// AdminPanel.jsx line 123-137
<select
  value={selectedEventId || ""}
  onChange={(e) => setSelectedEventId(value ? Number(value) : null)}
>
  <option value="">All Venues/Bands (Global View)</option>
  {events.map((event) => (
    <option value={event.id}>{event.name}</option>
  ))}
</select>
```

**Two Views**:

1. **Global View** (`selectedEventId === null`): Shows all performers/venues across all events
2. **Event View** (`selectedEventId !== null`): Shows performers/venues for specific event

### Current Add Flow Issues

**BandsTab.jsx (Line 467-476)**:

```jsx
<button onClick={() => setShowAddForm(true)}>+ Add Performer</button>
```

- No indication of scope
- Same button in both global and event contexts
- Form shows after click with explanation text (lines 785-787)

**Current Form Explanation** (Lines 785-787):

```jsx
<p className="text-white/70 text-sm mb-4">
  {selectedEventId
    ? "This band will be added to the selected event."
    : "This band will be available to assign to events later."}
</p>
```

**Problem**: Explanation appears AFTER clicking "Add Performer", not before.

## User Mental Models

### Persona 1: Event Organizer (Non-Technical)

**Context**: Managing "Long Weekend Vol. 4"
**Intent Scenarios**:

1. **New performer for this event only**
   - Mental model: "I want to add The Midnight Sons to this event"
   - Expected: Create band globally + schedule for Vol. 4
   - Current confusion: "Is this band now available for other events?"

2. **Existing performer returning**
   - Mental model: "The Gaslight Anthem played last year, adding them again"
   - Expected: Find existing band + schedule for Vol. 4
   - Current confusion: "Do I search first or add new?"

3. **New venue discovery**
   - Mental model: "Found a new bar, Berlin Nightclub, adding to event"
   - Expected: Create venue globally + use in Vol. 4
   - Current confusion: "Will this venue appear in past events?"

### Persona 2: Database Maintainer

**Context**: Managing global performer/venue pools
**Intent Scenarios**:

1. **Adding venue before event**
   - Mental model: "Pre-load venues for future events"
   - Expected: Create global venue, no event association
   - Current confusion: "How do I add without scheduling?"

2. **Cleaning up data**
   - Mental model: "Removing duplicate venues"
   - Expected: See all global entities clearly
   - Current confusion: "Which view am I in?"

## Logical Flow Analysis

### Scenario Matrix

| Context         | User Intent                     | Expected Action          | Current Behavior            | Gap                 |
| --------------- | ------------------------------- | ------------------------ | --------------------------- | ------------------- |
| **Global View** | Add venue for future use        | Create global venue only | ✅ Creates global venue     | None                |
| **Global View** | Add performer for future        | Create global performer  | ✅ Creates global performer | None                |
| **Event View**  | Add new performer to event      | Create global + schedule | ✅ Creates + schedules      | **Unclear intent**  |
| **Event View**  | Add existing performer to event | Search + schedule        | ❌ No search flow           | **Missing feature** |
| **Event View**  | Add new venue to event          | Create global + use      | ✅ Creates global venue     | **Unclear intent**  |
| **Event View**  | Use existing venue              | Select from dropdown     | ✅ Works in form            | None                |

### Critical Issues

1. **Pre-Click Ambiguity**: Button label doesn't communicate scope
2. **Post-Click Ambiguity**: Explanation appears too late
3. **Missing Flow**: No "add existing performer" workflow
4. **Visual Confusion**: Same UI in both contexts

## UX Design Solutions

### Principle 1: Scope BEFORE Action

**Rule**: Users must understand scope before clicking any "Add" button.

### Principle 2: Context-Aware Language

**Rule**: Button labels and form titles change based on context.

### Principle 3: Progressive Disclosure

**Rule**: Show complexity only when needed.

### Principle 4: Confirmation Feedback

**Rule**: Success messages must confirm what was created AND where.

---

## Design Patterns

### Pattern 1: Split Action Buttons (Event Context)

**When**: `selectedEventId !== null` (Event View)

**Replace Single Button**:

```jsx
// ❌ BEFORE (Ambiguous)
<button>+ Add Performer</button>
```

**With Split Actions**:

```jsx
// ✅ AFTER (Clear Intent)
<div className="flex flex-col sm:flex-row gap-3">
  <button className="primary-action">
    <Icon.Plus />
    <span>Create New Performer</span>
    <Badge>For {selectedEvent.name}</Badge>
  </button>

  <button className="secondary-action">
    <Icon.Link />
    <span>Add Existing Performer</span>
  </button>
</div>
```

**Mobile Design**:

```
┌─────────────────────────────────────┐
│ ┌───────────────────────────────┐   │
│ │  + Create New Performer       │   │
│ │  For Long Weekend Vol. 4      │   │
│ └───────────────────────────────┘   │
│                                     │
│ ┌───────────────────────────────┐   │
│ │  🔗 Add Existing Performer    │   │
│ └───────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Desktop Design**:

```
┌───────────────────────────────────────────────────────────┐
│  [+ Create New Performer]  [🔗 Add Existing Performer]    │
│  For Long Weekend Vol. 4                                  │
└───────────────────────────────────────────────────────────┘
```

---

### Pattern 2: Context Badge Visual Indicator

**Global Context Badge**:

```jsx
<button>
  <Icon.Globe />
  <span>Add Venue</span>
  <Badge variant="global">Available to All Events</Badge>
</button>
```

**Event Context Badge**:

```jsx
<button>
  <Icon.Calendar />
  <span>Create New Venue</span>
  <Badge variant="event">For {eventName}</Badge>
</button>
```

**Visual Hierarchy**:

```
GLOBAL VIEW:
┌─────────────────────────────────┐
│  🌐 Add Venue                   │
│  Available to All Events        │
└─────────────────────────────────┘

EVENT VIEW:
┌─────────────────────────────────┐
│  📅 Create New Venue             │
│  For Long Weekend Vol. 4        │
└─────────────────────────────────┘
```

---

### Pattern 3: Modal Title with Scope Context

**Current** (Ambiguous):

```jsx
<h3>Add New Band</h3>
```

**Improved** (Context-Aware):

```jsx
{
  /* Global Context */
}
<h3>Create Performer (Available to All Events)</h3>;

{
  /* Event Context */
}
<h3>Create Performer for {selectedEvent.name}</h3>;
```

**Visual Design**:

```
┌─────────────────────────────────────────────────┐
│ Create Performer for Long Weekend Vol. 4        │
│ ─────────────────────────────────────────────── │
│                                                 │
│ This performer will be:                         │
│ ✓ Added to the global performer database       │
│ ✓ Scheduled for Long Weekend Vol. 4            │
│                                                 │
│ Name: [___________________________]             │
│ Venue: [Select venue ▼]                        │
│ Start Time: [__:__] End Time: [__:__]          │
│                                                 │
│ [Create & Schedule]  [Cancel]                   │
└─────────────────────────────────────────────────┘
```

---

### Pattern 4: "Add Existing" Modal (New Feature)

**Flow**: User clicks "Add Existing Performer" in event context

**Modal Design**:

```
┌─────────────────────────────────────────────────┐
│ Add Existing Performer to Long Weekend Vol. 4   │
│ ─────────────────────────────────────────────── │
│                                                 │
│ Search: [___________________________] 🔍        │
│                                                 │
│ ┌─────────────────────────────────────────┐    │
│ │ ☐ The Gaslight Anthem                   │    │
│ │   Last played: Vol. 3 (2024-08-15)      │    │
│ │                                          │    │
│ │ ☐ The Midnight Sons                     │    │
│ │   Last played: Vol. 2 (2024-02-20)      │    │
│ │                                          │    │
│ │ ☐ Tokyo Police Club                     │    │
│ │   Never played at this event series     │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ Selected: 0 performers                          │
│                                                 │
│ Next: Configure scheduling details →            │
│                                                 │
│ [Cancel]                                        │
└─────────────────────────────────────────────────┘
```

**Step 2: Scheduling Details**:

```
┌─────────────────────────────────────────────────┐
│ Schedule Performers for Long Weekend Vol. 4     │
│ ─────────────────────────────────────────────── │
│                                                 │
│ 🎸 The Gaslight Anthem                          │
│ Venue: [Maxwell's ▼]                            │
│ Start: [20:00] End: [21:30]                     │
│                                                 │
│ 🎸 The Midnight Sons                            │
│ Venue: [Berlin Nightclub ▼]                     │
│ Start: [22:00] End: [23:00]                     │
│                                                 │
│ [← Back]  [Add to Event]                        │
└─────────────────────────────────────────────────┘
```

---

### Pattern 5: Success Messages with Scope Clarity

**Current** (Vague):

```jsx
showToast("Band added successfully!", "success");
```

**Improved** (Specific):

```jsx
// Global Context
showToast('✓ "The Midnight Sons" added to performer database', "success");

// Event Context (Create New)
showToast(
  '✓ "Tokyo Police Club" created and scheduled for Long Weekend Vol. 4',
  "success",
);

// Event Context (Add Existing)
showToast(
  '✓ "The Gaslight Anthem" scheduled for Long Weekend Vol. 4 at 20:00',
  "success",
);
```

**Toast Visual Design**:

```
┌────────────────────────────────────────┐
│ ✓ "Tokyo Police Club" created          │
│                                        │
│ Added to: Global Database              │
│ Scheduled: Long Weekend Vol. 4 @ 20:00 │
└────────────────────────────────────────┘
```

---

## Component Specifications

### Component 1: `ScopeAwareActionButton`

**Props**:

```typescript
interface ScopeAwareActionButtonProps {
  context: "global" | "event";
  eventName?: string;
  entityType: "performer" | "venue";
  onCreateNew: () => void;
  onAddExisting?: () => void; // Only for event context
}
```

**Render Logic**:

```jsx
function ScopeAwareActionButton({
  context,
  eventName,
  entityType,
  onCreateNew,
  onAddExisting,
}) {
  if (context === "global") {
    return (
      <button onClick={onCreateNew} className="btn-primary">
        <Globe className="icon" />
        <span>Add {entityType}</span>
        <Badge variant="global">Available to All Events</Badge>
      </button>
    );
  }

  // Event context: show split actions
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <button onClick={onCreateNew} className="btn-primary flex-1">
        <Plus className="icon" />
        <div className="flex flex-col items-start">
          <span>Create New {entityType}</span>
          <span className="text-xs opacity-70">For {eventName}</span>
        </div>
      </button>

      {entityType === "performer" && (
        <button onClick={onAddExisting} className="btn-secondary flex-1">
          <Link className="icon" />
          <span>Add Existing {entityType}</span>
        </button>
      )}
    </div>
  );
}
```

---

### Component 2: `AddExistingPerformerModal`

**Props**:

```typescript
interface AddExistingPerformerModalProps {
  eventId: number;
  eventName: string;
  allPerformers: Performer[];
  venues: Venue[];
  onClose: () => void;
  onSubmit: (selections: PerformerSchedule[]) => Promise<void>;
}

interface PerformerSchedule {
  performerId: number;
  venueId: number;
  startTime: string;
  endTime: string;
}
```

**State Machine**:

```typescript
type Step = "select" | "schedule" | "confirm";

const [currentStep, setCurrentStep] = useState<Step>("select");
const [selectedPerformers, setSelectedPerformers] = useState<Set<number>>(
  new Set(),
);
const [schedules, setSchedules] = useState<PerformerSchedule[]>([]);
```

---

### Component 3: `ScopeContextBanner`

**Purpose**: Visual indicator at top of form showing what will happen

**Props**:

```typescript
interface ScopeContextBannerProps {
  context: "global" | "event";
  eventName?: string;
  entityType: "performer" | "venue";
  mode: "create" | "addExisting";
}
```

**Render**:

```jsx
function ScopeContextBanner({ context, eventName, entityType, mode }) {
  if (context === "global") {
    return (
      <div className="bg-blue-900/20 border border-blue-600 rounded p-4 mb-4">
        <h4 className="text-blue-200 font-semibold mb-2">
          Global {entityType}
        </h4>
        <ul className="text-blue-200 text-sm space-y-1">
          <li>✓ Will be added to the global {entityType} database</li>
          <li>✓ Available to assign to any event</li>
          <li>✓ Not scheduled for any specific event yet</li>
        </ul>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="bg-orange-900/20 border border-orange-600 rounded p-4 mb-4">
        <h4 className="text-orange-200 font-semibold mb-2">
          Create & Schedule for {eventName}
        </h4>
        <ul className="text-orange-200 text-sm space-y-1">
          <li>✓ Will be added to the global {entityType} database</li>
          <li>✓ Will be scheduled for {eventName}</li>
          <li>✓ Can be reused in future events</li>
        </ul>
      </div>
    );
  }

  // mode === 'addExisting'
  return (
    <div className="bg-green-900/20 border border-green-600 rounded p-4 mb-4">
      <h4 className="text-green-200 font-semibold mb-2">
        Add Existing to {eventName}
      </h4>
      <ul className="text-green-200 text-sm space-y-1">
        <li>✓ Select from existing {entityType}s</li>
        <li>✓ Schedule for {eventName}</li>
        <li>✓ No new {entityType} will be created</li>
      </ul>
    </div>
  );
}
```

---

## Form Field Behavior

### Conditional Field Display

**Global Context Form**:

```jsx
<form>
  <Input name="name" label="Performer Name" required />
  <Input name="url" label="Website/Social Media" optional />

  {/* NO venue, time fields in global context */}
  <p className="text-white/60 text-sm">
    💡 You can assign this performer to events later
  </p>

  <Button type="submit">Add to Database</Button>
</form>
```

**Event Context Form (Create New)**:

```jsx
<form>
  <ScopeContextBanner
    context="event"
    eventName={eventName}
    entityType="performer"
    mode="create"
  />

  <Input name="name" label="Performer Name" required />
  <Input name="url" label="Website/Social Media" optional />

  <hr className="my-4 border-band-orange/20" />
  <h4 className="text-white font-semibold mb-3">Scheduling Details</h4>

  <Select name="venue_id" label="Venue" required>
    <option value="">Select venue...</option>
    {venues.map((v) => (
      <option value={v.id}>{v.name}</option>
    ))}
  </Select>

  <div className="grid grid-cols-2 gap-4">
    <Input name="start_time" label="Start Time" type="time" required />
    <Input name="end_time" label="End Time" type="time" required />
  </div>

  <Button type="submit">Create & Schedule for {eventName}</Button>
</form>
```

---

## Information Architecture

### Tab Structure with Context Indicator

```
┌──────────────────────────────────────────────────────┐
│ Band Crawl Admin                                      │
│                                                       │
│ Filter: [Long Weekend Vol. 4 ▼] [Clear Filter]       │
│                                                       │
│ [Events] [Venues] [Performers]                        │
├──────────────────────────────────────────────────────┤
│                                                       │
│ PERFORMERS                                            │
│ ──────────                                            │
│ Managing: Long Weekend Vol. 4                         │ ← Context indicator
│                                                       │
│ [+ Create New Performer] [🔗 Add Existing Performer]  │ ← Split actions
│ For Long Weekend Vol. 4                               │
│                                                       │
│ [Performer List...]                                   │
│                                                       │
└──────────────────────────────────────────────────────┘
```

---

## Edge Case Handling

### Edge Case 1: Adding Performer That Doesn't Exist (Event Context)

**Current Flow**: User must click "Add Performer", fill form, no search option

**Improved Flow**:

1. User clicks "Add Existing Performer"
2. Searches for "Tokyo Police Club"
3. No results found
4. Show inline prompt:
   ```
   ┌────────────────────────────────────────┐
   │ No performers found for "Tokyo Police" │
   │                                        │
   │ [Create "Tokyo Police Club" →]         │
   └────────────────────────────────────────┘
   ```
5. Clicking creates transition to "Create New" flow with name pre-filled

---

### Edge Case 2: Creating Duplicate Performer

**Current**: Error message after submission attempt

**Improved**: Real-time duplicate detection

```jsx
<Input
  name="name"
  label="Performer Name"
  onChange={async (value) => {
    const exists = await checkDuplicateName(value);
    if (exists) {
      showWarning(
        `"${value}" already exists. Did you mean to add them to this event instead?`,
        { action: "Switch to Add Existing", onClick: switchToAddExisting },
      );
    }
  }}
/>
```

**Warning Display**:

```
┌────────────────────────────────────────────────┐
│ Name: [The Gaslight Anthem____]                │
│                                                │
│ ⚠️  "The Gaslight Anthem" already exists       │
│                                                │
│ Did you mean to schedule them for this event?  │
│ [Yes, Schedule Them] [No, Create New Entry]    │
└────────────────────────────────────────────────┘
```

---

### Edge Case 3: Venue Created for Event (But Actually Global)

**Current Confusion**: User in event context creates venue, thinks it's event-specific

**Clarification Strategy**:

**Option A: Always Global** (Recommended)

- Venues are ALWAYS global entities
- Event context just filters display
- Make this explicit in UI

```jsx
// In event context
<button>
  <span>Create Venue</span>
  <span className="text-xs opacity-70">(Available to all events)</span>
</button>
```

**Form Banner**:

```
┌────────────────────────────────────────────────┐
│ ℹ️  Venues are shared across all events         │
│                                                │
│ This venue will be available to assign to any  │
│ event. You can select it when creating         │
│ performers for {eventName}.                    │
└────────────────────────────────────────────────┘
```

---

## Accessibility Considerations

### Screen Reader Announcements

```jsx
// When switching contexts
<div role="status" aria-live="polite" className="sr-only">
  {selectedEventId
    ? `Now viewing performers for ${selectedEvent.name}. Create new performer will schedule for this event.`
    : `Now viewing all performers globally. Create new performer will add to database only.`
  }
</div>

// Button labels
<button aria-label={`Create new performer for ${eventName} and add to global database`}>
  Create New Performer
</button>
```

### Keyboard Navigation

```jsx
// Split button pattern
<div role="group" aria-label="Add performer actions">
  <button>Create New Performer</button>
  <button>Add Existing Performer</button>
</div>

// Tab order: Action buttons → Form fields → Submit
```

### Focus Management

```jsx
// When modal opens, focus on search input
useEffect(() => {
  if (isOpen && searchInputRef.current) {
    searchInputRef.current.focus();
  }
}, [isOpen]);
```

---

## Mobile-First Design Specifications

### Touch Target Sizes

- Minimum button height: `48px` (44px iOS + 4px buffer)
- Minimum tap area: `48px × 48px`
- Spacing between tappable elements: `8px` minimum

### Mobile Action Buttons

```jsx
<div className="flex flex-col gap-3 w-full">
  <button className="min-h-[48px] w-full rounded-lg bg-band-orange text-white font-medium px-6 py-3 flex items-center justify-between">
    <span className="flex items-center gap-2">
      <Plus className="w-5 h-5" />
      Create New Performer
    </span>
    <Badge>For {eventName}</Badge>
  </button>

  <button className="min-h-[48px] w-full rounded-lg bg-gray-700 text-white font-medium px-6 py-3 flex items-center justify-center gap-2">
    <Link className="w-5 h-5" />
    Add Existing Performer
  </button>
</div>
```

### Mobile Modal Design

```
Full-screen on mobile (<768px)
Centered modal on desktop (≥768px)

Mobile:
┌─────────────────────────┐
│ [←] Add Existing        │ ← Full-width header with back button
├─────────────────────────┤
│ Search: [_________] 🔍  │
│                         │
│ Results scroll here...  │
│                         │
│                         │
│                         │
│ [Selected: 2]           │ ← Sticky footer
│ [Add to Event]          │
└─────────────────────────┘

Desktop:
┌─────────────────────────────────┐
│       [×]                       │
│  Add Existing to Event          │
│  ─────────────────────────────  │
│  Search: [___________] 🔍       │
│  ┌───────────────────────────┐ │
│  │ Results...                │ │
│  └───────────────────────────┘ │
│  [Cancel] [Add to Event]        │
└─────────────────────────────────┘
```

---

## Implementation Guidance

### Phase 1: Quick Wins (Low Effort, High Impact)

**1.1 Update Button Labels** (2 hours)

```jsx
// BandsTab.jsx
<button>
  {selectedEventId
    ? `+ Create Performer for ${selectedEvent.name}`
    : "+ Add Performer (Global)"}
</button>
```

**1.2 Add Context Banner to Forms** (3 hours)

- Implement `ScopeContextBanner` component
- Show at top of all add/edit forms
- Clarify what will be created/modified

**1.3 Improve Success Messages** (1 hour)

```jsx
showToast(
  selectedEventId
    ? `✓ "${bandName}" created and scheduled for ${selectedEvent.name}`
    : `✓ "${bandName}" added to performer database`,
  "success",
);
```

**Total Phase 1**: ~6 hours

---

### Phase 2: Split Action Buttons (Medium Effort, High Impact)

**2.1 Create `ScopeAwareActionButton` Component** (4 hours)

- Build reusable component with context awareness
- Implement split button pattern for event context
- Add visual badges for clarity

**2.2 Update BandsTab & VenuesTab** (2 hours)

- Replace existing add buttons with `ScopeAwareActionButton`
- Wire up new action handlers
- Test both contexts

**Total Phase 2**: ~6 hours

---

### Phase 3: Add Existing Flow (High Effort, High Value)

**3.1 Create `AddExistingPerformerModal` Component** (8 hours)

- Build search interface with filtering
- Implement multi-select with checkboxes
- Show performer history (last played, events)

**3.2 Create Scheduling Step** (6 hours)

- Build form for batch scheduling
- Venue and time assignment for each performer
- Conflict detection warnings

**3.3 API Integration** (4 hours)

- Create endpoint for adding existing performers to event
- Batch create performances
- Validation and error handling

**Total Phase 3**: ~18 hours

---

### Phase 4: Enhanced UX Polish (Medium Effort)

**4.1 Real-Time Duplicate Detection** (4 hours)

- Debounced name check on input
- Show suggestions when duplicates found
- Offer quick switch to "Add Existing" flow

**4.2 Venue Context Clarification** (2 hours)

- Add permanent "Venues are global" messaging
- Update venue forms with clarification
- Ensure consistency across contexts

**4.3 Mobile Optimization** (6 hours)

- Full-screen modals on mobile
- Touch-optimized controls
- Test on iOS Safari, Android Chrome

**Total Phase 4**: ~12 hours

---

## Validation & Testing

### Usability Testing Script

**Task 1: Add New Performer to Event**

- Setup: User viewing "Long Weekend Vol. 4"
- Instruction: "Add a new performer called 'The National' to this event"
- Success Criteria:
  - User clicks correct button without hesitation
  - User understands performer is added globally AND scheduled
  - Success message confirms both actions

**Task 2: Add Existing Performer to Event**

- Setup: Database has "The Gaslight Anthem"
- Instruction: "The Gaslight Anthem is playing again, add them to this event"
- Success Criteria:
  - User finds "Add Existing" option
  - User searches and selects performer
  - User schedules with venue and time

**Task 3: Add Global Venue**

- Setup: Global view (no event selected)
- Instruction: "Add 'The Oasis' venue for future events"
- Success Criteria:
  - User understands venue won't be scheduled
  - User creates venue without confusion
  - Success message confirms global addition

### A/B Testing Metrics

**Metrics to Track**:

1. **Error Rate**: Duplicate performer creations (should decrease)
2. **Time to Complete**: Add performer workflow (should stay same or improve)
3. **User Confidence**: Post-action survey "I understand what I just created" (should increase to >90%)
4. **Support Tickets**: "How do I add existing performer?" (should decrease to near-zero)

---

## Success Criteria

### Quantitative Goals

- **Zero ambiguity** in user testing (10/10 users understand scope)
- **<2% error rate** in adding wrong entity type
- **<5 seconds** to understand action scope from UI
- **Zero duplicate creations** due to unclear flow

### Qualitative Goals

- Users can verbalize what will happen before clicking
- No post-action confusion about where data was created
- Mobile users find split buttons easy to tap
- Non-technical users complete tasks without help

---

## Appendix A: Button Label Examples

### Event Context

| Entity    | Primary Button                     | Secondary Button         |
| --------- | ---------------------------------- | ------------------------ |
| Performer | "Create New Performer for {Event}" | "Add Existing Performer" |
| Venue     | "Create Venue (Available to All)"  | N/A                      |

### Global Context

| Entity    | Button Label                      |
| --------- | --------------------------------- |
| Performer | "Add Performer (Global Database)" |
| Venue     | "Add Venue (Global Database)"     |

---

## Appendix B: Color Coding System

### Context Colors

- **Global Context**: Blue (`bg-blue-900/20`, `border-blue-600`)
- **Event Context (Create)**: Orange (`bg-orange-900/20`, `border-orange-600`)
- **Event Context (Add Existing)**: Green (`bg-green-900/20`, `border-green-600`)

### Rationale

- Blue = Information, neutral, database-level
- Orange = Creation, action, event-specific
- Green = Connection, reuse, existing entities

---

## Appendix C: Responsive Breakpoints

```css
/* Mobile First */
.action-buttons {
  flex-direction: column; /* Stack vertically */
  gap: 12px;
}

/* Tablet and up */
@media (min-width: 640px) {
  .action-buttons {
    flex-direction: row; /* Side by side */
    gap: 16px;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .action-buttons {
    gap: 20px;
    justify-content: flex-end;
  }
}
```

---

## Appendix D: API Changes Required

### New Endpoint: Add Existing Performers

```typescript
POST /api/admin/bands/add-existing
Authorization: Bearer {token}

Request Body:
{
  "eventId": number,
  "performers": [
    {
      "bandId": number,
      "venueId": number,
      "startTime": "HH:MM",
      "endTime": "HH:MM"
    }
  ]
}

Response:
{
  "success": true,
  "created": number, // Count of performances created
  "conflicts": [
    {
      "bandId": number,
      "reason": "Overlapping time with {other band}"
    }
  ]
}
```

### Modified Response: Get All Bands

```typescript
GET /api/admin/bands
Response:
{
  "bands": [
    {
      "id": number,
      "name": string,
      "url": string,
      "lastPlayed": "YYYY-MM-DD" | null,
      "eventsCount": number,
      "events": [
        {
          "eventId": number,
          "eventName": string,
          "eventDate": "YYYY-MM-DD"
        }
      ]
    }
  ]
}
```

---

## Final Recommendations

### Priority Order

1. **Phase 1** (Quick Wins) - Implement immediately
   - Low effort, immediate clarity improvement
   - Requires no new components or API changes
   - Reduces user confusion by 50%

2. **Phase 2** (Split Buttons) - Implement within 2 weeks
   - Medium effort, high visual impact
   - Makes intent explicit before action
   - Prepares for "Add Existing" feature

3. **Phase 3** (Add Existing) - Implement within 1 month
   - High effort, completes workflow
   - Eliminates duplicate creation issue
   - Enables power users to work faster

4. **Phase 4** (Polish) - Implement ongoing
   - Continuous improvement based on feedback
   - Mobile optimization crucial for target users
   - Real-time validation prevents errors

### Decision Points

**Question**: Should venues have event-specific creation?
**Recommendation**: No. Keep venues always global, clarify in UI.
**Rationale**: Simplifies data model, venues naturally shared across events.

**Question**: Should "Add Existing" support bulk selection?
**Recommendation**: Yes, absolutely.
**Rationale**: Event organizers often add multiple returning performers at once.

**Question**: Should we show performer history in search?
**Recommendation**: Yes, critical context.
**Rationale**: Helps users identify correct performer if duplicates exist, shows "last played" info.

---

## Conclusion

The scope ambiguity problem stems from **context-insensitive UI** that doesn't communicate intent before action. The solution is **progressive disclosure** with **context-aware language** that makes scope **obvious and unavoidable**.

By implementing split action buttons, clear scope indicators, and an "Add Existing" workflow, users will always know exactly what they're creating and where it will appear.

**Key Principle**: Users should never have to wonder "what did I just create?"

**Success Metric**: 100% of users can correctly describe the action scope before clicking a button.

---

**Document Version**: 1.0
**Last Updated**: 2025-10-26
**Status**: Ready for Implementation
**Contact**: UX Design Team
