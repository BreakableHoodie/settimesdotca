# Deployment Guide

## Branches

- `main` - Production branch (lwbc.dredre.net)
- `dev` - Development/testing branch

## Deploy to Development

Test changes on the dev branch before deploying to production:

```bash
# Make sure you're on dev branch
git checkout dev

# Build and deploy to dev
npm run build
npx wrangler pages deploy dist --project-name longweekend-bandcrawl --branch dev
```

**Dev URL:** Will be at a subdomain like `dev.longweekend-bandcrawl.pages.dev`

## Deploy to Production

Only deploy to production after testing on dev:

```bash
# Switch to main branch
git checkout main

# Merge tested changes from dev
git merge dev

# Build and deploy to prod
npm run build
npx wrangler pages deploy dist --project-name longweekend-bandcrawl --branch main
```

**Production URL:** lwbc.dredre.net (via custom domain)

## Quick Commands

```bash
# Deploy current branch
npm run build && npx wrangler pages deploy dist --project-name longweekend-bandcrawl --branch $(git branch --show-current)

# Or add to package.json:
# "deploy:dev": "npm run build && npx wrangler pages deploy dist --project-name longweekend-bandcrawl --branch dev"
# "deploy:prod": "npm run build && npx wrangler pages deploy dist --project-name longweekend-bandcrawl --branch main"
```

## Testing Safari Cache Issues

After deploying to dev:

1. Visit dev URL in Safari
2. Open Developer Tools → Storage → Service Workers
3. Unregister old service workers
4. Hard refresh (Cmd + Shift + R)
5. Check Console for "[SW] Installing version" logs
6. Verify changes appear correctly

## Cache Busting Checklist

When updating bands.json or critical code:

1. Increment `DATA_VERSION` in `src/App.jsx`
2. Increment `CACHE_NAME` in `public/sw.js`
3. Commit changes
4. Deploy to dev first for testing
5. After verification, merge to main and deploy to prod
