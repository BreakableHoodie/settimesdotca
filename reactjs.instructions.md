# React Best Practices - Set Times Project

**Purpose**: React/TypeScript coding standards for the Set Times project

**Last Updated**: Sprint 2.0 Completion

## React Component Patterns

### Modern Hooks-Based Components
- Use functional components with hooks (`useState`, `useEffect`, `useRef`)
- Avoid class components - all new code uses functional patterns
- Use `forwardRef` for components that need ref forwarding

### TypeScript Integration
- Define interfaces for all component props
- Export interfaces alongside components
- Use TypeScript's type inference where possible
- Avoid `any` type - use proper typing

### Component Structure
```tsx
import React, { useState, useEffect, forwardRef } from 'react';
import styles from './Component.module.css';

export interface ComponentProps {
  // Props definition
}

export const Component = forwardRef<HTMLElement, ComponentProps>(
  ({ prop1, prop2 }, ref) => {
    // Component implementation
  }
);

Component.displayName = 'Component';
```

## Accessibility (WCAG 2.1 AA)

### ARIA Attributes
- Use semantic HTML first (button, nav, main, header)
- Add ARIA when semantic HTML insufficient:
  - `role="dialog"` for modals
  - `aria-modal="true"` for modal overlays
  - `aria-labelledby` connecting titles to content
  - `aria-label` for icon buttons
  - `aria-live` for dynamic updates

### Keyboard Navigation
- All interactive elements accessible via Tab
- Focus trap for modals (prevent Tab escape)
- Escape key closes dialogs/overlays
- Focus indicators visible (--shadow-focus token)
- Restore focus when closing modals

### Focus Management
```tsx
const previousActiveElement = useRef<HTMLElement | null>(null);

useEffect(() => {
  if (isOpen) {
    previousActiveElement.current = document.activeElement as HTMLElement;
    modalRef.current?.focus();
  } else {
    previousActiveElement.current?.focus();
  }
}, [isOpen]);
```

## CSS Modules

### Scoped Styling
- Use CSS Modules (`.module.css`) for all component styles
- Import styles as object: `import styles from './Component.module.css'`
- Apply classes: `className={styles.className}`
- Combine classes: `className={\`${styles.base} ${styles.variant}\`}`

### Design Tokens
- ALWAYS use CSS custom properties from `tokens.css`
- Never hardcode colors, spacing, or typography
- Import tokens: `@import '../../styles/tokens.css';`

```css
/* Good */
.button {
  color: var(--color-primary);
  padding: var(--spacing-4);
  border-radius: var(--radius-md);
}

/* Bad */
.button {
  color: #db2777;
  padding: 16px;
  border-radius: 8px;
}
```

## State Management

### Local State
- Use `useState` for component-local state
- Use `useRef` for DOM references and mutable values
- Use `useEffect` for side effects with proper cleanup

### Cleanup Pattern
```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // Handle event
  };

  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [dependencies]);
```

## Event Handlers

### Naming Convention
- Prefix handlers with `handle`: `handleClick`, `handleSubmit`
- Use proper TypeScript event types:
  - `React.MouseEvent<HTMLElement>`
  - `React.KeyboardEvent<HTMLElement>`
  - `React.FormEvent<HTMLFormElement>`

### Example
```tsx
const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.preventDefault();
  // Handle click
};

const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
  if (e.key === 'Escape') {
    onClose();
  }
};
```

## Responsive Design

### Mobile-First Approach
- Base styles target mobile (320px+)
- Use `@media (min-width: 640px)` for tablet
- Use `@media (min-width: 1024px)` for desktop

### Touch Targets
- Minimum 32px touch targets on mobile
- Larger padding for clickable elements at small viewports

```css
@media (max-width: 640px) {
  .button {
    min-width: 32px;
    min-height: 32px;
    padding: var(--spacing-3);
  }
}
```

### Accessibility Media Queries
- Support `prefers-reduced-motion: reduce`
- Support `prefers-contrast: high`
- Support `prefers-color-scheme: dark` (future)

```css
@media (prefers-reduced-motion: reduce) {
  .animated {
    animation: none;
    transition: none;
  }
}
```

## Component Exports

### Index Files
- Export components and interfaces from `index.ts`
- Use named exports for better tree-shaking

```ts
export { Component } from './Component';
export type { ComponentProps } from './Component';
```

## Portal Pattern

### Modal Overlays
- Use `createPortal` from `react-dom` for modals
- Render to `document.body` for proper stacking
- Manage body scroll: `document.body.style.overflow`

```tsx
import { createPortal } from 'react-dom';

return createPortal(
  <div className={styles.overlay}>
    {/* Modal content */}
  </div>,
  document.body
);
```

## Testing Requirements

### Component Tests
- Test rendering with various props
- Test user interactions (click, keyboard)
- Test accessibility attributes
- Test responsive behavior

### Accessibility Tests
- Run Playwright + @axe-core tests
- Verify WCAG 2.1 AA compliance
- Test keyboard navigation
- Test screen reader announcements

## Design System Integration

### Use Existing Components
- Check component library before creating new components
- Extend existing components via CSS Modules
- Maintain design system consistency

### Component Composition
```tsx
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/Modal';

<Modal isOpen={isOpen} onClose={handleClose}>
  <form>
    <Button variant="primary">Submit</Button>
  </form>
</Modal>
```

## Performance Considerations

### Avoid Unnecessary Re-renders
- Use `React.memo` for expensive components
- Memoize callbacks with `useCallback`
- Memoize values with `useMemo`

### Lazy Loading
- Use `React.lazy` for code splitting
- Implement loading states for async components

## Code Quality

### Before Committing
- Run `npm test` - all tests must pass
- Run `npm run build` - must build without errors
- Verify TypeScript types with `npm run type-check`
- Review accessibility with browser DevTools

### Component Checklist
- ✅ TypeScript interfaces defined
- ✅ CSS Modules for styling
- ✅ Design tokens used (no hardcoded values)
- ✅ ARIA attributes for accessibility
- ✅ Keyboard navigation supported
- ✅ Focus management implemented
- ✅ Responsive design (mobile-first)
- ✅ Cleanup functions in useEffect
- ✅ Proper event handler types
- ✅ Component exported from index.ts

## Sprint 2.0 Reference Implementations

### Modal Component
See `/frontend/src/components/Modal/Modal.tsx` for:
- Focus trap implementation
- Portal pattern
- Keyboard event handling
- ARIA attributes
- Focus restoration

### Alert Component
See `/frontend/src/components/Alert/Alert.module.css` for:
- Mobile-responsive patterns
- Touch target compliance
- Accessibility media queries
- Design token usage

### Design System
See `/frontend/src/DESIGN_SYSTEM.md` for:
- Complete component library
- Usage examples
- Accessibility standards
- Responsive patterns
