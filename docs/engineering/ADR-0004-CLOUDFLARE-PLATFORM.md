# ADR-0004: Cloudflare-first application platform

**Status:** Accepted for initial build; resource provisioning remains pending.

## Decision

Use Cloudflare Workers as the application runtime, React + Vite for the web client, Cloudflare Workflows for durable multi-step execution and human approval pauses, D1 for relational session metadata, and R2 for artifact payloads.

## Evidence reviewed

- Cloudflare's React + Vite guide documents a full-stack SPA with a Worker API, local Worker-runtime development, and deployment to Workers: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- Cloudflare Workflows supports durable multi-step execution, automatic retries, persisted state and waiting for external events/approvals: https://developers.cloudflare.com/workflows/
- Cloudflare D1 is a managed serverless SQL database with SQLite semantics, Worker bindings and Time Travel recovery: https://developers.cloudflare.com/d1/
- Cloudflare R2 provides object storage and a Workers API, with S3-compatible access for external tooling: https://developers.cloudflare.com/r2/

## Why this fits OUTPERFORM

- Work sessions can run longer than a normal request and may need retries or approval pauses.
- Artifact bodies and attachments should not be stored as large SQL values.
- Session metadata, requirements, findings, evidence metadata and events need relational querying.
- The frontend and API can deploy together without a separate frontend hosting service.
- The platform keeps provider adapters independent from Cloudflare-specific workflow and storage adapters.

## Known trade-offs

- D1 uses SQLite semantics and has per-database limits. Current documentation describes a 10 GB maximum database size on Workers Paid and 500 MB on Free, with single-threaded execution per database. This is suitable for the first product stage but must be revisited before high-write multi-tenant scale.
- Workflow payloads should contain references and compact metadata, not large artifact bodies.
- R2 bucket provisioning and D1 database creation are separate account resources. They have not been created yet.
- Authentication, tenancy isolation, abuse controls and secrets management must be implemented before public deployment.

## Cost and account guardrail

The connected Cloudflare account was inspected. It currently exposes two existing Workers, no D1 databases and no R2 buckets. Existing Workers will not be modified. This ADR does not authorize creating billable resources or deploying a public service.
