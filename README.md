# Long Weekend Band Crawl Mobile Schedule

A mobile-first web app that lets attendees build and view their personalized schedules for the Long Weekend Band Crawl. Select bands, see conflicts, and get "coming up in X minutes" reminders.

## Features

- Browse all performances across 4 venues
- Tap to add/remove bands from your schedule
- Persistent storage via localStorage
- "Coming up in X minutes" countdown bar
- Conflict detection for overlapping times
- Quick copy buttons for either your picks or the entire lineup (clipboard-friendly)
- Mobile-first responsive design with a compact sticky header that adapts on scroll
- Deep navy/purple background with neon orange accents (faithful to event poster)

### Recent Polishes

- App-style shrinking header that keeps Tickets visible while freeing vertical space.
- Inline clipboard helpers: `Copy Schedule` (selected bands) and `Copy Full Schedule` with live success feedback.
- Improved accessibility: consistent focus states, touch-friendly controls, and semantic labelling.
- Clipboard fallback for older Safari/iOS so copy still works without prompts.

## Admin Panel

This project now includes a full-featured admin panel with Cloudflare D1 database integration for managing events, venues, and bands.

**Features:**
- Password-protected admin interface at `/admin`
- Manage multiple events (create, duplicate, publish/unpublish)
- CRUD operations for venues and bands
- Time conflict detection for overlapping performances
- Rate limiting and audit logging for security
- Master password recovery system
- Mobile-responsive design

**Quick Access:**
- Local: `http://localhost:5173/admin`
- Production: `https://yourdomain.com/admin`

**Setup:** See [D1_SETUP.md](D1_SETUP.md) for complete database setup, security configuration, and deployment instructions.

## Project Structure

```sh
longweekendbandcrawl/
├── frontend/                  # React + Vite + Tailwind
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx          # Top nav with view toggle
│   │   │   ├── ComingUp.jsx        # Countdown to next show
│   │   │   ├── BandCard.jsx        # Individual band tile
│   │   │   ├── ScheduleView.jsx    # Grid/list of all bands
│   │   │   └── MySchedule.jsx      # User's selected bands
│   │   ├── App.jsx                 # Main app logic
│   │   ├── main.jsx                # React entry point
│   │   └── index.css               # Global styles
│   ├── public/
│   │   └── bands.json              # Full event schedule data
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
├── backend/                   # Express server
│   ├── server.js                   # Serves static files + API
│   └── package.json
├── docs/
│   └── schedule.webp               # Design reference poster
├── Dockerfile                      # Multi-stage build
├── docker-compose.yml
├── setup.sh                        # Install dependencies
├── .gitignore
├── .dockerignore
├── CLAUDE.md                       # Project instructions
└── README.md
```

## Quick Start

### Option 1: Local Development (Frontend Only)

```bash
# Install dependencies
./setup.sh

# Run dev server (http://localhost:5173)
cd frontend
npm run dev
```

### Option 2: Full Stack with Docker

```bash
# Build and run (http://localhost:3000)
docker-compose up --build
```

The Docker setup:

- Builds frontend with Vite
- Serves static files via Express
- Includes helmet + compression middleware
- Production-ready container

## Development Commands

```bash
# Frontend only
cd frontend
npm run dev        # Dev server with hot reload
npm run build      # Production build
npm run preview    # Preview production build

# Backend only
cd backend
npm run dev        # Run with --watch flag
npm start          # Production mode

# Docker
docker-compose up --build    # Build and start
docker-compose down          # Stop containers
```

## Quality Assurance

### Code Quality

```bash
cd frontend

# Linting
npm run lint           # Run ESLint
npm run lint:fix       # Auto-fix linting issues

# Formatting
npm run format         # Format code with Prettier
npm run format:check   # Check code formatting

# Combined quality check
npm run quality        # Run lint, format check, tests, and build
```

### Testing

```bash
cd frontend

# Unit & Accessibility Tests
npm run test           # Run all tests once
npm run test:watch     # Run tests in watch mode
npm run test:ui        # Run tests with UI
npm run test:a11y      # Run accessibility tests only
npm run test:coverage  # Run tests with coverage report
```

### Automated Quality Checks

All quality checks run automatically in CI/CD:

- **Linting** - ESLint with React, accessibility, and hooks rules
- **Accessibility** - axe-core automated testing for WCAG compliance
- **Performance** - Lighthouse CI for automated performance audits
- **Build** - Bundle size reporting and build verification

See `.github/workflows/quality.yml` for the complete CI configuration.

### Performance Checks

Use the bundled PageSpeed Insights helper after each deploy:

```bash
cd frontend
PSI_API_KEY=<your-google-api-key> npm run psi:dev     # dev.longweekend-bandcrawl.pages.dev
PSI_API_KEY=<your-google-api-key> npm run psi:prod    # lwbc.dredre.net
```

Without an API key Google enforces a very small anonymous quota; create an API key in the Google Cloud console (`pagespeedonline.googleapis.com`) and export it as `PSI_API_KEY` for reliable runs.

## Data Structure

See `frontend/public/bands.json` for the schedule format:

```json
{
  "id": "band-slug",
  "name": "Band Name",
  "venue": "Venue Name",
  "startTime": "8:00",
  "endTime": "8:30"
}
```

## Design

Inspired by the event poster (`docs/schedule.webp`):

- Deep navy (#1a1845) to purple (#2d2554) gradient background
- Orange/peach (#f5a962) band cards with rounded corners
- White text for high contrast
- Mobile-first responsive layout
- Desktop: 4-column grid by venue
- Mobile: Single column chronological list

## Tech Stack

- **Frontend:** React 18, Vite 5, Tailwind CSS 3, React Router
- **Backend:** Cloudflare Pages Functions (serverless)
- **Database:** Cloudflare D1 (SQLite)
- **Admin Panel:** Password-protected with rate limiting
- **Build:** Docker multi-stage build (optional)
- **Persistence:** localStorage (user schedules) + D1 (event data)

## Browser Support

Modern browsers with ES2020+ support:

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Deploying to Cloudflare Pages

This repository is hosted on GitHub at [`BreakableHoodie/longweekend-bandcrawl`](https://github.com/BreakableHoodie/longweekend-bandcrawl).

1. **Push the latest code**

   ```bash
   git status
   git add .
   git commit -m "Prepare Cloudflare Pages release"
   git push origin main
   ```

2. **Connect the repo to Cloudflare Pages**

   - In the Cloudflare dashboard go to **Pages → Create a project → Connect to Git**.
   - Authorise the Cloudflare Pages GitHub app and grant it access to `BreakableHoodie/longweekend-bandcrawl`.
   - Pick `main` as the production branch and add `dev` as a preview branch so staging deploys happen automatically.

3. **Configure build settings**

   - **Project root:** `frontend`
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
   - Set `NODE_VERSION=20` (Build settings → Environment variables) to match the Cloudflare build image requirement.

4. **Deploy**

   - Cloudflare installs dependencies, runs the Vite build, and publishes to the `*.pages.dev` domain.
   - Add your custom domain in **Pages → Custom domains** when ready.

5. **Smoke test**
   - Visit the preview/production URLs on desktop and mobile. Confirm the shrinking header, copy buttons, and schedule loading behave as expected.
   - Rerun the build locally with `cd frontend && npm run preview` if you need to debug before pushing.

Once Pages is connected, every push to `main` (and `dev` for previews) triggers a fresh deployment.

## Credits

Event presented by Fat Scheid & Pink Lemonade Records

## License

MIT — see [`LICENSE`](LICENSE)
