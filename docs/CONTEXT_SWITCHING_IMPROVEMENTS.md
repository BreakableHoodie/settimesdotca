# Admin Panel Context Switching Improvements

**Created:** 2025-10-26
**Status:** Analysis & Recommendations
**Priority:** Medium-High (UX improvement for non-technical users)

---

## Current State: What Exists

### ✅ Implemented Features

**1. Event Filter Dropdown** (`AdminPanel.jsx` lines 116-146)
- Located in header, always visible
- Shows "All Venues/Bands (Global View)" when no event selected
- Lists all events with publish status
- Has "Clear Filter" button when event is selected

**2. Tab Navigation**
- Events, Venues, Bands tabs
- Bottom navigation for mobile (recently added)

**3. Event Detail View** (`EventsTab.jsx`)
- When event selected, shows detailed event info page
- Displays performances grouped by venue
- Shows event stats, duration, publish status
- Provides actions: Edit, Metrics, Embed Code

**4. Cross-Tab Filters** (`AdminPanel.jsx` lines 48-70)
- Custom event listeners for `filterVenue` and `filterBand`
- Uses sessionStorage to persist filter state
- Switches tabs when clicking venue/band from event detail

---

## Issues & Limitations

### 🔴 Critical UX Issues

**1. No Visual Distinction Between Contexts**
- **Problem:** Global view and event-filtered view look nearly identical
- **Impact:** Users get lost, don't know if they're viewing all data or filtered data
- **Example:** In Bands tab, there's no clear indicator that you're viewing only bands from "Long Weekend Vol. 4"

**2. Hidden "Back to Global" Path**
- **Problem:** "Clear Filter" button is small and not prominent
- **Impact:** Users get stuck in event context, don't know how to return to global view
- **User Quote:** "needs better context switching (eg. global to event, event to global)"

**3. Inconsistent Event Context in EventsTab**
- **Problem:** EventsTab shows event detail when filtered, but other tabs don't adapt their layout
- **Impact:** Confusing UX - some tabs react to filter, others just quietly filter data
- **Expected:** All tabs should visually acknowledge the event filter

**4. No Breadcrumb Navigation**
- **Problem:** No visual hierarchy showing: `Global > Event Name > Tab Name`
- **Impact:** Users lose orientation, especially on mobile
- **Common in:** Modern admin panels (WordPress, Shopify, etc.)

### 🟡 Important UX Issues

**5. Event Filter Persistence Issues**
- **Problem:** When switching between tabs, the event filter persists but isn't visually reinforced
- **Impact:** User forgets which event they're viewing
- **Example:** Filter by "Vol. 4" → go to Bands → switch to Venues → which event am I viewing?

**6. No "Jump to Event Detail" Shortcut**
- **Problem:** Must go to Events tab → click event to see detail
- **Impact:** Inefficient workflow for managing specific events
- **Desired:** Quick action to jump to event detail from filtered view

**7. Ambiguous Filter Label**
- **Problem:** Label says "Filter:" but it's actually "Event Context Selector"
- **Impact:** Doesn't convey the significance of the selection
- **Better:** "Working on:" or "Event:" to show it's the active context

### 🟢 Nice-to-Have Improvements

**8. No Bulk Actions in Global View**
- **Problem:** Can't perform actions across multiple events simultaneously
- **Example:** "Publish all draft events" or "Delete all old events"

**9. No Event Quick Actions in Header**
- **Problem:** Common actions (Publish, Edit, Metrics) require navigating to Events tab
- **Desired:** Quick actions in header when event is selected

**10. No Visual Event Summary in Header**
- **Problem:** Only shows event name, not key stats
- **Desired:** Show band count, publish status, date in compact format

---

## Recommended Improvements

### Phase 1: Visual Clarity (High Priority - 1 day)

**1.1 Add Context Banner**
```jsx
{selectedEventId && (
  <div className="bg-band-orange/20 border-l-4 border-band-orange px-4 py-2 mb-4">
    <div className="flex items-center justify-between">
      <div>
        <span className="text-white/70 text-sm">Working on event:</span>
        <span className="text-band-orange font-bold ml-2">{selectedEvent.name}</span>
        <span className="text-white/50 text-sm ml-2">
          ({selectedEvent.band_count} performers, {selectedEvent.date})
        </span>
      </div>
      <button
        onClick={() => setSelectedEventId(null)}
        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded"
      >
        ← Back to All Events
      </button>
    </div>
  </div>
)}
```

**1.2 Visual Tab Badges**
- Add badge to tabs showing filtered count
- Example: "Performers (12)" when filtered, "Performers (all)" in global view

**1.3 Header Label Update**
- Change "Filter:" to "Event Context:"
- Make it more prominent (larger font, different color)

### Phase 2: Navigation Patterns (Medium Priority - 1 day)

**2.1 Breadcrumb Navigation**
```jsx
<nav className="flex items-center gap-2 text-sm text-white/70 mb-4">
  <button
    onClick={() => setSelectedEventId(null)}
    className="hover:text-band-orange transition-colors"
  >
    All Events
  </button>
  {selectedEvent && (
    <>
      <span>›</span>
      <span className="text-band-orange font-semibold">{selectedEvent.name}</span>
    </>
  )}
  {activeTab !== 'events' && (
    <>
      <span>›</span>
      <span className="text-white">{tabs.find(t => t.id === activeTab).label}</span>
    </>
  )}
</nav>
```

**2.2 Quick Event Actions in Header**
```jsx
{selectedEventId && (
  <div className="flex gap-2">
    <button onClick={() => handlePublishToggle()}>
      {selectedEvent.is_published ? 'Unpublish' : 'Publish'}
    </button>
    <button onClick={() => setShowMetrics(selectedEvent)}>Metrics</button>
    <button onClick={() => setShowEmbedCode(selectedEvent)}>Embed</button>
  </div>
)}
```

**2.3 Event Detail Quick Access**
- Add "View Event Detail" button in header when event selected
- Keyboard shortcut: `Ctrl/Cmd + E` to jump to event detail

### Phase 3: Enhanced Context (Lower Priority - 0.5 days)

**3.1 Tab Content Adaptation**
- BandsTab: Show "Showing X performers for {Event Name}" header
- VenuesTab: Show "Showing X venues for {Event Name}" header
- Different empty states for global vs. filtered

**3.2 Persistent Filter Indicators**
- Small pill badges in tab bar: "Events (5)" vs "Events (2 filtered)"
- Color-coded: orange for filtered, white for global

**3.3 Smart Default Behavior**
- Remember last-used event filter in localStorage
- Option to "Always start in global view" vs "Remember last event"

---

## Implementation Priority

### 🔴 Must Fix (Before Mobile Optimization)
1. **Context Banner** (Phase 1.1) - 2 hours
   - Makes filtered state immediately obvious
   - Provides clear "Back to Global" button
   - Highest user value

2. **Breadcrumb Navigation** (Phase 2.1) - 2 hours
   - Standard pattern users expect
   - Helps orientation on mobile
   - Easy to implement

### 🟡 Should Fix (During Mobile Optimization)
3. **Visual Tab Badges** (Phase 1.2) - 1 hour
4. **Header Label Update** (Phase 1.3) - 30 minutes
5. **Tab Content Adaptation** (Phase 3.1) - 2 hours

### 🟢 Nice to Have (Future Iteration)
6. **Quick Event Actions** (Phase 2.2) - 2 hours
7. **Event Detail Quick Access** (Phase 2.3) - 1 hour
8. **Persistent Filter Indicators** (Phase 3.2) - 1 hour
9. **Smart Default Behavior** (Phase 3.3) - 1 hour

---

## User Flow Examples

### Current Flow (Confusing)
1. User selects "Long Weekend Vol. 4" from dropdown
2. Goes to Bands tab
3. Sees list of bands (doesn't know if filtered or all)
4. Switches to Venues tab
5. Sees list of venues (forgets which event they're viewing)
6. Wants to go back to global view → where's the button?

### Improved Flow (Clear)
1. User selects "Long Weekend Vol. 4" from dropdown
2. **Orange context banner appears:** "Working on event: Long Weekend Vol. 4 (24 performers, Feb 15, 2025) [Back to All Events]"
3. **Breadcrumb shows:** "All Events › Long Weekend Vol. 4"
4. Goes to Bands tab
5. **Tab shows:** "Performers (24)" with "Showing 24 performers for Long Weekend Vol. 4" header
6. Switches to Venues tab
7. **Tab shows:** "Venues (4)" with "Showing 4 venues for Long Weekend Vol. 4" header
8. **Context banner still visible** with clear "Back to All Events" button
9. Clicks "Back to All Events" → returns to global view with visual confirmation

---

## Code Changes Required

### Files to Modify

**1. `AdminPanel.jsx`**
- Add context banner component
- Add breadcrumb navigation
- Update event selector label
- Add quick actions section
- Enhance "Clear Filter" button prominence

**2. `BandsTab.jsx`**
- Add filtered view header
- Add badge to tab count
- Update empty state messages

**3. `VenuesTab.jsx`**
- Add filtered view header
- Add badge to tab count
- Update empty state messages

**4. `EventsTab.jsx`**
- Update breadcrumb when in event detail
- Add "Back to Events List" button in event detail

### New Components Needed

**1. `ContextBanner.jsx`**
```jsx
export default function ContextBanner({ event, onClear }) {
  if (!event) return null

  return (
    <div className="bg-band-orange/20 border-l-4 border-band-orange px-4 py-3 mb-4 rounded-r">
      {/* Event context info + Back button */}
    </div>
  )
}
```

**2. `Breadcrumbs.jsx`**
```jsx
export default function Breadcrumbs({ items }) {
  return (
    <nav className="flex items-center gap-2 text-sm mb-4">
      {/* Breadcrumb trail */}
    </nav>
  )
}
```

---

## Testing Checklist

### Desktop Testing
- [ ] Context banner appears when event selected
- [ ] Context banner hides when "Back to All Events" clicked
- [ ] Breadcrumbs update when switching tabs
- [ ] Tab badges show correct counts (filtered vs global)
- [ ] Quick actions work in header
- [ ] Keyboard shortcuts function correctly

### Mobile Testing
- [ ] Context banner responsive on small screens
- [ ] Bottom nav integrates with context switching
- [ ] "Back" button touch-friendly (≥44px)
- [ ] Breadcrumbs collapse gracefully on mobile
- [ ] No horizontal scrolling on context banner

### User Testing
- [ ] Non-technical user can switch between global and event context
- [ ] User can find "Back to Global" easily
- [ ] User understands when viewing filtered vs all data
- [ ] User can complete common workflows without confusion

---

## Estimated Effort

**Phase 1 (Critical):** 4-5 hours
**Phase 2 (Important):** 4-5 hours
**Phase 3 (Nice-to-Have):** 2-3 hours

**Total:** 10-13 hours (~1.5 days)

---

## Recommendation

**Option A: Fix Critical Issues Now (4-5 hours)**
- Implement Context Banner (Phase 1.1)
- Implement Breadcrumbs (Phase 2.1)
- Update Header Labels (Phase 1.3)
- Add to current sprint before mobile optimization

**Option B: Include in Mobile Optimization (10-13 hours)**
- Complete all Phase 1 + Phase 2 improvements
- Design for mobile-first from the start
- Better integrated with bottom nav and touch UI

**Option C: Separate Sprint After Mobile (10-13 hours)**
- Focus entirely on mobile optimization first
- Address context switching as standalone UX improvement
- Risk: Users struggle with navigation during mobile testing

---

## User Feedback Incorporated

> "the overall admin panel needs better context switching (eg. global to event, event to global). Some of that is in place but it needs more work and refinement."

**Current Status:**
- ✅ Basic mechanism exists (dropdown + filter button)
- ❌ Not visually clear or intuitive
- ❌ Missing standard navigation patterns (breadcrumbs)
- ❌ No context reinforcement across tabs

**This Spec Addresses:**
- Visual clarity through context banner
- Standard navigation patterns (breadcrumbs)
- Context reinforcement (badges, headers)
- Clear "escape hatch" back to global view

---

**Next Action:** User decision on prioritization (Option A, B, or C)

*For mobile optimization priority, see: `docs/CURSOR_TASK_MOBILE_OPTIMIZATION.md`*
*For project roadmap, see: `docs/PROJECT_STATUS_AND_ROADMAP.md`*
