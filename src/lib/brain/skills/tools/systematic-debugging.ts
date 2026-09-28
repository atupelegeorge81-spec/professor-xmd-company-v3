// src/lib/brain/skills/tools/systematic-debugging.ts
// Port ya obra/superpowers systematic-debugging/condition-based-waiting (+ condition-based-waiting-example.ts):
// "Replace arbitrary timeouts with condition polling". Inatafuta sleeps/timeouts za kubahatisha kwenye code/tests
// na kutoa FACTS kwa review/fix. Inaendeshwa AUTOMATIC na runTools.ts.

export interface WaitFinding { line: number; kind: string; ms?: number; snippet: string }

const PATTERNS: { kind: string; rx: RegExp; ms?: (m: RegExpMatchArray) => number | undefined }[] = [
  { kind: "setTimeout-wait", rx: /await\s+new\s+Promise\s*\(\s*\(?\s*\w*\s*\)?\s*=>\s*setTimeout\s*\([^,]+,\s*(\d+)\s*\)/, ms: (m) => Number(m[1]) },
  { kind: "sleep", rx: /\b(?:await\s+)?(?:sleep|delay|wait)\s*\(\s*(\d+)\s*\)/, ms: (m) => Number(m[1]) },
  { kind: "playwright-waitForTimeout", rx: /\.wait_for_timeout\s*\(\s*(\d+)\s*\)|\.waitForTimeout\s*\(\s*(\d+)\s*\)/, ms: (m) => Number(m[1] || m[2]) },
  { kind: "python-sleep", rx: /\btime\.sleep\s*\(\s*([\d.]+)\s*\)/, ms: (m) => Math.round(Number(m[1]) * 1000) },
  { kind: "cy.wait-number", rx: /\bcy\.wait\s*\(\s*(\d+)\s*\)/, ms: (m) => Number(m[1]) },
  { kind: "Thread.sleep", rx: /\bThread\.sleep\s*\(\s*(\d+)\s*\)/, ms: (m) => Number(m[1]) },
];
const TEST_CONTEXT = /\b(describe|it|test|expect|assert|playwright|page\.|cy\.|pytest|unittest|vitest|jest)\b/;

/** Arbitrary waits (hasa kwenye tests). Condition polling (waitFor, waitForSelector, expect.poll) haihesabiwi. */
export function findArbitraryWaits(code: string): { inTests: boolean; findings: WaitFinding[] } {
  const src = String(code || "");
  const findings: WaitFinding[] = [];
  src.split("\n").forEach((line, i) => {
    if (/waitFor(Selector|LoadState|Event|Response|URL|Function)?\s*\(|wait_for_(selector|load_state)|expect\.poll|toPass\(/.test(line) && !/waitForTimeout|wait_for_timeout/.test(line)) return;
    for (const p of PATTERNS) {
      const m = line.match(p.rx);
      if (m) { findings.push({ line: i + 1, kind: p.kind, ms: p.ms?.(m), snippet: line.trim().slice(0, 100) }); break; }
    }
  });
  return { inTests: TEST_CONTEXT.test(src), findings };
}

export function waitsBlock(r: { inTests: boolean; findings: WaitFinding[] }): string {
  if (!r.findings.length) return "";
  return [
    `=== CONDITION-BASED WAITING CHECK (automatic) ===`,
    ...r.findings.slice(0, 8).map((f) => `- line ${f.line}: ${f.kind}${f.ms !== undefined ? ` (${f.ms} ms)` : ""} — arbitrary wait${r.inTests ? " in test code (flaky-test risk)" : ""}; wait for the actual condition instead`),
  ].join("\n");
}
