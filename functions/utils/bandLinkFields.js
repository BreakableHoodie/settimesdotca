// The canonical server-side list of band social-link platform keys.
//
// There are deliberately TWO canonical homes for this list, one per side of
// the build boundary — the same pattern CLAUDE.md documents for
// AFTER_MIDNIGHT_THRESHOLD_HOUR (frontend/src/utils/festivalDays.js and
// functions/utils/eventDay.js). The reason is identical: Cloudflare Pages
// Functions cannot import from frontend/, so a single shared definition is
// impossible.
//
//   - frontend-side home: `LINK_FIELDS` in
//     frontend/src/admin/utils/bandFields.js — the registry that also pairs
//     each key with its label, icon, Tailwind accent, and URL-safety resolver.
//   - server-side home: `BAND_LINK_FIELD_KEYS` below — keys only, because the
//     server has no use for the render/colour/resolver metadata.
//
// #779 — until this file existed, two public read endpoints each hand-built
// the same `social` object literal against `safeReflectSocialLinks(output)`.
// `/api/bands/{name}` listed FOUR of the eight platforms (website, instagram,
// bandcamp, facebook); `/api/bands/stats/{name}` listed all eight. The shorter
// list silently dropped youtube, spotify, apple_music and linktree, and because
// each list was hand-written the two had already diverged and could do so
// again. Both now iterate this one constant; neither file names a platform key
// by hand any more (a source-scanning guard in
// functions/utils/__tests__/bandLinkFieldsGuard.test.js keeps it that way).
//
// Order mirrors `LINK_FIELDS` so the two homes enumerate platforms in the
// same sequence, but the response contract is an OBJECT, so order is not
// load-bearing for API consumers — what matters is that every key is present
// and that a ninth platform added to one home is added to the other in the
// same PR.

export const BAND_LINK_FIELD_KEYS = [
  "website",
  "instagram",
  "bandcamp",
  "facebook",
  "youtube",
  "spotify",
  "apple_music",
  "linktree",
];
