PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS work_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'CREATED','UNDERSTANDING','BASELINING','EXECUTING','CHALLENGING',
    'EVALUATING','IMPROVING','VERIFYING','AWAITING_APPROVAL','BLOCKED',
    'COMPLETED','FAILED','CANCELLED','ROLLING_BACK','ROLLED_BACK'
  )),
  task_type TEXT NOT NULL,
  objective TEXT NOT NULL,
  budget_json TEXT NOT NULL,
  baseline_artifact_id TEXT,
  best_artifact_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_sessions_owner_updated
  ON work_sessions(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS requirements (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('USER','INFERRED')),
  mandatory INTEGER NOT NULL CHECK (mandatory IN (0,1)),
  verification_method TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  parent_artifact_id TEXT REFERENCES artifacts(id),
  created_by TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  UNIQUE(session_id, version)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_session_version
  ON artifacts(session_id, version DESC);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW','INFO')),
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('VERIFIED','REFUTED','UNCERTAIN','UNVERIFIED')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_records (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  finding_id TEXT REFERENCES findings(id) ON DELETE SET NULL,
  claim TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('VERIFIED','REFUTED','UNCERTAIN','UNVERIFIED')),
  source_type TEXT NOT NULL,
  source_ref TEXT,
  details_json TEXT,
  observed_at TEXT NOT NULL,
  CHECK (status != 'VERIFIED' OR source_ref IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_evidence_session_observed
  ON evidence_records(session_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_events_session_time
  ON session_events(session_id, occurred_at);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT
);
