// src/lib/milestone/startpack.ts — TASK 16 (maelezo16): MilestoneStartPack — kila awamu ya XMD Computer inaanza
// na context MPYA yenye kile tu inachohitaji (si historia ya chat, si mini-reports zote):
//   (a) plan ya milestone · (b) maamuzi ya Ledger ya milestone hii (fupi) · (c) muhtasari wa repo (tree depth 3 +
//   git log -n 15 — inajazwa na engine kutoka sandbox HALISI) · (d) muhtasari wa Build Reports za awali (≤ 60 mistari)
//   · (e) kasoro zilizorithiwa · (f) OCB ya Computer (task 11).
// Pure — hakuna I/O. Hali ya kudumu inakaa kwenye faili/git/ledger, si kwenye mazungumzo.

import type { Milestone } from "./types";

export interface StartPackLedgerEntry {
  agenda_index: number;
  agenda_item?: string | null;
  status?: string | null;
  decision_summary?: string | null;
}

/** Matokeo ya build ya milestone iliyotangulia (store record `build:Mk`). */
export interface PrevBuild {
  id: string;
  title?: string;
  finalState: string;
  reason?: string;
  report?: string;
}

export interface MilestoneStartPack {
  milestoneId: string;
  title: string;
  planMarkdown: string;
  /** (b) mstari mmoja kwa kila uamuzi wa Ledger wa agenda za milestone hii */
  ledger: string[];
  /** (d) ≤ PREV_REPORTS_MAX_LINES mistari */
  previousReports: string;
  /** (e) kasoro zilizorithiwa (mstari mmoja kila moja) */
  defects: string[];
  /** (f) OCB ya Computer (buildOCBForComputer) */
  ocb: string;
}

export const PREV_REPORTS_MAX_LINES = 60;
const LEDGER_LINE_MAX = 280;

/** Amri ya sandbox ya (c): tree depth 3 (bila node_modules/.git/.xmd/oh) + git log -n 15. */
export const REPO_SUMMARY_CMD = [
  "mkdir -p /home/user/ws && cd /home/user/ws",
  "echo '@@TREE'",
  "(find . -maxdepth 3 -not -path './node_modules*' -not -path './.git' -not -path './.git/*' -not -path './.xmd/oh*' -not -path '.' | sort | head -200)",
  "echo '@@GIT'",
  "(git log --oneline -n 15 2>/dev/null || echo '(no git history yet)')",
].join(" && ");

/** stdout ya REPO_SUMMARY_CMD → { tree, gitLog }. */
export function parseRepoSummary(stdout: string): { tree: string; gitLog: string } {
  const s = String(stdout || "");
  const t = s.indexOf("@@TREE");
  const g = s.indexOf("@@GIT");
  const tree = t >= 0 ? s.slice(t + 6, g >= 0 ? g : undefined).trim() : "";
  const gitLog = g >= 0 ? s.slice(g + 5).trim() : "";
  return { tree: tree || "(empty workspace)", gitLog: gitLog || "(no git history yet)" };
}

/** (b) Ledger fupi — agenda za milestone hii PEKEE (LOCKED kwanza kwa mpangilio wa agenda). */
export function ledgerShort(m: Milestone, ledger: StartPackLedgerEntry[]): string[] {
  return ledger
    .filter((e) => e.agenda_index >= m.agendas.from && e.agenda_index <= m.agendas.to)
    .sort((a, b) => a.agenda_index - b.agenda_index)
    .map((e) => {
      const d = String(e.decision_summary || "").replace(/\s+/g, " ").trim();
      const line = `A${e.agenda_index} [${e.status || "LOCKED"}] ${String(e.agenda_item || "").trim()}: ${d}`;
      return line.length > LEDGER_LINE_MAX ? line.slice(0, LEDGER_LINE_MAX - 1) + "…" : line;
    });
}

/** (d) Muhtasari wa Build Reports za milestones zilizotangulia — ≤ maxLines mistari kwa jumla. */
export function summarizePrevBuilds(prev: PrevBuild[], maxLines = PREV_REPORTS_MAX_LINES): string {
  if (!prev.length) return "none — this is the first milestone build.";
  const per = Math.max(3, Math.floor(maxLines / prev.length));
  const out: string[] = [];
  for (const p of prev) {
    out.push(`### ${p.id}${p.title ? ` — ${p.title}` : ""}: ${p.finalState}${p.reason ? ` (${p.reason})` : ""}`);
    const body = String(p.report || "")
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.trim() && !/^```/.test(l.trim()));
    out.push(...body.slice(0, per - 1));
  }
  return out.slice(0, maxLines).join("\n");
}

export function buildStartPack(o: {
  m: Milestone;
  planMarkdown: string;
  ledger: StartPackLedgerEntry[];
  prevBuilds: PrevBuild[];
  defects: string[];
  ocb: string;
}): MilestoneStartPack {
  return {
    milestoneId: o.m.id,
    title: o.m.title,
    planMarkdown: o.planMarkdown,
    ledger: ledgerShort(o.m, o.ledger),
    previousReports: summarizePrevBuilds(o.prevBuilds),
    defects: o.defects,
    ocb: o.ocb,
  };
}

/** Task file ya bridge (/home/user/startpack.md) — StartPack + muhtasari wa repo kutoka sandbox halisi. */
export function renderStartPack(p: MilestoneStartPack, repo: { tree: string; gitLog: string }, note = ""): string {
  return [
    p.ocb.trim(),
    "",
    `# XMD COMPUTER — START PACK · Milestone ${p.milestoneId}: ${p.title}`,
    "",
    "You start with a FRESH context. Everything you need is in this pack; long-term state lives in the files, git history and the Ledger — not in any previous chat.",
    `Build ONLY Milestone ${p.milestoneId}. Files from earlier milestones are already in /home/user/ws — keep them working, do not rebuild them.`,
    ...(note ? ["", note] : []),
    "",
    "## (b) Ledger decisions for this milestone (short form)",
    ...(p.ledger.length ? p.ledger.map((l) => `- ${l}`) : ["- none"]),
    "",
    "## (c) Repo summary (current /home/user/ws)",
    "File tree (depth 3):",
    "```",
    repo.tree,
    "```",
    "git log --oneline -n 15:",
    "```",
    repo.gitLog,
    "```",
    "",
    "## (d) Previous Build Reports (summary)",
    p.previousReports,
    "",
    "## (e) Inherited defects",
    ...(p.defects.length ? p.defects.map((d) => `- ${d}`) : ["- none"]),
    "",
    `## (a) Milestone ${p.milestoneId} plan — the contract (execute it step by step)`,
    "",
    p.planMarkdown.trim(),
    "",
  ].join("\n");
}

/* ---------------------------------------------------------------- TASK 18: amri za lango (.xmd/startpack.json) */

export interface PlanGateCommands {
  /** `Build Command:` ya plan (§4) — lango (c) linaiendesha, lazima exit 0 */
  buildCommand: string;
  /** `Test Command:` ya plan — "" ikiwa haipo au "none" */
  testCommand: string;
  /** plan inadai tests (Test Command halisi ipo) → lango (d) */
  requiresTests: boolean;
}

const NONE_RE = /^(?:none|n\/a|na|hakuna|no tests?|-|—)\.?$/i;
const cmdLine = (md: string, label: string): string => {
  const m = new RegExp(`^\\s*[-*]?\\s*\\**${label}\\s*\\**\\s*:\\s*\\**\\s*(.+?)\\s*$`, "im").exec(md || "");
  if (!m) return "";
  let v = m[1].trim().replace(/\*+$/, "").trim();
  const tick = /^`([^`]+)`/.exec(v);
  if (tick) v = tick[1].trim();
  return NONE_RE.test(v) ? "" : v;
};

/** Soma `Build Command:` / `Test Command:` kutoka plan ya milestone (mistari ya §4). */
export function planGateCommands(planMarkdown: string): PlanGateCommands {
  const buildCommand = cmdLine(planMarkdown, "Build Command");
  const testCommand = cmdLine(planMarkdown, "Test Command");
  return { buildCommand, testCommand, requiresTests: !!testCommand };
}
