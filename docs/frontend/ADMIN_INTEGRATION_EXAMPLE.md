# Admin Panel Integration Guide

This guide shows how to integrate the admin panel into your existing Long Weekend Band Crawl app.

## Option 1: Add Admin Route to Existing App (Recommended)

Update your `src/main.jsx` to include routing:

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import AdminApp from "./admin/AdminApp.jsx";
import "./index.css";

const hostname =
  typeof window !== "undefined" ? window.location.hostname || "" : "";
const isPreviewBuild =
  hostname.startsWith("dev.") || hostname.endsWith(".pages.dev");
const robotsMeta =
  typeof document !== "undefined"
    ? document.querySelector("meta[name='robots']")
    : null;
if (robotsMeta) {
  robotsMeta.setAttribute(
    "content",
    isPreviewBuild ? "noindex, nofollow" : "index,follow",
  );
} else if (typeof document !== "undefined") {
  const meta = document.createElement("meta");
  meta.name = "robots";
  meta.content = isPreviewBuild ? "noindex, nofollow" : "index,follow";
  document.head.appendChild(meta);
}

// Unregister service workers
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister().then((success) => {
          if (success) {
            console.warn(
              "[App] Service worker unregistered:",
              registration.scope,
            );
          }
        });
      });
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
```

Now you can access:

- Main app: `http://localhost:5173/`
- Admin panel: `http://localhost:5173/admin`

## Option 2: Separate Admin Page (For Testing)

Create a new file `admin.html` in your `public` folder:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin - Long Weekend Band Crawl</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/admin-entry.jsx"></script>
  </body>
</html>
```

Then create `src/admin-entry.jsx`:

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import AdminApp from "./admin/AdminApp.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>,
);
```

Access at: `http://localhost:5173/admin.html`

## Option 3: Hash-based Routing (No Backend Config Needed)

If you don't want to configure backend routing, use HashRouter:

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import AdminApp from "./admin/AdminApp.jsx";
import "./index.css";

// ... existing meta and service worker code ...

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminApp />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
```

Access at: `http://localhost:5173/#/admin`

## Quick Test Without Routing

For quick testing, temporarily replace your App in `main.jsx`:

```jsx
import AdminApp from "./admin/AdminApp.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>,
);
```

Access at: `http://localhost:5173/`

## Backend Configuration for Production

If using Option 1 (recommended), configure your server to serve `index.html` for all routes.

### Express.js Example

```javascript
// Serve admin route
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// Serve all other routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});
```

### Vite Dev Server

Already configured! Just use `/admin` path.

## File Structure After Integration

```
frontend/
├── src/
│   ├── admin/
│   │   ├── AdminApp.jsx         ← Main admin root component
│   │   ├── AdminLogin.jsx       ← Login screen
│   │   ├── AdminPanel.jsx       ← Admin panel container
│   │   ├── EventsTab.jsx        ← Events management
│   │   ├── VenuesTab.jsx        ← Venues management
│   │   ├── BandsTab.jsx         ← Bands management
│   │   └── README.md            ← Component documentation
│   ├── utils/
│   │   └── adminApi.js          ← API utilities
│   ├── App.jsx                  ← Main public app
│   └── main.jsx                 ← Entry point (update this)
```

## Testing Checklist

After integration:

1. Start dev server: `npm run dev`
2. Visit main app at `/` - should work normally
3. Visit admin at `/admin` - should show login screen
4. Test login functionality
5. Test all admin CRUD operations
6. Test logout functionality
7. Verify session persistence on refresh
8. Test on mobile viewport

## Navigation Between Admin and Public App

Add a link in your public app's header to access admin:

```jsx
// In your Header component
<a href="/admin" className="text-white/70 hover:text-white text-sm">
  Admin
</a>
```

Add a link in admin panel to return to public app:

```jsx
// In AdminPanel.jsx header section
<a href="/" className="text-band-orange hover:text-orange-300 text-sm">
  ← Back to Schedule
</a>
```

## Environment Variables (Optional)

Add to `.env` for configuration:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_ADMIN_ROUTE=/admin
```

Use in code:

```javascript
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/admin";
```

## Security Considerations

1. **Password Storage**: Admin password stored in sessionStorage (cleared on tab close)
2. **HTTPS Required**: Use HTTPS in production
3. **Rate Limiting**: Backend implements login attempt limiting
4. **Session Timeout**: Consider adding session expiration
5. **CSP Headers**: Configure Content Security Policy headers
6. **Admin Route**: Consider obscuring admin route path in production

## Troubleshooting

### Admin panel not loading

- Check console for errors
- Verify all admin files are in `src/admin/` directory
- Ensure `adminApi.js` is in `src/utils/`
- Check API base URL matches backend

### API calls failing

- Verify backend is running
- Check API endpoint paths match backend routes
- Inspect network tab for error details
- Verify admin password is stored in sessionStorage

### Routing not working

- Ensure `react-router-dom` is installed
- Check BrowserRouter is wrapping Routes
- Verify backend serves index.html for all routes

### Styles not applying

- Verify Tailwind config includes admin directory: `"./src/**/*.{js,jsx}"`
- Check `index.css` imports Tailwind directives
- Rebuild with `npm run build` if needed
