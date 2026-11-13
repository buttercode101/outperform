# OUTPERFORM privacy and data map

Internal implementation record — not a substitute for reviewed public Privacy Policy or Terms.

## Guest use

- Work briefs are stored in the visitor's browser using local storage.
- Text files are read locally in the browser; accepted formats are TXT, Markdown, JSON, CSV, HTML, XML and YAML up to 100 KB.
- Guest briefs are not sent to OUTPERFORM servers unless the visitor explicitly exports them and later chooses to import them after signing in.
- Browser storage may be lost if the visitor clears site data, uses private browsing or changes devices.

## Authenticated use

- Better Auth stores account identity and authentication session data in D1.
- Session objectives, task type, acceptance criteria, constraints, event history, model usage metadata, evidence records and playbooks are stored in D1.
- User-provided context and generated Markdown artifacts are stored in R2.
- Artifact hashes are stored in D1 and can be recomputed against R2 content.
- The improvement workflow sends task content and instructions to OpenRouter for model processing. The configured primary and challenger models are DeepSeek and Qwen. Do not claim that prompts are never retained by upstream providers; verify current provider terms and data controls before publishing the policy.
- Provider-reported token and cost metadata is stored in the session event history.

## Account deletion

The authenticated DELETE /api/account endpoint requires the exact confirmation phrase DELETE MY ACCOUNT. It deletes R2 context/artifact objects first, then removes the user's work sessions and Better Auth user record in a D1 batch. Session child records cascade from work_sessions; playbooks and daily usage cascade from the user record.

The endpoint enumerates all R2 objects under each owned session prefix, in addition to metadata-referenced legacy keys. If enumeration or deletion fails, it retains the account and returns an error rather than reporting successful deletion. Partial R2 cleanup may have occurred and a retry may be required.\n\nPrivate SQL snapshots are stored separately from live session objects. The current system does not yet apply deletion tombstones when restoring an older snapshot, so an old restore could reintroduce an account deleted after that snapshot was taken. Do not claim permanent erasure from disaster-recovery copies until snapshot retention and deletion replay are implemented.

## Security boundaries

- Guest mode is local-first.
- Private APIs require an authenticated Better Auth session.
- Session, artifact and playbook reads/deletes are scoped to the authenticated user.
- Provider credentials remain server-side Worker secrets.
- Daily AI run allowance is 10 starts per UTC day; brief creation/import does not consume a run.
- Each workflow is bounded to a maximum of five model calls.

## Public-launch items still requiring owner/legal review

1. Confirm the legal operator name and jurisdiction.
2. Supply a monitored privacy/support contact address.
3. Decide data retention periods for sessions, artifacts, logs and backups.
4. Review Cloudflare and OpenRouter current data-processing terms and subprocessors.
5. Publish a public Privacy Policy and Terms of Use that accurately describe the actual data flow.
6. Confirm backup deletion/retention behavior and the expected time to complete account deletion.
7. Decide whether email verification and password reset are required before opening registration broadly; the current Better Auth setup has email/password sign-up but no configured outbound email provider for recovery messages.
8. Review whether the ten-run daily allowance and any future paid tier need separate disclosures.
