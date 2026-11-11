# OUTPERFORM — Release readiness

Updated: 11 November 2026

## Implemented in the repository

- Guest-first entry with local brief creation, edit/delete, starter playbooks, text-file import and Markdown export.
- Explicit guest-to-account import that creates saved sessions without starting AI.
- Authenticated session workflow with primary DeepSeek generation, separate Qwen challenger, adjudication, final improvement and final criteria review.
- Immutable baseline artifact, versioned candidates and parent-artifact lineage.
- D1 evidence ledger, event history and R2 artifact storage.
- Explicit SHA-256 recomputation endpoint for artifact integrity.
- General and task-specific deterministic checks for selected code-risk patterns, research-link presence, document structure and quantified business claims.
- Heuristic risk routing with recorded signals and uncertainty estimate.
- Per-stage model usage metadata and provider cost where returned.
- Ten AI workflow starts per UTC day per account; no allowance consumed by brief creation or import; maximum five model calls per run.
- Private reusable playbook CRUD.
- Explicit account deletion with R2 and D1 cleanup.
- Production workflow applies D1 migrations, deploys, checks infrastructure health and smoke-tests guest entry plus anonymous API rejection.

## Verification evidence

- Domain tests and production build run through GitHub Actions.
- Production deployment health gate checks D1, usage schema, playbook schema, R2, Durable Workflow, authentication and both model configurations.
- Production smoke test checks public guest entry, built guest workspace markers and authentication boundaries for sessions, usage, playbooks and account deletion.
- D1 migration SQL for daily usage and private playbooks was checked against SQLite-compatible constraints during implementation.

A passing build or health endpoint is not equivalent to a complete authenticated end-to-end test.

## Release blockers / not yet proven

1. Run the latest Quality and Deploy production workflows to completion and verify the latest commit is live.
2. Complete a signed-in production journey: sign-up, sign-in, create session, start multi-model workflow, retrieve artifacts, verify hashes, review, approve/reject, save/reuse/delete playbooks and delete account.
3. Prove tenant isolation with two separate accounts across sessions, artifacts, evidence and playbooks.
4. Perform visual browser testing on mobile and desktop at 320, 375, 768, 1120 and wider viewports; test keyboard navigation and reduced motion.
5. Configure email delivery for password reset and decide whether email verification is required. No outbound email provider is configured currently.
6. Publish reviewed Privacy Policy and Terms of Use. Legal operator, jurisdiction, monitored contact email, retention periods and upstream provider data terms must be confirmed.
7. Test D1 backup/restore, R2 recovery, secret rotation and incident response.
8. Add actual execution adapters for connected repositories, browser journeys, source retrieval and external test tools. Current checks are limited text-pattern and structure checks; they do not execute code, validate source URLs or audit financial claims.
9. Build customer-owned benchmark sets with reviewed ground truth, repeatable tasks, regression tests, false-positive/false-negative tracking, cost and latency measurements. Do not claim "10x better" until controlled comparative tests support it.

## Release decision

**Not yet ready for a broad public launch.** It is now a substantially more capable deployed product foundation, but the remaining release blockers above must be closed before claiming production-scale reliability or ten-times superiority.
