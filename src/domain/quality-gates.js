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
  const taskSpecificChecks = [];
  if (taskType === "CODE") {
    const riskyPatterns = [
      ["dynamic_eval", /\beval\s*\(/i],
      ["dynamic_function", /\bnew\s+Function\s*\(/i],
      ["html_injection", /\.innerHTML\s*=/i],
      ["shell_execution", /\b(?:exec|execSync)\s*\(/i]
    ];
    const detected = riskyPatterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
    taskSpecificChecks.push({
      id: "code_risk_patterns",
      label: "Common code-risk pattern scan",
      status: detected.length ? "FLAG" : "PASS",
      detail: detected.length
        ? "Potentially risky patterns detected: " + detected.join(", ") + ". Review context and sanitization; this is not a full security scan."
        : "No selected high-risk text patterns detected. This is not a substitute for static analysis or execution."
    });
  } else if (taskType === "RESEARCH") {
    const links = text.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s)]+/gi) || [];
    taskSpecificChecks.push({
      id: "research_source_links",
      label: "Research source-link presence",
      status: links.length ? "PASS" : "FLAG",
      detail: links.length
        ? links.length + " source link(s) detected. Their availability, authority and claim support have not been checked."
        : "No source URLs detected. Claims requiring external evidence should be reviewed before relying on this research."
    });
  } else if (taskType === "DOCUMENT") {
    const missingStructure = words >= 100 && headings.length < 2;
    taskSpecificChecks.push({
      id: "document_structure",
      label: "Document structure scan",
      status: missingStructure ? "FLAG" : "PASS",
      detail: missingStructure
        ? "A longer document has fewer than two Markdown headings. Confirm whether its structure suits the intended audience."
        : "No obvious heading-structure issue detected by this simple check."
    });
  } else if (taskType === "BUSINESS") {
    const quantified = /(?:[$€£]\s?\d|\bR\s?\d|\b\d+(?:\.\d+)?%)/.test(text);
    const businessBody = text.replace(/^#{1,6}\s+.*$/gm, "");
    const hasBasis = /\b(?:assumptions?|estimates?|risks?|uncertaint(?:y|ies)|source|basis|forecast)\b/i.test(businessBody);
    taskSpecificChecks.push({
      id: "business_claim_basis",
      label: "Quantified business-claim basis",
      status: quantified && !hasBasis ? "FLAG" : "PASS",
      detail: quantified && !hasBasis
        ? "Quantified figures were found without an obvious assumptions, source, estimate or risk section. Validate the basis before making a decision."
        : "No obvious unsupported quantified-claim pattern detected. Figures and assumptions have not been independently validated."
    });
  }

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
  checks.push(...taskSpecificChecks);
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
      "They do not prove factual accuracy, requirement satisfaction, code correctness, test execution, legal compliance or real-world usefulness.",
      "Task-specific scans are narrow pattern checks, not complete security, source-validation or financial audits."
    ]
  };
}
