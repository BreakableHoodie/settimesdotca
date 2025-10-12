# Deployment Guide

## Branches

- `main` - Production branch (lwbc.dredre.net)
- `dev` - Development/testing branch

## GitHub Repository

The canonical repository lives at `git@github.com:BreakableHoodie/longweekend-bandcrawl.git`.

1. Ensure your local remotes point to GitHub:
   ```bash
   git remote -v
   # origin should be git@github.com:BreakableHoodie/longweekend-bandcrawl.git
   ```
   If not, update it with:
   ```bash
   git remote set-url origin git@github.com:BreakableHoodie/longweekend-bandcrawl.git
   ```
2. Keep both long-lived branches in sync:
   ```bash
   git checkout main && git pull
   git checkout dev && git pull
   ```
3. Apply [GitHub branch protection rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches):
   - `Settings → Branches → Add rule`
   - Rule name `main`: require pull request reviews, status checks (Cloudflare Pages), and block force pushes.
   - Duplicate the rule for `dev` (can be less strict if desired, but keep force pushes disabled).

### Connect GitHub to Cloudflare Pages

1. In the Cloudflare dashboard, open **Workers & Pages → longweekend-bandcrawl**.
2. Go to **Settings → Builds & deployments → Git integration** and choose **Connect to Git provider** (or **Disconnect** from Direct Upload first, if that option is shown).
3. Authorize GitHub, select the new repository, and set **Production branch** to `main`.
4. Under **Preview branches**, add `dev` so Cloudflare builds preview deployments automatically.
5. Trigger a test deployment by pushing to `dev` and confirm the `dev.longweekend-bandcrawl.pages.dev` alias updates.

Cloudflare Pages works with private GitHub repositories. When authorizing, grant the Cloudflare Pages GitHub app access to the private repo (either “All repositories” or the specific one) so Cloudflare can read the code during builds.

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

### Enable the dev preview in Cloudflare Pages

1. Sign in to the Cloudflare dashboard and open **Workers & Pages**.
2. Select the `longweekend-bandcrawl` project.
3. In the left nav choose **Settings → Builds & deployments → Git integration**.
4. Confirm `main` is the production branch, then add `dev` under **Preview branches** so pushes to `dev` auto-build.

If the project is set up as a direct upload (no Git integration connected), the **Preview branches** UI will not appear. Use `npx wrangler pages deploy ... --branch dev` (shown above) to publish the dev build—Cloudflare automatically serves it at `dev.longweekend-bandcrawl.pages.dev`.

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
