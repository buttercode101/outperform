# Production deployment and acceptance

## Current infrastructure

The OUTPERFORM Cloudflare Worker is deployed at:

- https://outperform.buttercoder-dev.workers.dev

Production resources:

- D1: \`outperform-prod\`
- R2: \`outperform-artifacts-prod\`
- Durable Workflow: \`outperform-improvement\`
- Model gateway: OpenRouter
- Configured model: \`deepseek/deepseek-v4-flash\`

On November 11, 2026, GitHub Actions deployment run #9 completed successfully. Its live health gate confirmed D1, R2, Durable Workflow, Better Auth configuration and OpenRouter configuration. That proves infrastructure readiness, not complete user-driven acceptance.

## Deployment workflow

GitHub Actions is the deployment authority:

1. Open \`buttercode101/outperform\` → Actions → Deploy production.
2. Inspect the latest run and commit SHA.
3. Confirm domain tests, source validation and production build passed.
4. Confirm Worker deployment and secret configuration passed.
5. Confirm the live health endpoint returned the required healthy state.

The repository uses the GitHub Actions secrets \`CLOUDFLARE_API_TOKEN\` and \`OPENROUTER_API_KEY\`. The Cloudflare token must retain account-scoped Workers Scripts write access and the binding permissions needed by Wrangler. Never put secrets in source, issues, logs or chat.

If deployment credentials fail, inspect the failing workflow step and Cloudflare token permissions. Do not replace the account-scoped token with the Global API Key.

## Required production acceptance

A green deployment is only the start. Verify all of the following against the deployed commit:

1. Guest mode loads without authentication.
2. Guest briefs can be created, edited, saved through refresh and exported.
3. Sign-up and sign-in work with correct validation and error states.
4. Guest brief import is explicit, resumable, and creates saved sessions without automatically running AI.
5. Authenticated users can create, list, retrieve and review sessions.
6. A real model workflow completes through primary generation, independent challenger, comparative adjudication, final improvement, deterministic artifact checks and final criteria review.
7. All artifact contents can be retrieved and SHA-256 hashes independently recomputed.
8. Evidence records and event history match the artifact and workflow results.
9. Approval and rejection are owner-scoped, recorded exactly once, and reject invalid state transitions.
10. Cross-user access attempts for sessions, events, evidence and artifacts are denied.
11. Request-size, session-creation, concurrency and model-call budgets are bounded.
12. Errors, timeouts, provider failures and workflow retries recover without duplicate artifacts or orphaned active sessions.
13. Mobile and desktop UI are tested at narrow and wide widths, including loading, empty, error and reduced-motion states.

## Verification language

- A healthy endpoint means configured infrastructure is reachable.
- A passing build means the application compiled.
- Passing domain tests means covered domain cases passed.
- A model-generated review is an AI opinion, not independent verification.
- Deterministic text-quality checks verify only the specific mechanical properties they inspect.
- External verification requires an actual tool run, a traceable result and an evidence reference.
- Never mark the product production-ready based only on a deployment badge, screenshot or model assertion.

## Recovery and operations

Before broad launch, document and test D1 backup/restore, R2 artifact retention/recovery, secret rotation, provider outage handling, log access, incident response and data deletion/retention. Establish alerts for failed workflows, rising provider error rates, unexpected usage spikes and storage failures.


## Recovery verification — 13 November 2026

- A production D1 SQL snapshot was restored into an isolated temporary D1 database using the Cloudflare D1 multi-statement execution path. All 81 statements completed; the restored database contained 19 tables and six migration records, and `PRAGMA foreign_key_check` returned no violations.
- The temporary database was deleted after verification. Production D1 and the original production session were not modified.
- The snapshot predates a later account deletion. It still contained that historical test account and a context-object reference whose R2 object had since been deleted. This demonstrates that a D1 snapshot alone is not a complete point-in-time recovery of D1 plus R2, and older snapshots must not be restored directly to production without reconciling later account deletions and checking every referenced R2 object.
- Existing R2 SQL snapshots are private, but automated full D1+R2 snapshot creation, retention, and deletion-tombstone replay are not yet configured. This remains a release-readiness gap.
