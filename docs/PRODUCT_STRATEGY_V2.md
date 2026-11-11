# OUTPERFORM — Product Strategy v2

**Decision:** Build OUTPERFORM as a cross-tool work-improvement and proof platform, not another general-purpose chatbot or coding agent.

## 1. Product promise

Bring work from wherever it was created. OUTPERFORM preserves the original, improves it through competing approaches, challenges the strongest candidate, runs the checks that are actually available, records evidence and limitations, and produces a portable Evidence Passport for human decision-making.

**Positioning:** Improve the work. Challenge the result. Carry the proof.

The promise is not "AI says this is better." The promise is a traceable record of what changed, why it changed, which checks ran, what passed or failed, what remains uncertain, and who accepted the result.

## 2. Competitive landscape reviewed — November 2026

### Cursor
Cursor provides deep codebase context, multi-file editing, terminal execution, cloud/background agents, browser testing, checkpoints and code review. It is an execution environment for software development. OUTPERFORM should not attempt to reproduce a full IDE or coding-agent VM as its first wedge. Sources: [Cursor Agent](https://prod.cursor.com/help/ai-features/agent), [Cloud Agents](https://prod.cursor.com/help/ai-features/background-agents), [Browser](https://cursor.com/docs/agent/tools/browser).

### Devin
Devin offers planning and execution for complex engineering work, PR review and visual QA, browser/desktop use, code migrations, scheduled chores and feedback-driven maintenance. This establishes that autonomous execution plus self-testing is already a competitive baseline for software agents. Source: [Devin product](https://devin.ai/).

### CodeRabbit
CodeRabbit now goes beyond comments: contextual review, agent loops, sandbox-tested findings, Autofix, custom pre-merge checks, triage and continuous security monitoring. It demonstrates the value of actionable review close to the code-change workflow. OUTPERFORM cannot differentiate on 'AI reviews and suggests fixes' alone. Sources: [CodeRabbit product](https://www.coderabbit.ai/), [Autofix](https://www.coderabbit.ai/blog/you-don-t-need-to-implement-that-autofix-will), [Pricing and checks](https://www.coderabbit.ai/pricing).

### Langfuse and Braintrust
These platforms provide tracing, datasets, scoring, experiments, human annotation, prompt/version tracking, cost/latency analytics and production evaluation loops. Braintrust also supports CI release gates; Langfuse supports dataset experiments and trace-linked metrics. They are strong evaluation infrastructure. OUTPERFORM should integrate with this ecosystem rather than pretend these capabilities are novel. Its opportunity is the end-user work product that takes arbitrary work, improves it, produces a candidate, and hands a person a decision-ready evidence dossier. Sources: [Langfuse dataset evaluation](https://langfuse.com/docs/evaluation/get-started/offline), [Langfuse tracing](https://langfuse.com/academy/tracing), [Braintrust evals](https://www.braintrust.dev/articles/how-to-eval).

## 3. What OUTPERFORM must own

The differentiated product is a **portable, independent improvement and proof layer across tools and work types**.

1. **Work intake:** paste, upload or import work from an existing tool. Keep the original immutable.
2. **Intent and acceptance contract:** turn the request into explicit goals, constraints, risk and measurable criteria. Let the user correct the contract before expensive execution.
3. **Competing improvement:** generate a primary solution and a genuinely independent alternative using a different model/provider where configured. The production default uses DeepSeek V4 Flash for the primary and Qwen3.5 Flash for the challenger; this is model diversity, not proof of independence from shared training data.
4. **Adversarial challenge:** test the preferred candidate against counterexamples, failure modes, contradictions, omissions and edge cases.
5. **Task-specific verification:** execute deterministic checks when tools are connected; use structured human checks when they are not. The first release includes narrow code-risk pattern, research-link presence, document-structure and business-claim-basis scans; these are triage signals, not full audits. Never label an LLM judge as an external verifier.
6. **Regression protection:** compare the candidate to the original and ensure improvements do not silently violate preserved requirements.
7. **Evidence Passport:** versioned artifacts, hashes, requirement coverage, findings, evidence references, check logs, cost/latency, remaining risks and human decision in one exportable report.
8. **Learning loop:** with user permission, turn approved corrections and failed checks into reusable playbooks and regression cases.
9. **Portability:** provider-neutral architecture and exports. The user should not need to adopt one coding agent, model vendor or IDE to benefit.
10. **User control:** explicit guest import, transparent run allowances, per-session exports and account/data deletion.

## 4. Product surfaces

### Guest — no account
- Create and edit work briefs.
- Use starter playbooks.
- Save locally and export.
- No server upload or AI execution.

### Free account
- Explicitly import guest briefs.
- Create private work sessions and cloud history.
- Run the improvement/challenge workflow within transparent fair-use and cost controls.
- Review candidate artifacts, mechanical quality checks and evidence.
- Approve/reject and export the Evidence Passport.

### Future team capabilities
- Shared workspaces, role-based access and approval policies.
- Repository and document connectors.
- Custom evaluation suites and recurring regression runs.
- Team strategy library and organization-specific rules.
- Private reusable playbooks with custom objectives, requirements and constraints.
- Audit exports and retention controls.

Paid plans, usage caps and model budgets require explicit product/pricing decisions; do not silently charge users or promise unlimited third-party inference.

## 5. The "wow" experience

The core review screen should feel like a professional decision room, not a chat transcript:

- A clear before/after view.
- Side-by-side primary, challenger and final candidates.
- A visible challenge report.
- Acceptance criteria with status and evidence references.
- A quality gate with passed, flagged and failed checks.
- A change summary and preserved constraints.
- A risk register and unresolved questions.
- A compact activity/evidence timeline.
- One-click downloads for candidate artifacts and Evidence Passport.
- A clear human decision: approve, reject, or request another improvement pass.

A result must not receive a green "verified" label merely because a model prefers it.

## 6. Initial wedge

Start with independent founders, product engineers, agencies and small product teams who already use multiple AI tools and need confidence in deliverables.

The first vertical should be software/product work because correctness can be tested with repository checks, builds, unit/integration tests, security scanners and browser journeys. Keep the core work model universal; add deeper adapters rather than hardcoding the product to code generation.

The next expansion is research and business/document decisions with source-backed claim checking, structured rubrics and human approval.

## 7. Competitive principles

- Do not compete on a model leaderboard or generic "best AI" score.
- Do not claim to be ten times better without controlled task-specific evidence.
- Do not rely on public benchmark scores as proof of product quality.
- Build private, customer-owned evaluation sets from real tasks and accepted outcomes.
- Separate deterministic checks, external tool results, human decisions and model opinions.
- Track false positives, false negatives, regressions, cost, latency and time saved.
- Make provider substitution possible without losing a user's evidence history.

## 8. Production acceptance gates

OUTPERFORM is not production-ready until all of the following are demonstrated against the deployed system:

1. Guest mode works without authentication; local save survives refresh; export opens and contains the full brief.
2. Account creation and sign-in work; guest import is opt-in, resumable and does not execute AI automatically.
3. Tenant isolation is proven for sessions, events, evidence and artifacts.
4. Input limits, rate limits, idempotency, bounded model calls, request timeouts and cost observability are enforced.
5. A real session runs to completion and the workflow's retry/recovery behavior is tested.
6. Candidate artifacts can be retrieved and their hashes independently recomputed.
7. Deterministic quality checks create traceable evidence records and correctly distinguish PASS, FLAG and FAIL.
8. The Evidence Passport matches the stored session, artifacts and event history.
9. Approve/reject is recorded exactly once and cannot be replayed into an invalid state.
10. Mobile and desktop layouts, keyboard access, empty/loading/error states and reduced motion are tested.
11. Monitoring, alerting, backups/restore, retention and incident recovery are documented and tested.
12. No user-facing claim exceeds the evidence actually collected.

## 9. Research sources and caveat

Public agent benchmarks are not a substitute for a product-specific evaluation. OpenAI's February 2026 audit found that at least 59.4% of an audited subset of SWE-bench Verified problems had materially flawed tests or descriptions. Its July 2026 audit estimated around 30% of SWE-bench Pro tasks were broken. Scale AI subsequently released SWE-Bench Pro V2 with 89 invalid tasks removed and a two-sided gate. This is evidence that benchmark quality itself must be audited. Sources: [OpenAI — SWE-bench Verified audit](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/), [OpenAI — SWE-Bench Pro audit](https://openai.com/index/separating-signal-from-noise-coding-evaluations/), [SWE-Bench Pro V2](https://labs.scale.com/leaderboard/swe_bench_pro_public_v2?tab=full). OUTPERFORM should therefore build task-specific evaluation sets with versioned instructions, deterministic checks and human-reviewed ground truth rather than use a single public leaderboard as a quality claim.
