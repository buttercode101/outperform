# Architecture Decision Record

## ADR-0001: Start with a modular monolith

**Status:** Accepted for initial implementation.

**Decision:** Build a modular monolith with explicit domain boundaries and durable asynchronous workflow support when required.

**Reasoning:** The product is at an early stage. A modular monolith reduces deployment and operational complexity while preserving the ability to separate components later.

**Consequences:** Keep domain logic independent of framework and provider SDKs. Define interfaces for model providers, artifact storage, evaluators and execution environments. Do not let infrastructure concerns leak into core domain logic.

## ADR-0002: Evidence is a first-class domain concept

**Status:** Accepted.

**Decision:** Findings and verification claims must reference evidence records. A model-generated assertion alone is not sufficient to mark a claim verified.

**Consequences:** The data model and user experience must distinguish verified, refuted, uncertain and unverified claims.

## ADR-0003: Preserve original artifacts

**Status:** Accepted.

**Decision:** Original user input is immutable within a session. Improvements create new versions with parent relationships and content hashes.

**Consequences:** No silent overwrite; rollback and provenance are mandatory capabilities.

## Open decisions

- Runtime/framework and deployment target.
- Database and object storage.
- Workflow/job orchestration.
- Initial model providers.
- Authentication and tenancy.
- Initial target customer segment.
