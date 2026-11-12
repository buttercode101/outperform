import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractJsonObject, normalizeModelContent, parseAdjudicationResponse } from "../src/domain/structured-response.js";

test("extracts JSON from a fenced response", () => {
  assert.deepEqual(extractJsonObject('Here is the review:\n```json\n{"assessment":"Good","criteriaCoverage":["A"]}\n```'), {
    assessment: "Good",
    criteriaCoverage: ["A"]
  });
});

test("extracts the first complete object when the model adds surrounding prose", () => {
  assert.deepEqual(extractJsonObject('Review result:\n{"assessment":"Complete","remainingRisks":[]}\nEnd of review.'), {
    assessment: "Complete",
    remainingRisks: []
  });
});

test("does not treat braces inside quoted strings as object boundaries", () => {
  assert.deepEqual(extractJsonObject('{"assessment":"Keep {this} literal","remainingRisks":[]}'), {
    assessment: "Keep {this} literal",
    remainingRisks: []
  });
});

test("returns null for malformed, incomplete or non-object responses", () => {
  assert.equal(extractJsonObject('{"assessment":"unfinished"'), null);
  assert.equal(extractJsonObject("no JSON was returned"), null);
  assert.equal(extractJsonObject('[{"assessment":"array"}]'), null);
  assert.equal(extractJsonObject(null), null);
});

test("normalizes string, multipart and object model message content", () => {
  assert.equal(normalizeModelContent({ content: "  {\"ok\":true}  " }), '{"ok":true}');
  assert.equal(normalizeModelContent({ content: [{ type: "text", text: '{"ok":' }, { type: "text", text: 'true}' }] }), '{"ok":\ntrue}');
  assert.equal(normalizeModelContent({ content: { ok: true } }), '{"ok":true}');
  assert.equal(normalizeModelContent({ refusal: "  Refused  " }), "Refused");
  assert.equal(normalizeModelContent({ content: null }), "");
  assert.equal(normalizeModelContent(null), "");
});

test("workflow imports the structured response helpers it calls", () => {
  const workerSource = readFileSync(new URL("../worker/workflows/improvement.js", import.meta.url), "utf8");
  assert.match(workerSource, /import \{ extractJsonObject, normalizeModelContent \} from ["']\.\.\/\.\.\/src\/domain\/structured-response\.js["']/);
});

test("avoids duplicate JSON-mode calls for the known incompatible adjudication model", () => {
  const workerSource = readFileSync(new URL("../worker/workflows/improvement.js", import.meta.url), "utf8");
  const adjudicationStart = workerSource.indexOf('stage: "ADJUDICATION"');
  const finalReviewStart = workerSource.indexOf('stage: "FINAL_REVIEW"');
  assert.ok(adjudicationStart >= 0 && finalReviewStart > adjudicationStart);
  const adjudicationCall = workerSource.slice(adjudicationStart, finalReviewStart);
  const finalReviewCall = workerSource.slice(finalReviewStart);
  assert.doesNotMatch(adjudicationCall, /responseFormat:\s*\{\s*type:\s*"json_object"/);
  assert.match(finalReviewCall, /responseFormat:\s*\{\s*type:\s*"json_object"/);
});

test("parses complete adjudication responses with explicit candidate choice", () => {
  const parsed = parseAdjudicationResponse('Evaluator output: {"preferred":"challenger","rationale":"The challenger satisfies more mandatory requirements.","strengths":["Clearer structure"],"risks":["One source remains unverified"],"improvementIdeas":["Add source verification"]} End.');
  assert.equal(parsed.preferred, "challenger");
  assert.equal(parsed.parsed, true);
  assert.equal(parsed.rationale, "The challenger satisfies more mandatory requirements.");
  assert.deepEqual(parsed.strengths, ["Clearer structure"]);
  assert.deepEqual(parsed.risks, ["One source remains unverified"]);
  assert.deepEqual(parsed.improvementIdeas, ["Add source verification"]);
});

test("rejects incomplete or invalid adjudication responses instead of silently preferring primary", () => {
  assert.throws(() => parseAdjudicationResponse('{"preferred":"primary","rationale":"Incomplete","strengths":[]}'), /complete JSON object|arrays/);
  assert.throws(() => parseAdjudicationResponse('{"preferred":"other","rationale":"No","strengths":[],"risks":[],"improvementIdeas":[]}'), /preferred set to primary or challenger/);
  assert.throws(() => parseAdjudicationResponse('{"preferred":"primary","rationale":"Cut off","strengths":["A"]'), /complete JSON object/);
});

test("Worker validates adjudication inside the retryable workflow step and records its result", () => {
  const workerSource = readFileSync(new URL("../worker/workflows/improvement.js", import.meta.url), "utf8");
  assert.match(workerSource, /import \{ extractJsonObject, normalizeModelContent, parseAdjudicationResponse \}/);
  assert.match(workerSource, /const evaluation = await step\.do\("independent-adjudication", async \(\) => \{/);
  assert.match(workerSource, /recordEvent\(this\.env\.DB, sessionId, "ADJUDICATION_COMPLETED"/);
  assert.doesNotMatch(workerSource, /function parseJudgeResponse\(/);
});
