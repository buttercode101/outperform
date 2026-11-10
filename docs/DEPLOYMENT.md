# Production deployment checklist

This checklist is required once per Cloudflare/GitHub environment.

## 1. Create a Cloudflare API token

In Cloudflare, open **My Profile → API Tokens → Create Token → Custom Token**.

Grant only the permissions needed by this deployment:

- Account / Workers Scripts / Write (required for Wrangler to upload the Worker and its runtime secrets)
- Account / D1 / Read (only if the deployment workflow needs to inspect D1)
- Account / R2 Storage / Read (only if the deployment workflow needs to inspect R2)

Scope the token to the exact Cloudflare account used by OUTPERFORM. Do not substitute a read-only Workers permission. The latest deployment reached Cloudflare but failed on `PUT /accounts/{account_id}/workers/scripts/outperform/secrets` with `No access to the specified resource`; the token therefore needs **Workers Scripts / Write** at minimum.

Scope the token to the account used by OUTPERFORM. Do not use the Global API Key.

## 2. Add the GitHub Actions secret

In GitHub, open:

**buttercode101/outperform → Settings → Secrets and variables → Actions → New repository secret**

- Name: `CLOUDFLARE_API_TOKEN`
- Value: the Cloudflare API token created above

Do not put the token in a commit, issue, pull request, chat message, or `.dev.vars`.

## 3. Deploy the Worker

Open **Actions → Deploy production → Run workflow**.

The workflow installs dependencies, runs tests, checks Worker source, builds the Vite/Cloudflare application, then deploys `dist/worker/wrangler.json`.

Production resources are already provisioned:

- D1: `outperform-prod`
- R2: `outperform-artifacts-prod`
- Workflow: `outperform-improvement`

The D1 migration ledger currently records migrations 0001–0004 as applied.

## 4. Configure Worker secrets

After the first successful deployment, open **Workers & Pages → outperform → Settings → Variables and Secrets** and add these as encrypted secrets:

- `BETTER_AUTH_SECRET`: generate a unique random secret of at least 32 characters (for example, `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`).
- `OPENROUTER_API_KEY`: the key from the intended OpenRouter account.
- `OPENROUTER_MODEL`: a model identifier available to that account.

Set `BETTER_AUTH_URL` only if the canonical application URL differs from the deployed Worker origin. Never put credentials in Worker plain-text variables.

## 5. Verify the live deployment

1. Open `/api/health` and confirm database, artifact storage and durable workflow bindings are available.
2. Confirm `authenticationConfigured` and `modelProviderConfigured` are both true.
3. Create an account and sign in.
4. Create a session with explicit requirements, constraints and source context.
5. Confirm primary, challenger, final improvement and final criteria review events appear.
6. Retrieve the final artifact and approve/reject it.
7. Confirm the final status and decision event are persisted in D1.

A successful build or a healthy `/api/health` response alone is not an end-to-end acceptance test.
