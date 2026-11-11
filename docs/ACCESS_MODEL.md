# OUTPERFORM access model

OUTPERFORM must demonstrate value before asking for registration. The public entry route is guest-first; account creation is an explicit user choice.

## Guest mode — no account

- Open the product and build a structured work brief.
- Add an objective, work type, success criteria and background/context.
- Start from one of five built-in playbooks and edit its objective and criteria.
- Import a text-based file up to 100 KB (TXT, Markdown, JSON, CSV, HTML, XML or YAML) into the local brief.
- Edit, delete and export local briefs.
- Save briefs in browser-local storage on the current device.
- Export a brief as Markdown for use elsewhere.
- No brief content is sent to the server in guest mode.
- Guest data is device/browser-local: clearing browser storage or switching devices can remove or hide it. Export is the portable backup.

Guest mode is deliberately local-first. It does not run the paid/variable-cost AI workflow, create cloud records, synchronize history, or provide durable cloud artifact storage.

## Free account — cloud and AI features

An account is required only when a user chooses a feature that needs identity, server-side execution, or cross-device persistence:

- Run the AI improvement workflow (primary execution, independent challenge and comparative evaluation).
- Request final improvement and criteria review.
- Store sessions and artifacts in the cloud.
- Review results and record approval/rejection.
- Access the same workspace across devices.
- Save and reuse private playbooks with custom objectives, requirements and constraints.
- Start up to 10 AI workflows per UTC day. Saving or importing briefs does not consume a run; the allowance is reserved only when execution starts. Each run is capped at five model calls.
- Permanently delete the account, saved sessions, playbooks and R2 artifacts through an explicit typed confirmation.

Registration is free. A user should never be redirected to registration merely to view the public product or create/export a local brief. Explain the value of account-only capabilities at the point the user chooses them.

## Product and engineering rules

1. Do not upload guest briefs silently.
2. Do not imply that local guest work is cloud-backed or independently verified.
3. Keep model execution behind authenticated, server-side ownership checks; never expose provider keys to the browser.
4. Preserve a clear export path so users can take their guest work with them.
5. Guest-to-account import is an explicit opt-in action. It creates saved cloud sessions but does not automatically start AI execution.
6. Do not treat an account as payment. Free account registration unlocks the current authenticated product capabilities; any future paid tier must be a separate, transparent decision.
