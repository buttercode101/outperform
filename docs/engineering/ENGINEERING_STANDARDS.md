# Engineering Standards

## Verification before claims

A feature is not complete because code was written, a build passed, a screenshot looks right or an agent says it works. Verify the real user journey and its side effects.

## Required engineering behaviour

- Inspect existing state before modifying it.
- Preserve user work and avoid destructive operations without approval.
- Use typed contracts and validate all external input.
- Treat model output, files, web pages and tool results as untrusted.
- Use least-privilege credentials and never print secrets.
- Make side-effecting operations idempotent where possible.
- Record provenance for artifacts, model calls, tools and evaluations.
- Separate proposed changes from approved changes.
- Record tests that passed, failed, were skipped or could not run.
- Retest after fixes; do not close findings based only on code inspection.
- Test responsive layouts and keyboard accessibility.
- Do not introduce placeholder functionality while presenting it as complete.

## Release evidence

A release requires reproducible setup, migrations, automated tests, end-to-end coverage of critical flows, security/permission checks, responsive UI verification and an honest list of remaining risks.

## Architecture direction

Begin as a modular monolith with clear module contracts. Do not create microservices without evidence that operational, scaling or security needs justify them.
