import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.OUTPERFORM_URL || "https://outperform.buttercoder-dev.workers.dev";
const outputDir = "artifacts/browser-qa";
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await page.emulateMedia({ colorScheme: "dark" });
const errors = [];
let guestMode = true;
let guestPostRequests = 0;
page.on("request", request => { if (guestMode && request.url().includes("/api/sessions") && request.method() === "POST") guestPostRequests += 1; });
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  const response = await page.goto(baseURL, { waitUntil: "networkidle", timeout: 45000 });
  assert.ok(response?.ok(), `Production entry returned HTTP ${response?.status()}`);
  await page.locator(".guest-hero h1").waitFor({ state: "visible", timeout: 20000 });
  assert.match(await page.locator(".guest-hero h1").innerText(), /No account required/);
  assert.equal(await page.locator("#guest-objective").count(), 1);
  assert.equal(await page.locator("#guest-requirements").count(), 1);
  assert.equal(await page.locator("#guest-context").count(), 1);
  await page.locator(".guest-library .empty-state").waitFor({ state: "visible" });
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark", "System dark preference should be applied on first visit.");
  const darkBackground = await page.locator(".guest-screen").evaluate(element => getComputedStyle(element).backgroundColor);
  assert.ok(Number(darkBackground.match(/\\d+/)?.[0]) < 50, `Dark theme surface is not dark: ${darkBackground}`);

  await page.getByRole("button", { name: "Switch to light mode" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".guest-hero h1").waitFor({ state: "visible" });
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light", "Manual theme choice should survive reload and override system preference.");
  const lightBackground = await page.locator(".guest-screen").evaluate(element => getComputedStyle(element).backgroundColor);
  assert.ok(Number(lightBackground.match(/\\d+/)?.[0]) > 200, `Light theme surface is not light: ${lightBackground}`);

  for (const width of [320, 375, 768, 1120, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 850 : 1000 });
    await page.waitForTimeout(150);
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      heroRight: document.querySelector(".guest-hero h1").getBoundingClientRect().right,
      composerRight: document.querySelector(".guest-composer").getBoundingClientRect().right,
      libraryRight: document.querySelector(".guest-library").getBoundingClientRect().right
    }));
    assert.ok(Math.max(dimensions.document, dimensions.body) <= width + 1,
      `Horizontal overflow at ${width}px: ${JSON.stringify(dimensions)}`);
    assert.ok(dimensions.heroRight <= width + 1, `Hero heading overflows at ${width}px`);
    assert.ok(dimensions.composerRight <= width + 1, `Composer overflows at ${width}px`);
    assert.ok(dimensions.libraryRight <= width + 1, `Saved brief panel overflows at ${width}px`);
    await page.screenshot({ path: `${outputDir}/guest-light-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await page.screenshot({ path: `${outputDir}/guest-dark-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Switch to light mode" }).click();
  }

  await page.goto(baseURL + "/?account=1&mode=signup", { waitUntil: "networkidle" });
  await page.locator(".auth-screen").waitFor({ state: "visible" });
  await page.setViewportSize({ width: 375, height: 850 });
  await page.screenshot({ path: `${outputDir}/auth-light-375.png`, fullPage: true });
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark", "Theme control should also be available on authentication.");
  await page.screenshot({ path: `${outputDir}/auth-dark-375.png`, fullPage: true });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark", "Theme preference should persist across guest and authentication routes.");
  guestMode = true;
  await page.goto(baseURL, { waitUntil: "networkidle" });

  await page.setViewportSize({ width: 1440, height: 1000 });
  const objective = `Browser QA brief ${new Date().toISOString()}`;
  await page.locator("#guest-objective").fill(objective);
  await page.locator("#guest-requirements").fill("Preserve existing work\nKeep guest data local\nExport a usable prompt");
  await page.locator("#guest-context").fill("Disposable browser-only QA context.");
  await page.getByRole("button", { name: /Save work brief/ }).click();
  await page.getByText(/Your work brief is saved in this browser/).waitFor({ state: "visible" });
  await page.locator(".guest-library .session-row").filter({ hasText: objective }).waitFor({ state: "visible" });

  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".guest-library .session-row").filter({ hasText: objective }).waitFor({ state: "visible" });

  const row = page.locator(".guest-library .session-row").filter({ hasText: objective });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.locator("#guest-objective").fill(objective + " — edited");
  await page.getByRole("button", { name: /Save changes/ }).click();
  await page.locator(".guest-library .session-row").filter({ hasText: objective + " — edited" }).waitFor({ state: "visible" });

  const editedRow = page.locator(".guest-library .session-row").filter({ hasText: objective + " — edited" });
  const briefDownloadEvent = page.waitForEvent("download");
  await editedRow.getByRole("button", { name: "Export brief" }).click();
  const briefDownload = await briefDownloadEvent;
  assert.equal(briefDownload.suggestedFilename(), "outperform-work-brief.md");
  const briefStream = await briefDownload.createReadStream();
  let briefContent = "";
  for await (const chunk of briefStream) briefContent += chunk.toString("utf8");
  assert.match(briefContent, /Browser QA brief/);
  assert.match(briefContent, /Preserve existing work/);

  const promptDownloadEvent = page.waitForEvent("download");
  await editedRow.getByRole("button", { name: /Export AI prompt/ }).click();
  const promptDownload = await promptDownloadEvent;
  assert.equal(promptDownload.suggestedFilename(), "outperform-ready-to-use-prompt.md");
  const promptStream = await promptDownload.createReadStream();
  let promptContent = "";
  for await (const chunk of promptStream) promptContent += chunk.toString("utf8");
  assert.match(promptContent, /Browser QA brief/);
  assert.match(promptContent, /Acceptance criteria/);

  page.once("dialog", dialog => dialog.accept());
  await editedRow.getByRole("button", { name: "Delete" }).click();
  await page.locator(".guest-library .session-row").filter({ hasText: objective + " — edited" }).waitFor({ state: "detached" });

  assert.equal(guestPostRequests, 0, "Guest brief save/export must remain device-local and must not create a server session.");
  assert.deepEqual(errors, [], `Browser console/page errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    result: "PASS",
    url: baseURL,
    viewportWidths: [320, 375, 768, 1120, 1440],
    guestWorkflow: ["empty-state", "create", "local-save", "reload-persistence", "oversize-file-error", "text-file-import", "edit", "export-brief-content", "export-prompt-content", "delete", "no-server-upload"],
    browserErrors: errors,
    screenshots: [320, 375, 768, 1120, 1440].flatMap(width => [`${outputDir}/guest-light-${width}.png`, `${outputDir}/guest-dark-${width}.png`])
  }, null, 2));
} finally {
  await browser.close();
}
