CREATE TABLE IF NOT EXISTS session_constraints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  constraint_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_constraints_session ON session_constraints(session_id);
