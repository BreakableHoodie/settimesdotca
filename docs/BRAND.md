# SetTimes Brand Identity

One-page reference for the SetTimes visual identity. This is the source of truth for logo usage and voice; it points at code for exact color values rather than duplicating them, so it can't drift.

## Colors

**Do not copy hex values from this doc into new code.** The four user-selectable themes (`midnight-ember`, `arctic-night`, `daybreak`, `silver-lining`) are defined as CSS custom properties in `frontend/src/index.css` under each `[data-theme='...']` block, and exposed as Tailwind v4 utilities via `@theme`. That file is the single source of truth — reference the semantic tokens (`text-accent-500`, `bg-bg-navy`, etc.), not literal hex codes. See the Theming section of the repo `CLAUDE.md` for the full token map and the "never hardcode white" rule for public/theme-following surfaces.

The core brand identity — the colors that appear in the logo itself, independent of the user's chosen theme — is fixed:

| Role                    | Value     | Where it comes from                                          |
| ----------------------- | --------- | ------------------------------------------------------------ |
| Brand orange (accent)   | `#f97316` | `--color-accent-500` in the `midnight-ember` (default) theme |
| Brand navy (background) | `#0c0f1a` | `--color-bg-navy` in the `midnight-ember` (default) theme    |

Logo assets (favicon, monogram, wordmark) are keyed to these two values regardless of which theme a visitor has selected — the mark itself doesn't re-theme, only the surrounding UI does.

> Note: `docs/design-system/DESIGN_SYSTEM.md` predates the current theme system and lists different (stale) color values and a "no web fonts" rule that's no longer accurate. Treat `frontend/src/index.css` as authoritative; that doc needs a refresh (tracked separately).

## Typography

- **Display** (`--font-display`, `frontend/src/index.css`): `'Bebas Neue', Impact, 'Arial Narrow', sans-serif`. Bebas Neue is self-hosted at `frontend/public/fonts/bebas-neue-latin.woff2` (no Google Fonts network dependency). Used for headings, the wordmark, and other high-impact display text — tall, condensed, all-caps by design.
- **Body** (`--font-sans`, `frontend/src/index.css`): `system-ui, -apple-system, BlinkMacSystemFont, ...` — the platform's native sans-serif stack. No web font is loaded for body copy.

## Logo usage

Two canonical marks live in `docs/brand/` as self-contained SVGs (embedded font, no external dependencies):

- **`docs/brand/wordmark.svg`** — "SetTimes" in Bebas Neue, `Set` in brand orange + `Times` in white, on the brand navy background. This mirrors the live site header (`frontend/src/components/Header.jsx`: `<span className="text-accent-500">Set</span>Times`, `font-display`). Use the wordmark wherever there's horizontal room and the brand name should read as text: site header, marketing pages, email headers, presentation title slides.
- **`docs/brand/monogram.svg`** — the "ST" monogram, orange "S" + white "T" on a rounded navy square. Use the monogram wherever space is small or square: favicon, browser tab, PWA/app icon, social profile avatar, anywhere the full wordmark won't fit legibly.

Both marks are designed **on-dark only** — the white portion of each mark requires the brand navy (or another sufficiently dark surface) behind it to stay legible. Neither is provided as a transparent/light-background cutout; that would require a second color pass for white-on-light which isn't part of this pass (see Follow-ups).

`frontend/public/favicon.svg` and the generated favicon/PWA PNGs (`favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png`) are rendered directly from the monogram design. If the monogram changes, regenerate all of them together so they don't drift from each other.

## Voice

**No AI-written artist bios or copy.** Structured facts about a band or artist (links, genre, hometown, etc.) are fine to research and enter — that's data. Prose that represents an artist's voice or story is not ours to write; it's a creative-arts sensitivity, not a legal one. This applies to band profile bios, artist-facing copy, and anything presented as coming from the artist.

## Follow-ups (not built in this pass)

Tracked as GitHub issues rather than left implicit here:

- Social post templates (event announcement cards for Instagram, etc.)
- OG/share image (1200×630) template — there's currently no default `og:image` at all (only `BandProfilePage.jsx` sets one, conditionally, from the band's own photo); a branded fallback image doesn't exist yet
- `docs/design-system/DESIGN_SYSTEM.md` refresh — stale color values and font claims that predate `index.css` theming
