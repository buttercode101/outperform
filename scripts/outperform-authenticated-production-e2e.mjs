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
let nextPromptValue = "DELETE MY ACCOUNT";
const autoConfirm = async dialog => {
  if (dialog.type() === "prompt") await dialog.accept(nextPromptValue);
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
  if (await page.locator(".guest-screen").count()) {
    await page.getByRole("button", { name: "Sign in / Create account" }).click();
    await page.locator("#auth-name").waitFor({ state: "visible", timeout: 30000 });
  } else {
    await page.goto(baseURL + "/?account=1&mode=signup", { waitUntil: "networkidle", timeout: 45000 });
  }
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

  const guestObjective = "Import a saved local guest brief into the private workspace without running AI.";
  await pageA.goto(baseURL, { waitUntil: "networkidle", timeout: 45000 });
  await pageA.locator("#guest-playbook").selectOption("DOCUMENT");
  await pageA.locator("#guest-objective").fill(guestObjective);
  await pageA.locator("#guest-context").fill("Synthetic QA context. This brief is disposable and must remain local until the user chooses to import it.");
  await pageA.getByRole("button", { name: "Save work brief" }).click();
  const guestRow = pageA.locator(".guest-library .session-row").filter({ hasText: guestObjective });
  await guestRow.waitFor({ state: "visible", timeout: 15000 });
  await guestRow.getByRole("button", { name: "Edit" }).click();
  await pageA.locator("#guest-objective").fill("This unsaved edit must be discarded.");
  await pageA.getByRole("button", { name: "Cancel edit" }).click();
  assert.equal(await guestRow.locator("h3").innerText(), guestObjective, "Cancel edit must preserve the saved local brief.");
  await pageA.getByRole("button", { name: "Sign in / Create account" }).click();
  await pageA.locator("#auth-name").waitFor({ state: "visible", timeout: 30000 });
  await pageA.getByRole("button", { name: "Continue without an account" }).click();
  await pageA.locator(".guest-screen").waitFor({ state: "visible", timeout: 30000 });
  userAId = await signUp(pageA, "OUTPERFORM E2E A", emailA);
  await pageA.locator(".guest-import-banner").waitFor({ state: "visible", timeout: 20000 });
  await pageA.getByRole("button", { name: "Import briefs" }).click();
  await pageA.locator(".guest-import-banner").waitFor({ state: "detached", timeout: 20000 });
  await pageA.locator(".session-row").filter({ hasText: guestObjective }).waitFor({ state: "visible", timeout: 15000 });
  const importedGuestCount = await pageA.evaluate(() => JSON.parse(localStorage.getItem("outperform_guest_work") || "[]").length);
  assert.equal(importedGuestCount, 0, "Successfully imported guest briefs must be removed from local-only storage.");
  await pageA.getByRole("button", { name: "Sign out" }).click();
  await pageA.locator(".guest-screen").waitFor({ state: "visible", timeout: 30000 });
  await pageA.getByRole("button", { name: "Sign in / Create account" }).click();
  await pageA.locator("#auth-name").waitFor({ state: "visible", timeout: 30000 });
  await pageA.getByRole("button", { name: "Sign in", exact: true }).click();
  await pageA.locator("#auth-name").waitFor({ state: "detached", timeout: 10000 });
  await pageA.locator("#auth-email").fill(emailA);
  await pageA.locator("#auth-password").fill("OutperformE2E!2026");
  await pageA.getByRole("button", { name: "Sign in", exact: true }).click();
  await pageA.locator(".app-shell").waitFor({ state: "visible", timeout: 30000 });
  const reauthenticatedUserId = await pageA.evaluate(async () => (await (await fetch("/api/auth/get-session")).json())?.user?.id || null);
  assert.equal(reauthenticatedUserId, userAId, "Sign-out and sign-in must restore the same account.");
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "dark", "Authenticated app should inherit the system dark preference.");
  await pageA.getByRole("button", { name: "Switch to light mode" }).click();
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "light", "Authenticated workspace theme toggle must work.");

  await pageA.screenshot({ path: outputDir + "/authenticated-overview-light-desktop.png", fullPage: true });
  await pageA.setViewportSize({ width: 375, height: 850 });
  const mobileOverviewWidth = await pageA.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
  assert.ok(mobileOverviewWidth <= 376, "Authenticated overview must not overflow at 375px.");
  assert.ok(await pageA.getByRole("button", { name: "Delete account" }).isVisible(), "Account deletion must remain accessible on mobile.");
  assert.equal(await pageA.locator(".avatar").isVisible(), false, "Decorative account avatar must not wrap onto a second mobile header row.");
  assert.equal(await pageA.locator(".breadcrumb-root").isVisible(), false, "Mobile breadcrumb must show only the current workspace view.");
  assert.equal(await pageA.locator(".breadcrumb-current").isVisible(), true, "Current workspace view must remain visible on mobile.");
  await pageA.screenshot({ path: outputDir + "/authenticated-overview-light-mobile.png", fullPage: true });
  await pageA.setViewportSize({ width: 320, height: 850 });
  const narrowOverviewWidth = await pageA.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
  assert.ok(narrowOverviewWidth <= 321, "Authenticated overview must not overflow at 320px: " + narrowOverviewWidth);
  assert.ok(await pageA.getByRole("button", { name: "Delete account" }).isVisible(), "Account deletion must remain accessible at 320px.");
  await pageA.setViewportSize({ width: 375, height: 850 });
  await pageA.getByRole("button", { name: "Switch to dark mode" }).click();
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "dark");
  await pageA.screenshot({ path: outputDir + "/authenticated-overview-dark-mobile.png", fullPage: true });
  await pageA.setViewportSize({ width: 1440, height: 1000 });
  await pageA.screenshot({ path: outputDir + "/authenticated-overview-dark-desktop.png", fullPage: true });

  await pageA.getByRole("button", { name: "New session" }).click();
  await pageA.locator(".composer").waitFor({ state: "visible" });
  await pageA.keyboard.press("Escape");
  await pageA.locator(".composer").waitFor({ state: "detached" });
  await pageA.getByRole("button", { name: "New session" }).click();
  await pageA.locator(".composer").waitFor({ state: "visible" });
  await pageA.getByRole("button", { name: "Close" }).click();
  await pageA.locator(".composer").waitFor({ state: "detached" });
  await pageA.getByRole("button", { name: /Start with your work/ }).click();
  await pageA.locator(".composer").waitFor({ state: "visible" });
  await pageA.locator(".modal-backdrop").click({ position: { x: 10, y: 10 } });
  await pageA.locator(".composer").waitFor({ state: "detached" });
  await pageA.getByRole("button", { name: "New session" }).click();
  await pageA.locator("#task-type").selectOption("DOCUMENT");
  const composerPlaybookObjective = "Create a reusable QA runbook for a web application.";
  await pageA.locator("#objective").fill(composerPlaybookObjective);
  await pageA.locator("#requirements").fill("Preserve existing behavior.\nVerify every critical path.");
  await pageA.locator("#constraints").fill("Do not change production data.");
  nextPromptValue = "QA composer playbook";
  await pageA.getByRole("button", { name: "Save as playbook" }).click();
  nextPromptValue = "DELETE MY ACCOUNT";
  await pageA.getByRole("button", { name: "Cancel" }).click();
  const savedComposerPlaybook = await pageA.evaluate(async () => {
    const response = await fetch("/api/playbooks");
    const data = await response.json();
    return (data.playbooks || []).find(item => item.name === "QA composer playbook") || null;
  });
  assert.ok(savedComposerPlaybook?.id, "Saving a reusable playbook from the composer must persist it.");
  await pageA.getByRole("button", { name: "Playbooks" }).click();
  const composerPlaybookCard = pageA.locator(".saved-playbook-card").filter({ hasText: "QA composer playbook" });
  await composerPlaybookCard.waitFor({ state: "visible", timeout: 15000 });
  await composerPlaybookCard.getByRole("button", { name: "Use playbook" }).click();
  await pageA.locator(".composer").waitFor({ state: "visible" });
  assert.equal(await pageA.locator("#task-type").inputValue(), "DOCUMENT");
  assert.equal(await pageA.locator("#objective").inputValue(), composerPlaybookObjective);
  assert.match(await pageA.locator("#requirements").inputValue(), /Preserve existing behavior/);
  assert.match(await pageA.locator("#constraints").inputValue(), /Do not change production data/);
  await pageA.getByRole("button", { name: "Cancel" }).click();
  await pageA.getByRole("button", { name: "Playbooks" }).click();
  await composerPlaybookCard.getByRole("button", { name: "Delete" }).click();
  await composerPlaybookCard.waitFor({ state: "detached", timeout: 15000 });

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
  await pageA.locator(".session-filters").waitFor({ state: "visible", timeout: 15000 });

  await pageA.getByRole("textbox", { name: "Search sessions" }).fill("this session does not exist");
  await pageA.locator(".compact-empty").waitFor({ state: "visible" });
  await pageA.getByRole("button", { name: "Clear filters" }).click();
  await pageA.getByLabel("Filter by status").selectOption("AWAITING_APPROVAL");
  await pageA.getByLabel("Filter by work type").selectOption("DOCUMENT");
  assert.equal(await pageA.locator(".session-row").count(), 1, "Status and work-type filters must isolate the ready-to-review document.");
  await pageA.getByLabel("Filter by status").selectOption("ALL");
  await pageA.getByLabel("Filter by work type").selectOption("ALL");

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
  const adjudicationEvent = (persistedSession.events || []).find(event => event.event_type === "ADJUDICATION_COMPLETED");
  const adjudication = adjudicationEvent?.payload;
  assert.ok(adjudication?.parsed === true, "Independent adjudication must persist a successfully parsed structured result.");
  assert.ok(["primary", "challenger"].includes(adjudication.preferred), "Adjudication must explicitly select a candidate.");
  assert.ok(typeof adjudication.rationale === "string" && adjudication.rationale.length > 0, "Adjudication must include a rationale.");
  assert.ok(Array.isArray(adjudication.strengths) && Array.isArray(adjudication.risks) && Array.isArray(adjudication.improvementIdeas), "Adjudication must include structured strengths, risks and improvement ideas.");
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
  await pageA.keyboard.press("Escape");
  await pageA.locator(".review-panel").waitFor({ state: "detached" });
  await pageA.getByRole("button", { name: "Switch to light mode" }).click();
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "light");
  await sessionRow.getByRole("button", { name: "Review" }).click();
  await pageA.locator(".review-panel").waitFor({ state: "visible", timeout: 30000 });
  await pageA.locator(".final-review-summary").waitFor({ state: "visible", timeout: 20000 });
  await pageA.screenshot({ path: outputDir + "/review-light-desktop.png", fullPage: true });
  await pageA.setViewportSize({ width: 375, height: 850 });
  for (const width of [320, 375]) {
    await pageA.setViewportSize({ width, height: 850 });
    const mobileReviewDimensions = await pageA.evaluate(() => ({
      viewport: window.innerWidth,
      document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      panel: document.querySelector(".review-panel")?.scrollWidth ?? 0,
      panelClient: document.querySelector(".review-panel")?.clientWidth ?? 0
    }));
    assert.ok(mobileReviewDimensions.document <= width + 1, "Review workspace must not overflow at " + width + "px: " + JSON.stringify(mobileReviewDimensions));
    assert.ok(mobileReviewDimensions.panel <= mobileReviewDimensions.panelClient + 1, "Review panel content must not overflow horizontally at " + width + "px.");
  }
  await pageA.setViewportSize({ width: 375, height: 850 });
  await pageA.screenshot({ path: outputDir + "/review-light-mobile.png", fullPage: true });
  await pageA.getByRole("button", { name: "Close" }).click();
  await pageA.getByRole("button", { name: "Switch to dark mode" }).click();
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "dark");
  await sessionRow.getByRole("button", { name: "Review" }).click();
  await pageA.locator(".review-panel").waitFor({ state: "visible", timeout: 30000 });
  await pageA.locator(".final-review-summary").waitFor({ state: "visible", timeout: 20000 });
  await pageA.locator(".model-usage-panel").waitFor({ state: "visible", timeout: 20000 });
  const darkReviewContrast = await pageA.evaluate(() => {
    const parse = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = value => {
      const channels = parse(value).map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const contrast = (foreground, background) => {
      const a = luminance(foreground), b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const selectors = {
      reviewMeta: ".review-meta",
      modelUsage: ".model-usage-panel li",
      modelStage: ".model-usage-panel li span:first-child",
      qualityGate: ".quality-gate-panel li strong",
      criteriaHeading: ".criteria-review h3",
      riskLabel: ".risk-assessment > div strong",
      decisionHeading: ".decision-actions > div strong",
      decisionHint: ".decision-actions > div span"
    };
    return Object.entries(selectors).map(([name, selector]) => {
      const element = document.querySelector(selector);
      if (!element) return { name, missing: true, ratio: 0 };
      const foreground = getComputedStyle(element).color;
      let ancestor = element, background = "rgb(17, 23, 18)";
      while (ancestor) {
        const candidate = getComputedStyle(ancestor).backgroundColor;
        if (candidate && candidate !== "rgba(0, 0, 0, 0)" && candidate !== "transparent") {
          background = candidate;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      return { name, foreground, background, ratio: contrast(foreground, background) };
    });
  });
  for (const check of darkReviewContrast) {
    assert.ok(!check.missing && check.ratio >= 4.5, "Dark review text must meet WCAG AA contrast: " + JSON.stringify(check));
  }
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
  for (const width of [320, 375, 768, 1120]) {
    await pageA.setViewportSize({ width, height: width < 500 ? 850 : 1000 });
    const measurement = await pageA.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll("body *")].map(element => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: typeof element.className === "string" ? element.className : element.getAttribute("class"),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth
        };
      }).filter(item => item.right > viewportWidth + 1 || item.left < -1 || item.scrollWidth > item.clientWidth + 1)
        .sort((a, b) => b.right - a.right).slice(0, 15);
      return {
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        offenders
      };
    });
    if (width === 768) {
      await pageA.screenshot({ path: outputDir + "/performance-768.png", fullPage: true });
      console.log("PERFORMANCE_OVERFLOW_DIAGNOSTICS", JSON.stringify(measurement));
    }
    assert.ok(measurement.scrollWidth <= width + 1, "Performance page overflows at " + width + "px: " + measurement.scrollWidth);
  }
  await pageA.setViewportSize({ width: 1440, height: 1000 });
  await pageA.getByRole("button", { name: "Switch to light mode" }).click();
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "light", "Performance page must support light mode.");
  await pageA.getByRole("button", { name: "Switch to dark mode" }).click();
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "dark", "Performance page must support dark mode.");
  await pageA.getByRole("button", { name: "Back to overview" }).click();
  await pageA.locator(".work-area").waitFor({ state: "visible" });

  await pageA.getByRole("button", { name: "Playbooks" }).click();
  await pageA.locator(".playbook-grid").waitFor({ state: "visible" });
  for (const width of [320, 375, 768, 1120]) {
    await pageA.setViewportSize({ width, height: width < 500 ? 850 : 1000 });
    const dimensions = await pageA.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
    assert.ok(dimensions <= width + 1, "Playbooks page overflows at " + width + "px: " + dimensions);
  }
  await pageA.setViewportSize({ width: 1440, height: 1000 });
  await pageA.getByRole("button", { name: "Switch to light mode" }).click();
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "light", "Playbooks page must support light mode.");
  await pageA.getByRole("button", { name: "Switch to dark mode" }).click();
  assert.equal(await pageA.locator("html").getAttribute("data-theme"), "dark", "Playbooks page must support dark mode.");
  const starter = pageA.locator(".playbook-card").filter({ hasText: "Engineering hardening" });
  await starter.getByRole("button", { name: "Save to my library" }).click();
  const savedPlaybook = pageA.locator(".saved-playbook-card").filter({ hasText: "Engineering hardening" });
  await savedPlaybook.waitFor({ state: "visible", timeout: 15000 });
  await savedPlaybook.getByRole("button", { name: "Delete" }).click();
  await savedPlaybook.waitFor({ state: "detached", timeout: 15000 });

  // Exercise the follow-up workflow and the destructive rejection decision.
  await pageA.getByRole("button", { name: "Overview" }).click();
  await sessionRow.getByRole("button", { name: "Review" }).click();
  await pageA.locator(".follow-up-panel").waitFor({ state: "visible", timeout: 20000 });
  const followUpFeedback = "Preserve the rollback decision tree, but make the smoke checks executable and clearly separate verified evidence from assumptions.";
  await pageA.locator("#follow-up-feedback").fill(followUpFeedback);
  await pageA.locator(".follow-up-panel").getByRole("button", { name: "Run another improvement pass" }).click();

  const followUpDeadline = Date.now() + 9 * 60 * 1000;
  let followUpSession = null;
  while (Date.now() < followUpDeadline) {
    const listing = await pageA.evaluate(async () => {
      const response = await fetch("/api/sessions");
      if (!response.ok) throw new Error("Follow-up session list returned HTTP " + response.status);
      return await response.json();
    });
    followUpSession = (listing.sessions || []).find(item => item.id !== sessionId && item.objective === objective);
    if (followUpSession) {
      if (["FAILED", "CANCELLED", "BLOCKED"].includes(followUpSession.status)) {
        throw new Error("Follow-up workflow ended in " + followUpSession.status);
      }
      if (followUpSession.status === "AWAITING_APPROVAL") break;
    }
    await pageA.waitForTimeout(5000);
  }
  assert.ok(followUpSession?.id && followUpSession.status === "AWAITING_APPROVAL", "Follow-up improvement pass must reach human review.");
  const followUpDetail = await pageA.evaluate(async id => {
    const response = await fetch("/api/sessions/" + id);
    if (!response.ok) throw new Error("Follow-up detail returned HTTP " + response.status);
    return await response.json();
  }, followUpSession.id);
  assert.ok(followUpDetail.session.context.includes(followUpFeedback), "Follow-up context must preserve the user's new direction.");

  await pageA.waitForFunction(() => document.querySelectorAll(".session-row").length >= 3, null, { timeout: 20000 });
  const matchingRows = pageA.locator(".session-row").filter({ hasText: objective });
  assert.equal(await matchingRows.count(), 2, "The original and follow-up sessions must both be visible.");
  let followUpReviewOpened = false;
  for (let index = 0; index < await matchingRows.count(); index += 1) {
    await matchingRows.nth(index).getByRole("button", { name: "Review" }).click();
    await pageA.locator(".review-panel").waitFor({ state: "visible", timeout: 20000 });
    await pageA.locator(".final-review-summary").waitFor({ state: "visible", timeout: 20000 });
    if (await pageA.locator(".decision-actions").count()) {
      followUpReviewOpened = true;
      break;
    }
    await pageA.getByRole("button", { name: "Close" }).click();
  }
  assert.ok(followUpReviewOpened, "The follow-up session must expose its approval/rejection controls.");
  await pageA.locator(".decision-actions").getByRole("button", { name: "Reject result" }).click();
  let rejectedStatus = null;
  const rejectionDeadline = Date.now() + 30000;
  while (Date.now() < rejectionDeadline) {
    rejectedStatus = await getSessionStatus(pageA, followUpSession.id);
    if (rejectedStatus === "CANCELLED") break;
    await pageA.waitForTimeout(1000);
  }
  assert.equal(rejectedStatus, "CANCELLED", "Rejecting a follow-up must close it as CANCELLED.");
  const duplicateDecisionStatus = await pageA.evaluate(async id => {
    const response = await fetch("/api/sessions/" + id + "/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "APPROVE" })
    });
    return response.status;
  }, followUpSession.id);
  assert.equal(duplicateDecisionStatus, 409, "A rejected session must reject a second, conflicting decision.");
  assert.equal(await getSessionStatus(pageA, sessionId), "COMPLETED", "The original approved session must remain unchanged after the follow-up is rejected.");

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
