# Initial Data Model

The initial D1 migration establishes the relational metadata layer.

## Tables

- `work_sessions`: owner-scoped session state, objective, task type, budget and version.
- `requirements`: explicit user requirements and inferred criteria.
- `artifacts`: immutable artifact metadata, R2 object key, SHA-256 hash and parent version.
- `findings`: potential defects, risks and opportunities linked to an artifact.
- `evidence_records`: evidence status and observable source references.
- `session_events`: append-only workflow event history.
- `approvals`: pending and resolved human approval decisions.

## Storage split

D1 stores metadata and structured records. R2 stores original and derived artifact payloads, attachments, diffs and larger execution logs. Every stored object should be addressed by a non-guessable key and verified against its content hash.

## Invariants

- Every session is owner-scoped.
- Artifact versions are unique within a session.
- Original artifacts are not overwritten.
- A VERIFIED evidence record requires a source reference.
- Findings link to the artifact version they concern.
- Material state changes produce events.
- Approval decisions are auditable.

## Security note

The schema is not a substitute for authorization. Every API query must enforce authenticated owner/tenant scope. Public deployment is blocked until authentication, authorization and request validation are implemented and tested.
