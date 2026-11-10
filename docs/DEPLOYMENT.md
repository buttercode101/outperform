# Production deployment checklist

This checklist is required once per Cloudflare/GitHub environment.

## 1. Create a Cloudflare API token

In Cloudflare, open **My Profile → API Tokens → Create Token → Custom Token**.

Grant the following permission on the OUTPERFORM Cloudflare account:

- **Account / Workers Scripts / Write**

The previous deployment reached Cloudflare but failed on the Worker secrets endpoint with "No access to the specified resource". The existing GitHub token is active and can read Workers scripts, but it does not have the required write permission.

Do not substitute a read-only Workers permission. Do not use the Global API Key. Keep the token account-scoped.

## 2. Add GitHub Actions secrets

In GitHub, open:

**buttercode101/outperform → Settings → Secrets and variables → Actions → New repository secret**

Add:

- CLOUDFLARE_API_TOKEN: the account-scoped Cloudflare token with Workers Scripts / Write.
- OPENROUTER_API_KEY: the key from the intended OpenRouter account.

Never put either value in a commit, issue, pull request, chat message, or .dev.vars.

## 3. Deploy the Worker

Open **Actions → Deploy production → Run workflow**.

The workflow installs dependencies, runs domain tests, validates Worker source, builds the Vite/Cloudflare application, deploys dist/worker/wrangler.json, ensures a persistent Better Auth secret exists, installs the OpenRouter key, and checks the live health endpoint.

Production resources are already provisioned:

- D1: outperform-prod
- R2: outperform-artifacts-prod
- Workflow: outperform-improvement

The D1 migration ledger records migrations 0001–0004 as applied.

The production model is configured as deepseek/deepseek-v4-flash in wrangler.jsonc. It is a non-secret setting and should not be stored as an encrypted secret.

## 4. Verify the live deployment

1. Open /api/health and confirm database, artifact storage and durable workflow bindings are available.
2. Confirm authenticationConfigured and modelProviderConfigured are both true.
3. Create an account and sign in.
4. Create a session with explicit requirements, constraints and source context.
5. Confirm primary, challenger, final improvement and final criteria review events appear.
6. Retrieve the final artifact and approve/reject it.
7. Confirm the final status and decision event are persisted in D1.

A successful build or a healthy /api/health response alone is not an end-to-end acceptance test.
