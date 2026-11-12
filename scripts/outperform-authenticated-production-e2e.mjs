// Regression run against deployment 204: verify model-content normalization and JSON-mode fallback end to end.
// Regression run against deployment 203: exercise provider structured-response fallback and full approval lifecycle.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.OUTPERFORM_URL || "https://outperform.buttercoder-dev.workers.dev";
const outputDir = "artifacts/production-e2e";
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const contextA = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const pageA = await contextA.newPage();
await pageA.emulateMedia({ colorScheme: "dark" });
const browserErrors = [];
function monitorBrowserErrors(page) {
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (/Failed to load resource: the server responded with a status of 40[14]/.test(message.text())) return;
    browserErrors.push(message.text());
  });
  page.on("response", response => {
    const status = response.status();
    const path = new URL(response.url()).pathname;
    if (status >= 500 || (status >= 400 && (!path.startsWith("/api/") || ![401, 404].includes(status)))) {
      browserErrors.push(`HTTP ${status} ${path}`);
    }
  });
}
monitorBrowserErrors(pageA);
const autoConfirm = async dialog => {
  if (dialog.type() === "prompt") await dialog.accept("DELETE MY ACCOUNT");
  else await dialog.accept();
};
pageA.on("dialog", autoConfirm);

let contextB;
let pageB;
let userAId = null;
let userBId = null;
let sessionId = null;
let artifactIds = [];
let userADeleted = false;
let userBDeleted = false;

async function signUp(page, name, email) {
  await page.goto(baseURL + "/?account=1&mode=signup", { waitUntil: "networkidle", timeout: 45000 });
  await page.locator("#auth-name").fill(name);
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill("OutperformE2E!2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.locator(".app-shell").waitFor({ state: "visible", timeout: 30000 });
  const identity = await page.evaluate(async () => {
    const response = await fetch("/api/auth/get-session");
    const data = await response.json();
    return data?.user ? { id: data.user.id } : null;
  });
  assert.ok(identity?.id, "New account must establish a real authenticated session.");
  return identity.id;
}

async function readDownload(download) {
  const stream = await download.createReadStream();
  assert.ok(stream, "Expected a readable download stream.");
  let content = "";
  for await (const chunk of stream) content += chunk.toString("utf8");
  return content;
}

async function getSessionByObjective(page, objective) {
  return page.evaluate(async target => {
    const response = await fetch("/api/sessions");
    if (!response.ok) return { errorStatus: response.status };
    const data = await response.json();
    const session = (data.sessions || []).find(item => item.objective === target);
    return session ? { id: session.id, status: session.status, taskType: session.task_type } : null;
  }, objective);
}

async function getSessionStatus(page, id) {
  return page.evaluate(async sessionId => {
    const response = await fetch("/api/sessions");
    if (!response.ok) return null;
    const data = await response.json();
    return (data.sessions || []).find(item => item.id === sessionId)?.status ?? null;
  }, id);
}

async function deleteAccountFallback(page) {
  if (!page || page.isClosed()) return;
  try {
    await page.evaluate(async () => {
      await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" })
      });
    });
  } catch {}
}

try {
  const suffix = Date.now() + "-" + randomUUID().slice(0, 8);
  const emailA = "outperform-e2e-a-" + suffix + "@example.com";
  const emailB = "outperform-e2e-b-" + suffix + "@example.com";

  userAId = await signUp(pageA, "OUTPERFORM E2E A", emailA);
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "dark", "Authenticated app should inherit the system dark preference.");
  await pageA.getByRole("button", { name: "Switch to light mode" }).click();
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "light", "Authenticated workspace theme toggle must work.");

  await pageA.screenshot({ path: outputDir + "/authenticated-overview-light-desktop.png", fullPage: true });
  await pageA.setViewportSize({ width: 375, height: 850 });
  const mobileOverviewWidth = await pageA.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
  assert.ok(mobileOverviewWidth <= 376, "Authenticated overview must not overflow at 375px.");
  await pageA.screenshot({ path: outputDir + "/authenticated-overview-light-mobile.png", fullPage: true });
  await pageA.getByRole("button", { name: "Switch to dark mode" }).click();
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "dark");
  await pageA.screenshot({ path: outputDir + "/authenticated-overview-dark-mobile.png", fullPage: true });
  await pageA.setViewportSize({ width: 1440, height: 1000 });
  await pageA.screenshot({ path: outputDir + "/authenticated-overview-dark-desktop.png", fullPage: true });

  const objective = "Create a concise deployment runbook for a small web application, including a pre-deployment snapshot, smoke checks, rollback steps, and post-deployment verification.";
  await pageA.getByRole("button", { name: "New session" }).click();
  await pageA.locator("#task-type").selectOption("DOCUMENT");
  await pageA.locator("#objective").fill(objective);
  await pageA.locator("#requirements").fill([
    "List pre-deployment backup and restore checks.",
    "Separate automated verification from human approval.",
    "Give a rollback decision tree and exact validation steps."
  ].join("\n"));
  await pageA.locator("#constraints").fill("Do not claim external systems have been tested. Distinguish verified facts from assumptions.");
  await pageA.locator("#context").fill("Synthetic QA brief. The application uses a Cloudflare Worker, D1 database, R2 artifact storage and a React/Vite interface. This is disposable test data.");
  await pageA.getByRole("button", { name: /Create and run/ }).click();

  const deadline = Date.now() + 9 * 60 * 1000;
  let session = null;
  while (Date.now() < deadline) {
    session = await getSessionByObjective(pageA, objective);
    if (session?.errorStatus) throw new Error("Authenticated session listing returned HTTP " + session.errorStatus);
    if (session?.id) {
      sessionId = session.id;
      if (session.status === "AWAITING_APPROVAL") break;
      if (["FAILED", "CANCELLED", "BLOCKED"].includes(session.status)) {
        const detail = await pageA.evaluate(async id => {
          const response = await fetch("/api/sessions/" + id);
          return await response.json();
        }, session.id);
        throw new Error("Production workflow ended in " + session.status + ": " + JSON.stringify(detail.events || []));
      }
      if (session.status === "CREATED") {
        const row = pageA.locator(".session-row").filter({ hasText: objective });
        const runButton = row.getByRole("button", { name: "Run" });
        if (await runButton.count()) await runButton.click();
      }
    }
    await pageA.waitForTimeout(5000);
  }
  assert.ok(session?.id && session.status === "AWAITING_APPROVAL", "Real AI workflow must reach human approval within nine minutes.");

  const sessionRow = pageA.locator(".session-row").filter({ hasText: objective });
  await sessionRow.getByRole("button", { name: "Review" }).click();
  await pageA.locator(".review-panel").waitFor({ state: "visible", timeout: 30000 });
  await pageA.locator(".risk-assessment").waitFor({ state: "visible", timeout: 20000 });
  await pageA.locator(".quality-gate-panel").waitFor({ state: "visible", timeout: 20000 });
  await pageA.locator(".final-review-summary").waitFor({ state: "visible", timeout: 20000 });
  await pageA.locator(".model-usage-panel").waitFor({ state: "visible", timeout: 20000 });

  const artifactTabs = pageA.locator(".artifact-tab");
  const artifactCount = await artifactTabs.count();
  assert.equal(artifactCount, 4, "A complete run must preserve the baseline and produce primary, challenger and final artifacts.");
  const artifactNames = await pageA.locator(".artifact-tab strong").allTextContents();
  for (const required of ["BASELINE", "PRIMARY", "CHALLENGER", "FINAL"]) {
    assert.ok(artifactNames.some(name => name.toUpperCase().includes(required)), "Missing artifact lineage entry: " + required);
  }
  const persistedSession = await pageA.evaluate(async id => {
    const response = await fetch("/api/sessions/" + id);
    if (!response.ok) throw new Error("Session detail returned HTTP " + response.status);
    return await response.json();
  }, sessionId);
  const artifactsByRole = new Map((persistedSession.artifacts || []).map(artifact => [artifact.created_by, artifact]));
  const baseline = artifactsByRole.get("BASELINE");
  const primary = artifactsByRole.get("PRIMARY");
  const challenger = artifactsByRole.get("CHALLENGER");
  const final = artifactsByRole.get("FINAL");
  assert.ok(baseline && primary && challenger && final, "All four artifact records must be persisted in D1.");
  const finalReviewEvent = (persistedSession.events || []).find(event => event.event_type === "FINAL_REVIEW_COMPLETED");
  const finalReview = finalReviewEvent?.payload?.review;
  assert.ok(finalReview && typeof finalReview.assessment === "string", "Final review must be persisted as structured data.");
  assert.ok(Array.isArray(finalReview.criteriaCoverage) && finalReview.criteriaCoverage.length > 0, "Final review must contain criteria coverage.");
  assert.equal(finalReview.verificationStatus, "UNVERIFIED", "A model review must not be labeled as external verification.");
  assert.deepEqual(
    [baseline.version, primary.version, challenger.version, final.version],
    [1, 2, 3, 4],
    "Artifact versions must satisfy the positive D1 constraint and preserve lineage order."
  );
  assert.equal(primary.parent_artifact_id, baseline.id, "Primary artifact must reference the immutable baseline.");
  assert.equal(challenger.parent_artifact_id, baseline.id, "Challenger artifact must reference the immutable baseline.");
  assert.ok([primary.id, challenger.id].includes(final.parent_artifact_id), "Final artifact must reference the selected candidate.");
  assert.equal(persistedSession.session.bestArtifactId, final.id, "Session best-artifact pointer must resolve to the final artifact.");
  const modelUsageCount = await pageA.locator(".model-usage-panel li").count();
  assert.ok(modelUsageCount >= 4, "Provider usage must be recorded for the real generation workflow.");
  const qualityGateCount = await pageA.locator(".quality-gate-panel li").count();
  assert.ok(qualityGateCount >= 4, "Deterministic quality gate must expose its individual checks.");

  await pageA.screenshot({ path: outputDir + "/review-dark-desktop.png", fullPage: true });
  await pageA.getByRole("button", { name: "Close" }).click();
  await pageA.getByRole("button", { name: "Switch to light mode" }).click();
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "light");
  await sessionRow.getByRole("button", { name: "Review" }).click();
  await pageA.locator(".review-panel").waitFor({ state: "visible", timeout: 30000 });
  await pageA.locator(".final-review-summary").waitFor({ state: "visible", timeout: 20000 });
  await pageA.screenshot({ path: outputDir + "/review-light-desktop.png", fullPage: true });
  await pageA.setViewportSize({ width: 375, height: 850 });
  const mobileReviewDimensions = await pageA.evaluate(() => ({
    viewport: window.innerWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    panel: document.querySelector(".review-panel")?.scrollWidth ?? 0,
    panelClient: document.querySelector(".review-panel")?.clientWidth ?? 0
  }));
  assert.ok(mobileReviewDimensions.document <= 376, "Review workspace must not overflow at 375px: " + JSON.stringify(mobileReviewDimensions));
  assert.ok(mobileReviewDimensions.panel <= mobileReviewDimensions.panelClient + 1, "Review panel content must not overflow horizontally.");
  await pageA.screenshot({ path: outputDir + "/review-light-mobile.png", fullPage: true });
  await pageA.getByRole("button", { name: "Close" }).click();
  await pageA.getByRole("button", { name: "Switch to dark mode" }).click();
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "dark");
  await sessionRow.getByRole("button", { name: "Review" }).click();
  await pageA.locator(".review-panel").waitFor({ state: "visible", timeout: 30000 });
  await pageA.screenshot({ path: outputDir + "/review-dark-mobile.png", fullPage: true });
  await pageA.setViewportSize({ width: 1440, height: 1000 });

  const integrityPasses = [];
  for (let index = 0; index < artifactCount; index += 1) {
    const tab = artifactTabs.nth(index);
    const name = await tab.locator("strong").innerText();
    await tab.click();
    await pageA.getByRole("button", { name: "Verify fingerprint" }).click();
    const result = pageA.locator(".integrity-result");
    await result.waitFor({ state: "visible", timeout: 20000 });
    const resultText = await result.innerText();
    assert.match(resultText, /Fingerprint verified/, "Artifact fingerprint failed for " + name + ": " + resultText);
    integrityPasses.push(name);
  }

  const finalTab = artifactTabs.filter({ hasText: "FINAL" }).first();
  await finalTab.click();
  const compareButton = pageA.getByRole("button", { name: "Compare candidates" });
  await compareButton.click();
  await pageA.locator(".artifact-comparison").waitFor({ state: "visible" });
  assert.equal(await pageA.locator(".comparison-columns article").count(), 2, "Candidate comparison must show both competing drafts.");
  await pageA.getByRole("button", { name: "Close comparison" }).click();

  const passportEvent = pageA.waitForEvent("download");
  await pageA.getByRole("button", { name: "Export evidence passport" }).click();
  const passportDownload = await passportEvent;
  const passportContent = await readDownload(passportDownload);
  assert.match(passportContent, /OUTPERFORM Evidence Passport/i);
  assert.match(passportContent, /ARTIFACT_INTEGRITY_CHECKED/);
  assert.match(passportContent, /MODEL_USAGE_RECORDED/);

  const artifactEvent = pageA.waitForEvent("download");
  await pageA.getByRole("button", { name: "Download artifact" }).click();
  const artifactDownload = await artifactEvent;
  const finalArtifactContent = await readDownload(artifactDownload);
  assert.match(finalArtifactContent, /deployment runbook/i);

  await pageA.getByRole("button", { name: "Approve result" }).click();
  let finalStatus = null;
  const completionDeadline = Date.now() + 30000;
  while (Date.now() < completionDeadline) {
    finalStatus = await getSessionStatus(pageA, sessionId);
    if (finalStatus === "COMPLETED") break;
    await pageA.waitForTimeout(1000);
  }
  assert.equal(finalStatus, "COMPLETED", "Human approval must complete the session.");

  const detail = await pageA.evaluate(async id => {
    const response = await fetch("/api/sessions/" + id);
    const data = await response.json();
    return { status: response.status, artifactIds: (data.artifacts || []).map(item => item.id) };
  }, sessionId);
  assert.equal(detail.status, 200);
  artifactIds = detail.artifactIds;
  assert.equal(artifactIds.length, 4);

  await pageA.getByRole("button", { name: "Performance" }).click();
  await pageA.locator(".insights-metrics").first().waitFor({ state: "visible" });
  const metricsText = await pageA.locator(".insights-metrics").first().innerText();
  assert.match(metricsText, /MODEL CALLS TODAY/);
  assert.match(metricsText, /TOKENS PROCESSED/);

  await pageA.getByRole("button", { name: "Playbooks" }).click();
  const starter = pageA.locator(".playbook-card").filter({ hasText: "Engineering hardening" });
  await starter.getByRole("button", { name: "Save to my library" }).click();
  const savedPlaybook = pageA.locator(".saved-playbook-card").filter({ hasText: "Engineering hardening" });
  await savedPlaybook.waitFor({ state: "visible", timeout: 15000 });
  await savedPlaybook.getByRole("button", { name: "Delete" }).click();
  await savedPlaybook.waitFor({ state: "detached", timeout: 15000 });

  contextB = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  pageB = await contextB.newPage();
  pageB.on("dialog", autoConfirm);
  monitorBrowserErrors(pageB);
  userBId = await signUp(pageB, "OUTPERFORM E2E B", emailB);

  const isolation = await pageB.evaluate(async ({ targetSessionId, targetArtifactId }) => {
    const listResponse = await fetch("/api/sessions");
    const list = await listResponse.json();
    const sessionResponse = await fetch("/api/sessions/" + targetSessionId);
    const artifactResponse = await fetch("/api/sessions/" + targetSessionId + "/artifacts/" + targetArtifactId);
    return {
      ownSessionCount: (list.sessions || []).length,
      foreignSessionStatus: sessionResponse.status,
      foreignArtifactStatus: artifactResponse.status
    };
  }, { targetSessionId: sessionId, targetArtifactId: artifactIds[0] });
  assert.equal(isolation.ownSessionCount, 0, "A new tenant must not see another user's sessions.");
  assert.equal(isolation.foreignSessionStatus, 404, "A new tenant must not read another user's session.");
  assert.equal(isolation.foreignArtifactStatus, 404, "A new tenant must not read another user's artifact.");

  await pageB.getByRole("button", { name: "Delete account" }).click();
  await pageB.locator(".guest-screen").waitFor({ state: "visible", timeout: 30000 });
  userBDeleted = true;

  await pageA.getByRole("button", { name: "Delete account" }).click();
  await pageA.locator(".guest-screen").waitFor({ state: "visible", timeout: 30000 });
  userADeleted = true;
  const anonymousStatus = await pageA.evaluate(async () => {
    const [sessions, playbooks] = await Promise.all([fetch("/api/sessions"), fetch("/api/playbooks")]);
    return { sessions: sessions.status, playbooks: playbooks.status };
  });
  assert.deepEqual(anonymousStatus, { sessions: 401, playbooks: 401 }, "Account deletion must revoke access to private APIs.");

  assert.deepEqual(browserErrors, [], "Browser runtime errors: " + browserErrors.join(" | "));
  console.log(JSON.stringify({
    result: "PASS",
    production: baseURL,
    userIds: [userAId, userBId],
    sessionId,
    artifactCount,
    artifactNames,
    persistedLineage: { baseline: baseline.id, primary: primary.id, challenger: challenger.id, final: final.id },
    integrityPasses,
    modelUsageCount,
    qualityGateCount,
    isolation,
    accountDeletion: { userADeleted, userBDeleted, anonymousStatus },
    screenshots: [
      outputDir + "/authenticated-overview-dark-desktop.png",
      outputDir + "/authenticated-overview-dark-mobile.png",
      outputDir + "/review-dark-desktop.png",
      outputDir + "/review-dark-mobile.png"
    ],
    browserErrors
  }, null, 2));
} finally {
  if (sessionId && pageA && !pageA.isClosed() && !userADeleted) {
    const deadline = Date.now() + 11 * 60 * 1000;
    while (Date.now() < deadline) {
      const status = await getSessionStatus(pageA, sessionId).catch(() => null);
      if (!status || ["AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED", "BLOCKED"].includes(status)) break;
      await pageA.waitForTimeout(5000).catch(() => {});
    }
  }
  if (!userBDeleted) await deleteAccountFallback(pageB);
  if (!userADeleted) await deleteAccountFallback(pageA);
  await browser.close();
}
