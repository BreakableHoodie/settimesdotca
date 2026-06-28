// Canonical band-name matching key. Populates/matches band_profiles.name_normalized.
// Must stay byte-identical everywhere — changing it breaks find-or-create matching
// of bands (lineup import, follow-matching). Do not "improve" the regex.
export function normalizeBandName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
