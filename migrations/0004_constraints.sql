CREATE TABLE IF NOT EXISTS constraints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'OTHER',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_constraints_session ON constraints(session_id, created_at);
