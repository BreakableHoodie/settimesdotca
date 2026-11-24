export function bandHometown(band) {
  return band?.origin_city || band?.origin_region || band?.origin || "";
}

export function buildBandTitle(band) {
  const genre = band?.genre ? ` — ${band.genre}` : "";
  const hometown = bandHometown(band);
  return `${band?.name || "Band"}${genre}${hometown ? ` from ${hometown}` : ""} | SetTimes`;
}

// Facts only (no AI-written artist prose). "band" is not in the data (many acts
// are solo or DJs), and "played" is false for a published edition that has not
// happened yet, so the copy says what the data says: on N lineups.
export function buildBandFallbackDescription(band) {
  const hometown = bandHometown(band);
  const facts = [];

  if (band?.genre && hometown) facts.push(`${band.genre} from ${hometown}.`);
  else if (band?.genre) facts.push(`${band.genre}.`);
  else if (hometown) facts.push(`From ${hometown}.`);

  const count = band?.played_editions_count;
  if (Number.isInteger(count) && count > 0) {
    const lineups = count === 1 ? "lineup" : "lineups";
    const latest = band.most_recent_edition_name ? `, latest ${band.most_recent_edition_name}` : "";
    facts.push(`On ${count} SetTimes ${lineups}${latest}.`);
  }

  return facts.join(" ");
}
