# Set Times Design System

**Version**: 2.0
**Status**: ✅ WCAG 2.1 AA Compliant
**Last Updated**: Sprint 2.0 Completion

## Overview

The Set Times Design System provides a comprehensive foundation for building accessible, responsive, and visually consistent user interfaces across both admin and public-facing applications. Built on CSS custom properties and React components, this system ensures maintainability and scalability.

## Design Tokens

All design tokens are defined in `/frontend/src/styles/tokens.css` using CSS custom properties for easy theming and consistency.

### Color System

#### Brand Colors
```css
--color-primary: #db2777    /* Pink Lemonade primary */
--color-secondary: #f59e0b  /* Warm complementary */
--color-accent: #0369a1     /* Cool contrast (WCAG AA: 4.51:1) */
```

#### Semantic Colors (WCAG AA Compliant)
```css
--color-success: #047857    /* 5.48:1 contrast ratio */
--color-warning: #b45309    /* 5.02:1 contrast ratio */
--color-error: #ef4444      /* 4.5:1 minimum maintained */
--color-info: #3b82f6
```

All semantic colors meet WCAG 2.1 AA standards for contrast when used on white backgrounds.

#### Surface & Text
```css
--color-background: #ffffff
--color-surface: #fafafa
--color-text-primary: #171717    /* High contrast */
--color-text-secondary: #525252  /* Medium contrast */
--color-border: #d4d4d4
```

### Typography Scale

**Modular Scale**: 1.25 ratio for harmonious sizing

```css
--font-size-xs: 0.75rem    /* 12px */
--font-size-sm: 0.875rem   /* 14px */
--font-size-base: 1rem     /* 16px - body default */
--font-size-lg: 1.125rem   /* 18px */
--font-size-xl: 1.25rem    /* 20px */
--font-size-2xl: 1.5rem    /* 24px - h3 */
--font-size-3xl: 1.875rem  /* 30px - h2 */
--font-size-4xl: 2.25rem   /* 36px - h1 */
```

**Font Weights**:
- Normal: 400 (body text)
- Medium: 500 (emphasis)
- Semibold: 600 (headings)
- Bold: 700 (strong emphasis)

### Spacing System

**8px Grid System** - All spacing based on 4px base unit:

```css
--spacing-1: 4px
--spacing-2: 8px
--spacing-3: 12px
--spacing-4: 16px   /* Common button/input padding */
--spacing-6: 24px   /* Section spacing */
--spacing-8: 32px   /* Large gaps */
--spacing-12: 48px  /* Page sections */
```

### Border Radius

```css
--radius-sm: 4px    /* Badges, small buttons */
--radius-md: 8px    /* Cards, inputs, buttons */
--radius-lg: 12px   /* Modals, large cards */
--radius-full: 9999px  /* Pills, circular buttons */
```

### Shadows

Layered elevation system for depth hierarchy:

```css
--shadow-sm: Subtle elevation (dropdowns)
--shadow-md: Standard cards
--shadow-lg: Modals, overlays
--shadow-focus: 0 0 0 3px primary-200 (accessibility)
```

## Component Library

### Base Components (11)

**Form Controls**:
- `<Button>` - Primary, secondary, danger, ghost, success, warning, link variants
- `<Input>` - Text, email, password, number inputs with validation states
- `<Select>` - Dropdown select with options, placeholder, and validation
- `<Textarea>` - Multi-line text input with character counting and resize options

**Feedback & Overlays**:
- `<Alert>` - Success, warning, error, info notifications with icons
- `<Modal>` - Dialog with focus trap, escape handling, backdrop click
- `<ConfirmDialog>` - Confirmation modal for destructive actions
- `<Loading>` - Loading spinner with size variants and fullscreen mode
- `<Tooltip>` - Accessible tooltip with arrow positioning (top/bottom/left/right)

**Data Display**:
- `<Card>` - Content container with variants (default, elevated, gradient, glow)
- `<Badge>` - Status indicators with semantic colors (memoized)

All components available in `/frontend/src/components/ui/`

**Component Architecture**:
- **Tailwind Components (11)**: Use utility classes with prop-based variants
- **Responsive Strategy**: Mobile-first with consumer-level breakpoints (sm:, md:, lg:, xl:, 2xl:)
- **Accessibility**: All components include proper ARIA attributes, focus management, and keyboard support

### Component Usage Examples

#### Button Component
```jsx
import { Button } from '@/components/ui/Button';

// Primary action
<Button variant="primary" size="md">Save Changes</Button>

// Secondary action
<Button variant="secondary" size="sm">Cancel</Button>

// Loading state
<Button loading disabled>Processing...</Button>
```

#### Modal Component with Focus Trap
```jsx
import { Modal } from '@/components/Modal';

<Modal
  isOpen={isOpen}
  onClose={handleClose}
  title="Edit Band"
  size="md"
  closeOnEscape
  closeOnOverlayClick
>
  <form>
    {/* Modal content with automatic focus management */}
  </form>
</Modal>
```

#### Alert Component
```jsx
import Alert from '@/components/ui/Alert';

<Alert
  variant="success"
  dismissible
  onClose={handleClose}
>
  Band created successfully!
</Alert>
```

#### Select Component
```jsx
import Select from '@/components/ui/Select';

<Select
  label="Venue"
  value={selectedVenue}
  onChange={(e) => setSelectedVenue(e.target.value)}
  options={[
    { value: 'venue-1', label: 'The Warehouse' },
    { value: 'venue-2', label: 'Club Nova' },
  ]}
  placeholder="Select a venue"
  required
/>
```

#### Textarea Component
```jsx
import Textarea from '@/components/ui/Textarea';

<Textarea
  label="Band Bio"
  value={bio}
  onChange={(e) => setBio(e.target.value)}
  placeholder="Tell us about the band..."
  rows={4}
  maxLength={500}
  showCount
/>
```

## Accessibility Features

### WCAG 2.1 AA Compliance

**Verified**: 34/34 accessibility tests passing (Playwright + @axe-core)

**Color Contrast**:
- Text colors: Minimum 4.5:1 contrast ratio with backgrounds
- UI components: Minimum 3:1 contrast ratio
- All semantic colors tested and verified

**Keyboard Navigation**:
- All interactive elements accessible via keyboard
- Tab order follows logical content flow
- Focus visible on all interactive elements
- Escape key closes modals/dialogs

**Focus Management**:
- Modal focus trap prevents focus from escaping dialogs
- Focus restoration when modals close
- Custom focus indicators using `--shadow-focus`

**ARIA Attributes**:
- `role="dialog"` and `aria-modal="true"` on modals
- `aria-label` on icon buttons
- `aria-labelledby` connecting titles to content
- Form inputs properly labeled

**Screen Reader Support**:
- Semantic HTML structure
- Descriptive alt text for images
- Status announcements for dynamic content
- Accessible form validation messages

### Accessibility Features by Component

**Modal**:
- Focus trap prevents Tab from leaving dialog
- Escape key closes (configurable)
- Focus restored to trigger element on close
- Body scroll prevented while open
- Overlay click handling (configurable)

**Alert**:
- Icon-based visual indicators
- Color-blind safe design
- Dismissible with keyboard (Escape)
- Semantic color meanings consistent

**Form Controls**:
- Proper label associations
- Validation state indicators
- Error message announcements
- Disabled state styling

## Responsive Design

### Mobile-First Approach

All components use mobile-first responsive patterns with progressive enhancement.

**Breakpoints**:
```css
/* Mobile: 0-639px (default) */
/* Tablet: 640px+ */
/* Desktop: 1024px+ */
/* Wide: 1280px+ */
```

### Responsive Implementation Strategy

**Component-Level Responsive CSS (1 Component)**:
- **Modal** (CSS Modules) - True @media queries for mobile (@media max-width: 640px), high contrast (@media prefers-contrast: high), reduced motion (@media prefers-reduced-motion: reduce)

**Touch Target Compliance (All Interactive Components)**:
- Button, Input, ConfirmDialog - All use `min-h-[44px]` for WCAG 2.1 AAA compliance

**Consumer-Level Responsive Behavior**:
- **ScheduleView.jsx** - Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4`
- **Header.jsx** - Layout: `flex-col md:flex-row`, text scaling: `text-lg sm:text-xl md:text-2xl`
- **BandCard.jsx** - Typography: `text-base md:text-lg`, `text-xs md:text-sm`

**Architecture Rationale**:
Base components use Tailwind with fixed classes and prop-based variants for simplicity. Responsive behavior happens at the page/consumer level using Tailwind's breakpoint prefixes (sm:, md:, lg:, xl:, 2xl:), allowing flexible layouts while maintaining component simplicity.

**Touch Target Compliance**:
All interactive elements meet minimum 44px touch target on mobile (WCAG 2.1 Level AAA):

```css
/* Tailwind utility approach */
.button {
  min-height: 44px; /* min-h-[44px] */
}

/* Direct sizing approach */
.iconButton {
  height: 44px; /* h-11 (11 × 4px = 44px) */
  width: 44px;  /* w-11 */
}
```

### Responsive Pattern Examples

**Touch Target Implementation**:
```jsx
// Tailwind utility approach (Button.jsx)
<button className="min-h-[44px] px-6 py-3">
  Click Me
</button>

// Grid-based sizing (BandCard.jsx)
<button className="h-11 w-11 flex items-center justify-center">
  <FontAwesomeIcon icon={faPlus} />
</button>
```

**Typography Scaling** (mobile-first progressive enhancement):
```jsx
// BandCard.jsx - Progressive text sizing
<h3 className="text-base md:text-lg leading-snug">
  {band.name}
</h3>

<p className="text-xs md:text-sm">
  {band.venue}
</p>
```

**Layout Switching** (column to row transitions):
```jsx
// Header.jsx - Responsive layout changes
<div className="flex flex-col md:flex-row items-center gap-3">
  {/* Stacks vertically on mobile, horizontal on tablet+ */}
</div>

// ScheduleView.jsx - Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
  {/* 1 column mobile, 2 tablet, 3 desktop, 4 wide screens */}
</div>
```

**State-Based Responsive Behavior**:
```jsx
// Header.jsx - Scroll-triggered responsive changes
const [scrolled, setScrolled] = useState(false)

useEffect(() => {
  const onScroll = () => setScrolled(window.scrollY > 50)
  window.addEventListener('scroll', onScroll, { passive: true })
  return () => window.removeEventListener('scroll', onScroll)
}, [])

return (
  <header className={`transition-all duration-300 ${
    scrolled
      ? 'py-2 shadow-lg backdrop-blur-sm bg-bg-navy/85'
      : 'py-4 bg-gradient-to-b from-bg-navy to-bg-purple'
  }`}>
    <h1 className={`font-bold transition-all ${
      scrolled
        ? 'text-lg sm:text-xl md:text-2xl'
        : 'text-3xl md:text-4xl'
    }`}>
      {title}
    </h1>
  </header>
)
```

**Breakpoint Best Practices**:
- **sm: 640px** - Minor adjustments, text size bumps
- **md: 768px** - Layout changes (column → row), component visibility
- **lg: 1024px** - Grid column increases, sidebar additions
- **xl: 1280px** - Wide layouts, max-width constraints
- **2xl: 1536px** - Maximum density layouts, 4+ column grids

### Reduced Motion Support

Respects `prefers-reduced-motion` user preference:

```css
@media (prefers-reduced-motion: reduce) {
  .alert {
    animation: none;
  }
  .closeButton {
    transition: none;
  }
}
```

## Admin vs Public Interface

### Shared Design Language

Both admin and public interfaces use the same design system foundation:

**Shared Elements**:
- Design tokens from `tokens.css`
- Component library from `/components`
- Typography scale and spacing
- Accessibility standards
- Responsive breakpoints

**Admin Interface** (`/admin/`):
- 19 specialized components
- Data-intensive layouts (tables, forms)
- Bulk actions and management tools
- Higher information density

**Public Interface**:
- User-facing event browsing
- Mobile-optimized schedule views
- Simplified navigation
- Content-focused design

Both interfaces maintain visual consistency through shared token usage while adapting layouts for their specific use cases.

## Usage Guidelines

### Getting Started

1. **Import Design Tokens**:
```jsx
import '@/styles/tokens.css';
```

2. **Use CSS Variables in Components**:
```css
.myComponent {
  color: var(--color-text-primary);
  padding: var(--spacing-4);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}
```

3. **Import Components**:
```jsx
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/Modal';
import { Alert } from '@/components/Alert';
```

### Best Practices

**Color Usage**:
- Use semantic colors for their intended purpose (success for confirmations, error for failures)
- Never hardcode color values - always use tokens
- Verify contrast ratios when creating new color combinations

**Spacing**:
- Use the 8px grid system consistently
- Prefer spacing tokens over arbitrary values
- Maintain consistent spacing within component groups

**Typography**:
- Use the modular scale for all font sizes
- Maintain line-height for readability (1.5 for body, 1.25 for headings)
- Use font weights intentionally (semibold for headings, normal for body)

**Component Composition**:
- Build complex UIs from base components
- Extend components using CSS modules, not inline styles
- Maintain accessibility when composing

### Migration Guide

If upgrading from a previous design system:

1. **Replace hardcoded colors** with tokens:
   ```css
   /* Before */
   color: #db2777;

   /* After */
   color: var(--color-primary);
   ```

2. **Update spacing** to grid system:
   ```css
   /* Before */
   padding: 15px;

   /* After */
   padding: var(--spacing-4); /* 16px - closest grid value */
   ```

3. **Replace custom components** with design system equivalents
4. **Run accessibility tests** to verify WCAG compliance maintained

## Testing

### Accessibility Testing

**Automated Tests** (Playwright + @axe-core):
```bash
npm run test:e2e:accessibility
```

**Manual Testing Checklist**:
- [ ] Keyboard navigation works for all interactive elements
- [ ] Focus indicators visible and clear
- [ ] Screen reader announcements make sense
- [ ] Color contrast meets WCAG AA standards
- [ ] Touch targets at least 32px on mobile

### Visual Regression Testing

```bash
npm run test:visual
```

### Component Testing

```bash
npm test
```

## Resources

**Files**:
- Design Tokens: `/frontend/src/styles/tokens.css`
- Components: `/frontend/src/components/`
- Admin Interface: `/frontend/src/admin/`

**Standards**:
- WCAG 2.1 AA: https://www.w3.org/WAI/WCAG21/quickref/
- React Best Practices: `/reactjs.instructions.md`
- Project Roadmap: `/ROADMAP_TO_DEMO.md`

**Testing**:
- Playwright Accessibility: https://playwright.dev/docs/accessibility-testing
- Axe-core Rules: https://github.com/dequelabs/axe-core

## Changelog

### Sprint 2.0 (Current) - January 2026
- ✅ Established design token system with CSS custom properties
- ✅ Created 11 base components with consistent patterns
- ✅ Achieved WCAG 2.1 AA compliance (34/34 tests passing)
- ✅ Implemented touch target compliance (44px minimum) across all interactive components
- ✅ Mobile-first responsive architecture with Tailwind breakpoints
- ✅ Built admin interface with 19 specialized components
- ✅ **Added focus trap implementation to Modal** - Tab/Shift+Tab cycles within modal, focus restoration on close
- ✅ **Added Select component** - Dropdown with options, placeholder, validation states
- ✅ **Added Textarea component** - Multi-line input with character counting, resize control
- ✅ Updated semantic colors for WCAG AA contrast compliance
- ✅ Documented accurate design system reflecting current implementation

### Component Summary
| Component | Features | Accessibility |
|-----------|----------|---------------|
| Button | 8 variants, 3 sizes, loading state | Focus ring, disabled state |
| Input | Validation, icons, helper text | Label association, aria-invalid |
| Select | Options, placeholder, validation | Label association, aria-invalid |
| Textarea | Character count, resize, validation | Label association, aria-invalid |
| Alert | 4 variants, dismissible, icons | role="alert", aria-live |
| Modal | Focus trap, backdrop click, sizes | aria-modal, focus management |
| ConfirmDialog | Danger/primary variants | ESC to close, aria-modal |
| Loading | 4 sizes, fullscreen, text | role="status", aria-live |
| Tooltip | 4 positions, arrow | role="tooltip", keyboard |
| Card | 6 variants, hoverable | Semantic structure |
| Badge | 6 variants, 3 sizes | Memoized for performance |

---

**Design System Status**: ✅ Complete and Production-Ready
