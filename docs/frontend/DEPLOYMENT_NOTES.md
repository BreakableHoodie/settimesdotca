# Deployment Notes

## Cache Invalidation

The service worker uses versioned cache names to ensure users get fresh content after updates.

**Before each deployment:**

1. Update the cache version in `public/sw.js`:

   ```javascript
   const CACHE_NAME = 'bandcrawl-vX' // Increment X
   ```

2. The service worker will:
   - Install with the new cache version
   - Delete old cache versions on activation
   - Force clients to use the new cache

## Pre-Deployment Checklist

- [ ] Update service worker cache version (`public/sw.js`)
- [ ] Run `npm run build` to create production build
- [ ] Test the build locally with `npm run preview`
- [ ] Verify all functionality works in the preview
- [ ] Check browser console for errors
- [ ] Test on mobile device or responsive mode

## Post-Deployment Verification

- [ ] Visit production URL and hard refresh (Cmd/Ctrl + Shift + R)
- [ ] Check that service worker registered successfully (DevTools > Application > Service Workers)
- [ ] Verify security headers are present (DevTools > Network > select any request > Headers)
- [ ] Test the site in offline mode (DevTools > Network > Offline checkbox)
- [ ] Confirm Font Awesome icons load correctly
- [ ] Test schedule loading and band selection
- [ ] Verify "Clear Schedule" functionality
