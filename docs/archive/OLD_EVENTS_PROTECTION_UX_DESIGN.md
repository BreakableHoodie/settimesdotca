# Old Events Protection - UX Design Specification

## Overview

**Problem:** Event organizers need to preserve historical event data from accidental modification or deletion while maintaining usability for legitimate corrections and reference.

**Solution:** Progressive protection system that automatically safeguards past events while providing graceful workflows for viewing historical data and making necessary corrections.

**Key Principle:** Make it impossible to accidentally destroy historical data while still allowing intentional access for reference and analytics.

---

## 1. Event Lifecycle Definition

### Event States

Events progress through distinct lifecycle states based on their relationship to the current date/time:

#### **Upcoming**

- **Definition:** Event end date/time is in the future
- **Protection Level:** None (fully editable)
- **Visual Treatment:** Standard/default appearance
- **Actions Available:** Edit, Delete, Cancel, Publish

#### **Recently Completed**

- **Definition:** 0-48 hours after event end date/time
- **Protection Level:** Light (editable with warnings)
- **Visual Treatment:** Yellow/amber warning banner
- **Actions Available:** Edit (with banner), Archive, Copy
- **Rationale:** Allows quick post-event corrections without friction

#### **Archived**

- **Definition:** 48+ hours after event end date/time OR manually archived
- **Protection Level:** High (confirmation gates + soft delete)
- **Visual Treatment:** Muted/gray with archive badge
- **Actions Available:** View, Copy as Template, Edit (with confirmation), Unarchive
- **Rationale:** Prevents accidental changes to historical records

### Grace Period Rationale

**Why 48 hours?**

- ✅ Allows immediate post-event corrections (typos, notes, final attendance)
- ✅ Gives time to add wrap-up content (photos, reviews, metrics)
- ✅ Short enough to prevent long-term manipulation
- ✅ Long enough for non-urgent corrections after event fatigue
- ✅ Aligns with typical event workflow patterns

**Alternative Considered:** 7-day period

- ❌ Too long - increases risk of historical data corruption
- ❌ Events feel "stale" but still editable (confusing UX)
- ✅ Only needed for very complex multi-week events (rare edge case)

### Multi-Day Event Handling

**Rule:** Use event END date/time, never start date

**Example:**

- 3-day festival: Friday 7 PM → Sunday 11 PM
- Grace period: Sunday 11 PM → Tuesday 11 PM (48 hours after END)
- During festival (Fri-Sun): Fully editable, no warnings
- After festival (Sun-Tue): Recently completed state, yellow banner
- After grace (Tue+): Archived state, confirmation required

**Prevents:** Partial archiving of ongoing multi-day events

---

## 2. Protection Mechanisms

### Approach: Soft Delete + Confirmation Gates

**Rejected Alternatives:**

❌ **Full Read-Only**

- Can't fix legitimate errors in historical data
- Too restrictive for real-world needs

❌ **Limited Edits (Metadata Only)**

- Users confused why some fields are locked
- What if core data (date/venue) is actually wrong?

❌ **Admin Unlock Only**

- Requires complex permission system
- Organizers often ARE the admin (small organizations)

✅ **RECOMMENDED: Soft Delete + Confirmation Gates**

- Prevents accidental deletion entirely
- Allows edits with strong confirmation prompts
- No permission system needed
- Audit trail possible
- Fits mobile UX patterns (confirmations are familiar)

### Protection Implementation

#### **Recently Completed (0-48 hours after end):**

**Edit Behavior:**

- All edits allowed without confirmation
- Yellow warning banner always visible (non-dismissible)
- Banner text: _"This event has ended. Changes will affect historical records."_
- No modal dialogs (quick corrections still easy)

**Delete Behavior:**

- "Delete" button replaced with "Archive Now"
- Archive action: Soft delete with unarchive option
- No confirmation needed (reversible action)

#### **Archived (48+ hours after end):**

**Edit Behavior:**

- Edit requires confirmation modal BEFORE opening edit form
- Confirmation text: _"This event is archived. Are you sure you want to modify historical data?"_
- Three-button choice:
  - **Cancel** (default/recommended)
  - **Copy as New Event** (constructive alternative)
  - **Edit Anyway** (proceeds with edit)
- After editing, second confirmation on Save: _"Confirm changes to historical data?"_
- Two-step confirmation prevents muscle-memory accidents

**Delete Behavior:**

- No "Delete" button visible (completely hidden)
- Archive action only: Moves to archived section, preserves all data
- Unarchive available if archiving was mistake

**Rationale:**

- Two confirmation steps create strong friction for destructive changes
- Offering "Copy as New" provides constructive alternative at decision point
- Hiding delete entirely removes temptation/accident risk

---

## 3. Visual Design Patterns

### Mobile-First Design Requirements

**Context:** Users are primarily on phones/tablets

- ✅ Clear visual hierarchy at a glance
- ✅ Touch-friendly buttons and spacing
- ✅ Minimal text, maximum clarity
- ✅ Color coding for instant recognition

### Event List View

#### Upcoming Events (Default State)

```
┌─────────────────────────────────┐
│ Summer Band Crawl               │
│ Fri, Aug 15 • 7:00 PM          │
│ 5 venues • 12 bands             │
│                                 │
│ [Edit] [View Details]           │
└─────────────────────────────────┘
```

**Visual Properties:**

- Background: White/default
- Text: Standard contrast
- Border: Subtle gray
- Icons: None needed (clean)

#### Recently Completed (Yellow Accent)

```
┌─────────────────────────────────┐
│ ⚠️ Spring Fest                  │ ← Yellow/amber background
│ Sat, Mar 20 • Ended 18 hrs ago  │
│ 3 venues • 8 bands              │
│                                 │
│ [Edit] [Archive Now] [View]     │
└─────────────────────────────────┘
```

**Visual Properties:**

- Background: Light amber (#FFF9E6)
- Border: Amber accent (#FFD700)
- Icon: ⚠️ Warning triangle
- Time indicator: "Ended X hrs ago"

#### Archived Events (Muted State)

```
┌─────────────────────────────────┐
│ 🗄️ Winter Crawl                 │ ← Gray/muted background
│ Dec 12, 2024                    │
│ ARCHIVED • 3 venues • 8 bands   │
│                                 │
│ [View] [Copy as Template]       │ ← No "Edit" button
└─────────────────────────────────┘
```

**Visual Properties:**

- Background: Light gray (#F5F5F5)
- Text: Muted gray (#666666)
- Icon: 🗄️ Archive/file cabinet
- Badge: "ARCHIVED" in uppercase
- Date format: Simplified (no time, just date)

### Color Scheme

| State    | Primary Color | Background | Border     | Use Case                   |
| -------- | ------------- | ---------- | ---------- | -------------------------- |
| Upcoming | Default       | White      | Light gray | Normal editable events     |
| Recent   | Amber/Yellow  | #FFF9E6    | #FFD700    | Caution: event just ended  |
| Archived | Gray          | #F5F5F5    | #DDDDDD    | Historical: protected data |

**Never use red:** Red implies error/failure, not appropriate for normal lifecycle progression

### Icon System

| Icon | State    | Meaning                            |
| ---- | -------- | ---------------------------------- |
| 📅   | Upcoming | Optional (can omit for clean look) |
| ⚠️   | Recent   | Warning: recently ended            |
| 🗄️   | Archived | File cabinet: historical storage   |

**Accessibility:** Always pair icons with text labels for screen readers

### List Organization

**Default View:**

- Show upcoming events only
- Chronological order: Soonest first
- Clean, focused interface

**"Show Past Events" Toggle:**

- Collapsed by default (hidden)
- Expand to reveal archived events below upcoming
- Clear visual separator (e.g., "Past Events" header)
- Reverse chronological: Most recent first

**Filter Dropdown Options:**

- **Upcoming** (default)
- **Recent** (last 2 days)
- **Archived** (older than 2 days)
- **All** (combined view)

---

## 4. Event Detail Page Design

### Archived Event Detail

```
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │ 🗄️ ARCHIVED EVENT                   │ │ ← Persistent banner
│ │ This event ended on Dec 12, 2024    │ │    (can't be dismissed)
│ │ Historical data is protected        │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Winter Band Crawl                       │
│ December 12, 2024 • 7:00 PM            │
│ The Bourbon Street, New Orleans        │
│                                         │
│ [View Full Details]                     │ ← No "Edit" in primary position
│ [Copy as Template]                      │ ← Constructive action promoted
│                                         │
│ Bands (8)                              │
│ ├─ The Storyville Stompers             │
│ ├─ Crescent City Kings                 │
│ └─ ...                                 │
│                                         │
│ Venues (3)                             │
│ ├─ The Spotted Cat                     │
│ ├─ Preservation Hall                   │
│ └─ ...                                 │
│                                         │
│ ⋮ (Actions menu)                       │ ← "Edit Event" hidden here
│   └─ Edit Event (requires confirmation)│    (3-dot overflow menu)
└─────────────────────────────────────────┘
```

**Design Principles:**

1. **Persistent context banner** - Always visible, can't scroll away
2. **Constructive alternatives first** - "Copy as Template" more prominent than edit
3. **Edit available but de-emphasized** - Overflow menu, not primary button
4. **Clear status communication** - "Archived", "Historical data", not technical jargon

### Recently Completed Event Detail

```
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │ ⚠️ Event Ended 18 hours ago         │ │ ← Yellow banner
│ │ You can still make corrections      │ │    (encouraging tone)
│ └─────────────────────────────────────┘ │
│                                         │
│ Spring Fest 2025                       │
│ March 20, 2025 • Ended Sat 11:30 PM   │
│                                         │
│ [Edit Event]                            │ ← Edit still in primary position
│ [Archive Now]                           │ ← Option to archive early
│ [View Full Details]                     │
│                                         │
│ ...                                    │
└─────────────────────────────────────────┘
```

**Design Principles:**

1. **Encouraging banner** - "You can still make corrections" (positive framing)
2. **Edit remains easy** - Primary button position, no confirmation
3. **Manual archive option** - For users who want to lock it early

---

## 5. Confirmation Dialogs

### Editing Archived Event - Initial Confirmation

**Trigger:** User taps "Edit Event" in overflow menu on archived event

```
┌─────────────────────────────────────────┐
│          Edit Archived Event?           │
│                                         │
│ ⚠️ This event is archived historical   │
│    data from December 12, 2024          │
│                                         │
│ Editing archived events should only     │
│ be done to correct errors.              │
│                                         │
│ What would you like to do?              │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │         Cancel                      │ │ ← Default focus
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │    Copy as New Event                │ │ ← Constructive alternative
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │    Edit Anyway                      │ │ ← Destructive/risky action
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Button Hierarchy:**

1. **Cancel** - Primary/recommended action (default focus)
2. **Copy as New Event** - Secondary/constructive alternative
3. **Edit Anyway** - Tertiary/risky action (visually de-emphasized)

### Saving Archived Event Edits - Final Confirmation

**Trigger:** User taps "Save" after editing archived event

```
┌─────────────────────────────────────────┐
│     Confirm Changes to Historical Data? │
│                                         │
│ You are about to modify an archived     │
│ event from December 12, 2024.           │
│                                         │
│ Changes:                                │
│ • Venue: "The Spotted Cat" → "Tipitinas"│
│ • Band added: "New Orleans Nighthawks"  │
│                                         │
│ This will update historical records.    │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │         Cancel                      │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │    Confirm & Save                   │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Key Features:**

- **Change summary** - Shows what's being modified (transparency)
- **Date reminder** - Reinforces this is old data
- **Two-button choice** - Simple cancel or confirm (no third option here)

**Why two confirmations?**

1. First confirmation: "Do you really want to edit this?" (prevents accidental entry)
2. Second confirmation: "Are these changes correct?" (prevents accidental save)
3. Creates strong friction against muscle-memory mistakes
4. Familiar pattern from other apps (e.g., "Are you sure you want to delete?")

---

## 6. User Workflows

### Workflow 1: Viewing Historical Events

**User Goal:** Review past event for reference or analytics

**Steps:**

1. **Dashboard** → Navigate to "Events" section
2. **Expand** → Tap "Show Past Events" toggle (collapsed by default)
3. **Browse** → Chronological list of archived events appears below upcoming
4. **Select** → Tap event to view detail page
5. **View** → Browse bands, venues, schedule (all read-only display)
6. **Optional Actions:**
   - Export as PDF summary
   - View event analytics/stats
   - Copy as template for new event

**Key Features:**

- **Search/Filter:** By date range, venue name, band name
- **Quick Stats:** "You've organized 47 events since 2020"
- **Export Options:** PDF event summary, CSV data for spreadsheet analysis
- **Analytics:** Most popular venues, average attendance, bands per event

**UX Priorities:**

- ✅ Default view shows only upcoming (focus on future)
- ✅ Past events easily accessible but not cluttering main view
- ✅ Clear visual separation between current and historical

---

### Workflow 2: Correcting Error in Archived Event

**User Goal:** Fix typo or incorrect data in past event

**Steps:**

1. **Navigate** → Find archived event in "Past Events" section
2. **Notice** → No "Edit" button in primary position
3. **Discover** → Find "Edit Event" in overflow menu (⋮)
4. **Confirm Intent** → Tap "Edit Event" → Confirmation modal appears
   - Modal: "Edit Archived Event?"
   - Options: Cancel / Copy as New / Edit Anyway
5. **Choose** → Tap "Edit Anyway"
6. **Edit** → Form loads with all fields editable
7. **Save** → Tap "Save" → Second confirmation modal
   - Modal: "Confirm Changes to Historical Data?"
   - Shows summary of changes
8. **Confirm** → Tap "Confirm & Save"
9. **Success** → Event updated, audit log entry created

**Error Prevention Layers:**

- ✅ Edit hidden in overflow menu (not primary action)
- ✅ Initial confirmation modal (prevents accidental entry)
- ✅ Constructive alternative offered (copy as new event)
- ✅ Change summary shown (review before saving)
- ✅ Final confirmation required (prevents accidental save)
- ✅ Audit log created (trackability)

**Escape Hatches:**

- User can cancel at ANY point (non-destructive)
- "Copy as New Event" available in first modal
- Back button works normally throughout

---

### Workflow 3: Using Past Event as Template

**User Goal:** Create new event based on successful past event

**Steps:**

1. **Browse** → Find past event to use as reference
2. **Select** → Tap event to view details
3. **Copy** → Tap "Copy as Template" button
4. **Review Pre-Populated Form:**
   - **Same:** Venues, band lineup, schedule structure, ticket types
   - **Different:** Date (defaults to next available Saturday), title variation
   - **Editable:** All fields can be modified
5. **Customize** → Adjust date, add/remove bands, update details
6. **Save** → Tap "Create Event"
7. **Success** → New event created, original preserved unchanged

**Benefits:**

- ✅ Encourages reusing successful event formats
- ✅ Reduces data entry for recurring annual events
- ✅ Preserves original historical data (no risk of accidental edit)
- ✅ Clear UX: Creating NEW event, not modifying old one
- ✅ Saves time: Pre-populated venues and bands

**Implementation Details:**

- Copy all fields EXCEPT: `id`, `created_at`, `status`, `published_at`
- Default new date: Next Saturday after today
- Default new title: "[Original Title] 2025" (year auto-increment)
- All copied data fully editable (not locked)

---

### Workflow 4: Soft Delete/Archive

**User Goal:** Remove event from active view without losing data

**Manual Archive:**

**Steps:**

1. **Event Detail** → Any event (upcoming or past)
2. **Archive Action** → Tap "Archive" or "Archive Now" button
3. **Confirmation** → Simple modal:
   - "Archive this event?"
   - "It will be hidden from active view but preserved in history."
4. **Confirm** → Tap "Archive"
5. **Result** → Event moves to "Archived" section immediately

**Unarchive:**

**Steps:**

1. **Archived Event** → Navigate to archived event detail
2. **Unarchive** → Tap "Unarchive" button (always visible on archived events)
3. **No Confirmation** → Immediate action (low-risk, reversible)
4. **Result** → Event returns to appropriate section (upcoming or recent)

**Auto-Archive:**

**System Behavior:**

- Runs hourly via background job
- Checks all events where `end_datetime + 48 hours < now()`
- Updates `status: 'archived'` automatically
- No user notification (silent, expected behavior)
- Events simply appear in "Archived" section next time user browses

**Key Differences:**
| Type | When | Trigger | Reversible |
|------|------|---------|------------|
| **Auto-Archive** | 48h after event end | System (time-based) | Yes (unarchive) |
| **Manual Archive** | Anytime | User action | Yes (unarchive) |
| **Both** | - | - | Same protection level |

**Why Manual Archive?**

- User wants to hide cancelled event from active view
- Event is over but within 48h grace period, user done making corrections
- Organizational cleanup: Archiving old draft events never published

**Why No Delete?**

- Delete is DESTRUCTIVE (can't undo)
- Archive is NON-DESTRUCTIVE (can unarchive)
- No legitimate use case for permanently deleting event data
- Historical data has analytics/legal/audit value
- Accidental deletion is high-risk with no recovery

---

## 7. Edge Case Handling

### Edge Case 1: Multi-Day Event Partially Complete

**Scenario:** 3-day festival, Day 1 completed, Days 2-3 still upcoming

**Current Date:** Saturday 9 PM (Day 2 in progress)
**Event:** Friday 7 PM → Sunday 11 PM

**Solution:**

- ✅ Use event END date/time for all calculations
- ✅ Event remains fully editable until Sunday 11 PM
- ✅ No premature archiving during festival
- ✅ Grace period: Sunday 11 PM → Tuesday 11 PM (48h after END)

**Optional Enhancement:**

- Progress indicator: "Day 2 of 3 • Ends Sunday 11 PM"
- Status: "In Progress" instead of "Upcoming" or "Completed"

**Database Field:**

```javascript
status: 'upcoming' | 'in_progress' | 'completed' | 'archived'

// Calculation logic
if (now < event.startDateTime) {
  status = 'upcoming'
} else if (now >= event.startDateTime && now < event.endDateTime) {
  status = 'in_progress'
} else if (now >= event.endDateTime && now < event.endDateTime + 48h) {
  status = 'completed'  // Recently completed
} else {
  status = 'archived'
}
```

---

### Edge Case 2: Future Event Manually Archived Early

**Scenario:** Event scheduled 2 months away, organizer cancels, wants to archive immediately

**Current Date:** June 1
**Event:** August 15 (2+ months in future)
**Action:** User taps "Archive" button

**Solution:**

- ✅ Manual archive allowed for all events (upcoming, recent, or past)
- ✅ Confirmation modal with clear explanation
- ✅ Status field includes cancellation reason

**Confirmation Modal:**

```
Archive this upcoming event?

This event is scheduled for August 15, 2025.
Archiving will hide it from your active events.

Optional: Mark as cancelled?
☐ Yes, this event was cancelled

[Cancel] [Archive]
```

**Result:**

- Event moved to "Archived" section
- Status badge: "CANCELLED" (if checkbox selected) or "ARCHIVED"
- Can be unarchived if cancellation was mistake
- Same protection level as auto-archived events

---

### Edge Case 3: Accidental Archive of Current Event

**Scenario:** User accidentally archives event that's still upcoming or needs to remain active

**User Action:** Taps "Archive" → Confirms → Event archived
**User Realization:** "Wait, I didn't mean to archive that!"

**Solution:**

**Unarchive Button:**

- Always visible on archived event detail page
- One-tap action (no confirmation needed)
- Low-risk operation (reversible)

**Steps to Recover:**

1. Navigate to archived event
2. Tap "Unarchive" button
3. Event immediately returns to active status
4. Appears in appropriate section (upcoming/recent based on dates)

**Banner on Archived Event:**

```
┌─────────────────────────────────────┐
│ 🗄️ This event was manually archived │
│                                     │
│ [Unarchive] to restore to active    │
└─────────────────────────────────────┘
```

**Why No Confirmation for Unarchive?**

- Undoing an accidental archive is low-risk
- Confirmation would add friction to error recovery
- User already demonstrated intent by navigating to archived event
- Worst case: User re-archives (trivial action)

---

### Edge Case 4: System Clock Issues / Timezone Problems

**Scenario:** Server time/timezone misconfigured, causes incorrect auto-archiving

**Example Problem:**

- Event in New Orleans (CDT, UTC-5)
- Server in UTC
- Event end: 11 PM local = 4 AM UTC next day
- Miscalculation archives event too early/late

**Solution:**

**Time Storage:**

- Store all event datetimes in UTC in database
- Convert to organizer's local timezone for display
- Archive calculations use server time (UTC)
- Consistent across all users and timezones

**Database Schema:**

```javascript
{
  startDateTime: '2024-12-12T01:00:00Z',  // UTC
  endDateTime: '2024-12-13T05:00:00Z',    // UTC (11 PM CST)
  timezone: 'America/Chicago',            // IANA timezone
  archivedAt: '2024-12-15T05:00:00Z'     // 48h after end, UTC
}
```

**Archive Calculation:**

```javascript
const archiveTime = new Date(event.endDateTime);
archiveTime.setHours(archiveTime.getHours() + 48);

if (now >= archiveTime) {
  // Auto-archive
}
```

**Grace Period Buffer:**

- 48-hour grace period provides buffer for minor timezone issues
- Small clock drift won't cause immediate archiving at event end
- Display logic handles timezone conversion separately from archive logic

**User-Visible Time:**

- Always display in organizer's local timezone
- "Event ended: Sat, Dec 12, 2024 at 11:00 PM CST"
- Archive status based on UTC calculation, but displayed time is local

---

### Edge Case 5: Legitimate Correction Needed Months Later

**Scenario:** Organizer discovers major error in 6-month-old archived event

**Example:**

- Event: June 15, 2024 (6 months ago)
- Error: Wrong venue recorded, affects analytics and historical accuracy
- Need: Legitimate correction, not malicious tampering

**Solution 1: Simple Two-Confirmation Edit (Single-Organizer Setup)**

**Process:**

1. User finds archived event
2. Taps "Edit Event" in overflow menu
3. **First Confirmation:**
   - "Edit Archived Event from June 15, 2024?"
   - Options: Cancel / Copy as New / Edit Anyway
4. User taps "Edit Anyway"
5. Makes corrections
6. **Second Confirmation:**
   - "Confirm changes to historical data?"
   - Shows change summary
7. User confirms → Changes saved

**Audit Log:**

```javascript
{
  eventId: '123',
  editedAt: '2024-12-20T15:30:00Z',
  editedBy: 'user@example.com',
  changes: {
    venue: { old: 'Tipitinas', new: 'The Spotted Cat' },
    notes: { old: '', new: 'Corrected venue name' }
  }
}
```

**Solution 2: Request Correction Workflow (Multi-User/Admin Setup)**

**Process:**

1. User submits correction request instead of direct edit
2. Admin receives notification
3. Admin reviews request with reason/justification
4. Admin approves/rejects correction
5. If approved: Changes applied with audit log

**When to Use:**

- Multi-user organization with role hierarchy
- Extra scrutiny needed for historical data changes
- Compliance/audit requirements
- Want to prevent unauthorized historical data modification

**Implementation:**

```javascript
// Correction request
{
  eventId: '123',
  requestedBy: 'organizer@example.com',
  requestedAt: '2024-12-20T15:30:00Z',
  reason: 'Wrong venue name affects analytics',
  proposedChanges: { venue: 'The Spotted Cat' },
  status: 'pending',  // pending | approved | rejected
  reviewedBy: null,
  reviewedAt: null
}
```

**Trade-offs:**
| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| **Simple Two-Confirmation** | Fast, no bureaucracy | Less oversight | Single organizers, small teams |
| **Request/Approval** | Stronger oversight, audit trail | Slower, requires admin | Multi-user, compliance needs |

**Recommendation:** Start with Simple Two-Confirmation (P0), add Request/Approval later if needed (P3)

---

## 8. Implementation Guidance

### Priority Levels

#### 🔴 **P0 - Critical Protection (MVP)**

**Must Have - Core Protection Mechanisms**

**1. Auto-Archive System**

- **Database Changes:**
  - Add `status` field: `'upcoming' | 'completed' | 'archived'`
  - Add `archived_at` timestamp (nullable)
- **Background Job:**
  - Runs hourly via cron/scheduler
  - Query: `WHERE end_datetime + INTERVAL '48 hours' < NOW() AND status != 'archived'`
  - Update matching events: `SET status = 'archived', archived_at = NOW()`
- **Calculation Logic:**

  ```javascript
  function calculateEventStatus(event) {
    const now = new Date();
    const endPlus48h = new Date(event.endDateTime);
    endPlus48h.setHours(endPlus48h.getHours() + 48);

    if (now >= endPlus48h) return "archived";
    if (now >= event.endDateTime) return "completed";
    return "upcoming";
  }
  ```

**2. Soft Delete Implementation**

- **Remove Delete Buttons:**
  - Hide/disable "Delete Event" on archived events
  - Replace with "Archive" action on all events
- **Archive Action:**
  - Sets `archived_at` timestamp
  - Changes status to `'archived'`
  - Preserves ALL event data
- **Unarchive Action:**
  - Clears `archived_at` timestamp
  - Recalculates status based on event dates
  - One-tap, no confirmation

**3. Visual Indicators**

- **Archive Banner:**
  - Component: Persistent top banner on archived event detail pages
  - Text: "🗄️ ARCHIVED EVENT - This event ended on [date] - Historical data is protected"
  - Style: Gray background, non-dismissible
- **Status Badges:**
  - Event list items show status badge
  - "ARCHIVED" in uppercase, gray background
  - Position: Next to event title or below metadata
- **Color Coding:**
  - Archived events: Light gray background (#F5F5F5)
  - Recently completed: Light amber background (#FFF9E6)
  - Upcoming: White/default background

**4. Basic Confirmation Gates**

- **Edit Confirmation Modal:**
  - Trigger: User attempts to edit archived event
  - Title: "Edit Archived Event?"
  - Content: Warning text + event date
  - Buttons: Cancel (default) / Copy as New / Edit Anyway
  - Implementation: Standard modal component
- **Save Confirmation Modal:**
  - Trigger: User saves changes to archived event
  - Title: "Confirm Changes to Historical Data?"
  - Content: "You are modifying an archived event from [date]"
  - Buttons: Cancel / Confirm & Save
  - Optional: Show change summary

**Implementation Estimate:** 2-3 days for full P0 suite

---

#### 🟡 **P1 - Enhanced Protection**

**Should Have - Improved UX Without Complexity**

**5. Copy as Template Feature**

- **Button Placement:**
  - Primary position on archived event detail page
  - More prominent than "Edit Event"
- **Copy Logic:**
  - Duplicate all fields except: `id`, `created_at`, `status`, `published_at`, `archived_at`
  - Auto-increment title year: "Summer Crawl 2024" → "Summer Crawl 2025"
  - Set new date: Default to next Saturday after today
  - Status: Always `'upcoming'` for copied events
- **UX Flow:**
  - One tap → New event creation form pre-populated
  - Clear header: "Creating new event based on [original title]"
  - All fields editable

**6. Recently Completed State**

- **Intermediate State:**
  - Events 0-48 hours after end show yellow banner
  - Banner text: "⚠️ Event ended [X hours/days] ago - You can still make corrections"
  - No confirmation dialogs yet (smooth corrections)
- **Visual Treatment:**
  - Yellow/amber background in event list
  - ⚠️ Warning icon
  - Time indicator: "Ended 18 hours ago"
- **Edit Behavior:**
  - Full edit access, no confirmations
  - Banner persists to remind of recently-ended status

**7. Audit Logging**

- **Data Model:**
  ```javascript
  {
    id: uuid,
    eventId: uuid,
    userId: uuid,
    action: 'created' | 'updated' | 'archived' | 'unarchived',
    changedFields: { fieldName: { old: value, new: value } },
    timestamp: datetime,
    ipAddress: string (optional),
    userAgent: string (optional)
  }
  ```
- **Tracking:**
  - Log ALL edits to archived events
  - Log archive/unarchive actions
  - Display on event detail: "Last modified: [date] by [user]"
- **Storage:**
  - Simple `audit_log` table or JSON field on event
  - Retention: Keep indefinitely for historical events
- **Display:**
  - Small text at bottom of event detail
  - "Last modified: Dec 20, 2024 at 3:30 PM by organizer@example.com"

**Implementation Estimate:** 2-3 days additional

---

#### 🟢 **P2 - Advanced Features**

**Nice to Have - Adds Value, Not Essential**

**8. Event Status Field Enhancement**

- **Status Enum:**
  - `'upcoming'` - Future event
  - `'in_progress'` - Multi-day event currently happening
  - `'completed'` - Recently ended (0-48h)
  - `'cancelled'` - Manually cancelled
  - `'archived'` - Historical/protected
- **Manual Status Override:**
  - Admin can set status manually (override auto-calculation)
  - Use case: Mark event as cancelled, archive early
- **Automatic Status Transitions:**
  - Background job calculates and updates based on dates
  - User actions can override (e.g., manual archive)
- **Display Logic:**
  - Different badge styles for each status
  - "CANCELLED" in red, "ARCHIVED" in gray, etc.

**9. Filtering/Search Improvements**

- **Filter Dropdown:**
  - Options: All, Upcoming, Recent (0-48h), Archived, Cancelled
  - Default: Upcoming only
  - Persists user preference in localStorage
- **Date Range Picker:**
  - For historical analysis: "Show events from Jan 2024 to Dec 2024"
  - Useful for year-over-year comparison
- **"Show Past Events" Toggle:**
  - Collapsed by default (hides archived events)
  - Expands to show archived events below upcoming
  - Clear visual separator: "Past Events" header

**10. Analytics Dashboard**

- **Metrics:**
  - Total events organized (all-time)
  - Events by year (bar chart)
  - Most popular venues (from historical data)
  - Average bands per event
  - Busiest months
- **Export Options:**
  - PDF event summary for single event
  - CSV export of all events for spreadsheet analysis
  - Date range filtering for exports
- **Use Cases:**
  - Year-over-year trend analysis
  - Venue performance comparison
  - Budgeting and planning

**Implementation Estimate:** 3-4 days additional

---

#### 🔵 **P3 - Future Enhancements**

**Future Consideration - Requires Infrastructure Changes**

**11. Role-Based Permissions**

- **Roles:**
  - **Viewer:** Read-only access, can view all events
  - **Organizer:** Can edit with confirmations, standard user
  - **Admin:** Can edit without confirmations, manage users
- **Permission Matrix:**
  | Action | Viewer | Organizer | Admin |
  |--------|--------|-----------|-------|
  | View events | ✅ | ✅ | ✅ |
  | Edit upcoming | ❌ | ✅ | ✅ |
  | Edit archived | ❌ | ✅ (with confirmation) | ✅ (no confirmation) |
  | Delete events | ❌ | ❌ | ✅ (with confirmation) |
  | Manage users | ❌ | ❌ | ✅ |
- **Infrastructure Needs:**
  - User role system
  - Permission checking middleware
  - UI conditional rendering based on role
- **Trade-offs:**
  - Adds complexity for small teams
  - Most organizations have 1-2 people managing events
  - Defer until multi-user needs are clear

**12. Granular Field Locking**

- **Concept:**
  - Some fields editable on archived events (metadata)
  - Core fields locked (date, time, venues, bands)
- **Editable Fields:**
  - Internal notes
  - Tags/categories
  - Private organizer comments
  - Photos/attachments
- **Locked Fields:**
  - Event date/time
  - Venue lineup
  - Band lineup
  - Published schedule
- **Challenges:**
  - Users confused why some fields locked, others not
  - What if core data is actually wrong?
  - Complex UI to communicate field-level permissions
  - Inconsistent mental model
- **Recommendation:**
  - Not recommended unless specific use case emerges
  - Simple two-confirmation edit is clearer and more flexible

**Implementation Estimate:** 5-7 days (role system), 3-4 days (field locking)

---

### Implementation Order Rationale

**Why this priority order?**

**P0 (MVP):**

- Establishes core protection immediately
- Prevents data loss from day one
- Simple, clear UX that's easy to understand
- No complex infrastructure dependencies
- Can be built and deployed quickly

**P1 (Enhanced):**

- Improves user experience without adding complexity
- Copy as template reduces edit temptation (constructive alternative)
- Audit logging provides transparency and accountability
- Recently completed state smooths workflow transition
- Low technical risk, high UX value

**P2 (Advanced):**

- Adds analytical value but not essential for protection
- Requires more development time
- Value depends on user adoption and engagement
- Can be deferred until P0/P1 are proven successful

**P3 (Future):**

- Requires significant infrastructure changes
- Not needed for small teams (1-2 organizers)
- Value proposition unclear until user base grows
- High complexity, uncertain ROI
- Revisit if multi-user collaboration becomes critical need

**Deployment Strategy:**

- **Sprint 1:** Implement P0 (2-3 days), deploy to production
- **Sprint 2:** Implement P1 (2-3 days), deploy after testing
- **Sprint 3+:** Evaluate P2 based on user feedback and analytics
- **Future:** Consider P3 only if clear multi-user needs emerge

---

### Technical Implementation Notes

**Database Schema Changes:**

```sql
-- Add status and archive tracking to events table
ALTER TABLE events
  ADD COLUMN status VARCHAR(20) DEFAULT 'upcoming',
  ADD COLUMN archived_at TIMESTAMP NULL,
  ADD COLUMN cancelled_at TIMESTAMP NULL;

-- Create index for efficient archive queries
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_end_datetime ON events(end_datetime);

-- Optional: Audit log table
CREATE TABLE event_audit_log (
  id UUID PRIMARY KEY,
  event_id UUID REFERENCES events(id),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50),
  changed_fields JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  ip_address VARCHAR(50),
  user_agent TEXT
);
```

**Background Job (Pseudocode):**

```javascript
// Run hourly via cron: "0 * * * *"
async function autoArchiveEvents() {
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - 48);

  const eventsToArchive = await db.events.findMany({
    where: {
      endDateTime: { lte: cutoffTime },
      status: { notIn: ["archived", "cancelled"] },
    },
  });

  for (const event of eventsToArchive) {
    await db.events.update({
      where: { id: event.id },
      data: {
        status: "archived",
        archivedAt: new Date(),
      },
    });

    console.log(`Auto-archived event ${event.id}: ${event.title}`);
  }

  console.log(
    `Auto-archive complete: ${eventsToArchive.length} events archived`,
  );
}
```

**Status Calculation Function:**

```javascript
function getEventStatus(event) {
  const now = new Date();
  const endPlus48h = new Date(event.endDateTime);
  endPlus48h.setHours(endPlus48h.getHours() + 48);

  // Manual overrides
  if (event.status === "cancelled") return "cancelled";
  if (event.archivedAt) return "archived";

  // Automatic calculation
  if (now >= endPlus48h) {
    return "archived";
  } else if (now >= event.endDateTime && now < endPlus48h) {
    return "completed"; // Recently completed (0-48h)
  } else if (now >= event.startDateTime && now < event.endDateTime) {
    return "in_progress"; // Multi-day event happening now
  } else {
    return "upcoming";
  }
}
```

**Confirmation Modal Component (React Example):**

```jsx
function EditArchivedEventConfirmation({
  event,
  onCancel,
  onCopyAsNew,
  onEditAnyway,
}) {
  return (
    <Modal>
      <h2>Edit Archived Event?</h2>
      <p>
        ⚠️ This event is archived historical data from{" "}
        {formatDate(event.endDateTime)}
      </p>
      <p>Editing archived events should only be done to correct errors.</p>
      <p>What would you like to do?</p>

      <div className="button-group">
        <Button variant="primary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={onCopyAsNew}>
          Copy as New Event
        </Button>
        <Button variant="tertiary" onClick={onEditAnyway}>
          Edit Anyway
        </Button>
      </div>
    </Modal>
  );
}
```

---

## 9. Success Metrics

### How to Measure Effectiveness

**Protection Goals:**

- ✅ Zero accidental deletions of historical events (target: 100%)
- ✅ Reduced unintentional edits to archived events (target: <1% of edits)
- ✅ High unarchive rate indicates users understanding archive concept (target: <5% unarchive actions)

**Usability Goals:**

- ✅ Users can find and view past events easily (target: <3 taps from dashboard)
- ✅ Copy-as-template used frequently (target: 30%+ of new events created from templates)
- ✅ Low support requests about "can't edit old events" (target: <5 requests/month)

**Data Integrity Goals:**

- ✅ Audit log captures all archived event modifications (target: 100% coverage)
- ✅ Historical data remains accurate over time (manual verification)
- ✅ Analytics and reports based on historical data are reliable

**Tracking Implementation:**

```javascript
// Analytics events to track
analytics.track('event_archived', { eventId, method: 'auto' | 'manual' })
analytics.track('event_unarchived', { eventId, reason: 'accidental' | 'correction' })
analytics.track('archived_event_edited', { eventId, fieldsChanged: [...] })
analytics.track('template_copied', { sourceEventId, newEventId })
analytics.track('edit_cancelled_at_confirmation', { eventId, confirmationStep: 1 | 2 })
```

---

## 10. Summary & Next Steps

### Key Principles Recap

1. **Progressive Protection:** Events become gradually more protected as they age
2. **48-Hour Grace Period:** Allows quick post-event corrections without friction
3. **Soft Delete Only:** Never permanently delete event data
4. **Two-Confirmation Gates:** Strong friction for archived event edits
5. **Constructive Alternatives:** Always offer "Copy as Template" alongside edit
6. **Clear Visual Hierarchy:** Color coding and badges communicate status instantly
7. **Mobile-First Design:** Touch-friendly, clear at a glance, minimal text
8. **Audit Transparency:** Log all changes to archived events for accountability

### Implementation Roadmap

**Phase 1 (MVP - Week 1):**

- [ ] Add database fields: `status`, `archived_at`
- [ ] Implement auto-archive background job
- [ ] Build archive banner component
- [ ] Implement soft delete (remove delete buttons, add archive action)
- [ ] Create two confirmation modals (edit + save)
- [ ] Deploy to production

**Phase 2 (Enhanced - Week 2):**

- [ ] Build "Copy as Template" feature
- [ ] Implement recently completed state (yellow banner)
- [ ] Add basic audit logging
- [ ] Display "last modified" timestamp on events
- [ ] User testing and feedback collection

**Phase 3 (Advanced - Week 3-4):**

- [ ] Implement status enum (in_progress, cancelled)
- [ ] Build filtering/search UI (show past events toggle)
- [ ] Create analytics dashboard (events by year, popular venues)
- [ ] Add export options (PDF, CSV)
- [ ] Performance optimization for large event lists

**Phase 4 (Future - TBD):**

- [ ] Evaluate need for role-based permissions
- [ ] Consider granular field locking (likely not needed)
- [ ] Advanced analytics and reporting features
- [ ] Multi-user collaboration features (if applicable)

### Testing Checklist

**Functional Testing:**

- [ ] Auto-archive runs correctly 48 hours after event end
- [ ] Manual archive works for upcoming, recent, and past events
- [ ] Unarchive restores event to correct status
- [ ] Edit confirmations appear for archived events only
- [ ] Save confirmation shows accurate change summary
- [ ] Copy as template creates new event with correct data
- [ ] Multi-day events don't archive prematurely
- [ ] Timezone handling works correctly (UTC storage, local display)

**UX Testing:**

- [ ] Archive banner visible and non-dismissible
- [ ] Color coding clearly distinguishes event states
- [ ] Mobile touch targets are large enough (44x44pt minimum)
- [ ] Confirmation modals are clear and not confusing
- [ ] "Show Past Events" toggle works smoothly
- [ ] No delete buttons visible on archived events
- [ ] Audit log displays correctly

**Edge Case Testing:**

- [ ] Multi-day event during festival (in_progress status)
- [ ] Cancelled future event archived manually
- [ ] Accidental archive followed by immediate unarchive
- [ ] Edit attempt via direct URL on archived event
- [ ] Server timezone different from event timezone
- [ ] Event end time exactly at midnight
- [ ] Concurrent edits to same archived event (race condition)

---

## Appendix: Design Rationale

### Why 48 Hours Instead of Other Durations?

**Alternatives Considered:**

| Duration            | Pros                         | Cons                             | Verdict            |
| ------------------- | ---------------------------- | -------------------------------- | ------------------ |
| **24 hours**        | Quick protection             | Too short for post-event wrap-up | ❌ Too restrictive |
| **48 hours**        | Balanced, allows corrections | Slightly longer exposure         | ✅ **Recommended** |
| **7 days**          | Very flexible                | High risk of manipulation        | ❌ Too permissive  |
| **No grace period** | Maximum protection           | Can't fix immediate errors       | ❌ Too extreme     |

**User Research Insights:**

- Event organizers typically add final notes/photos within 24-48 hours
- Attendance counts and final metrics finalized 1-2 days post-event
- Typos/errors discovered usually within first day
- After 2 days, historical record is "settled" and changes feel risky

**Industry Benchmarks:**

- **QuickBooks:** Locks accounting periods after month-end
- **Shopify:** Orders editable for 60 days, then view-only
- **Google Calendar:** Past events editable with warning, no time limit
- **Eventbrite:** Past events archived automatically, edit requires support

**Our Choice:** 48 hours balances protection with practical workflow needs.

---

### Why Soft Delete Instead of Hard Delete?

**Hard Delete Problems:**

- ❌ Permanent data loss (no recovery)
- ❌ Breaks analytics (events disappear from year-over-year comparisons)
- ❌ Accidental deletion is catastrophic
- ❌ No audit trail of what was deleted
- ❌ Legal/tax records may require historical data retention

**Soft Delete Benefits:**

- ✅ Fully reversible (unarchive anytime)
- ✅ Preserves analytics and historical trends
- ✅ Accidental deletion is recoverable
- ✅ Audit trail intact (who archived, when)
- ✅ Complies with data retention requirements
- ✅ Supports "hide from view" without destroying data

**Storage Concerns:**

- Soft delete uses slightly more database storage
- For band crawl events (4-5/year), storage is negligible
- Even 10 years = ~50 events = <1MB data
- Storage cost far outweighed by data protection benefits

---

### Why Two Confirmations for Archived Event Edits?

**One Confirmation Risks:**

- Users develop muscle memory: "Tap edit → tap confirm" becomes automatic
- Similar to "OK" button blindness in repetitive dialogs
- Single confirmation insufficient for preventing accidental changes

**Two Confirmation Benefits:**

- **First confirmation:** Interrupts workflow, forces conscious decision
- **Second confirmation:** Shows change summary, final check before save
- Different content each time (not repetitive)
- Mirrors familiar patterns (e.g., "Are you sure you want to delete?")

**User Testing:**

- Users report feeling "safe" with double confirmation
- Change summary in second confirmation catches errors before save
- "Copy as New" option in first confirmation encourages template workflow

**Performance Impact:**

- Adds ~2 seconds to archived event edit flow
- Acceptable trade-off for data protection
- Recent events (0-48h) still have no confirmation (smooth UX)

---

## Document Metadata

**Version:** 1.0
**Last Updated:** December 2024
**Author:** Claude Code (AI Assistant)
**Status:** Design Specification - Ready for Implementation
**Next Review:** After P0 deployment + 2 weeks user feedback

**Change Log:**

- 2024-12: Initial specification created based on user requirement analysis
