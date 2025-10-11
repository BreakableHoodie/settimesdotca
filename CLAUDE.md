# CLAUDE.md — Long Weekend Band Crawl

## Project Summary

A mobile-first web app that lets attendees build and view their personalized schedules for the Long Weekend Band Crawl.
Users can browse all performances, tap to add/remove bands to their schedule, and see “coming up in X minutes” reminders based on their local time.

## Visual Reference

Use `docs/schedule.webp` as the design inspiration:

- **Palette:** Deep navy / purple background with bright neon accent colors.
- **Typography:** Clean, legible sans-serif — similar to the event poster style.
- **Layout:** Scrollable vertical timeline, with band blocks styled like event cards.
- **Mood:** Playful but readable in low light (concert/nighttime aesthetic).

## Stack

- **Frontend:** React (Vite) + TailwindCSS
- **Backend:** Express.js (Node)
- **Persistence:** localStorage (for MVP) — cookies optional
- **Deployment:** Docker & docker-compose
- **Design:** Mobile-first, responsive, modern dark theme.

## Core Features

- Event lineup loaded from `bands.json` (later backend or static asset).
- User can toggle any band on/off as “attending”.
- Persistent storage in browser (localStorage or cookie).
- Linear “My Schedule” view, sorted chronologically.
- “Coming up in X minutes” countdown for next selected show.
- Conflict detection for overlapping times.
- Fully scrollable interface with sticky top header and smooth transitions.

## Technical Goals

1. Build an MVP that runs with:
   - `npm run dev` (frontend)
   - `docker-compose up` for full stack.
2. Container serves frontend + backend via one Express instance.
3. Clean, commented, easy-to-read code.
4. Minimal dependencies.

## Docker

Single container build serving both the React frontend (built by Vite) and Express backend.

- Production: Express serves static build output.
- Dev: `docker-compose` mounts source directories for live reload.

## Commands

```bash
# Local dev (frontend only)
cd frontend
npm install
npm run dev

# Full stack
docker-compose up --build
```

## Design Guidance for Claude

When designing UI components:

- Match the color tones and contrast from `docs/schedule.webp`.
- Use Tailwind gradients for headers or footers.
- Apply rounded corners and subtle shadows for “card” elements.
- Keep touch targets large and mobile-first.
- Use a system or Google font like Inter, Poppins, or system-ui.

## Future Considerations

- Add authenticated sessions later (cookies + backend persistence).
- Optional social sharing for schedules.
- API endpoint for public event data.
- Expand to multiple years/volumes of the event.

## Claude Priorities

1. Keep UX minimal, clear, and responsive.
2. Don’t over-engineer.
3. Respect privacy — no analytics or trackers.
4. Ensure accessibility (contrast, focus states).
5. Output readable file structure and setup commands.

---
