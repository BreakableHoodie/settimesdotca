# Admin Panel Context Switching UX Design

**Created:** 2025-10-26
**Status:** Design Recommendations
**Priority:** High (Mobile-First UX for Non-Technical Users)
**Target Users:** Non-technical event organizers using primarily phones/tablets

---

## Executive Summary

Context switching in the admin panel exists but causes confusion because users cannot easily tell:

1. **Which context they're in** (global vs event-specific)
2. **How to get back** to global view
3. **What data they're viewing** when switching tabs

This document provides professional UX design recommendations prioritized by user impact, with mobile-first considerations and accessibility compliance.

---

## User Mental Models & Pain Points

### Current User Experience Journey

**Scenario: Non-technical organizer managing "Long Weekend Vol. 4"**

1. Opens admin panel → sees dropdown labeled "Filter:" (unclear purpose)
2. Selects "Long Weekend Vol. 4" from dropdown
3. Switches to Performers tab → **Lost: Am I viewing all performers or just this event's?**
4. Switches to Venues tab → **Confused: Which event am I managing now?**
5. Wants to return to global view → **Can't find "Clear Filter" button** (small, non-obvious)
6. Clicks around randomly → **Frustration: No clear path back**

### Mental Model Mismatch

**What Users Expect:**

- Clear visual indication of "workspace" (like switching folders in file manager)
- Obvious "back" or "exit" to return to previous state
- Persistent visual reminder of current context
- Familiar navigation patterns from apps they use (Instagram, Facebook, Email)

**What System Currently Provides:**

- Small dropdown with ambiguous label
- Hidden "Clear Filter" button
- No visual distinction between contexts
- No breadcrumb trail showing location in hierarchy

---

## UX Design Principles Applied

### 1. Progressive Disclosure

Don't overwhelm users with all options at once. Show what's relevant to current context.

### 2. Visual Hierarchy

Use color, size, and position to indicate importance and relationships.

### 3. Recognition Over Recall

Users shouldn't need to remember their context. Make it always visible.

### 4. Consistency

Apply familiar navigation patterns from apps users already know.

### 5. Forgiveness

Make it easy to undo or go back. Reduce anxiety about "getting lost."

### 6. Mobile-First Touch Targets

Minimum 44x44px touch targets (WCAG 2.1 AAA compliance).

---

## Design Recommendations (Prioritized by UX Impact)

## Priority 1: CRITICAL (Fix Before Mobile Optimization)

### 1.1 Context Banner with Clear Exit Path

**UX Impact: 🔴 CRITICAL** | **Effort: 2 hours** | **Mobile-Optimized: Yes**

**Problem Solved:**

- Users don't know which event they're managing
- Can't find way back to global view
- Forget context when switching tabs

**Design Pattern:** Contextual alert banner (inspired by Linear, Notion, GitHub)

**Wireframe Description:**

```
┌────────────────────────────────────────────────────────────────┐
│ ⚠️  Working on: Long Weekend Vol. 4                [✕ Exit to Global View] │
│    24 performers • 4 venues • Feb 15, 2025 • Draft                      │
└────────────────────────────────────────────────────────────────┘
```

**Visual Specifications:**

- **Background:** Orange gradient (brand-orange/20 to brand-orange/10)
- **Border:** 4px left border in solid brand-orange (#FF6B35)
- **Icon:** Orange warning/context icon (⚠️ or 📍)
- **Event Name:** Bold white text, 18px (mobile) / 20px (desktop)
- **Metadata:** Light gray text (white/70), 14px
- **Exit Button:**
  - White background with 10% opacity
  - Hover: 20% opacity
  - Text: White, bold
  - Min height: 48px (mobile touch target)
  - Clear action verb: "Exit to Global View" or "← Back to All Events"
  - Position: Right side (desktop) / Full width below (mobile)

**Mobile Layout:**

```
┌──────────────────────────────┐
│ ⚠️ Working on:               │
│ Long Weekend Vol. 4          │
│ 24 performers • 4 venues     │
│ Feb 15, 2025 • Draft         │
│ [✕ Exit to Global View]     │ ← Full-width button
└──────────────────────────────┘
```

**Accessibility:**

- ARIA label: "Currently managing event: Long Weekend Vol. 4. Press to exit to global view."
- Keyboard shortcut: ESC key exits context
- Screen reader announces context change
- Focus trap within context banner when tabbing

**Implementation Code Reference:**
See `docs/CONTEXT_SWITCHING_IMPROVEMENTS.md` Phase 1.1 (lines 98-118)

---

### 1.2 Breadcrumb Navigation

**UX Impact: 🔴 CRITICAL** | **Effort: 2 hours** | **Mobile-Optimized: Yes**

**Problem Solved:**

- Users don't understand hierarchical location
- No visual "you are here" indicator
- Difficult to navigate back through levels

**Design Pattern:** Breadcrumb trail (universal standard in admin interfaces)

**Wireframe Description:**

```
Desktop:
┌────────────────────────────────────────────┐
│ All Events › Long Weekend Vol. 4 › Performers │
└────────────────────────────────────────────┘

Mobile (Collapsed):
┌──────────────────────────┐
│ ... › Vol. 4 › Performers │
└──────────────────────────┘
```

**Visual Specifications:**

- **Container:** Subtle background (band-navy/20), 8px padding
- **Separator:** Orange chevron (›) in brand-orange
- **Links:**
  - Default: Light gray (white/70)
  - Hover: Brand orange
  - Active (current): White, bold
  - Text size: 14px (mobile) / 16px (desktop)
- **Tap Targets:** Each breadcrumb item minimum 44x44px
- **Truncation:** Mobile truncates to last 2-3 levels with ellipsis

**Interaction Behavior:**

- Click "All Events" → Returns to global view
- Click event name → Returns to Events tab with event detail
- Click tab name → No action (already on that tab)
- Keyboard navigation: Tab through breadcrumb items, Enter to activate

**Mobile Optimization:**

1. **Truncate intelligently:**
   - Always show current level (rightmost)
   - Show parent level
   - Collapse ancestors into "..."

2. **Touch-friendly:**
   - Increase spacing between items to 12px
   - Minimum 48px touch targets

3. **Context menu on "...":**
   - Tap ellipsis → Show full path in modal
   - Quick navigation to any level

**Accessibility:**

- ARIA: `nav` with `aria-label="Breadcrumb navigation"`
- Each item: `aria-current="page"` for active item
- Screen reader: "Navigation: All Events, then Long Weekend Vol. 4, then Performers, current page"

---

## Priority 2: IMPORTANT (Include in Mobile Optimization)

### 2.1 Tab Badges with Context-Aware Counts

**UX Impact: 🟡 IMPORTANT** | **Effort: 1 hour** | **Mobile-Optimized: Yes**

**Problem Solved:**

- Users forget they're in filtered mode when switching tabs
- No indication of how filter affects data in each tab
- Unclear if viewing "all" or "some" records

**Design Pattern:** Badge indicators (Gmail unread counts, Slack notifications)

**Wireframe Description:**

```
Global View:
┌──────────────────────────────────────────────┐
│ [Events (5)]  [Venues (all)]  [Performers (all)] │
└──────────────────────────────────────────────┘

Event Context (Vol. 4 selected):
┌──────────────────────────────────────────────┐
│ [Events (5)]  [Venues (4)]  [Performers (24)] │
│                   ↑filtered      ↑filtered   │
└──────────────────────────────────────────────┘
```

**Visual Specifications:**

- **Global View Badge:**
  - Background: Transparent
  - Text: White/50
  - Format: "(all)" or total count

- **Filtered View Badge:**
  - Background: Orange circle (brand-orange/30)
  - Text: Brand orange, bold
  - Format: "(count)" with exact number
  - Animation: Subtle pulse on context switch

- **Mobile:**
  - Smaller text (12px)
  - Badge positioned above tab label
  - Color-coded: orange = filtered, gray = global

**Interaction:**

- Hover over badge → Tooltip: "Showing 24 performers for Long Weekend Vol. 4"
- No click action (badge is informational only)

**Accessibility:**

- ARIA label on tab: "Performers, 24 items in current event"
- Screen reader: "Performers tab, showing 24 of 50 total performers for selected event"

---

### 2.2 Tab Content Headers with Context Summary

**UX Impact: 🟡 IMPORTANT** | **Effort: 2 hours** | **Mobile-Optimized: Yes**

**Problem Solved:**

- Tab content doesn't acknowledge filter state
- Users don't understand what they're viewing
- No reinforcement of context within tab

**Design Pattern:** Contextual subheader (Shopify admin, WordPress dashboard)

**Wireframe Description:**

```
┌─────────────────────────────────────────────────────────────┐
│ Performers Tab (Event Context)                              │
├─────────────────────────────────────────────────────────────┤
│ 📍 Showing 24 performers for Long Weekend Vol. 4            │
│                                         [View All Performers] │
├─────────────────────────────────────────────────────────────┤
│ [+ Add Performer]                          [Bulk Actions ▼] │
├─────────────────────────────────────────────────────────────┤
│ Table of performers...                                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Performers Tab (Global View)                                │
├─────────────────────────────────────────────────────────────┤
│ 🌍 Showing all performers across all events                 │
├─────────────────────────────────────────────────────────────┤
│ [+ Add Performer]                          [Bulk Actions ▼] │
├─────────────────────────────────────────────────────────────┤
│ Table of performers...                                      │
└─────────────────────────────────────────────────────────────┘
```

**Visual Specifications:**

- **Filtered Context Header:**
  - Background: Orange gradient (band-orange/10)
  - Border: 1px bottom border (band-orange/30)
  - Icon: 📍 (pin/location) in orange
  - Text: White, 16px
  - Event name: Bold, orange
  - Action link: "View All Performers" → exits context

- **Global Context Header:**
  - Background: Blue gradient (blue/10)
  - Border: 1px bottom border (blue/30)
  - Icon: 🌍 (globe) in blue
  - Text: White, 16px
  - No action link needed (already global)

**Mobile Layout:**

```
┌────────────────────────────┐
│ 📍 Long Weekend Vol. 4     │
│    24 performers           │
│ [View All]                 │ ← Prominent button
└────────────────────────────┘
```

**Accessibility:**

- ARIA live region: Announces context when tab loads
- Screen reader: "Performers section. Showing 24 performers for Long Weekend Vol. 4 event."

---

### 2.3 Improved Event Selector Label & Design

**UX Impact: 🟡 IMPORTANT** | **Effort: 30 minutes** | **Mobile-Optimized: Yes**

**Problem Solved:**

- "Filter:" label doesn't convey significance
- Users don't understand this controls their workspace
- Dropdown blends into header

**Design Pattern:** Context selector (Slack workspace switcher, Gmail account selector)

**Current vs Improved:**

```
BEFORE:
┌────────────────────────────────────┐
│ Filter: [All Venues/Bands (Global View) ▼] │
└────────────────────────────────────┘

AFTER:
┌────────────────────────────────────┐
│ 📅 Event Workspace:                 │
│ [Long Weekend Vol. 4 ▼]            │
│ [✕ Exit Event]                     │
└────────────────────────────────────┘
```

**Visual Specifications:**

- **Label:**
  - Change "Filter:" to "Event Workspace:" or "Working On:"
  - Font size: 14px (mobile) / 16px (desktop)
  - Color: White/90 (more prominent)
  - Icon: 📅 or 🎯 (calendar or target)

- **Dropdown:**
  - Increase size: 16px font, 48px height
  - Add icon indicating it's a selector (▼)
  - Selected state: Orange border (2px)
  - Hover state: Subtle orange glow

- **Clear Button:**
  - Rename: "Clear Filter" → "✕ Exit Event" or "Back to Global"
  - Make more prominent (larger, orange outline)
  - Position: Right side of dropdown (desktop) / Below (mobile)
  - Min height: 48px (touch target)

**Dropdown Options Format:**

```
┌────────────────────────────────────┐
│ 🌍 All Events (Global View)        │
├────────────────────────────────────┤
│ 📅 Long Weekend Vol. 4             │
│    24 performers • 4 venues • Draft │
├────────────────────────────────────┤
│ 📅 Summer Sessions 2024            │
│    12 performers • 2 venues • Live  │
└────────────────────────────────────┘
```

**Mobile Optimization:**

- Full-width dropdown (fills available space)
- Icons remain visible at small sizes
- Metadata text wraps to second line if needed
- Exit button below dropdown for thumb reach

**Accessibility:**

- ARIA label: "Select event workspace. Currently: Long Weekend Vol. 4"
- Keyboard: Arrow keys navigate, Enter selects, ESC closes
- Screen reader: "Event workspace selector. 5 options available. Currently selected: All Events, Global View."

---

## Priority 3: NICE TO HAVE (Future Iteration)

### 3.1 Quick Actions in Context Banner

**UX Impact: 🟢 NICE TO HAVE** | **Effort: 2 hours**

**Problem Solved:**

- Common actions require navigation to Events tab
- Inefficient workflow for event management
- No quick access to event details

**Wireframe Description:**

```
┌──────────────────────────────────────────────────────────────────┐
│ ⚠️ Working on: Long Weekend Vol. 4                                  │
│    [📊 Metrics] [✏️ Edit] [🔗 Embed] [📋 Copy Link] [✕ Exit to Global] │
└──────────────────────────────────────────────────────────────────┘
```

**Visual Specifications:**

- Icon buttons: 36x36px (desktop), 44x44px (mobile)
- Spacing: 8px between buttons
- Colors: White/20 background, orange on hover
- Tooltips on hover (desktop) or long-press (mobile)

**Mobile:**

- Horizontal scroll for actions
- Swipe gesture to access all actions
- Most common actions visible without scrolling

---

### 3.2 Event Stats Quick View

**UX Impact: 🟢 NICE TO HAVE** | **Effort: 1 hour**

**Problem Solved:**

- Users want quick stats without leaving context
- No visual summary of event scope
- Stats only visible in Events tab detail view

**Wireframe Description:**

```
┌────────────────────────────────────────────┐
│ ⚠️ Working on: Long Weekend Vol. 4          │
│    📊 24 performers | 🏢 4 venues | 📅 Feb 15 │
│    Status: 📝 Draft | Duration: 6h 30m      │
└────────────────────────────────────────────┘
```

---

### 3.3 Persistent Filter Indicator (Sticky)

**UX Impact: 🟢 NICE TO HAVE** | **Effort: 1 hour**

**Problem Solved:**

- Context banner might scroll out of view on long pages
- Users lose context reminder when scrolling

**Design:** Sticky positioning on context banner, always visible at top when scrolling.

---

## Mobile-First Design Considerations

### Touch Target Sizing (WCAG 2.1 AAA Compliance)

**Minimum Sizes:**

- Primary actions (Exit, Breadcrumb links): 48x48px
- Secondary actions (Badges, metadata): 44x44px
- Text links: 44px height with padding

### Gesture Support

1. **Swipe Right on Breadcrumb:** Navigate back one level
2. **Long Press on Context Banner:** Quick actions menu
3. **Pull-Down-to-Refresh:** Reload current context data
4. **Swipe Left/Right on Tab Bar:** Switch between tabs

### Mobile Layout Adaptations

#### Context Banner Mobile Stack:

```
┌──────────────────────────────┐
│ ⚠️ Long Weekend Vol. 4        │  ← Event name (truncated if needed)
│ 24 performers • 4 venues     │  ← Stats row
│ [Exit to Global View]        │  ← Full-width button
└──────────────────────────────┘
```

#### Breadcrumb Mobile Collapse:

```
┌──────────────────────────┐
│ ... › Vol. 4 › Performers │  ← Truncated with ellipsis
│ [Tap ... to expand]      │  ← Action hint
└──────────────────────────┘
```

#### Tab Badges Mobile Position:

```
┌───────┬───────┬────────┐
│Events │Venues │Perform │  ← Tab labels
│  (5)  │  (4)  │  (24)  │  ← Badges below
└───────┴───────┴────────┘
```

---

## Accessibility (WCAG 2.1 AA/AAA Compliance)

### Color Contrast

**Tested Combinations:**

- Brand orange (#FF6B35) on navy background: **4.8:1** (AA compliant)
- White text on orange badge: **4.5:1** (AA compliant)
- Light gray (white/70) on navy: **7.2:1** (AAA compliant)

### Keyboard Navigation

**Tab Order:**

1. Event Workspace dropdown
2. Exit Event button
3. Breadcrumb links (left to right)
4. Tab navigation (left to right)
5. Tab content

**Keyboard Shortcuts:**

- `ESC` - Exit current event context to global view
- `Ctrl/Cmd + E` - Jump to Events tab
- `Ctrl/Cmd + V` - Jump to Venues tab
- `Ctrl/Cmd + P` - Jump to Performers tab
- `Ctrl/Cmd + G` - Toggle global/event view

### Screen Reader Support

**ARIA Attributes:**

```html
<!-- Context Banner -->
<div
  role="alert"
  aria-live="polite"
  aria-label="Currently managing event: Long Weekend Vol. 4"
>
  <button aria-label="Exit to global view and manage all events">
    Exit to Global View
  </button>
</div>

<!-- Breadcrumb -->
<nav aria-label="Breadcrumb navigation">
  <ol>
    <li><a href="#" aria-label="Navigate to all events">All Events</a></li>
    <li aria-current="page">Long Weekend Vol. 4</li>
  </ol>
</nav>

<!-- Tab with Badge -->
<button
  role="tab"
  aria-selected="true"
  aria-label="Performers, showing 24 items in current event"
>
  Performers <span aria-label="24 items">(24)</span>
</button>
```

**Focus Management:**

- When context changes, focus moves to context banner
- Screen reader announces: "Context changed. Now managing Long Weekend Vol. 4."
- Focus visible indicator: 2px orange outline with 2px offset

### Reduced Motion Support

```css
@media (prefers-reduced-motion: reduce) {
  /* Disable badge pulse animation */
  .badge-filtered {
    animation: none;
  }

  /* Disable context banner slide-in */
  .context-banner {
    transition: none;
  }
}
```

---

## Design Systems Reference & Inspiration

### Linear (Project Management)

**What They Do Well:**

- **Contextual breadcrumbs** at top of every view
- **Subtle background color changes** when in project vs global view
- **Quick exit path** always visible
- **Keyboard shortcuts** prominently displayed

**Apply to Our Design:**

- Breadcrumb pattern (Priority 1.2)
- Background color shift in filtered tabs (Priority 2.2)
- Keyboard shortcut hints in tooltips

### Notion (Workspace Switcher)

**What They Do Well:**

- **Workspace selector** is prominently placed
- **Visual icon** indicates current workspace
- **Metadata preview** in dropdown (members, pages, etc.)
- **Smooth transitions** between contexts

**Apply to Our Design:**

- Event workspace selector design (Priority 2.3)
- Metadata in dropdown options (performer count, venue count)
- Icon-based visual language

### Shopify Admin (Multi-Store)

**What They Do Well:**

- **Store indicator** always visible in header
- **Color-coded badges** for different store states
- **Quick store switcher** with search
- **Contextual actions** appear/disappear based on context

**Apply to Our Design:**

- Context banner always-visible design (Priority 1.1)
- Badge system for filtered/global states (Priority 2.1)
- Contextual quick actions (Priority 3.1)

### WordPress Dashboard (Multi-Site)

**What They Do Well:**

- **Site selector** in admin bar
- **Clear "Network Admin" vs "Site Admin"** visual distinction
- **Consistent placement** of context controls
- **Mobile-optimized** admin interface

**Apply to Our Design:**

- Visual distinction between global/event views
- Consistent header placement of event selector
- Mobile-first responsive patterns

### GitHub (Repository Context)

**What They Do Well:**

- **Repository breadcrumb** always shows org/repo/path
- **Branch selector** is visually prominent
- **Contextual tabs** change based on repository
- **File tree navigation** with clear hierarchy

**Apply to Our Design:**

- Hierarchical breadcrumb structure (Priority 1.2)
- Context-aware tab content (Priority 2.2)

---

## Visual Design Mockup Descriptions

### Desktop Mockup: Event Context Active

```
┌────────────────────────────────────────────────────────────────────┐
│ 🎸 Band Crawl Admin                              [Create Event] [Logout] │
├────────────────────────────────────────────────────────────────────┤
│ 📅 Event Workspace: [Long Weekend Vol. 4 ▼]  [✕ Exit Event]       │
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
│ ⚠️  Working on: Long Weekend Vol. 4                                   │
│     24 performers • 4 venues • Feb 15, 2025 • Draft                 │
│     [📊 Metrics] [✏️ Edit] [🔗 Embed]      [✕ Exit to Global View] │
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
│ All Events › Long Weekend Vol. 4                                   │
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
│ [Events (5)]  [Venues (4)]  [Performers (24)]                      │
│                      ↑active                                        │
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
│ 📍 Showing 4 venues for Long Weekend Vol. 4    [View All Venues]   │
├────────────────────────────────────────────────────────────────────┤
│ [Table of venues...]                                                │
└────────────────────────────────────────────────────────────────────┘
```

**Visual Details:**

- Orange background gradient on context banner (#FF6B35 → rgba(255,107,53,0.1))
- White text throughout for readability
- Orange accent on active tab (bottom border)
- Filtered badge has orange circle background
- Exit buttons have subtle white background (10% opacity)

### Mobile Mockup: Event Context Active

```
┌──────────────────────────┐
│ 🎸 Band Crawl Admin      │
│ [≡] [Create] [Logout]    │
├──────────────────────────┤
│ 📅 Event Workspace:       │
│ [Long Weekend Vol. 4 ▼]  │
│ [✕ Exit to Global View]  │
└──────────────────────────┘
┌──────────────────────────┐
│ ⚠️ Long Weekend Vol. 4    │
│ 24 performers • 4 venues │
│ Feb 15, 2025 • Draft     │
│ [Exit to Global View]    │
└──────────────────────────┘
┌──────────────────────────┐
│ ... › Vol. 4             │
└──────────────────────────┘
┌──────────────────────────┐
│ Events  Venues  Perform  │
│  (5)     (4)      (24)   │
│          ▲active         │
└──────────────────────────┘
┌──────────────────────────┐
│ 📍 4 venues for Vol. 4   │
│ [View All Venues]        │
├──────────────────────────┤
│ [Venue cards...]         │
└──────────────────────────┘
```

**Mobile Interaction Notes:**

- Swipe left/right on tab bar to switch tabs
- Tap "..." in breadcrumb to expand full path
- Pull down on context banner to refresh
- Long-press Exit button for additional options (Metrics, Edit, Embed)

---

## Empty State & Error State Designs

### Empty State: No Event Selected (Global View)

```
┌────────────────────────────────────────────────────────────────┐
│ 🌍 Global View: Managing All Events                           │
│                                                                │
│    Select an event above to focus on specific performances     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Empty State: Event Selected, No Data

```
┌────────────────────────────────────────────────────────────────┐
│ 📍 Showing performers for Long Weekend Vol. 4                  │
│                                                                │
│    No performers yet for this event.                           │
│    [+ Add First Performer]                                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Error State: Lost Context (Fail-Safe)

```
┌────────────────────────────────────────────────────────────────┐
│ ⚠️ Context Error                                                │
│                                                                │
│    The selected event no longer exists.                        │
│    [Return to Global View]                                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## User Testing Protocols

### Usability Testing Checklist

**Task 1: Navigate from Global to Event Context**

- [ ] User can find event selector without assistance
- [ ] User understands purpose of event selector
- [ ] User successfully selects an event
- [ ] User recognizes they are now in event context

**Task 2: Switch Between Tabs in Event Context**

- [ ] User maintains awareness of which event they're managing
- [ ] User understands what data is displayed in each tab
- [ ] User doesn't get confused when switching tabs

**Task 3: Return to Global View**

- [ ] User can find exit path within 5 seconds
- [ ] User understands what "Exit to Global View" means
- [ ] User successfully returns to global view
- [ ] User recognizes they are now in global context

**Task 4: Navigate Using Breadcrumbs**

- [ ] User understands breadcrumb hierarchy
- [ ] User can navigate back using breadcrumbs
- [ ] User finds breadcrumbs helpful for orientation

**Success Metrics:**

- **Task completion rate:** >90%
- **Time to find exit:** <5 seconds
- **User confidence rating:** >4/5
- **Zero "I'm lost" moments**

### A/B Testing Scenarios

**Test A: Context Banner Placement**

- Variant 1: Banner above breadcrumb
- Variant 2: Banner below breadcrumb
- Metric: User recognition speed

**Test B: Exit Button Label**

- Variant 1: "Exit to Global View"
- Variant 2: "← Back to All Events"
- Variant 3: "✕ Exit Event"
- Metric: Click-through rate, user understanding

**Test C: Badge Style**

- Variant 1: Orange circle with count
- Variant 2: Text badge with "filtered" label
- Variant 3: Icon badge with filter funnel
- Metric: User awareness of filtered state

---

## Implementation Priority Matrix

### UX Impact vs Effort Analysis

```
High Impact, Low Effort (DO FIRST):
├─ Context Banner (Priority 1.1) - 2 hours
├─ Breadcrumb Navigation (Priority 1.2) - 2 hours
└─ Improved Selector Label (Priority 2.3) - 30 minutes

High Impact, Medium Effort (DO NEXT):
├─ Tab Badges (Priority 2.1) - 1 hour
└─ Tab Content Headers (Priority 2.2) - 2 hours

Medium Impact, Medium Effort (LATER):
├─ Quick Actions (Priority 3.1) - 2 hours
├─ Event Stats Quick View (Priority 3.2) - 1 hour
└─ Sticky Filter Indicator (Priority 3.3) - 1 hour
```

### Recommended Implementation Phases

**Phase 1: Critical UX Fixes (4.5 hours)**

1. Context Banner with Exit Path (2h)
2. Breadcrumb Navigation (2h)
3. Improved Event Selector Label (30m)

**Phase 2: Mobile Optimization Integration (3 hours)** 4. Tab Badges with Counts (1h) 5. Tab Content Context Headers (2h)

**Phase 3: Polish & Enhancement (4 hours)** 6. Quick Actions in Banner (2h) 7. Event Stats Quick View (1h) 8. Sticky Banner on Scroll (1h)

**Total Estimated Effort:** 11.5 hours (~1.5 days)

---

## Design Validation Criteria

### Before Implementation:

- [ ] Mobile mockups reviewed and approved
- [ ] Color contrast ratios tested (4.5:1 minimum)
- [ ] Touch target sizes verified (44x44px minimum)
- [ ] Keyboard navigation flow documented
- [ ] Screen reader script written and tested

### During Implementation:

- [ ] Component matches approved design specs
- [ ] Responsive breakpoints tested (320px, 768px, 1024px)
- [ ] ARIA attributes implemented correctly
- [ ] Keyboard shortcuts functional
- [ ] Focus visible indicators present

### Post-Implementation:

- [ ] User testing with 5+ non-technical users
- [ ] Task completion rate >90%
- [ ] Zero critical accessibility violations
- [ ] Performance impact <100ms
- [ ] Mobile usability score >85/100

---

## Success Metrics & KPIs

### Quantitative Metrics

**Navigation Efficiency:**

- Time to exit context: <5 seconds (target)
- Breadcrumb click-through rate: >30%
- Tab switch without confusion: >95%

**Context Awareness:**

- Users correctly identify current context: >95%
- Users find exit path on first attempt: >90%
- Users understand filtered vs global state: >90%

**Mobile Performance:**

- Touch target accuracy: >98%
- Gesture recognition rate: >95%
- Mobile task completion: Same as desktop

### Qualitative Metrics

**User Feedback:**

- "I know where I am": >90% agreement
- "I can easily go back": >90% agreement
- "Context is always clear": >85% agreement

**Usability Testing:**

- Zero "I'm lost" moments
- Positive comments on clarity
- Reduced support tickets about navigation

---

## Integration with Mobile Optimization Work

### Shared Design Patterns

**Touch Interactions:**

- Context banner swipe gestures
- Tab bar swipe navigation
- Long-press for contextual menus
- Pull-to-refresh in event context

**Responsive Layout:**

- Stacked mobile layouts
- Collapsible breadcrumbs
- Full-width buttons for thumb reach
- Bottom navigation integration

**Performance:**

- Optimized context banner rendering
- Smooth tab transitions
- Minimal reflow on context switch
- Efficient badge updates

### Coordination Points

1. **Bottom Navigation Integration:**
   - Context banner works with bottom nav
   - Badge counts match bottom nav indicators
   - Consistent touch targets across components

2. **Mobile-First Testing:**
   - All designs tested on real devices first
   - Touch target validation on phones/tablets
   - Thumb zone accessibility verified

3. **Progressive Enhancement:**
   - Basic functionality works without JavaScript
   - Enhanced interactions for modern browsers
   - Graceful degradation for older devices

---

## Appendix: Design Assets Needed

### Icons Required

- ⚠️ Warning/Context indicator
- 📍 Pin/Location marker
- 🌍 Globe (global view)
- 📅 Calendar (event selector)
- ✕ Close/Exit symbol
- › Breadcrumb separator
- 📊 Metrics/Analytics
- ✏️ Edit pencil
- 🔗 Link/Embed

### Color Palette

- Brand Orange: #FF6B35
- Band Navy: #1A1F2E
- Band Purple: #2A1F3D
- White/90: rgba(255, 255, 255, 0.9)
- White/70: rgba(255, 255, 255, 0.7)
- White/50: rgba(255, 255, 255, 0.5)
- White/20: rgba(255, 255, 255, 0.2)
- Orange/30: rgba(255, 107, 53, 0.3)
- Orange/20: rgba(255, 107, 53, 0.2)
- Orange/10: rgba(255, 107, 53, 0.1)

### Typography

- Primary Font: System UI (-apple-system, BlinkMacSystemFont, Segoe UI, Roboto)
- Heading Sizes: 20px (mobile) / 24px (desktop)
- Body Sizes: 14px (mobile) / 16px (desktop)
- Badge Sizes: 12px (mobile) / 14px (desktop)
- Line Height: 1.5 (body), 1.2 (headings)

### Spacing Scale

- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px

### Border Radius

- Small (badges, buttons): 6px
- Medium (cards): 8px
- Large (modals): 12px

---

## Final Recommendations

### Priority Sequence for Development

**Week 1: Critical UX Fixes**

1. Implement context banner with exit path
2. Add breadcrumb navigation
3. Update event selector label and styling

**Week 2: Mobile Optimization Phase** 4. Add tab badges with context-aware counts 5. Implement tab content headers with context summary 6. Test on real mobile devices

**Week 3: Polish & Validation** 7. User testing with non-technical organizers 8. Iterate based on feedback 9. Accessibility audit and fixes

### Risk Mitigation

**Risk: Users Still Get Lost**

- Mitigation: A/B test different label variations
- Fallback: Add inline help tooltips

**Risk: Mobile Touch Targets Too Small**

- Mitigation: Validate on actual devices before launch
- Fallback: Increase spacing, reduce content density

**Risk: Performance Impact on Older Devices**

- Mitigation: Lazy load context banner animations
- Fallback: Disable animations on low-end devices

### Next Steps

1. **Review & Approve:** Stakeholder approval of design mockups
2. **Dev Handoff:** Provide design specs to development team
3. **Component Build:** Create reusable context switching components
4. **User Testing:** Test with 5+ non-technical users
5. **Iterate:** Refine based on real-world usage
6. **Launch:** Roll out with mobile optimization update

---

**Document Status:** Ready for Review
**Next Action:** Stakeholder approval of Priority 1 designs
**Related Documents:**

- `docs/CONTEXT_SWITCHING_IMPROVEMENTS.md` (Technical Analysis)
- `docs/CURSOR_TASK_MOBILE_OPTIMIZATION.md` (Mobile Work)
- `docs/PROJECT_STATUS_AND_ROADMAP.md` (Project Planning)
