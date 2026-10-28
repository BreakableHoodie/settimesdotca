-- Question-driven metrics (#1246 Q3): "How do fans find us?"
-- Decision: where promotion effort goes before LWBC19 (Instagram vs Google vs
-- word of mouth). Store only fixed referrer kinds, never a URL or visitor id.

CREATE TABLE IF NOT EXISTS referrer_daily_stats (
  date TEXT NOT NULL,
  bucket TEXT NOT NULL CHECK (bucket IN ('instagram', 'facebook', 'google', 'other_search', 'direct', 'other')),
  visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0),
  PRIMARY KEY (date, bucket)
);
