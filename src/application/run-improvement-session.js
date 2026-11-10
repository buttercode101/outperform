import { transitionSession } from "../domain/session.js";
import { planChallenge } from "../domain/challenge.js";
import { invariant } from "../domain/errors.js";

function requireAdapter(adapters, name) {
  invariant(typeof adapters?.[name] === "function", "MISSING_ADAPTER", `Required adapter "${name}" is not configured.`);
  return adapters[name];
}

function assertSessionArtifact(session, artifact, label) {
  invariant(artifact && artifact.sessionId === session.id,
    "ARTIFACT_SESSION_MISMATCH", `${label} must belong to the active session.`);
}

function appendEvent(events, type, data, now) {
  events.push(Object.freeze({
    id: `${events.length + 1}`,
    type,
    data,
    occurredAt: now().toISOString()
  }));
}

export async function runImprovementSession({
  session: initialSession,
  baselineArtifact,
  adapters,
  approvals = {},
  challengeOptions = {},
  now = () => new Date(),
  onEvent = () => {}
}) {
  invariant(initialSession?.status === "CREATED", "SESSION_NOT_READY", "Only a newly created session can start this workflow.");
  assertSessionArtifact(initialSession, baselineArtifact, "Baseline artifact");

  const events = [];
  const emit = (type, data = {}) => {
    const event = appendEvent(events, type, data, now);
    onEvent(event);
  };
  let session = initialSession;
  let primaryArtifact = null;
  let challengedArtifact = null;
  let evaluation = null;
  let improvement = null;
  let finalArtifact = baselineArtifact;
  let verification = null;

  try {
    session = transitionSession(session, "UNDERSTANDING", now());
    emit("SESSION_UNDERSTANDING");
    session = transitionSession(session, "BASELINING", now());
    emit("BASELINE_CAPTURED", { artifactId: baselineArtifact.id, contentHash: baselineArtifact.contentHash });

    session = transitionSession(session, "EXECUTING", now());
    primaryArtifact = await requireAdapter(adapters, "executePrimary")({ session, baselineArtifact });
    assertSessionArtifact(session, primaryArtifact, "Primary artifact");
    emit("PRIMARY_EXECUTION_COMPLETED", { artifactId: primaryArtifact.id });

    const plan = planChallenge({
      taskType: session.taskType,
      risk: challengeOptions.risk ?? "MEDIUM",
      uncertainty: challengeOptions.uncertainty ?? 0.5,
      remainingModelCalls: Math.max(0, session.budget.maxModelCalls - 1),
      remainingToolCalls: session.budget.maxToolCalls ?? 0,
      expectedBenefitThreshold: challengeOptions.expectedBenefitThreshold ?? 0.35,
      allowedStrategies: challengeOptions.allowedStrategies
    });
    emit("CHALLENGE_SELECTED", plan);

    if (plan.strategy !== "NO_CHALLENGE") {
      session = transitionSession(session, "CHALLENGING", now());
      challengedArtifact = await requireAdapter(adapters, "runChallenge")({ session, baselineArtifact, primaryArtifact, plan });
      if (challengedArtifact) assertSessionArtifact(session, challengedArtifact, "Challenged artifact");
      emit("CHALLENGE_COMPLETED", { strategy: plan.strategy, artifactId: challengedArtifact?.id ?? null });
    }

    session = transitionSession(session, "EVALUATING", now());
    evaluation = await requireAdapter(adapters, "evaluate")({
      session, baselineArtifact, primaryArtifact, challengedArtifact, plan
    });
    invariant(evaluation && Array.isArray(evaluation.findings), "INVALID_EVALUATION", "Evaluator must return a findings array.");
    emit("EVALUATION_COMPLETED", {
      findingCount: evaluation.findings.length,
      verifiedFindingCount: evaluation.findings.filter((item) => item.evidenceStatus === "VERIFIED").length
    });

    const actionableFindings = evaluation.findings.filter((item) =>
      item.evidenceStatus === "VERIFIED" && item.severity !== "INFO"
    );

    if (actionableFindings.length > 0) {
      session = transitionSession(session, "IMPROVING", now());
      improvement = await requireAdapter(adapters, "proposeImprovement")({ session, findings: actionableFindings, primaryArtifact, challengedArtifact });
      invariant(improvement && Array.isArray(improvement.changes), "INVALID_IMPROVEMENT", "Improvement adapter must return a changes array.");
      emit("IMPROVEMENT_PROPOSED", { changeCount: improvement.changes.length });

      if (improvement.requiresApproval && approvals.improvement !== true) {
        session = transitionSession(session, "AWAITING_APPROVAL", now());
        emit("APPROVAL_REQUIRED", { action: "APPLY_IMPROVEMENT" });
        return { session, status: "AWAITING_APPROVAL", events, plan, evaluation, improvement, finalArtifact: primaryArtifact, verification: null };
      }

      finalArtifact = await requireAdapter(adapters, "applyImprovement")({ session, artifact: primaryArtifact, improvement });
      assertSessionArtifact(session, finalArtifact, "Improved artifact");
      emit("IMPROVEMENT_APPLIED", { artifactId: finalArtifact.id });
    } else {
      finalArtifact = primaryArtifact;
    }

    session = transitionSession(session, "VERIFYING", now());
    verification = await requireAdapter(adapters, "verify")({ session, baselineArtifact, artifact: finalArtifact, evaluation });
    invariant(verification && Array.isArray(verification.failed) && Array.isArray(verification.regressions),
      "INVALID_VERIFICATION", "Verifier must return failed and regressions arrays.");
    emit("VERIFICATION_COMPLETED", {
      passedCount: verification.passed?.length ?? 0,
      failedCount: verification.failed.length,
      regressionCount: verification.regressions.length
    });

    const verified = verification.failed.length === 0 && verification.regressions.length === 0;
    if (!verified) {
      session = transitionSession(session, "FAILED", now());
      emit("SESSION_FAILED", { reason: "Verification failed or regressions were detected." });
      return { session, status: "FAILED", events, plan, evaluation, improvement, finalArtifact: baselineArtifact, verification };
    }

    session = transitionSession(session, "COMPLETED", now());
    emit("SESSION_COMPLETED", { artifactId: finalArtifact.id });
    return { session, status: "COMPLETED", events, plan, evaluation, improvement, finalArtifact, verification };
  } catch (error) {
    if (!["COMPLETED", "FAILED", "CANCELLED", "ROLLED_BACK"].includes(session.status)) {
      try { session = transitionSession(session, "FAILED", now()); } catch {}
    }
    emit("SESSION_ERROR", { code: error.code ?? "UNEXPECTED_ERROR", message: error.message });
    return { session, status: "FAILED", events, plan: null, evaluation, improvement, finalArtifact: baselineArtifact, verification, error: { code: error.code ?? "UNEXPECTED_ERROR", message: error.message } };
  }
}
