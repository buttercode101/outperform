export function buildLineDiff(left = "", right = "", { maxCells = 180000 } = {}) {
  const a = String(left).replace(/\r\n/g, "\n").split("\n");
  const b = String(right).replace(/\r\n/g, "\n").split("\n");
  if (a.length * b.length > maxCells) {
    return {
      mode: "summary",
      rows: [
        { type: "summary", text: "The documents are too large for an in-browser line diff. Review the complete candidates side by side." },
        { type: "summary", text: "Candidate A: " + a.length + " lines · Candidate B: " + b.length + " lines" }
      ],
      added: null,
      removed: null
    };
  }
  const width = b.length + 1;
  const dp = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * width + j] = a[i] === b[j]
        ? 1 + dp[(i + 1) * width + j + 1]
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }
  const rows = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ type: "context", lineA: i + 1, lineB: j + 1, text: a[i] });
      i++; j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      rows.push({ type: "removed", lineA: i + 1, lineB: null, text: a[i++] });
      removed++;
    } else {
      rows.push({ type: "added", lineA: null, lineB: j + 1, text: b[j++] });
      added++;
    }
  }
  while (i < a.length) { rows.push({ type: "removed", lineA: i + 1, lineB: null, text: a[i++] }); removed++; }
  while (j < b.length) { rows.push({ type: "added", lineA: null, lineB: j + 1, text: b[j++] }); added++; }
  return { mode: "diff", rows, added, removed };
}
