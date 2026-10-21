// Poster-led event palettes (#1248): the stored shape of `events.theme_colors`.
//
//   { "v": 1, "source": "poster" | "manual",
//     "light": { "ground", "ink", "accent", "nowFill" },
//     "dark":  { "ground", "ink", "accent", "nowFill" } }
//
// Every colour is lowercase-insensitive `#rrggbb`. The frontend's copy of this
// check is `isValidThemeColours` in frontend/src/utils/posterPalette.js; Pages
// Functions cannot import from frontend/, so the two are kept in step by tests
// on each side (the after-midnight threshold's two-homes rule). Contrast is not
// checked here: the event page repairs it at render (`readableThemeColours`),
// so a hand-edited palette can be ugly but never unreadable.
const HEX = /^#[0-9a-f]{6}$/i;
const ROLES = ["ground", "ink", "accent", "nowFill"];
const SOURCES = ["poster", "manual"];

function hasExactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function isValidThemeColors(value) {
  if (!hasExactKeys(value, ["v", "source", "light", "dark"])) return false;
  if (value.v !== 1 || !SOURCES.includes(value.source)) return false;
  return ["light", "dark"].every(
    (variant) =>
      hasExactKeys(value[variant], ROLES) &&
      ROLES.every((role) => typeof value[variant][role] === "string" && HEX.test(value[variant][role])),
  );
}

/** A stored JSON string -> { valid } or { valid: false, error }. */
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
        "Theme colors must be a version 1 poster palette (light and dark: ground, ink, accent, nowFill as #rrggbb)",
    };
  }
  return { valid: true };
}
