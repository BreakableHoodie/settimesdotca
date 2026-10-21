// Venue stamp inks and short names (#1248).
//
// Each venue carries a fixed "hand stamp" ink, constant across editions, so
// Prohibition is the same teal on every poster-led event page. The ink is a
// secondary cue only: the stamp always prints the venue's name, because eight
// inks dark enough to pass WCAG AA on a light poster ground cannot also be well
// separated in lightness (all sit between 0.07 and 0.14 relative luminance).
// The page re-checks contrast against its actual ground at render time.
//
// Order matters: migration 0076 backfills existing venues by id rank through
// this list, and the order reproduces the approved mockup on production data
// (Room 47 slate, Prohibition teal, Revive ochre, Princess red, Roost purple,
// Blue Room blue). Append new inks; never reorder, or the migration and this
// list disagree about what rank N means.
export const STAMP_INKS = Object.freeze([
  "#44505c", // slate
  "#1f6b5c", // teal
  "#7d5c00", // ochre
  "#b4432f", // red
  "#6b3f99", // purple
  "#2b55a3", // blue
  "#9c2f6b", // magenta
  "#3f6a12", // green
]);

/**
 * The ink for a newly created venue: the palette entry used by the fewest
 * venues, earliest in the list on a tie. Two venues created at the same moment
 * may share an ink; that is cosmetic, so it is not worth a transaction.
 */
export async function pickInkForNewVenue(DB) {
  const { results } = await DB.prepare(
    "SELECT ink_color, COUNT(*) AS uses FROM venues WHERE ink_color IS NOT NULL GROUP BY ink_color",
  ).all();
  const uses = new Map((results || []).map((row) => [row.ink_color, row.uses]));
  let best = STAMP_INKS[0];
  for (const ink of STAMP_INKS) {
    if ((uses.get(ink) ?? 0) < (uses.get(best) ?? 0)) best = ink;
  }
  return best;
}

/**
 * The ink for a new venue, or null if it cannot be chosen. The ink is
 * cosmetic and the column nullable (an uncoloured stamp), so a failed lookup
 * is logged and never blocks creating the venue, on show day least of all.
 */
export async function inkForNewVenueOrNull(DB, venueName) {
  try {
    return await pickInkForNewVenue(DB);
  } catch (error) {
    console.error("venue.create: stamp ink lookup failed; creating the venue without one", { venueName, error });
    return null;
  }
}

/**
 * The name a stamp prints: the venue name without a trailing parenthetical
 * qualifier ("Blue Room (Inside Revive Karaoke)" -> "Blue Room"). Derived, not
 * stored, so there is no second name for anyone to keep in step.
 */
export function venueShortName(name) {
  if (typeof name !== "string") return null;
  const short = name.replace(/\s*\([^()]*\)\s*$/, "").trim();
  return short || name.trim() || null;
}
