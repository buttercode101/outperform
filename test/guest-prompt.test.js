import test from "node:test";
import assert from "node:assert/strict";
import { buildGuestPrompt } from "../src/domain/guest-prompt.js";

test("guest prompt includes the objective, criteria and supplied context", () => {
  const prompt = buildGuestPrompt({
    taskType: "CODE",
    objective: "Improve this service while preserving current behaviour.",
    requirements: ["Keep public APIs stable", "Add regression tests"],
    context: "Existing service implementation and relevant architecture notes."
  });
  assert.match(prompt, /Improve this service/);
  assert.match(prompt, /Keep public APIs stable/);
  assert.match(prompt, /Existing service implementation/);
});

test("guest prompt never claims the source material was uploaded or verified", () => {
  const prompt = buildGuestPrompt({ objective: "Create a practical project plan." });
  assert.match(prompt, /Never invent sources, citations, test results/);
  assert.match(prompt, /have not been uploaded/);
  assert.match(prompt, /No additional context supplied/);
});
