# GitHub Copilot Instructions

This document provides guidance to GitHub Copilot for working on the Long Weekend Band Crawl mobile schedule application.

## Project Overview

A mobile-first web application for the Long Weekend Band Crawl event that allows attendees to:
- Browse all performances across 4 venues
- Build personalized schedules by selecting bands
- View "coming up in X minutes" countdowns
- Detect scheduling conflicts
- Copy schedules to clipboard

## Architecture

### Tech Stack
- **Frontend**: React 18 + Vite 5 + Tailwind CSS 3
- **Backend**: Express.js (Node.js)
- **State Management**: React hooks + localStorage
- **Build Tools**: Vite, Docker
- **Testing**: Vitest + Testing Library + axe-core (accessibility)
- **Code Quality**: ESLint, Prettier, Lighthouse CI

### Project Structure
```
settimesdotca/
├── frontend/           # React application
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── App.jsx     # Main application
│   │   ├── main.jsx    # React entry point
│   │   └── index.css   # Global styles
│   ├── public/
│   │   └── bands.json  # Event schedule data
│   └── package.json
├── backend/            # Express server
│   ├── server.js       # Serves static files
│   └── package.json
├── docs/               # Design references
├── Dockerfile          # Multi-stage build
├── docker-compose.yml
└── CLAUDE.md          # Detailed project instructions
```

## Development Workflow

### Setup
```bash
# Install all dependencies
./setup.sh

# Frontend development (http://localhost:5173)
cd frontend
npm run dev

# Full stack with Docker (http://localhost:3000)
docker-compose up --build
```

### Code Quality Commands
```bash
cd frontend

# Linting
npm run lint           # Check for issues
npm run lint:fix       # Auto-fix issues

# Formatting
npm run format         # Format with Prettier
npm run format:check   # Verify formatting

# Testing
npm run test           # Run all tests
npm run test:watch     # Watch mode
npm run test:a11y      # Accessibility tests only
npm run test:coverage  # Coverage report

# Complete quality check
npm run quality        # Run lint, format check, tests, and build
```

### Build & Preview
```bash
cd frontend
npm run build          # Production build
npm run preview        # Preview production build
```

## Coding Standards

### React Components
- Use **functional components** with hooks (no class components)
- Keep components focused and single-purpose
- Extract reusable logic into custom hooks
- Use prop destructuring for clarity
- Add PropTypes or TypeScript types where appropriate

Example:
```jsx
function BandCard({ band, isSelected, onToggle }) {
  // Component logic
}
```

### State Management
- Use `useState` for component-local state
- Use `useEffect` for side effects (localStorage, timers)
- Keep state as close to where it's needed as possible
- Avoid prop drilling; consider context for deeply nested state

### Styling
- **Mobile-first approach**: Design for mobile, enhance for desktop
- Use **Tailwind CSS** utility classes
- Follow the existing design system:
  - Deep navy/purple gradient background (#1a1845 to #2d2554)
  - Orange/peach accent (#f5a962) for bands and highlights
  - White text for high contrast
  - Rounded corners and subtle shadows
- Ensure touch targets are at least 44x44px
- Maintain consistent spacing using Tailwind's spacing scale

### Accessibility
- All interactive elements must be keyboard accessible
- Provide proper ARIA labels and roles
- Ensure color contrast meets WCAG AA standards (4.5:1 for text)
- Test with screen readers when possible
- Run accessibility tests: `npm run test:a11y`

### Performance
- Keep bundle size minimal
- Lazy load components when appropriate
- Optimize images (use WebP format)
- Use React.memo() for expensive components
- Avoid unnecessary re-renders

## Design Principles

1. **Mobile-First**: Primary user experience is on mobile devices
2. **Privacy-Focused**: No analytics, trackers, or external data collection
3. **Minimal Dependencies**: Only add dependencies when truly necessary
4. **Accessibility**: WCAG AA compliance minimum
5. **Performance**: Fast load times and smooth interactions
6. **Simplicity**: Clear, readable code over clever solutions

## Data Format

Bands are stored in `frontend/public/bands.json`:
```json
{
  "id": "band-slug",
  "name": "Band Name",
  "venue": "Venue Name",
  "startTime": "8:00",
  "endTime": "8:30"
}
```

## Common Tasks

### Adding a New Component
1. Create file in `frontend/src/components/`
2. Use functional component with hooks
3. Add Tailwind styling following design system
4. Ensure keyboard and screen reader accessibility
5. Add tests if logic is complex
6. Import and use in parent component

### Modifying Styles
1. Use Tailwind utilities when possible
2. Keep custom CSS in `index.css` minimal
3. Follow mobile-first responsive approach
4. Test on different screen sizes
5. Verify contrast ratios for accessibility

### Adding Dependencies
1. Evaluate if truly necessary (prefer standard library)
2. Check bundle size impact
3. Verify license compatibility (prefer MIT/Apache)
4. Add to appropriate package.json (frontend or backend)
5. Document why it's needed in commit message

### Fixing Bugs
1. Write a failing test that reproduces the bug
2. Fix the bug with minimal changes
3. Verify the test passes
4. Run full test suite: `npm run quality`
5. Test manually in browser

## Testing Guidelines

- Write tests for complex logic and user interactions
- Use Testing Library's user-centric queries (getByRole, getByLabelText)
- Test accessibility with jest-axe
- Mock external dependencies (localStorage, fetch)
- Keep tests focused and readable
- Aim for meaningful coverage, not 100%

## Git Workflow

- Create feature branches from `main`
- Use descriptive commit messages
- Keep commits focused and atomic
- Run `npm run quality` before pushing
- All quality checks run in CI/CD

## CI/CD

The repository uses GitHub Actions:
- **quality.yml**: Runs linting, tests, and build checks
- **cloudflare-pages.yml**: Deploys to Cloudflare Pages

All checks must pass before merging.

## Deployment

Production deploys to Cloudflare Pages:
- **Project root**: `frontend`
- **Build command**: `npm run build`
- **Output directory**: `dist`

## Important Files

- **CLAUDE.md**: Comprehensive project documentation (read this for context)
- **README.md**: User-facing documentation
- **frontend/public/bands.json**: Event schedule data
- **docs/schedule.webp**: Design reference poster

## Tips for Copilot

1. Always check `CLAUDE.md` for detailed project context
2. Run tests frequently during development
3. Follow the established patterns in existing components
4. Prioritize accessibility and mobile experience
5. Keep code changes minimal and focused
6. When in doubt, ask for clarification rather than assuming

## Resources

- [React Documentation](https://react.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Vite Documentation](https://vitejs.dev/guide)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref)
