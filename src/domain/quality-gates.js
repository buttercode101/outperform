const PLACEHOLDER_PATTERN = /\b(?:TODO|TBD|FIXME|lorem ipsum|insert\s+(?:here|text|citation|source)|replace\s+with\s+(?:your|the)\s+\w+)\b/i;
const UNSUPPORTED_CLAIM_PATTERN = /\b(?:tests?\s+(?:all\s+)?passed|all\s+tests\s+pass|I\s+(?:ran|executed)\s+(?:the\s+)?tests?|verified\s+(?:the\s+)?(?:facts|claims|sources|code|results))\b/i;

function wordCount(value) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function inspectArtifact(content, { taskType = "OTHER" } = {}) {
  const text = typeof content === "string" ? content : "";
  const words = wordCount(text);
  const headings = text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, "").trim().toLowerCase());
  const duplicateHeadings = headings.filter((heading, index) => headings.indexOf(heading) !== index);
  const hasPlaceholder = PLACEHOLDER_PATTERN.test(text);
  const unsupportedVerificationLanguage = UNSUPPORTED_CLAIM_PATTERN.test(text);
  const checks = [
    {
      id: "content_present",
      label: "Artifact contains content",
      status: text.trim().length > 0 ? "PASS" : "FAIL",
      detail: text.trim().length > 0 ? "Non-empty artifact content was stored." : "The final artifact is empty."
    },
    {
      id: "minimum_substance",
      label: "Minimum content threshold",
      status: words >= 25 ? "PASS" : "FLAG",
      detail: words >= 25 ? words + " words detected." : words + " words detected; a human should confirm the deliverable is complete."
    },
    {
      id: "placeholder_scan",
      label: "Placeholder scan",
      status: hasPlaceholder ? "FAIL" : "PASS",
      detail: hasPlaceholder ? "Common unfinished placeholder text was detected." : "No common unfinished placeholder markers were detected."
    },
    {
      id: "heading_consistency",
      label: "Repeated heading scan",
      status: duplicateHeadings.length ? "FLAG" : "PASS",
      detail: duplicateHeadings.length ? "Repeated headings: " + [...new Set(duplicateHeadings)].join(", ") : "No repeated Markdown headings were detected."
    },
    {
      id: "verification_language",
      label: "Verification-claim scan",
      status: unsupportedVerificationLanguage ? "FLAG" : "PASS",
      detail: unsupportedVerificationLanguage
        ? "The artifact contains language that may imply tests or verification. Confirm supporting evidence before relying on it."
        : "No common unsupported test/verification claim patterns were detected."
    }
  ];
  const failures = checks.filter((check) => check.status === "FAIL").length;
  const flags = checks.filter((check) => check.status === "FLAG").length;
  return {
    taskType,
    wordCount: words,
    headingCount: headings.length,
    checks,
    summary: {
      passed: checks.filter((check) => check.status === "PASS").length,
      flagged: flags,
      failed: failures,
      outcome: failures ? "FAILED_CHECKS" : flags ? "REVIEW_REQUIRED" : "MECHANICAL_CHECKS_PASSED"
    },
    limitations: [
      "These checks inspect text structure only.",
      "They do not prove factual accuracy, requirement satisfaction, code correctness, test execution, legal compliance or real-world usefulness."
    ]
  };
}
