import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractJsonObject, normalizeModelContent } from "../src/domain/structured-response.js";

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
