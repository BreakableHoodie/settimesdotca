# SetTimes Visual Design Polish Checklist
**Final UI/UX Review Before Demo**

**Goal:** Ensure professional, polished appearance
**Deadline:** Before November 30, 2025

---

## 🎨 Design System Review

### Color Palette

**Check all colors for consistency:**
- [ ] Primary color (brand/accent): `#F97316` (orange) used consistently
- [ ] Background navy: `#0F172A` used for dark backgrounds
- [ ] Text colors follow hierarchy:
  - Primary text: `#F8FAFC` (near white)
  - Secondary text: `#CBD5E1` (light gray)
  - Tertiary text: `#64748B` (medium gray)
- [ ] Success green: `#10B981` for positive actions
- [ ] Error red: `#EF4444` for warnings/errors
- [ ] Warning yellow: `#F59E0B` for cautions
- [ ] Info blue: `#3B82F6` for informational messages

**WCAG Contrast:**
- [ ] All text meets AA contrast ratio (4.5:1)
- [ ] Large text meets AA ratio (3:1)
- [ ] Interactive elements have sufficient contrast
- [ ] Focus indicators are visible (2:1 minimum)

**Test:**
```bash
# Use browser DevTools or online tool
# Check contrast at: https://webaim.org/resources/contrastchecker/
```

---

### Typography

**Font Stack:**
- [ ] Primary font loads: Inter, system-ui, sans-serif
- [ ] Fallback fonts work if primary fails
- [ ] No FOUT (Flash of Unstyled Text) on page load
- [ ] Font weights used correctly:
  - Regular (400): Body text
  - Medium (500): Subheadings
  - Semibold (600): Headings
  - Bold (700): Emphasis

**Text Sizes:**
- [ ] Minimum text size: 14px (mobile), 16px (desktop)
- [ ] Headings follow clear hierarchy:
  - H1: 2.5rem (40px)
  - H2: 2rem (32px)
  - H3: 1.5rem (24px)
  - H4: 1.25rem (20px)
- [ ] Line height: 1.5 minimum for body text
- [ ] Letter spacing: subtle on headings

**Readability:**
- [ ] Max line length: 65-75 characters
- [ ] Comfortable reading on mobile (no squinting)
- [ ] Text hierarchy is clear (scannable)

---

### Spacing & Layout

**Spacing System (4px base):**
- [ ] All spacing uses 4px increments (4, 8, 12, 16, 24, 32, 48, 64)
- [ ] Consistent padding on cards/containers
- [ ] Consistent margins between sections
- [ ] Button padding feels comfortable
- [ ] Form field spacing is generous

**Layout Grid:**
- [ ] Pages are centered (max-width container)
- [ ] Content doesn't touch screen edges (padding)
- [ ] Elements align to grid
- [ ] No awkward half-pixel offsets
- [ ] Responsive breakpoints work:
  - Mobile: < 640px
  - Tablet: 640-1024px
  - Desktop: > 1024px

**White Space:**
- [ ] Generous white space around elements
- [ ] Not cramped or cluttered
- [ ] Clear visual grouping
- [ ] Comfortable to scan

---

## 🎯 Component Review

### Buttons

**Visual Check:**
- [ ] Primary buttons: orange background, white text
- [ ] Secondary buttons: outlined, transparent background
- [ ] Danger buttons: red background, white text
- [ ] Ghost buttons: no background, subtle hover
- [ ] All buttons have clear hover states
- [ ] All buttons have active/pressed states
- [ ] Focus rings visible for keyboard navigation
- [ ] Loading states show spinner
- [ ] Disabled states are obvious (opacity 50%)

**Sizes:**
- [ ] Small: 36px height (px-4 py-2)
- [ ] Medium: 44px height (px-6 py-3) - **default**
- [ ] Large: 52px height (px-8 py-4)
- [ ] Touch targets: 44x44px minimum

**Icons in Buttons:**
- [ ] Icons align vertically with text
- [ ] Icon spacing looks balanced
- [ ] Icon size proportional to text
- [ ] Icon-only buttons are 44x44px minimum

---

### Forms

**Input Fields:**
- [ ] Border color: gray when idle, blue when focused
- [ ] Labels are above or to left of inputs
- [ ] Placeholder text is subtle, not too dark
- [ ] Error states: red border + red message below
- [ ] Success states: green border (optional)
- [ ] Input height: 44px minimum
- [ ] Padding feels comfortable (px-4 py-3)
- [ ] Focus rings are visible and styled

**Dropdowns/Selects:**
- [ ] Dropdown arrow icon present
- [ ] Options list styled consistently
- [ ] Selected option highlighted
- [ ] Hover states on options
- [ ] Keyboard navigation works (up/down arrows)

**Checkboxes/Radio Buttons:**
- [ ] Large enough to tap (24x24px minimum)
- [ ] Clear checked state (checkmark, filled circle)
- [ ] Clear focus states
- [ ] Labels are clickable (not just box)

**Form Layout:**
- [ ] Fields are vertically aligned
- [ ] Consistent field widths
- [ ] Related fields grouped visually
- [ ] Form doesn't feel cramped
- [ ] Mobile: fields stack vertically
- [ ] Desktop: logical 2-column layout (if applicable)

---

### Cards

**Event/Band Cards:**
- [ ] Consistent card style throughout
- [ ] Clear shadow/border for depth
- [ ] Padding is generous (p-6)
- [ ] Content hierarchy is clear
- [ ] Hover states on clickable cards
- [ ] Cards scale well on mobile

**Admin Cards:**
- [ ] Event cards show status badge clearly
- [ ] Venue cards show band count
- [ ] Performer cards show time + venue
- [ ] All cards have consistent spacing

---

### Badges

**Status Badges:**
- [ ] Draft: gray background
- [ ] Published: green background
- [ ] Archived: orange background
- [ ] Badges have appropriate size (not too large)
- [ ] Badge text is readable
- [ ] Badges have subtle rounded corners

**Count Badges:**
- [ ] Band counts: subtle secondary style
- [ ] Consistent size and styling
- [ ] Don't overpower other content

---

### Alerts/Messages

**Alert Types:**
- [ ] Success: green background, white text, checkmark icon
- [ ] Error: red background, white text, X icon
- [ ] Warning: yellow background, dark text, exclamation icon
- [ ] Info: blue background, white text, info icon

**Alert Behavior:**
- [ ] Alerts appear at top of content or inline
- [ ] Auto-dismiss after 5 seconds (optional)
- [ ] Close button present (X icon)
- [ ] Clear, actionable messages
- [ ] Icons align with text

---

### Modals/Dialogs

**Visual:**
- [ ] Modal centered on screen
- [ ] Dark overlay behind modal (opacity 50-75%)
- [ ] Modal has shadow for depth
- [ ] Close button clearly visible
- [ ] Content doesn't overflow modal

**Behavior:**
- [ ] Modal animates in smoothly
- [ ] Clicking overlay closes modal
- [ ] ESC key closes modal
- [ ] Focus trapped inside modal
- [ ] First input auto-focused

**Confirm Dialogs:**
- [ ] Title is clear and bold
- [ ] Message explains action
- [ ] Dangerous actions highlighted (red)
- [ ] Cancel button on left, confirm on right
- [ ] Keyboard shortcuts work (ESC, Enter)

---

### Loading States

**Spinners:**
- [ ] Spinner size matches context
- [ ] Spinner color matches theme
- [ ] Smooth animation (not janky)
- [ ] Centered in container

**Skeleton Loaders:**
- [ ] Use skeleton loaders for slow content
- [ ] Skeleton matches final layout
- [ ] Pulse animation subtle

**Loading Buttons:**
- [ ] Button shows spinner when loading
- [ ] Button is disabled when loading
- [ ] Text changes to "Loading..." or similar
- [ ] Spinner color contrasts with button background

---

## 📱 Mobile Experience

### Responsive Design

**Layout:**
- [ ] All pages work on iPhone SE (375px width)
- [ ] All pages work on iPad (768px width)
- [ ] All pages work on large desktop (1920px+ width)
- [ ] No horizontal scrolling
- [ ] Content scales appropriately
- [ ] Images don't overflow

**Navigation:**
- [ ] Bottom navigation on mobile (< 640px)
- [ ] Top navigation on desktop (> 640px)
- [ ] Tabs are easy to tap (44px height)
- [ ] Active tab is clearly highlighted

**Forms on Mobile:**
- [ ] Inputs trigger correct keyboard:
  - Email → email keyboard (@)
  - Number → number pad
  - URL → URL keyboard (.com)
  - Tel → phone keyboard
- [ ] Zoom doesn't occur on focus (16px font minimum)
- [ ] Submit buttons above keyboard

**Touch Interactions:**
- [ ] All buttons: 44x44px minimum
- [ ] Adequate spacing between tappable elements
- [ ] No accidental taps on nearby buttons
- [ ] Swipe gestures work (if implemented)

---

### Performance

**Image Optimization:**
- [ ] All images compressed (WebP format if supported)
- [ ] Lazy loading on images below fold
- [ ] Appropriate image sizes (no 4K images for thumbnails)
- [ ] Alt text on all images

**Font Loading:**
- [ ] Fonts preloaded or use system fonts
- [ ] No FOIT (Flash of Invisible Text)
- [ ] Font subsetting if using custom fonts

**Animation Performance:**
- [ ] Animations run at 60fps
- [ ] No jank or stuttering
- [ ] Reduced motion respected (prefers-reduced-motion)

---

## ✨ Branding & Polish

### Logo & Branding

**SetTimes Logo:**
- [ ] Logo appears in header
- [ ] Logo is crisp (SVG or 2x PNG)
- [ ] Logo links to homepage
- [ ] Logo has appropriate spacing
- [ ] Logo color contrasts with background

**Favicon:**
- [ ] Favicon set in `<head>`
- [ ] Multiple sizes provided (16x16, 32x32, 180x180)
- [ ] Appears correctly in browser tabs

**Brand Voice:**
- [ ] Consistent terminology throughout
- [ ] Professional but friendly tone
- [ ] No Lorem Ipsum placeholder text
- [ ] Error messages are helpful (not technical)

---

### Micro-interactions

**Hover States:**
- [ ] All interactive elements have hover state
- [ ] Cursor changes to pointer on clickable items
- [ ] Hover transition is smooth (150-200ms)
- [ ] Hover states are subtle (not jarring)

**Focus States:**
- [ ] Clear focus ring on all interactive elements
- [ ] Focus ring color contrasts with background
- [ ] Focus ring is 2px or more
- [ ] Tab order is logical

**Animations:**
- [ ] Page transitions are smooth
- [ ] Modal/dialog animations feel polished
- [ ] Loading animations don't distract
- [ ] Animations enhance UX (don't just add flair)

---

### Icons

**Icon Consistency:**
- [ ] All icons from same icon set (Font Awesome)
- [ ] Icon sizes consistent within context
- [ ] Icon colors match design system
- [ ] Icons have proper alignment (vertical center)

**Icon Usage:**
- [ ] Icons have semantic meaning (not decorative)
- [ ] Icon + text combinations balanced
- [ ] Icon-only buttons have aria-label
- [ ] Icons scale on mobile

---

## 🌐 Cross-Browser Testing

**Test on:**
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

**Check:**
- [ ] Layout identical across browsers
- [ ] No CSS rendering bugs
- [ ] JavaScript works in all browsers
- [ ] No console errors

---

## ♿ Accessibility Review

**Keyboard Navigation:**
- [ ] All functionality accessible via keyboard
- [ ] Tab order is logical
- [ ] Focus visible at all times
- [ ] No keyboard traps
- [ ] Skip navigation link present

**Screen Reader:**
- [ ] All images have alt text
- [ ] Form labels properly associated
- [ ] Buttons have descriptive text/aria-label
- [ ] ARIA roles used correctly
- [ ] Landmark regions defined

**Color Blindness:**
- [ ] Information not conveyed by color alone
- [ ] Error states have icons + text
- [ ] Status indicated by text + color

**Motion:**
- [ ] Animations respect prefers-reduced-motion
- [ ] No auto-playing videos
- [ ] Carousels can be paused

**Test with:**
- [ ] Screen reader (NVDA, JAWS, VoiceOver)
- [ ] Keyboard only (no mouse)
- [ ] Color blindness simulator

---

## 🔍 Final Visual Inspection

### Public Timeline

**Desktop:**
- [ ] Header looks professional
- [ ] Event cards are well-spaced
- [ ] Typography is crisp and readable
- [ ] Colors are vibrant but not overwhelming
- [ ] Footer (if present) looks complete
- [ ] No awkward line breaks
- [ ] Images load quickly

**Mobile:**
- [ ] Layout adapts gracefully
- [ ] Text is readable without zoom
- [ ] Buttons are easy to tap
- [ ] Scrolling is smooth
- [ ] No content cut off

---

### Band Profile Pages

**Content:**
- [ ] Band name is prominent
- [ ] Description is readable
- [ ] Performance details clear
- [ ] Social links styled consistently
- [ ] Back button obvious

**Layout:**
- [ ] Hero section (if present) looks good
- [ ] Content sections well-defined
- [ ] No awkward white space
- [ ] Mobile layout stacks nicely

---

### Admin Panel

**Dashboard:**
- [ ] Clean, uncluttered interface
- [ ] Tabs clearly labeled
- [ ] Context banner prominent
- [ ] Action buttons stand out
- [ ] Data tables readable

**Forms:**
- [ ] Forms don't feel cramped
- [ ] Labels are clear
- [ ] Validation errors helpful
- [ ] Success feedback obvious
- [ ] Cancel/submit buttons clear

**Lists:**
- [ ] Items are scannable
- [ ] Action buttons accessible
- [ ] Hover states work
- [ ] Delete confirmations clear
- [ ] Empty states helpful

---

## 📸 Screenshot Preparation

**Capture these for demo backup:**
- [ ] Public timeline (full event)
- [ ] Individual band profile
- [ ] Admin login screen
- [ ] Admin dashboard (Events tab)
- [ ] Create venue form (filled out)
- [ ] Create performer form (filled out)
- [ ] Conflict detection warning
- [ ] Context banner
- [ ] Mobile view (iPhone)
- [ ] Design system showcase (buttons, badges, etc.)

**Screenshot Guidelines:**
- [ ] 1920x1080 resolution
- [ ] Browser UI hidden (full screen or crop)
- [ ] Clear, crisp images (PNG format)
- [ ] Consistent zoom level (100%)
- [ ] Numbered sequentially (01-20)

---

## ✅ Sign-Off Checklist

**Visual design is ready when:**
- [ ] All design system elements consistent
- [ ] All components polished
- [ ] Mobile experience excellent
- [ ] Cross-browser testing passed
- [ ] Accessibility review complete
- [ ] No visual bugs or glitches
- [ ] Screenshots captured
- [ ] Brand elements in place
- [ ] Professional appearance confirmed

**Final Approval:**
- [ ] Designer sign-off: _____ (if applicable)
- [ ] Developer sign-off: _____
- [ ] Stakeholder preview: _____
- [ ] Ready for demo: _____

---

## 🎨 Quick Fix Reference

**Common Visual Issues:**

**Misaligned elements:**
```css
/* Use flexbox for vertical centering */
display: flex;
align-items: center;
```

**Text too close to edges:**
```css
/* Add padding to containers */
padding: 1.5rem; /* 24px */
```

**Buttons feel small:**
```css
/* Ensure minimum touch target */
min-height: 44px;
min-width: 44px;
padding: 0.75rem 1.5rem; /* 12px 24px */
```

**Low contrast text:**
```css
/* Use lighter text colors on dark backgrounds */
color: #F8FAFC; /* near white */
```

**Janky animations:**
```css
/* Use transform and opacity only */
transition: transform 200ms ease, opacity 200ms ease;
/* Avoid: width, height, left, right, top, bottom */
```

---

**Visual design polished. Demo will look professional! ✨**
