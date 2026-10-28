// Poster-led event palettes (#1248): the stored shape of `events.theme_colors`.
//
//   { "v": 1, "source": "poster" | "manual", "poster": "<https url>",
//     "light": { "ground", "ink", "accent", "nowFill" },
//     "dark":  { "ground", "ink", "accent", "nowFill" } }
//
// or { "v": 1, "source": "none", "poster": "<https url>" }: the house theme,
// chosen for that poster (and so not re-read from it).
//
// `poster` is the poster the colours were read from. A palette describes ONE
// poster: the admin form re-reads when the event's poster differs from it, and
// the public page ignores a "poster" palette whose poster is not the event's
// current one (a hand-picked "manual" palette applies regardless).
//
// Every colour is `#rrggbb`; either hex case is accepted. The frontend's copy of this
// check is `isValidThemeColours` in frontend/src/utils/posterPalette.js; Pages
// Functions cannot import from frontend/, so the two are kept in step by tests
// on each side (the after-midnight threshold's two-homes rule). Contrast is not
// checked here: the event page repairs it at render (`readableThemeColours`),
// so a hand-edited palette can be ugly but never unreadable.
const HEX = /^#[0-9a-f]{6}$/i;
const ROLES = ["ground", "ink", "accent", "nowFill"];
const SOURCES = ["poster", "manual"];
const MAX_POSTER_URL = 500;

function isHttpsUrl(value) {
  if (typeof value !== "string" || value.length > MAX_POSTER_URL) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function isValidThemeColors(value) {
  // The house theme CHOSEN for a poster: "Remove colours" stores this, so the
  // form does not read that poster again and undo the choice.
  if (value?.source === "none") {
    return hasExactKeys(value, ["v", "source", "poster"]) && value.v === 1 && isHttpsUrl(value.poster);
  }
  if (!hasExactKeys(value, ["v", "source", "poster", "light", "dark"])) return false;
  if (value.v !== 1 || !SOURCES.includes(value.source) || !isHttpsUrl(value.poster)) return false;
  return ["light", "dark"].every(
    (variant) =>
      hasExactKeys(value[variant], ROLES) &&
      ROLES.every((role) => typeof value[variant][role] === "string" && HEX.test(value[variant][role])),
  );
}

/**
 * A submitted JSON string -> { valid, value } or { valid: false, error }.
 *
 * Callers store `value`, the palette RE-SERIALISED from what was checked, never
 * the submitted text: JSON.parse keeps the LAST copy of a repeated key, so
 * `{"ground":"<anything>","ground":"#000000"}` validates while the raw text
 * still carries the first copy to whatever reads it with another parser.
 */
export function validateThemeColorsJson(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { valid: false, error: "Theme colors must be valid JSON" };
  }
  if (!isValidThemeColors(parsed)) {
    return {
      valid: false,
      error:
        "Theme colors must be a version 1 poster palette (the poster's https URL; light and dark: ground, ink, accent, nowFill as #rrggbb)",
    };
  }
  return { valid: true, value: JSON.stringify(parsed) };
}
