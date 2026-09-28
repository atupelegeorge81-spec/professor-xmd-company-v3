// src/lib/brain/skills/tools/verification-before-completion.ts
// Port ya obra/superpowers verification-before-completion: "Red Flags - STOP" + "Rationalization Prevention" +
// "Common Failures". Inakagua kauli za "done / passing / approved" zisizo na ushahidi (logs/facts tu — haibadilishi verdict).

export interface CompletionCheck { claimsSuccess: boolean; flags: string[]; evidence: string[]; ok: boolean }

const RED_FLAGS: [string, RegExp][] = [
  ["hedging: should/probably/seems", /\b(should (work|pass|be fine|be ok)|probably|seems to|appears to|looks (good|correct|fine|right)|i think it works|i believe it works)\b/i],
  ["satisfaction before verification", /\b(?:great|perfect|done|awesome)!|\b(?:all good|lgtm|works now)\b/i],
  ["trusting a success report", /\b(agent|owner|they|he|she) (said|reported|says|confirmed) (it'?s )?(fixed|done|working|success)/i],
  ["partial verification", /\b(partial(ly)?|quick(ly)? check(ed)?|skimmed|at a glance|spot[- ]check)\b/i],
  ["just this once", /\b(just this once|good enough|close enough|for now)\b/i],
  ["linter/compile confusion", /\b(lint(er)? (passed|clean)|no (type )?errors) so (it )?(works|passes)\b/i],
];
const SUCCESS_RE = /\b(APPROVE[D]?|approved|done|complete[d]?|fixed|passes|passing|all tests pass|works|ready( to ship)?|verified|meets (all )?(the )?requirements)\b/i;
const EVIDENCE_PATTERNS: [string, RegExp][] = [
  ["cites line/identifier", /\b(line \d+|L\d+|`[^`]{2,60}`|function \w+|\.\w+\(|<\w+[^>]*>)/],
  ["cites probe facts", /\b(static probe|probe|found \d+|aria-|alt=|label)\b/i],
  ["acceptance checks traced", /\b(acceptance|criteria|requirement \d|check(ed)? (each|every|all)|checklist|✓|✔)\b/i],
  ["explicit NOT VERIFIED", /\bnot verified\b/i],
  ["numbers/results", /\b\d+\/\d+\b|\b\d+ (pass|fail|error)s?\b/i],
];

export function checkCompletionClaims(text: string): CompletionCheck {
  const t = String(text || "");
  const claimsSuccess = SUCCESS_RE.test(t);
  const flags = RED_FLAGS.filter(([, rx]) => rx.test(t)).map(([n]) => n);
  const evidence = EVIDENCE_PATTERNS.filter(([, rx]) => rx.test(t)).map(([n]) => n);
  // Iron law: NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
  const ok = !claimsSuccess || (evidence.length > 0 && flags.length === 0);
  return { claimsSuccess, flags, evidence, ok };
}
