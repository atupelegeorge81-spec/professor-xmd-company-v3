// TASK 21 (maelezo21) — Check runners: CODE inaamua PASS/FAIL/ERROR (si LLM).
// runCheck(check, ctx) → { id, type, result: "PASS" | "FAIL" | "ERROR", detail }
//  · command / grep / file_exists / file_contains → shell ndani ya sandbox (workspace ya agent)
//  · http → localhost: curl ndani ya sandbox · URL ya nje: fetch ya harness
//  · dom_exists / computed_style / no_horizontal_overflow / console_clean / contrast_min / touch_target_min
//      → browser halisi ndani ya sandbox kupitia cu/xmd-evidence.mjs (config mode "checks"; kurasa zinashirikiwa)
//  · screenshot_taken → EvidencePack (manifest) + faili halisi la PNG
// ERROR = check yenyewe haikuweza kuendeshwa — HAIHESABIWI kama PASS kamwe. Sign-off hairuhusiwi ikiwa kuna FAIL au ERROR.
import type { EvidenceSandbox } from "@/lib/cu/evidence";
import { EVIDENCE_PORT } from "./plan";
import { EVIDENCE_TOOLS_DIR } from "./evidence";
import { validateCheck } from "./schemas";
import type { Check, CheckResult, EvidenceCheckResult, EvidencePack, GrepOp } from "./types";

export interface CheckContext {
  sbx: EvidenceSandbox;
  /** mzizi wa workspace ndani ya sandbox (commands/paths zinaendeshwa kutoka hapa) */
  ws: string;
  /** maandishi ya cu/xmd-evidence.mjs — yanahitajika kwa checks za browser */
  script?: string;
  /** app ya local (kama screenshots): Start Command + port; AU `base` = URL ya site hai */
  startCommand?: string;
  port?: number;
  base?: string;
  startTimeoutMs?: number;
  /** kwa screenshot_taken */
  evidence?: EvidencePack | null;
  /** jina la folda ya matokeo `.xmd/checks/<tag>` */
  tag?: string;
  commandTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export const BROWSER_CHECK_TYPES = ["dom_exists", "computed_style", "no_horizontal_overflow", "console_clean", "contrast_min", "touch_target_min"] as const;
const isBrowser = (t: string) => (BROWSER_CHECK_TYPES as readonly string[]).includes(t);
/** maelezo21: grep inaruka folda hizi (+ .git) */
export const GREP_EXCLUDE_DIRS = ["node_modules", ".next", "dist", ".git"];
const TAIL_LINES = 40;

/** quoting salama ya shell (single quotes) */
export const shq = (s: string) => `'${String(s).replace(/'/g, `'\\''`)}'`;

const res = (c: { id?: string; type?: string }, result: CheckResult, detail: string): EvidenceCheckResult =>
  ({ id: String(c.id || "?"), type: String(c.type || "?") as EvidenceCheckResult["type"], result, detail: detail.slice(0, 2000) });

/** Inaendesha script ya bash ndani ya sandbox bila exception kwa exit≠0. Inarudisha exit + mkia wa output. */
export async function sbxShell(ctx: CheckContext, body: string, timeoutMs = ctx.commandTimeoutMs ?? 5 * 60_000): Promise<{ exit: number; out: string }> {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const f = `/tmp/xmdchk-${id}`;
  await ctx.sbx.files.write(`${f}.sh`, body);
  const r = await ctx.sbx.commands.run(
    `cd ${shq(ctx.ws)} && bash ${f}.sh > ${f}.out 2>&1; echo "__XMD_RC=$?"; tail -n ${TAIL_LINES} ${f}.out; rm -f ${f}.sh ${f}.out`,
    { timeoutMs },
  );
  const so = String(r?.stdout || "");
  const m = /__XMD_RC=(\d+)\n?/.exec(so);
  return { exit: m ? Number(m[1]) : -1, out: m ? so.slice(m.index + m[0].length).replace(/\s+$/, "") : so };
}

/** maelezo21 grep: count op (eq|lt|gt); `expect` ya zamani → present = gt 0, absent = eq 0 */
export function grepRule(c: { expect?: string; count?: number; op?: GrepOp }): { op: GrepOp; count: number } {
  if (c.op && Number.isInteger(c.count)) return { op: c.op, count: c.count as number };
  return c.expect === "absent" ? { op: "eq", count: 0 } : { op: "gt", count: 0 };
}
export const grepCompare = (n: number, op: GrepOp, count: number) => (op === "eq" ? n === count : op === "lt" ? n < count : n > count);

const LOCAL_HOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i;

async function runCommand(c: Extract<Check, { type: "command" }>, ctx: CheckContext): Promise<EvidenceCheckResult> {
  const want = Number.isInteger(c.expectExit) ? (c.expectExit as number) : 0;
  const r = await sbxShell(ctx, `${c.cmd}\n`);
  if (r.exit < 0) return res(c, "ERROR", `command did not report an exit code: ${r.out.slice(-300)}`);
  return res(c, r.exit === want ? "PASS" : "FAIL", `exit ${r.exit} (expected ${want}) — last lines:\n${r.out}`);
}

async function runGrep(c: Extract<Check, { type: "grep" }>, ctx: CheckContext): Promise<EvidenceCheckResult> {
  const paths = c.paths && c.paths.length ? c.paths : [c.path || "."];
  const { op, count } = grepRule(c);
  const ex = GREP_EXCLUDE_DIRS.map((d) => `--exclude-dir=${d}`).join(" ");
  const body = `grep -rEn --binary-files=without-match ${ex} -e ${shq(c.pattern)} -- ${paths.map(shq).join(" ")} > /tmp/xmdg.out 2> /tmp/xmdg.err; rc=$?
echo "__GREP_RC=$rc __N=$(wc -l < /tmp/xmdg.out)"; head -n 5 /tmp/xmdg.out | cut -c1-200; head -n 3 /tmp/xmdg.err; rm -f /tmp/xmdg.out /tmp/xmdg.err; exit 0\n`;
  const r = await sbxShell(ctx, body);
  const m = /__GREP_RC=(\d+) __N=(\d+)/.exec(r.out);
  if (!m) return res(c, "ERROR", `grep did not run: ${r.out.slice(-300)}`);
  const rc = Number(m[1]), n = Number(m[2]);
  const sample = r.out.slice(m.index + m[0].length).trim();
  if (rc > 1) return res(c, "ERROR", `grep failed (exit ${rc}) — bad pattern or missing path: ${sample.slice(0, 400)}`);
  return res(c, grepCompare(n, op, count) ? "PASS" : "FAIL", `${n} matching lines for /${c.pattern}/ in ${paths.join(", ")} (rule: ${op} ${count})${sample ? `\n${sample.slice(0, 600)}` : ""}`);
}

async function runFile(c: Extract<Check, { type: "file_exists" | "file_contains" }>, ctx: CheckContext): Promise<EvidenceCheckResult> {
  if (c.type === "file_exists") {
    const r = await sbxShell(ctx, `if [ -e ${shq(c.path)} ]; then echo "__F=yes $(wc -c < ${shq(c.path)} 2>/dev/null || echo dir)"; else echo "__F=no"; fi\n`);
    const m = /__F=(yes|no)\s*(\S*)/.exec(r.out);
    if (!m) return res(c, "ERROR", `file check did not run: ${r.out.slice(-300)}`);
    return res(c, m[1] === "yes" ? "PASS" : "FAIL", m[1] === "yes" ? `${c.path} exists (${m[2]}${/^\d+$/.test(m[2]) ? " bytes" : ""})` : `${c.path} does not exist`);
  }
  const r = await sbxShell(ctx, `if [ ! -f ${shq(c.path)} ]; then echo "__C=missing"; exit 0; fi
grep -qF -e ${shq(c.text)} -- ${shq(c.path)}; echo "__C=$?"\n`);
  const m = /__C=(missing|\d+)/.exec(r.out);
  if (!m) return res(c, "ERROR", `file check did not run: ${r.out.slice(-300)}`);
  if (m[1] === "missing") return res(c, "FAIL", `${c.path} does not exist`);
  if (m[1] === "0") return res(c, "PASS", `${c.path} contains ${JSON.stringify(c.text).slice(0, 120)}`);
  if (m[1] === "1") return res(c, "FAIL", `${c.path} does not contain ${JSON.stringify(c.text).slice(0, 120)}`);
  return res(c, "ERROR", `grep -F failed (exit ${m[1]}) on ${c.path}`);
}

async function runHttp(c: Extract<Check, { type: "http" }>, ctx: CheckContext): Promise<EvidenceCheckResult> {
  const want = (c.expectStatus ?? c.status) as number;
  const method = (c.method || "GET").toUpperCase();
  const contains = c.bodyContains;
  let status = 0;
  let body = "";
  if (LOCAL_HOST_RE.test(c.url)) {
    // app iko ndani ya sandbox → curl kutoka huko huko
    const r = await sbxShell(ctx, `code=$(curl -s -o /tmp/xmdh.body -w '%{http_code}' -X ${shq(method)} --max-time 20 ${shq(c.url)}); echo "__H=$code"; head -c 4000 /tmp/xmdh.body; rm -f /tmp/xmdh.body\n`, 60_000);
    const m = /__H=(\d+)\n?/.exec(r.out);
    if (!m) return res(c, "ERROR", `curl did not run: ${r.out.slice(-300)}`);
    status = Number(m[1]);
    body = r.out.slice(m.index + m[0].length);
  } else {
    try {
      const f = ctx.fetchImpl || fetch;
      const resp = await f(c.url, { method, redirect: "follow", signal: AbortSignal.timeout(20_000) });
      status = resp.status;
      body = (await resp.text()).slice(0, 1_000_000);
    } catch (e: any) {
      return res(c, "ERROR", `${method} ${c.url} could not be fetched: ${String(e?.cause?.code || e?.message || e).slice(0, 200)}`);
    }
  }
  if (status === 0) return res(c, "ERROR", `${method} ${c.url}: no HTTP response (connection failed)`);
  const statusOk = status === want;
  const bodyOk = contains === undefined || contains === "" || body.includes(contains);
  return res(c, statusOk && bodyOk ? "PASS" : "FAIL",
    `${method} ${c.url} → HTTP ${status} (expected ${want})${contains ? ` · body ${bodyOk ? "contains" : "does NOT contain"} ${JSON.stringify(contains).slice(0, 80)}` : ""}`);
}

async function runScreenshotTaken(c: Extract<Check, { type: "screenshot_taken" }>, ctx: CheckContext): Promise<EvidenceCheckResult> {
  const pack = ctx.evidence;
  if (!pack || !Array.isArray(pack.screenshots)) return res(c, "ERROR", "no evidence pack available — screenshots were not collected");
  const state = c.state || "default";
  const hit = pack.screenshots.find((s) => s.route === c.route && (!c.viewport || s.viewport === c.viewport) && s.state === state);
  const want = `${c.route}${c.viewport ? ` @${c.viewport}` : ""} [${state}]`;
  if (!hit) {
    const err = (pack.errors || []).find((x) => x.route === c.route && (!c.viewport || x.viewport === c.viewport));
    return res(c, "FAIL", `no screenshot for ${want} (pack has ${pack.screenshots.length})${err ? ` — runner error: ${err.kind}: ${err.detail.slice(0, 200)}` : ""}`);
  }
  const r = await sbxShell(ctx, `if [ -s ${shq(hit.path)} ]; then echo "__S=$(wc -c < ${shq(hit.path)})"; else echo "__S=0"; fi\n`, 30_000).catch(() => ({ exit: -1, out: "" }));
  const bytes = Number(/__S=(\d+)/.exec(r.out)?.[1] || 0);
  const urlOk = /^https?:\/\//.test(hit.url || "");
  if (bytes > 0 || urlOk) return res(c, "PASS", `${hit.id} ${want}: ${bytes ? `${hit.path} ${bytes} bytes` : "file gone from sandbox"}${urlOk ? ` · uploaded ${hit.url.slice(0, 90)}` : ""}`);
  return res(c, "FAIL", `${hit.id} ${want} is listed but the PNG is empty/missing and was not uploaded`);
}

/** Checks zote za browser kwa script MOJA (kurasa zinashirikiwa). Matokeo kwa mpangilio uleule. */
async function runBrowserBatch(checks: Check[], ctx: CheckContext): Promise<EvidenceCheckResult[]> {
  if (!checks.length) return [];
  if (!ctx.script) return checks.map((c) => res(c, "ERROR", "browser check runner (xmd-evidence.mjs) was not provided"));
  if (!ctx.base && !ctx.startCommand) return checks.map((c) => res(c, "ERROR", "no Start Command and no base URL — the app cannot be opened"));
  const tag = (ctx.tag || `run-${Date.now().toString(36)}`).replace(/[^\w.-]/g, "_");
  const script = `${EVIDENCE_TOOLS_DIR}/xmd-evidence.mjs`;
  const cfgRel = `${EVIDENCE_TOOLS_DIR}/checks-${tag}.json`;
  const outRel = `.xmd/checks/${tag}`;
  const cfg = {
    mode: "checks", milestoneId: "M0", round: 0, cwd: ctx.ws, outDir: outRel, port: ctx.port ?? EVIDENCE_PORT,
    startCommand: ctx.startCommand || "", startTimeoutMs: ctx.startTimeoutMs ?? 120_000, checks,
    ...(ctx.base ? { base: ctx.base } : {}),
  };
  try {
    await ctx.sbx.commands.run(`mkdir -p ${shq(`${ctx.ws}/${EVIDENCE_TOOLS_DIR}`)} && rm -rf ${shq(`${ctx.ws}/${outRel}`)}`, { timeoutMs: 30_000 });
    await ctx.sbx.files.write(`${ctx.ws}/${script}`, ctx.script);
    await ctx.sbx.files.write(`${ctx.ws}/${cfgRel}`, JSON.stringify(cfg, null, 2));
    const r = await sbxShell(ctx, `node ${shq(script)} --config ${shq(cfgRel)}\n`, 10 * 60_000);
    const raw = await ctx.sbx.files.read(`${ctx.ws}/${outRel}/manifest.json`).catch(() => "");
    if (!raw) return checks.map((c) => res(c, "ERROR", `browser runner wrote no result (exit ${r.exit}): ${r.out.slice(-300)}`));
    const man = JSON.parse(String(raw));
    const got: EvidenceCheckResult[] = Array.isArray(man.checks) ? man.checks : [];
    const why = (man.errors || []).map((e: any) => `${e.kind}: ${String(e.detail).slice(0, 240)}`).join("; ");
    return checks.map((c, i) => {
      const g = got[i];
      if (!g || g.id !== String(c.id)) return res(c, "ERROR", `browser runner gave no result for this check${why ? ` — ${why}` : ""}`);
      const result: CheckResult = g.result === "PASS" || g.result === "FAIL" ? g.result : "ERROR";
      return res(c, result, String(g.detail || ""));
    });
  } catch (e: any) {
    return checks.map((c) => res(c, "ERROR", `browser runner failed: ${String(e?.message || e).slice(0, 240)}`));
  }
}

async function runOne(c: Check, ctx: CheckContext): Promise<EvidenceCheckResult> {
  switch (c.type) {
    case "command": return runCommand(c, ctx);
    case "grep": return runGrep(c, ctx);
    case "file_exists":
    case "file_contains": return runFile(c, ctx);
    case "http": return runHttp(c, ctx);
    case "screenshot_taken": return runScreenshotTaken(c, ctx);
    default: return (await runBrowserBatch([c], ctx))[0];
  }
}

/** Check MOJA. Check isiyo halali (schema) → ERROR. Exception yoyote → ERROR (kamwe si PASS). */
export async function runCheck(check: unknown, ctx: CheckContext): Promise<EvidenceCheckResult> {
  return (await runChecks([check], ctx)).results[0];
}

/** Checks nyingi: za browser zinaendeshwa kwa pamoja (script moja), nyingine moja moja. Mpangilio unabaki. */
export async function runChecks(checks: unknown[], ctx: CheckContext): Promise<{ results: EvidenceCheckResult[]; ms: number }> {
  const t0 = Date.now();
  const out: EvidenceCheckResult[] = new Array(checks.length);
  const browser: { i: number; c: Check }[] = [];
  for (let i = 0; i < checks.length; i++) {
    const raw = checks[i] as Record<string, unknown>;
    const v = validateCheck(raw, `check[${i}]`);
    if (!v.ok) { out[i] = res((raw || {}) as { id?: string; type?: string }, "ERROR", `invalid check: ${v.errors.join("; ")}`); continue; }
    if (isBrowser(v.value.type)) { browser.push({ i, c: v.value }); continue; }
    try { out[i] = await runOne(v.value, ctx); } catch (e: any) { out[i] = res(v.value, "ERROR", `check runner failed: ${String(e?.message || e).slice(0, 240)}`); }
  }
  const br = await runBrowserBatch(browser.map((b) => b.c), ctx);
  browser.forEach((b, k) => { out[b.i] = br[k]; });
  return { results: out, ms: Date.now() - t0 };
}

/** maelezo21: milestone haiwezi ku-sign-off ikiwa check yoyote ni FAIL au ERROR. */
export function canSignOff(results: EvidenceCheckResult[]): { ok: boolean; blocking: EvidenceCheckResult[] } {
  const blocking = results.filter((r) => r.result !== "PASS");
  return { ok: blocking.length === 0, blocking };
}

export interface ReviewerClaim { result?: string; note?: string; by?: string }
export type ReviewedCheck = EvidenceCheckResult & { reviewer?: ReviewerClaim; overrideRejected?: boolean };

/**
 * KANUNI YA DHAHABU (maelezo21; verdict ya task 26 itaitumia): reviewer wa LLM HAWEZI kugeuza FAIL/ERROR kuwa PASS.
 * Matokeo ya code ndiyo ya mwisho. Maoni ya reviewer yanahifadhiwa tu; jaribio la kupindua linaonyeshwa (overrideRejected).
 */
export function applyReviewerVerdict(code: EvidenceCheckResult, claim?: ReviewerClaim | null): ReviewedCheck {
  if (!claim) return { ...code };
  const said = String(claim.result || "").toUpperCase();
  const overrideRejected = code.result !== "PASS" && said === "PASS";
  return { ...code, result: code.result, reviewer: { ...claim }, ...(overrideRejected ? { overrideRejected: true } : {}) };
}
