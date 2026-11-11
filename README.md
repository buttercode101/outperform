# OUTPERFORM

**AI work improvement, challenge and verification.**

OUTPERFORM is designed to improve real work—not merely compare model answers. A user brings an idea, draft, project or existing deliverable. The engine preserves an immutable baseline, produces a primary result with DeepSeek, creates a separate Qwen challenger, adjudicates candidates, improves the selected result, runs task-specific mechanical checks and presents a reviewable evidence trail.

> Make AI work harder. Make the work better. Prove the difference.

## Current implementation

The deployed product is evolving from a generic improvement workflow into a cross-tool improvement and proof platform. See [Product Strategy v2](docs/PRODUCT_STRATEGY_V2.md) for the product direction and competitive differentiation.

- Guest-first workspace with local brief creation/edit/delete, text-file import, Markdown export and explicit opt-in guest-to-account import.
- Free account fair-use allowance: 10 AI workflow starts per UTC day; saving/importing briefs does not consume an AI run. Each run is bounded to five model calls.
- Authenticated workspace with session search/filtering, workflow metrics, task-specific playbooks, a private reusable playbook library and performance view.
- Candidate artifact library with side-by-side comparison, SHA-256 fingerprints, artifact downloads and private Evidence Passport export.
- Deterministic artifact quality gate with task-specific checks for selected code-risk patterns, research source-link presence, document structure and quantified business claims; results are recorded as evidence records and clearly labeled as limited checks.
- Per-stage OpenRouter usage events with generation IDs, model, tokens and provider-reported cost where supplied.
- Owner-scoped work sessions and context storage.
- Durable Cloudflare Workflow with a DeepSeek primary model, a distinct Qwen challenger model, comparative adjudication, a final improvement pass and a separate criteria review.
- Immutable baseline and versioned candidate artifacts stored in R2, linked by parent-artifact lineage and content hashes.
- Explicit SHA-256 recomputation for any artifact, recorded as a verifiable evidence event.
- User-owned reusable playbooks stored in D1 and scoped to the authenticated account.
- D1 event history, requirements, approval and evidence tables.
- Explicit human approve/reject decisions, recorded against the session.
- User requirements and constraints are persisted and passed to every model stage.
- Default five-call budget supports the full candidate, improvement and review loop; smaller budgets skip later stages explicitly.
- Model evaluation is labeled as model-generated; it is not represented as external verification.
- Failed workflows are recorded as failed rather than left in an active state.
- Concurrent start requests are guarded by a conditional database claim.

The production Worker and health gate were verified on November 11, 2026. Later UI and workflow changes are being rebuilt and redeployed through GitHub Actions; check the latest workflow run before treating the newest commit as live. Full user-driven end-to-end acceptance (guest import, account creation, real model run, evidence retrieval, approval/rejection and tenant-isolation tests) remains required. Deterministic text checks are not external verification.

## Architecture

- **Client:** React 19 + Vite
- **Runtime:** Cloudflare Workers
- **Durable execution:** Cloudflare Workflows
- **Relational state:** Cloudflare D1
- **Artifact storage:** Cloudflare R2
- **Authentication:** Better Auth
- **Model gateway:** OpenRouter

Production resources are configured in `wrangler.jsonc`; the `dev` environment uses separate D1 and R2 resources.

## Local development

Requirements: Node.js 22 or later and npm.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Set the following in your local `.dev.vars` file before running model workflows:

- `BETTER_AUTH_SECRET`: a random secret of at least 32 characters.
- `BETTER_AUTH_URL`: the local application origin.
- `OPENROUTER_API_KEY`: your OpenRouter API key.
- `OPENROUTER_MODEL`: the primary model identifier supported by your OpenRouter account.
- `OPENROUTER_CHALLENGER_MODEL`: a distinct challenger model identifier supported by your OpenRouter account.

Never commit `.dev.vars` or paste production credentials into source files.

## Quality checks

```bash
npm run check
npm test
npm run build
```

The GitHub Quality workflow runs all three checks and retains the generated Cloudflare build output as a short-lived Actions artifact.

## Production deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the exact token, secret and live-verification checklist.

1. Push to \`main\` or manually run **Deploy production** from GitHub Actions.
2. The workflow runs domain tests and source validation, builds the app, applies pending D1 migrations, deploys the Worker, configures the OpenRouter secret and creates the Better Auth secret if it does not already exist.
3. The live health gate verifies D1, daily usage, private playbooks, R2, Durable Workflow, authentication and both model configurations.
4. A production smoke test checks that guest entry is public, the guest workspace is present in the built bundle, and private session/usage APIs reject anonymous requests.

The regular Quality workflow does not deploy production. Full signed-in end-to-end acceptance remains a separate release gate. See \`docs/DEPLOYMENT.md\`.

## Engineering principles

- Preserve original work and version every material artifact.
- Separate generation, evaluation and verification.
- Treat model outputs and imported content as untrusted.
- Require evidence for material claims.
- Use task-specific acceptance criteria.
- Gate consequential actions behind explicit approval.
- Record actual tests, costs, failures and skipped checks.
- Never confuse an agent's assertion with verified behavior.

## Product and planning

See [Product Strategy v2](docs/PRODUCT_STRATEGY_V2.md), [Access Model](docs/ACCESS_MODEL.md), `docs/planning/` and `docs/engineering/` for the product direction, requirements, architecture, challenge protocol, verification model, market hypotheses and execution decisions.
