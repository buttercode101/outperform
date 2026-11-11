CREATE TABLE IF NOT EXISTS user_playbooks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  task_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  objective_template TEXT NOT NULL,
  requirements_json TEXT NOT NULL DEFAULT '[]',
  constraints_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_playbooks_owner_updated
  ON user_playbooks(owner_id, updated_at DESC);
