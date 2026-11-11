CREATE TABLE IF NOT EXISTS user_daily_usage (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  usage_date TEXT NOT NULL,
  sessions_created INTEGER NOT NULL DEFAULT 0 CHECK (sessions_created >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_usage_date
  ON user_daily_usage(usage_date, sessions_created);
