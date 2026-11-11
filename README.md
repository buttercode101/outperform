# OUTPERFORM

**AI work improvement, challenge and verification.**

OUTPERFORM is designed to improve real work—not merely compare model answers. A user brings an idea, draft, project or existing deliverable. The engine creates a baseline, produces a primary result, independently challenges it, compares candidates and presents a reviewable result with its limitations and evidence trail.

> Make AI work harder. Make the work better. Prove the difference.

## Current implementation

The first executable product slice is under active development.

- Guest-first React workspace: build and export local work briefs without registering; email/password accounts unlock cloud-backed AI execution and history.
- Owner-scoped work sessions and context storage.
- Durable Cloudflare Workflow for primary execution, independent challenge, comparative adjudication, a final improvement pass and a separate criteria review.
- Versioned Markdown artifacts stored in R2, with content hashes.
- D1 event history, requirements, approval and evidence tables.
- Explicit human approve/reject decisions, recorded against the session.
- User requirements and constraints are persisted and passed to every model stage.
- Default five-call budget supports the full candidate, improvement and review loop; smaller budgets skip later stages explicitly.
- Model evaluation is labeled as model-generated; it is not represented as external verification.
- Failed workflows are recorded as failed rather than left in an active state.
- Concurrent start requests are guarded by a conditional database claim.

The production Worker is deployed and its automated health gate has passed: D1, R2, Durable Workflow, authentication configuration and OpenRouter model-provider configuration are present. The guest-first access model is documented in [docs/ACCESS_MODEL.md](docs/ACCESS_MODEL.md). Full user-driven end-to-end acceptance (create account → run real session → retrieve artifact → approve/reject) remains a separate verification gate.

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
- `OPENROUTER_MODEL`: a model identifier supported by your OpenRouter account.

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

1. Add `CLOUDFLARE_API_TOKEN` as a GitHub Actions repository secret. It needs permission to deploy Workers and manage the configured bindings/workflow.
2. Configure production Worker secrets `BETTER_AUTH_SECRET`, `OPENROUTER_API_KEY`, and `OPENROUTER_MODEL`.
3. Run **Deploy production** from GitHub Actions using workflow dispatch.
4. Verify the deployed `/api/health` endpoint, account creation, sign-in, session creation, workflow execution, artifact retrieval and approval decisions.

The deployment workflow builds the app and deploys the generated configuration at `dist/worker/wrangler.json`. The regular quality workflow does not deploy production.

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

See `docs/planning/` and `docs/engineering/` for the product foundation, requirements, architecture, challenge protocol, verification model, market hypotheses and execution decisions.
