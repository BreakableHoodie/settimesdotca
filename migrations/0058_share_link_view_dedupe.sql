-- #705 — share_links.view_count counted fetches, not people.
--
-- The old counter incremented on every non-import GET with no deduplication, so
-- it blended human reloads with link-preview crawlers (iMessage, Slack,
-- WhatsApp, Twitter, Facebook and friends each fetch the URL once to build an
-- unfurl card). Observed in production: 42 "views" for one person reloading a
-- preview during development.
--
-- Those numbers cannot be corrected — there is no recoverable ratio between
-- crawler hits and real visitors — so they are retired as a metric. They are
-- NOT destroyed: view_count_legacy preserves each row's pre-cutover value, so
-- the decision stays reversible and the old figure is still auditable.
--
-- Leaving them in place was the worse option: one column would then hold two
-- different definitions, and any chart across the cutover shows a cliff that
-- reads as lost traffic rather than a changed definition.

ALTER TABLE share_links ADD COLUMN view_count_legacy INTEGER;

UPDATE share_links SET view_count_legacy = view_count;

UPDATE share_links SET view_count = 0;

-- Dedupe ledger: one row per (link, visitor). The endpoint INSERT OR IGNOREs
-- here and only increments view_count when the insert actually created a row,
-- which makes view_count unique-visitors-per-link, all-time.
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

-- Supports the cascade and any per-link reporting; the PK already covers
-- lookups by (slug, visitor_hash).
CREATE INDEX IF NOT EXISTS idx_share_link_views_slug ON share_link_views(slug);
