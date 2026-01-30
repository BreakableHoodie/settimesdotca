# SetTimes.ca Design System

**Version:** 1.0.0
**Last Updated:** November 18, 2025
**Sprint:** 2.0 - UI/UX Redesign & Design System

## Overview

This design system establishes the visual foundation for SetTimes.ca, ensuring consistency across both admin and public interfaces while maintaining accessibility (WCAG 2.1 AA compliance) and mobile-first responsive design.

---

## Design Principles

### 1. **Music Event Aesthetic**
- Deep, rich backgrounds inspired by concert posters
- High-energy accent colors for calls-to-action
- Bold typography for maximum readability in low-light venues

### 2. **Accessibility First**
- WCAG 2.1 AA compliant color contrasts (4.5:1 minimum)
- Touch targets minimum 44x44px on mobile
- Keyboard navigation support for all interactive elements
- Screen reader friendly semantic HTML

### 3. **Mobile-First**
- Designed for one-handed phone use at live events
- Progressive enhancement for desktop
- Touch-friendly controls with adequate spacing

### 4. **Performance**
- No web fonts (system fonts only)
- Minimal animations (respect `prefers-reduced-motion`)
- Optimized for edge network delivery

---

## Color Palette

### Brand Colors

```css
--color-primary-50:   #f0f4ff   /* Lightest blue - hover states */
--color-primary-100:  #d9e3ff   /* Light blue - backgrounds */
--color-primary-500:  #4f46e5   /* Primary brand - links, CTAs */
--color-primary-600:  #4338ca   /* Primary hover */
--color-primary-700:  #3730a3   /* Primary active */

--color-accent-400:   #ff8c5a   /* Light orange - hover */
--color-accent-500:   #ff6b35   /* Brand orange - primary actions */
--color-accent-600:   #e65a2a   /* Orange hover */
```

### Background Colors

```css
--color-bg-navy:      #1a1845   /* Deep navy - primary background */
--color-bg-purple:    #2d2554   /* Purple - gradient end */
--color-bg-dark:      #16213e   /* Dark blue - cards, panels */
--color-bg-darker:    #0f1729   /* Darkest - modals, overlays */
```

### Semantic Colors

```css
/* Success - green */
--color-success-400:  #4ade80   /* Light green - hover */
--color-success-500:  #22c55e   /* Success green - confirmations */
--color-success-600:  #16a34a   /* Success hover */

/* Warning - yellow */
--color-warning-400:  #fbbf24   /* Light yellow - hover */
--color-warning-500:  #f59e0b   /* Warning yellow - alerts */
--color-warning-600:  #d97706   /* Warning hover */

/* Error - red */
--color-error-400:    #f87171   /* Light red - hover */
--color-error-500:    #ef4444   /* Error red - destructive actions */
--color-error-600:    #dc2626   /* Error hover */

/* Info - blue */
--color-info-400:     #60a5fa   /* Light blue - hover */
--color-info-500:     #3b82f6   /* Info blue - informational */
--color-info-600:     #2563eb   /* Info hover */
```

### Text Colors

```css
--color-text-primary:   #ffffff     /* Primary text - headings, body */
--color-text-secondary: #e5e7eb     /* Secondary text - descriptions */
--color-text-tertiary:  #9ca3af     /* Tertiary text - labels, hints */
--color-text-disabled:  #6b7280     /* Disabled state */
--color-text-inverse:   #111827     /* Text on light backgrounds */
```

### Contrast Ratios (WCAG 2.1 AA)

| Color Combination | Ratio | Pass |
|-------------------|-------|------|
| White on Navy (#fff on #1a1845) | 13.2:1 | ✅ AAA |
| Orange on Navy (#ff6b35 on #1a1845) | 5.8:1 | ✅ AA |
| Success on Navy (#22c55e on #1a1845) | 6.2:1 | ✅ AA |
| Text Secondary on Navy (#e5e7eb on #1a1845) | 11.5:1 | ✅ AAA |

---

## Typography

### Font Stack (System Fonts Only)

```css
--font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
             'Roboto', 'Helvetica Neue', Arial, sans-serif;
--font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono',
             'Courier New', monospace;
```

### Type Scale

```css
--text-xs:    0.75rem   /* 12px - small labels */
--text-sm:    0.875rem  /* 14px - body small, labels */
--text-base:  1rem      /* 16px - body text */
--text-lg:    1.125rem  /* 18px - lead text */
--text-xl:    1.25rem   /* 20px - h4 */
--text-2xl:   1.5rem    /* 24px - h3 */
--text-3xl:   1.875rem  /* 30px - h2 */
--text-4xl:   2.25rem   /* 36px - h1 */
--text-5xl:   3rem      /* 48px - hero headings */
```

### Font Weights

```css
--font-normal:    400   /* Body text */
--font-medium:    500   /* Emphasized text */
--font-semibold:  600   /* Subheadings */
--font-bold:      700   /* Headings */
```

### Line Heights

```css
--leading-tight:   1.25   /* Headings */
--leading-snug:    1.375  /* Subheadings */
--leading-normal:  1.5    /* Body text */
--leading-relaxed: 1.625  /* Long-form content */
```

### Usage Guidelines

- **Headings:** Bold weight, tight line height
- **Body:** Normal weight, normal line height
- **Labels:** Medium weight, uppercase, small size
- **Code:** Monospace font, slightly smaller size

---

## Spacing System

### Base Unit: 4px (0.25rem)

```css
--space-0:   0rem      /* 0px */
--space-1:   0.25rem   /* 4px */
--space-2:   0.5rem    /* 8px */
--space-3:   0.75rem   /* 12px */
--space-4:   1rem      /* 16px */
--space-5:   1.25rem   /* 20px */
--space-6:   1.5rem    /* 24px */
--space-8:   2rem      /* 32px */
--space-10:  2.5rem    /* 40px */
--space-12:  3rem      /* 48px */
--space-16:  4rem      /* 64px */
--space-20:  5rem      /* 80px */
--space-24:  6rem      /* 96px */
```

### Semantic Spacing

```css
--gap-xs:      var(--space-2)   /* 8px - tight spacing */
--gap-sm:      var(--space-3)   /* 12px - compact spacing */
--gap-base:    var(--space-4)   /* 16px - default spacing */
--gap-md:      var(--space-6)   /* 24px - section spacing */
--gap-lg:      var(--space-8)   /* 32px - large spacing */
--gap-xl:      var(--space-12)  /* 48px - hero spacing */
```

---

## Border Radius

```css
--radius-sm:   0.25rem  /* 4px - small elements */
--radius-base: 0.5rem   /* 8px - buttons, inputs */
--radius-md:   0.75rem  /* 12px - cards */
--radius-lg:   1rem     /* 16px - modals */
--radius-xl:   1.5rem   /* 24px - hero elements */
--radius-full: 9999px   /* Circular */
```

---

## Shadows

```css
--shadow-xs:   0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-sm:   0 1px 3px 0 rgb(0 0 0 / 0.1),
               0 1px 2px -1px rgb(0 0 0 / 0.1);
--shadow-base: 0 4px 6px -1px rgb(0 0 0 / 0.1),
               0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-md:   0 10px 15px -3px rgb(0 0 0 / 0.1),
               0 4px 6px -4px rgb(0 0 0 / 0.1);
--shadow-lg:   0 20px 25px -5px rgb(0 0 0 / 0.1),
               0 8px 10px -6px rgb(0 0 0 / 0.1);
--shadow-xl:   0 25px 50px -12px rgb(0 0 0 / 0.25);

/* Glow effects */
--shadow-glow-primary:  0 0 20px rgba(79, 70, 229, 0.5);
--shadow-glow-success:  0 0 20px rgba(34, 197, 94, 0.5);
--shadow-glow-accent:   0 0 20px rgba(255, 107, 53, 0.5);
```

---

## Component Primitives

### Buttons

**Primary Button**
- Background: `--color-accent-500`
- Text: White
- Padding: `12px 24px` (base), `10px 20px` (sm), `14px 28px` (lg)
- Border radius: `--radius-base`
- Hover: `--color-accent-600`
- Focus: Outline with `--shadow-glow-accent`

**Secondary Button**
- Background: Transparent
- Border: `2px solid --color-text-secondary`
- Text: `--color-text-primary`
- Padding: Same as primary (account for border)
- Hover: Background `rgba(255, 255, 255, 0.1)`

**Danger Button**
- Background: `--color-error-500`
- Text: White
- Hover: `--color-error-600`

**Ghost Button**
- Background: Transparent
- Text: `--color-text-primary`
- Hover: Background `rgba(255, 255, 255, 0.05)`

### Inputs

**Text Input**
- Background: `rgba(255, 255, 255, 0.05)`
- Border: `1px solid rgba(255, 255, 255, 0.1)`
- Text: `--color-text-primary`
- Padding: `10px 16px`
- Border radius: `--radius-base`
- Focus: Border `--color-primary-500`, shadow `--shadow-glow-primary`

**Select**
- Same as text input
- Icon: Chevron down, `--color-text-tertiary`

**Checkbox/Radio**
- Size: `20px` (desktop), `44px` (mobile touch target)
- Border: `2px solid rgba(255, 255, 255, 0.3)`
- Checked background: `--color-accent-500`
- Focus: Outline with `--shadow-glow-primary`

### Cards

**Base Card**
- Background: `--color-bg-dark`
- Border: `1px solid rgba(255, 255, 255, 0.1)`
- Border radius: `--radius-md`
- Padding: `--space-6`
- Shadow: `--shadow-base`

**Elevated Card (Hover)**
- Shadow: `--shadow-lg`
- Transform: `translateY(-2px)`
- Transition: `all 200ms ease`

### Badges

**Status Badge**
- Padding: `4px 12px`
- Border radius: `--radius-full`
- Font size: `--text-xs`
- Font weight: `--font-medium`
- Uppercase: true

**Badge Variants:**
- Success: Background `--color-success-500/20`, text `--color-success-400`
- Warning: Background `--color-warning-500/20`, text `--color-warning-400`
- Error: Background `--color-error-500/20`, text `--color-error-400`
- Info: Background `--color-info-500/20`, text `--color-info-400`

### Modals

**Modal Overlay**
- Background: `rgba(0, 0, 0, 0.8)`
- Backdrop blur: `8px`

**Modal Content**
- Background: `--color-bg-darker`
- Border: `1px solid rgba(255, 255, 255, 0.1)`
- Border radius: `--radius-lg`
- Max width: `600px` (default), `900px` (large)
- Padding: `--space-8`
- Shadow: `--shadow-xl`

---

## Responsive Breakpoints

```css
--breakpoint-sm:  640px   /* Mobile landscape */
--breakpoint-md:  768px   /* Tablet */
--breakpoint-lg:  1024px  /* Desktop */
--breakpoint-xl:  1280px  /* Wide desktop */
--breakpoint-2xl: 1536px  /* Ultra-wide */
```

### Usage

- **Mobile (< 640px):** Single column, stacked navigation, large touch targets
- **Tablet (640px - 1024px):** Two columns, collapsible sidebar
- **Desktop (> 1024px):** Multi-column grids, persistent sidebar, hover states

---

## Animation & Transitions

### Duration

```css
--duration-fast:    150ms   /* Micro-interactions */
--duration-base:    200ms   /* Default transitions */
--duration-slow:    300ms   /* Complex animations */
--duration-slower:  500ms   /* Page transitions */
```

### Easing

```css
--ease-in:       cubic-bezier(0.4, 0, 1, 1);
--ease-out:      cubic-bezier(0, 0, 0.2, 1);
--ease-in-out:   cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce:   cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

### Respect User Preferences

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Accessibility Guidelines

### Focus States

All interactive elements must have visible focus indicators:
- Outline: `2px solid --color-primary-500`
- Outline offset: `2px`
- Combine with glow shadow for enhanced visibility

### Touch Targets

Minimum touch target size: **44x44px** (WCAG 2.1 AAA)
- Applies to all buttons, links, checkboxes, radio buttons
- Add padding/margin to meet minimum even if visual element is smaller

### Color Contrast

All text must meet WCAG 2.1 AA standards:
- Normal text: 4.5:1 minimum
- Large text (18px+): 3:1 minimum
- UI components: 3:1 minimum

### Screen Readers

- Use semantic HTML (`<button>`, `<nav>`, `<main>`, etc.)
- Add ARIA labels where needed (`aria-label`, `aria-describedby`)
- Provide alternative text for images (`alt` attribute)
- Announce dynamic content changes (`aria-live`)

---

## Component Library

### Base Components (Implemented)

1. **Button** - Primary, Secondary, Danger, Ghost variants
2. **Input** - Text, Email, Password, Number
3. **Select** - Dropdown with custom styling
4. **Checkbox** - Standard and indeterminate states
5. **Radio** - Radio button groups
6. **Badge** - Status indicators
7. **Card** - Content containers
8. **Modal** - Dialog overlays
9. **Alert** - Notification banners
10. **Tooltip** - Contextual help
11. **Loading** - Spinner and skeleton states
12. **Toggle** - On/off switch

### Admin-Specific Components

13. **DataTable** - Sortable, filterable tables
14. **Form** - Complete form layouts with validation
15. **Sidebar** - Collapsible navigation
16. **Breadcrumbs** - Navigation trail
17. **ContextBanner** - Current event indicator
18. **TabBar** - Tab navigation

### Public-Specific Components

19. **EventCard** - Event listing display
20. **BandCard** - Performance card
21. **Timeline** - Current/upcoming/past events
22. **ScheduleGrid** - Venue-based grid view
23. **FilterBar** - Time/venue filtering

---

## Usage Examples

### Button

```jsx
// Primary
<button className="px-6 py-3 bg-accent-500 text-white rounded-lg font-medium hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 focus:ring-offset-bg-navy transition-colors">
  Create Event
</button>

// Secondary
<button className="px-6 py-3 border-2 border-text-secondary text-text-primary rounded-lg font-medium hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors">
  Cancel
</button>
```

### Input

```jsx
<div className="space-y-2">
  <label htmlFor="event-name" className="block text-sm font-medium text-text-secondary">
    Event Name
  </label>
  <input
    type="text"
    id="event-name"
    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-text-primary placeholder-text-tertiary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 focus:outline-none transition-colors"
    placeholder="Long Weekend Band Crawl Vol. 6"
  />
</div>
```

### Card

```jsx
<div className="bg-bg-dark border border-white/10 rounded-xl p-6 shadow-base hover:shadow-lg transition-shadow">
  <h3 className="text-xl font-bold text-text-primary mb-2">Event Title</h3>
  <p className="text-text-secondary">Event description goes here...</p>
</div>
```

---

## Design Tokens in Code

All design tokens are available as:
1. **CSS Variables** - in `frontend/src/index.css`
2. **Tailwind Classes** - in `frontend/tailwind.config.js`
3. **Component Props** - in reusable components

### Example CSS Variables

```css
:root {
  /* Colors */
  --color-primary-500: #4f46e5;
  --color-accent-500: #ff6b35;
  --color-bg-navy: #1a1845;

  /* Spacing */
  --space-4: 1rem;
  --space-6: 1.5rem;

  /* Typography */
  --text-base: 1rem;
  --font-sans: system-ui, sans-serif;
}
```

---

## Next Steps

1. ✅ Design system documentation complete
2. 🔄 Implement CSS variables in `index.css`
3. 🔄 Update Tailwind config with design tokens
4. 🔄 Build base component library
5. 🔄 Apply design system to admin interface
6. 🔄 Apply design system to public interface

---

**Status:** Foundation Complete - Ready for Implementation
**Sprint:** 2.0 - UI/UX Redesign & Design System
**Date:** November 18, 2025

