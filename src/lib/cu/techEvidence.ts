// TASK 29 (maelezo29) — harness ya ushahidi wa technical (bila screenshots) ndani ya sandbox ya milestone:
//  (1) secrets scan juu ya faili za git (git ls-files / git grep) — thamani zinafichwa kabla ya kuhifadhiwa
//  (2) amri za plan: Build/Test/Lint/Typecheck/Migration Status + `npm audit --omit=dev`
//  (3) checks za plan zisizo za browser (command/grep/http — pamoja na negative/unauthenticated — /file_*/db)
//  (4) git diff summary. CODE inaamua PASS/FAIL/ERROR; reviewers (Megatron + Cybertron) wanasoma `check:<id>`.
import { runChecks, sbxShell, shq, type CheckContext, type DbProbe } from "@/lib/milestone/checks";
import { EVIDENCE_PORT, validateMilestonePlan } from "@/lib/milestone/plan";
import { cmdLine } from "@/lib/milestone/startpack";
import {
  parseSecretScan, secretGrepEre, secretsCheckDetail, SECRET_SCAN_EXCLUDE, techCommandsOf, techPlanChecks, type SecretFinding,
} from "@/lib/milestone/techEvidence";
import type { EvidenceCheckResult, EvidenceCommand, EvidenceError, EvidencePack } from "@/lib/milestone/types";
import type { EvidenceSandbox } from "./evidence";

export interface CaptureTechInput {
  milestoneId: string;
  round: number;
  planMarkdown: string;
  ws?: string;
  db?: DbProbe;
  startTimeoutMs?: number;
}
export interface TechEvidenceResult {
  checks: EvidenceCheckResult[];
  commands: EvidenceCommand[];
  gitDiffSummary: string;
  secrets: SecretFinding[];
  scannedFiles: number;
  /** TASK-29: faili za repo (git ls-files) — Optimus asibuni njia kwenye COs */
  files: string[];
  errors: EvidenceError[];
  ms: number;
}

const NET_ERR = /ENOLOCK|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|audit endpoint returned an error|network request/i;

export async function captureTechEvidence(sbx: EvidenceSandbox, input: CaptureTechInput): Promise<TechEvidenceResult> {
  const t0 = Date.now();
  const ws = input.ws || "/home/user/ws";
  const tag = `${input.milestoneId}-R${input.round}-tech`;
  const ctx: CheckContext = {
    sbx, ws, startCommand: cmdLine(input.planMarkdown, "Start Command"), port: EVIDENCE_PORT, tag, db: input.db,
    startTimeoutMs: input.startTimeoutMs, commandTimeoutMs: 5 * 60_000,
  };
  const errors: EvidenceError[] = [];
  const checks: EvidenceCheckResult[] = [];

  // (1) secrets scan — output kamili kwenye faili (sbxShell inarudisha mkia tu)
  const out = `/tmp/xmdsec-${tag}.out`;
  const ex = SECRET_SCAN_EXCLUDE.map((d) => `':(exclude)${d}'`).join(" ");
  const exDirs = [...SECRET_SCAN_EXCLUDE, ".git"].map((d) => `--exclude-dir=${d}`).join(" ");
  let secrets: SecretFinding[] = [];
  let scanned = 0, hasPkg = false, tracked: string[] = [];
  try {
    await sbxShell(ctx, `{ [ -f package.json ] && echo "__PKG"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "__FILES"; git ls-files; echo "__HITS"; git grep -nIE --full-name -e ${shq(secretGrepEre())} -- . ${ex} | cut -c1-600 | head -n 400
else
  echo "__FILES"; find . -type f -not -path './node_modules/*' -not -path './.git/*' -not -path './.xmd/*' | sed 's#^\\./##'
  echo "__HITS"; grep -rnIE ${exDirs} -e ${shq(secretGrepEre())} . | sed 's#^\\./##' | cut -c1-600 | head -n 400
fi; } > ${out} 2>&1; exit 0\n`, 120_000);
    const raw = String(await sbx.files.read(out).catch(() => ""));
    await sbx.commands.run(`rm -f ${out}`, { timeoutMs: 15_000 }).catch(() => {});
    hasPkg = /^__PKG$/m.test(raw);
    const files = (raw.split("__FILES\n")[1] || "").split("__HITS\n")[0].split("\n").map((x) => x.trim()).filter(Boolean);
    const hits = raw.split("__HITS\n")[1] || "";
    scanned = files.length;
    tracked = files.slice(0, 300);
    secrets = parseSecretScan(hits, files);
    checks.push({ id: "tech/secrets", type: "grep", result: raw.includes("__FILES") ? (secrets.length ? "FAIL" : "PASS") : "ERROR", detail: raw.includes("__FILES") ? secretsCheckDetail(secrets, scanned) : "secrets scan did not run" });
  } catch (e: any) {
    checks.push({ id: "tech/secrets", type: "grep", result: "ERROR", detail: `secrets scan failed: ${String(e?.message || e).slice(0, 200)}` });
  }

  // (2) amri za plan + npm audit
  const cmds = techCommandsOf(input.planMarkdown, hasPkg).map((c) => ({
    id: c.id, type: "command" as const, expectExit: c.expectExit,
    cmd: c.id === "tech/audit" ? `[ -f package-lock.json ] || npm i --package-lock-only --ignore-scripts --no-audit --no-fund >/dev/null 2>&1; ${c.cmd}` : c.cmd,
  }));
  const commands: EvidenceCommand[] = [];
  if (cmds.length) {
    const r = await runChecks(cmds, { ...ctx, startCommand: undefined });
    r.results.forEach((x, i) => {
      const fixed = x.id === "tech/audit" && x.result === "FAIL" && NET_ERR.test(x.detail) ? { ...x, result: "ERROR" as const, detail: `npm audit could not reach the registry / no lockfile — ${x.detail}` } : x;
      checks.push(fixed);
      commands.push({ cmd: cmds[i].cmd, exit: Number(/^exit (-?\d+)/.exec(x.detail)?.[1] ?? -1), logPath: "" });
    });
  }

  // (3) checks za plan (http za localhost → Start Command inawashwa na runChecks)
  const plan = validateMilestonePlan(input.planMarkdown, { id: input.milestoneId, reviewMode: "technical" });
  const planChecks = techPlanChecks(plan.checks);
  if (planChecks.length) checks.push(...(await runChecks(planChecks, ctx)).results);
  else errors.push({ kind: "harness", detail: "the plan has no command/http/db checks for technical evidence" });

  // (4) git diff summary (tangu milestone iliyoidhinishwa ya mwisho, au mwanzo wa repo)
  let gitDiffSummary = "";
  try {
    const g = await sbxShell(ctx, `b=$(git describe --tags --abbrev=0 --match 'milestone-*' 2>/dev/null || git hash-object -t tree /dev/null); echo "base: $b"; git diff --stat "$b" HEAD 2>&1 | tail -n 25; git log --oneline -n 8 2>&1\n`, 60_000);
    gitDiffSummary = g.out.slice(0, 4000);
  } catch (e: any) { errors.push({ kind: "harness", detail: `git diff summary failed: ${String(e?.message || e).slice(0, 160)}` }); }

  return { checks, commands, gitDiffSummary, secrets, scannedFiles: scanned, files: tracked, errors, ms: Date.now() - t0 };
}

/** Unganisha ushahidi wa technical kwenye pack (technical: pack tupu ya screenshots · mixed: juu ya screenshots). */
export function mergeTechEvidence(pack: EvidencePack, t: TechEvidenceResult): EvidencePack {
  const seen = new Set((pack.checks || []).map((c) => c.id));
  return {
    ...pack,
    checks: [...(pack.checks || []), ...t.checks.filter((c) => !seen.has(c.id))],
    commands: [...(pack.commands || []), ...t.commands],
    gitDiffSummary: pack.gitDiffSummary || t.gitDiffSummary,
    errors: [...(pack.errors || []), ...t.errors],
    technical: {
      secrets: t.secrets.length, secretFiles: [...new Set(t.secrets.map((s) => s.file))].slice(0, 20),
      checks: t.checks.length, failed: t.checks.filter((c) => c.result !== "PASS").length, ms: t.ms, files: (t.files || []).slice(0, 300),
    },
  };
}

export function techEvidenceSummary(t: TechEvidenceResult): string {
  const fail = t.checks.filter((c) => c.result !== "PASS");
  return `checks ${t.checks.length - fail.length}/${t.checks.length} PASS · secrets ${t.secrets.length}${fail.length ? ` · not passing: ${fail.slice(0, 6).map((c) => `${c.id} ${c.result}`).join(", ")}` : ""} · ${Math.round(t.ms / 1000)}s`;
}
