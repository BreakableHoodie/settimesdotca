-- #705 — share_links.view_count counted fetches, not people.
--
-- The old counter incremented on every non-import GET with no deduplication,
-- so the same person refreshing a preview counted every time. Observed in
-- production: 42 "views" from one developer reloading during development.
--
-- Not crawlers, despite the obvious guess: link-preview unfurlers fetch the
-- HTML document /s/[slug], which does no counting, and cannot reach the JSON
-- endpoint that does (it is fetched by the React app after hydration). Reloads
-- account for the inflation on their own.
--
-- Those numbers cannot be corrected — nothing distinguishes a reload from a
-- distinct visitor after the fact — so they are retired as a metric. They are
-- NOT destroyed: view_count_legacy preserves each row's pre-cutover value, so
-- the decision stays reversible and the old figure is still auditable.
--
-- Leaving them in place was the worse option: one column would then hold two
-- different definitions, and any chart across the cutover shows a cliff that
-- reads as lost traffic rather than a changed definition.

-- Statement order is deliberate: everything additive first, the one
-- destructive statement last. D1 has no BEGIN/COMMIT, so a migration file's
-- statements are not wrapped in a transaction and a mid-file failure leaves
-- partial state. Zeroing before the ledger exists would leave "counts
-- destroyed, no ledger" as a survivable state; this ordering cannot.

ALTER TABLE share_links ADD COLUMN view_count_legacy INTEGER;

-- Dedupe ledger: one row per (link, visitor). The endpoint INSERT OR IGNOREs
-- here and recomputes view_count as COUNT(*) over these rows, which makes
-- view_count unique-visitors-per-link, all-time.
--
-- visitor_hash is a SHA-256 of ip|user-agent|slug (see
-- functions/utils/visitorDedupe.js). The raw IP is never stored, and the slug
-- acts as a per-link salt so the same visitor is not correlatable across links.
--
-- share_links.slug is NOT NULL UNIQUE, so the FK is valid; ON DELETE CASCADE
-- means deleting a share link takes its ledger rows with it rather than leaving
-- orphans that would suppress counting if the slug were ever reissued.
CREATE TABLE IF NOT EXISTS share_link_views (
  slug         TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  -- datetime('now') yields 'YYYY-MM-DD HH:MM:SS' (space separator). Do not
  -- store a JS toISOString() value here — the T separator breaks string
  -- comparisons against datetime('now'), the SEC-F1 bug class in CLAUDE.md.
  first_seen   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slug, visitor_hash),
  FOREIGN KEY (slug) REFERENCES share_links(slug) ON DELETE CASCADE
);

-- Backs the COUNT(*) the endpoint recomputes on each new visitor, plus the
-- cron's child-delete; the PK already covers lookups by (slug, visitor_hash).
CREATE INDEX IF NOT EXISTS idx_share_link_views_slug ON share_link_views(slug);

-- Destructive, and therefore last. Both statements are guarded so a retry
-- after a partial apply is a no-op rather than a data loss: without the
-- IS NULL guard, re-running would overwrite the preserved figure with the
-- already-zeroed (or since-accumulated) view_count and destroy the only copy.
-- D1's runner records applied files and will not re-run one on its own, so
-- this is belt-and-braces for a manual retry — four words for a destructive
-- failure mode.
UPDATE share_links SET view_count_legacy = view_count WHERE view_count_legacy IS NULL;

UPDATE share_links SET view_count = 0 WHERE view_count_legacy IS NOT NULL AND view_count > 0;
