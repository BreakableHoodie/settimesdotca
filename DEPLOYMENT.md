# Deployment Instructions for Cloudflare Pages

## Deploying to lwbc.dredre.net

This project is configured to deploy to Cloudflare Pages at **lwbc.dredre.net**.

### Build Configuration

**Framework preset:** Vite
**Build command:** `cd frontend && npm install && npm run build`
**Build output directory:** `frontend/dist`
**Root directory:** `/` (project root)

### Environment Variables

No environment variables required for this static build.

### Step-by-Step Deployment

1. **Connect Repository to Cloudflare Pages**

   - Log in to Cloudflare Dashboard
   - Go to Pages → Create a project
   - Connect your GitHub account
   - Select the repository: `BreakableHoodie/longweekend-bandcrawl`
   - Set `main` as the production branch and add `dev` under preview branches

2. **Configure Build Settings**

   ```
   Framework preset: Vite
   Build command: cd frontend && npm install && npm run build
   Build output directory: frontend/dist
   Root directory: / (leave blank or set to root)
   ```

3. **Configure Custom Domain**

   - After initial deployment, go to Pages → Your Project → Custom domains
   - Add custom domain: `lwbc.dredre.net`
   - Follow DNS configuration instructions (likely a CNAME record)

4. **Deploy**
   - Click "Save and Deploy"
   - Cloudflare will automatically build and deploy
   - Future pushes to main branch will auto-deploy

### DNS Configuration

You'll need to add a CNAME record in your DNS settings:

```txt
Type: CNAME
Name: lwbc
Target: [your-project].pages.dev
Proxy status: Proxied (orange cloud)
```

### Important Notes

- The app is a **static PWA** - no backend required
- All data is in `frontend/public/bands.json`
- User schedules are stored in **localStorage** (browser-side only)
- Service worker caches assets for offline use
- Build time: ~1-2 minutes

### Troubleshooting

**Build fails:**

- Ensure build command includes `cd frontend` since the Vite project is in a subdirectory
- Check that Node version is 20+ in Cloudflare settings

**404 errors on routes:**

- This is a single-page app - Cloudflare Pages should handle this automatically with Vite
- If issues persist, create `frontend/public/_redirects` file:
  ```
  /*    /index.html   200
  ```

**Service worker not updating:**

- The service worker caches aggressively
- Users may need to hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- Consider updating cache version in `frontend/public/sw.js` when making changes

### Local Testing Before Deploy

```bash
# Build and preview locally
cd frontend
npm install
npm run build
npm run preview
```

This will serve the production build locally on http://localhost:4173 for testing.

### Post-Deployment Checklist

- [ ] Verify custom domain resolves correctly
- [ ] Test PWA install on mobile device
- [ ] Verify all band data loads correctly
- [ ] Test schedule persistence (localStorage)
- [ ] Test share functionality
- [ ] Verify countdown timers show correct times on event day
- [ ] Check service worker caching (offline mode)
- [ ] Test on multiple browsers (Chrome, Safari, Firefox)

### Updating Band Data

To update the band schedule after deployment:

1. Edit `frontend/public/bands.json`
2. Commit and push to main branch
3. Cloudflare will automatically rebuild and deploy
4. Users may need to refresh to see changes (service worker cache)

---

**Event Date:** October 12, 2025
**Deployment Domain:** https://lwbc.dredre.net
**Repository:** BreakableHoodie/longweekend-bandcrawl
