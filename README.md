# Long Weekend Band Crawl Vol. 14

A mobile-first web app that lets attendees build and view their personalized schedules for the Long Weekend Band Crawl. Select bands, see conflicts, and get "coming up in X minutes" reminders.

## Features

- Browse all performances across 4 venues
- Tap to add/remove bands from your schedule
- Persistent storage via localStorage
- "Coming up in X minutes" countdown bar
- Conflict detection for overlapping times
- Mobile-first responsive design
- Deep navy/purple background with neon orange accents (faithful to event poster)

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

## Future Enhancements

- Backend persistence with user accounts
- Social sharing of schedules
- Push notifications for upcoming shows
- Multi-year/volume support
- Map integration for venues
- Real-time updates

## Credits

Event presented by Fat Scheid & Pink Lemonade Records

## License

MIT
