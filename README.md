# Long Weekend Band Crawl Vol. 14

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

- **Frontend:** React 18, Vite 5, Tailwind CSS 3
- **Backend:** Express.js, Helmet, Compression
- **Build:** Docker multi-stage build
- **Persistence:** localStorage (browser-based)

## Browser Support

Modern browsers with ES2020+ support:

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Deploying to Cloudflare Pages

You can ship straight from your Gitea repo.

1. **Push the latest code**  
   ```bash
   git status
   git add .
   git commit -m "Prepare Cloudflare Pages release"
   git push origin main
   ```

2. **Create a Pages project**
   - In the Cloudflare dashboard go to **Pages → Create a project → Connect to Git**.
   - Authorise Cloudflare to read from your Gitea instance (you may need to add it as a custom git provider).
   - Select the `longweekendbandcrawl` repo and branch (e.g. `main`).

3. **Configure build settings**
   - **Project root**: `frontend`
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
   - (Optional) set `NODE_VERSION=18` under environment variables to match the local toolchain.

4. **Deploy**
   - Cloudflare installs dependencies and runs the build.
   - When the build finishes, the site is live on the auto-generated `*.pages.dev` domain.
   - Add a custom domain via the Pages dashboard if required.

5. **Smoke test**
   - Visit the production URL on desktop and mobile. Confirm the shrinking header, copy buttons, and schedule loading behave as expected.
   - You can rerun the build locally with `cd frontend && npm run preview` to double-check before pushing.

Once Pages is connected, every push to the selected branch triggers a fresh deployment.

## Credits

Event presented by Fat Scheid & Pink Lemonade Records

## License

MIT
