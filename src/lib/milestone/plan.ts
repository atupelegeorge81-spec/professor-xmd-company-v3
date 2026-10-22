// src/lib/milestone/plan.ts — TASK 15 (maelezo15): Optimus anaandika plan ya MILESTONE MOJA (si mradi mzima).
// Inatumia mashine ya plan iliyopo (workPlan.ts: sehemu 8, assemblePlanDocument ya deterministic, Data Guard,
// lango la Task 4) kwa ngazi ya milestone, + validator ya milestone (Styling + Dependencies, Checks za mashine,
// routes/states/viewports, uthibitisho wa technical). Plan isiyopita HAITEKELEZWI (Computer haianzi).

import {
  assemblePlanDocument, constraintFallbackLines, extractPlanSections, parsePlanSteps, planStepBody,
  replacePlanStepsPart, PLAN_STEP_TEMPLATE, PLAN_STEPS_MAX, PLAN_STEPS_MIN,
} from "@/lib/board/workPlan";
import type { FactSheet } from "@/lib/board/factSheet";
import type { GuardHit } from "@/lib/board/dataGuard";
import { isPlanExecutable, planStatusOf, planWarningsOf } from "@/lib/cu/planGate";
import { validateCheck } from "./schemas";
import { cmdLine, planGateCommands } from "./startpack"; // TASK-18 · TASK-32: cmdLine (Start Command)
import { inheritedSection } from "./signoff"; // TASK-28
import type { Check, Milestone } from "./types";

/** Viewports za ushahidi (maelezo19) — plan inazitaja kwa kila route. */
export const PLAN_VIEWPORTS = ["375x667", "768x1024", "1280x800"] as const;
/** TASK-19: port ambayo Start Command inatumikia app (harness inapiga http://127.0.0.1:<port>). */
export const EVIDENCE_PORT = 4173;

/** Mifano ya Check union (Task 9) kwa prompt — sehemu zote ni za lazima isipokuwa zilizoandikwa (optional). */
export const CHECK_SHAPES = `Allowed check objects (exact field names; "id" unique in the whole plan, e.g. "M1-S2-a"):
{"id":"…","type":"file_exists","path":"index.html"}
{"id":"…","type":"file_contains","path":"index.html","text":"<form"}
{"id":"…","type":"grep","pattern":"messages\\\\.json","path":"server.js","expect":"present"}        (expect: "present" | "absent")
{"id":"…","type":"grep","pattern":"console\\\\.log","paths":["src"],"count":0,"op":"eq"}             (count of matching lines; op: eq | lt | gt; node_modules/.next/dist skipped)
{"id":"…","type":"command","cmd":"node --check server.js","expectExit":0}                           (run from the workspace root)
{"id":"…","type":"http","url":"http://localhost:3000/","method":"GET","expectStatus":200,"bodyContains":"<h1"}   (bodyContains optional; "headers":{"Authorization":"Bearer …"} and "body":"…" optional)
{"id":"…","type":"db","table":"orders","rls":true}                                                     (real database: table exists; "rls":true = Row Level Security must be ON; "schema" optional, default public)
{"id":"…","type":"dom_exists","route":"/","selector":"form#contact","viewport":"375x667"}           (viewport optional)
{"id":"…","type":"computed_style","route":"/","selector":"h1","property":"font-size","expected":"32px"}   (or "forbidden":"…" instead of "expected")
{"id":"…","type":"no_horizontal_overflow","route":"/","viewport":"375x667"}                              (or "routes":[…] / "viewports":[…]; default: all 3 viewports)
{"id":"…","type":"console_clean","route":"/"}
{"id":"…","type":"contrast_min","route":"/","selector":"button","min":4.5}
{"id":"…","type":"touch_target_min","route":"/","selector":"button","minPx":44}
{"id":"…","type":"screenshot_taken","route":"/","viewport":"1280x800","state":"default"}                 (state optional)`;

export const MS_STEP_TEMPLATE = `${PLAN_STEP_TEMPLATE}
- **Checks:** REQUIRED for every step that creates or edits files — machine-readable acceptance checks, as ONE fenced block:
\`\`\`checks
[{"id":"M1-S1-a","type":"file_exists","path":"index.html"}]
\`\`\``;

// ── Validator (pure) ─────────────────────────────────────────────────────────
export interface MilestonePlanValidation {
  ok: boolean;
  errors: string[];
  checks: Check[];
  stats: { steps: number; structural: number; checks: number; routes: number; proofChecks: number };
}

/** TASK-32: huduma zisizopo kwenye sandbox ya build (Docker / Postgres ya ndani / Supabase CLI ya local stack) */
export const SANDBOX_UNAVAILABLE_RE = /\b(?:docker(?:-compose)?|podman|supabase\s+(?:start|stop|status|test|db\s+(?:reset|start|test|lint|push|diff|dump))|psql|pg_prove|pg_ctl|(?:localhost|127\.0\.0\.1):5432)\b/i;
const cap = (s: unknown, n: number) => (String(s ?? "").length > n ? `${String(s).slice(0, n)} […]` : String(s ?? ""));

/** TASK-35 (T32 follow-up): binaries zilizothibitishwa kwa `command -v` kwenye template ya build `professor-xmd-browser-v3`
 *  (sandbox halisi ya E2B, 2026-10-22; PATH ya bridge = /home/user/.local/bin:/home/user/node_modules/.bin:/usr/local/bin:/usr/bin:/bin).
 *  HAZIPO: docker, podman, psql, pg_prove, supabase, vercel, pnpm, yarn, bun, tsc, next, eslint, vitest, vite, prettier, serve. */
export const SANDBOX_BIN_MANIFEST: readonly string[] = [
  "bash", "sh", "node", "npm", "npx", "python3", "python", "pip", "pip3", "git", "curl", "wget", "jq", "sed", "awk", "grep", "find",
  "xargs", "tar", "gzip", "make", "gcc", "g++", "test", "sleep", "timeout", "cat", "ls", "mkdir", "rm", "cp", "mv", "chmod", "touch",
  "head", "tail", "wc", "sort", "uniq", "diff", "env", "tee", "date", "du", "kill", "ps", "ss", "which", "openssl", "sha256sum", "base64",
  "ssh", "playwright",
];

/** TASK-35 (a): uwezo halisi wa sandbox ya build — unaingia kwenye kila prompt ya plan (PART 1, PART 2 na marekebisho). */
export const SANDBOX_CAPABILITIES = `=== BUILD SANDBOX CAPABILITIES (verified with \`command -v\` — anything not listed does NOT exist) ===
- Linux (E2B) with Node 20 + npm 10 + npx, Python 3.12 + pip, git, bash, curl, Playwright (Chromium is used by the harness).
- Available commands: ${SANDBOX_BIN_MANIFEST.join(", ")}.
- NOT available: Docker / docker-compose / podman, any local Postgres server, psql / pg_prove, the Supabase CLI (so never \`supabase start\`, \`supabase test db\`, \`supabase db reset\`), the Vercel CLI, pnpm, yarn, bun.
- Tools that come from npm packages (next, tsc, eslint, vitest, vite, prettier, serve …) are NOT on PATH: run them through an npm script (\`npm run build\`) or \`npx <tool>\`, with the package listed in package.json.
- Database: the real Supabase project is reached over HTTPS by the harness — "db" checks run OUTSIDE the sandbox; every table created for tests must be prefixed \`xmdtest_\`. Inside the sandbox there is no database server and no database credentials: verify SQL/migrations statically (file_contains / grep checks) or with a Node script that needs no database.
- Every command you write (Build / Test / Start / Lint / Typecheck / Migration Status lines and every "command" check) is preflighted with \`command -v\` against this list; a plan that uses a missing command is rejected and sent back to you.`;

/** TASK-35 (b): marudio ya kuandika upya plan yenye amri zisizopo kwenye sandbox (preflight ya `command -v`). */
export const PREFLIGHT_REPAIR_MAX = 3;
const SHELL_BUILTINS = new Set(["cd", "test", "[", "[[", "echo", "true", "false", "export", "set", "unset", "exit", "source", ".", "printf", "read", "wait", "shift", "type", "command", "exec", "eval", "pwd", "ulimit", "umask", "trap", "!", "if", "then", "else", "elif", "fi", "for", "do", "done", "while", "until", "case", "esac", "{", "}", "in", "return", "local", "let"]);
const CMD_WRAPPERS = new Set(["sudo", "env", "timeout", "nohup", "time", "exec"]);

/** Binaries ambazo amri ya shell inaziita (neno la kwanza la kila kipande kati ya && || ; | & ( ) na mstari mpya; nje ya quotes).
 *  Builtins, njia (./x, scripts/x.sh), VAR=val na wrappers (sudo/env/timeout N/nohup/time) zinarukwa. */
export function commandBinaries(cmd: string): string[] {
  const segs: string[] = [];
  let cur = "", q: string | null = null;
  const s = String(cmd || "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === "\\" && q === '"') { cur += s[++i] ?? ""; } else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === "`") { q = c; cur += c; continue; }
    const redirect = c === "&" && (s[i - 1] === ">" || s[i - 1] === "<" || s[i + 1] === ">");
    if (!redirect && (c === ";" || c === "|" || c === "&" || c === "\n" || c === "(" || c === ")")) { segs.push(cur); cur = ""; continue; }
    cur += c;
  }
  segs.push(cur);
  const out: string[] = [];
  for (const seg of segs) {
    const words = seg.trim().replace(/^\$/, "").trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < words.length) {
      const w = words[i];
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) { i++; continue; }
      if (CMD_WRAPPERS.has(w)) { i++; if (w === "timeout") while (i < words.length && /^(-\S+|\d+[smhd]?)$/.test(words[i])) i++; if (w === "env") while (i < words.length && /^-/.test(words[i])) i++; continue; }
      break;
    }
    const b = (words[i] || "").replace(/^["'`]+|["'`]+$/g, "");
    if (!b || SHELL_BUILTINS.has(b) || b.includes("/") || /^[-<>0-9$&]/.test(b)) continue;
    if (!out.includes(b)) out.push(b);
  }
  return out;
}

/** Binaries za amri ambazo hazipo kwenye manifest (`command -v <bin>` → not found). */
export function missingBinaries(cmd: string, manifest: readonly string[] = SANDBOX_BIN_MANIFEST): string[] {
  return commandBinaries(cmd).filter((b) => !manifest.includes(b));
}

/** Kosa la preflight (lina sababu kamili) — linarudishwa kwa Optimus, halitupwi kimya kimya. */
export function preflightError(where: string, label: string, cmd: string, manifest: readonly string[] = SANDBOX_BIN_MANIFEST): string | null {
  const miss = missingBinaries(cmd, manifest);
  const hit = cmd.match(SANDBOX_UNAVAILABLE_RE);
  if (!miss.length && !hit) return null;
  const why = [
    ...miss.map((b) => `\`${b}\` (command -v ${b} → not found)`),
    ...(hit && !miss.some((b) => hit[0].toLowerCase().startsWith(b.toLowerCase())) ? [`\`${hit[0]}\` (needs Docker / a local Postgres, which the sandbox does not have)`] : []),
  ];
  return `${where}: ${label} \`${cap(cmd, 160)}\` cannot run in the build sandbox — preflight: ${why.join(", ")}. Rewrite it with available commands only (see BUILD SANDBOX CAPABILITIES; npm tools via \`npm run …\` or \`npx <tool>\`).`;
}
export const isPreflightError = (e: string): boolean => /cannot run in the build sandbox/.test(e);

const STYLING_RE = /Styling\s*\+\s*Dependencies\s*\**\s*:\s*\**\s*(.*)$/im;
const ROUTE_RE = /route\s*:\s*`?(\/[^\s`·|;,]*)`?\s*[·|;,]\s*states?\s*:\s*([^·|;]+?)\s*[·|;]\s*viewports?\s*:\s*(.+)$/gim;
const NO_FILES = /^(none|n\/a|-|—|no files?|not applicable)\b/i;

/** Block ya ```checks (au ```json) baada ya "**Checks:**" ndani ya mwili wa hatua. */
export function stepChecksBlock(body: string): string | null {
  const at = body.search(/\*\*Checks:?\*\*|^\s*-?\s*Checks\s*:/im);
  if (at < 0) return null;
  const m = body.slice(at).match(/```(?:checks|json)?[^\n]*\n([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

/** TASK-32 (E2E halisi): LLM iliandika `[...]}` (mabano ya ziada mwishoni) mara 2 mfululizo → plan structure_failed.
 *  Array ya kwanza ikifungwa kikamilifu na kinachobaki ni mabano/koma za kufunga TU, tunaisoma; vinginevyo kosa la awali. */
export function parseChecksJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch (e) {
    const t = raw.trim();
    if (t[0] !== "[") throw e;
    let depth = 0, inStr = false, esc = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") {
        depth--;
        if (depth === 0) {
          if (!/^[\s\]},]*$/.test(t.slice(i + 1))) throw e;
          return JSON.parse(t.slice(0, i + 1));
        }
      }
    }
    throw e;
  }
}

export function validateMilestonePlan(md: string, m: Pick<Milestone, "id" | "reviewMode">): MilestonePlanValidation {
  const errors: string[] = [];
  const sec = extractPlanSections(md);
  const checks: Check[] = [];

  // 1. Styling + Dependencies (SafariSmart: Tailwind haikuwahi kusakinishwa)
  const st = (sec[4] || "").match(STYLING_RE) || md.match(STYLING_RE);
  const stVal = st ? st[1].replace(/\*+/g, "").trim() : "";
  if (!st) errors.push(`${m.id} plan §4: missing the "Styling + Dependencies:" line — name the exact styling approach/framework and every package to install (e.g. "Styling + Dependencies: plain CSS in styles.css; packages: none")`);
  else if (stVal.length < 6 || /^(not discussed|tbd|n\/a|none|unknown)\.?$/i.test(stVal)) errors.push(`${m.id} plan §4: "Styling + Dependencies:" is empty or vague (${JSON.stringify(stVal)}) — it must name the exact framework and the installed packages`);

  // 1b. TASK-18: Build Command (lango la kumaliza linaiendesha — lazima exit 0)
  // TASK-32 (E2E halisi run 5): `Test Command: supabase test db` haiwezi kupita kwenye sandbox (hakuna Docker/Postgres)
  // → lango PARTIAL → M1 BLOCKED. Amri kama hizi zinakataliwa hapa → Optimus anaandika upya (jaribio la muundo).
  // TASK-35 (b): preflight ya `command -v` kwa kila binary (si regex ya Docker/Postgres pekee) — kosa linarudi kwa Optimus.
  for (const [label, cmd] of [["Build Command", planGateCommands(md).buildCommand], ["Test Command", planGateCommands(md).testCommand]] as const) {
    const pe = cmd ? preflightError(`${m.id} plan §4`, `"${label}:"`, cmd) : null;
    if (pe) errors.push(pe);
  }
  if (!planGateCommands(md).buildCommand) errors.push(`${m.id} plan §4: missing the "Build Command:" line — one shell command run from the workspace root that exits 0 only when this milestone builds (e.g. "Build Command: \`npm run build\`" or, for a docs-only milestone, "Build Command: \`test -s README.md\`")`);

  // 2. Hatua + Checks za mashine kwa kila hatua ya muundo (inayounda/kubadilisha faili)
  const s6 = sec[6] || "";
  const steps = parsePlanSteps(s6);
  if (!steps.length) errors.push(`${m.id} plan §6: no "### Step N — Title" work steps`);
  let structural = 0;
  const ids = new Set<string>();
  for (const s of steps) {
    const body = planStepBody(s6, s.n);
    const files = (body.match(/\*\*Files:?\*\*\s*:?\s*(.+)/i)?.[1] || "").replace(/[`*]/g, "").trim();
    const isStructural = !!files && !NO_FILES.test(files);
    const raw = stepChecksBlock(body);
    let arr: unknown[] | null = null;
    if (raw !== null) {
      try {
        const j = parseChecksJson(raw);
        if (Array.isArray(j)) arr = j;
        else errors.push(`${m.id} plan Step ${s.n} ("${s.title.slice(0, 60)}"): Checks block must be a JSON array of Check objects`);
      } catch (e: any) {
        errors.push(`${m.id} plan Step ${s.n} ("${s.title.slice(0, 60)}"): Checks block is not valid JSON (${String(e?.message || e).slice(0, 80)})`);
      }
    }
    let valid = 0;
    (arr || []).forEach((c, i) => {
      const v = validateCheck(c, `Step ${s.n} check[${i}]`);
      if (!v.ok) { errors.push(`${m.id} plan ${v.errors.join("; ")}`); return; }
      const id = (c as Check).id;
      if (ids.has(id)) { errors.push(`${m.id} plan Step ${s.n} check[${i}].id: duplicate id ${JSON.stringify(id)} (ids must be unique in the plan)`); return; }
      ids.add(id);
      if ((c as Check).type === "command") { // TASK-35 (b)
        const pe = preflightError(`${m.id} plan Step ${s.n} check[${i}] (${id})`, "command", String((c as any).cmd || ""));
        if (pe) { errors.push(pe); return; }
      }
      checks.push(c as Check);
      valid++;
    });
    if (isStructural) {
      structural++;
      if (!valid && raw === null) errors.push(`${m.id} plan Step ${s.n} ("${s.title.slice(0, 60)}"): no machine-readable Acceptance Checks — this step touches files (${files.slice(0, 60)}) so it needs a \`\`\`checks JSON array with ≥1 valid Check`);
      else if (!valid && arr && !arr.length) errors.push(`${m.id} plan Step ${s.n} ("${s.title.slice(0, 60)}"): Checks array is empty — needs ≥1 valid Check`);
    }
  }

  // 3. Routes + states + viewports (visual/mixed)
  let routes = 0;
  if (m.reviewMode !== "technical") {
    const area = sec[7] || md;
    for (const r of area.matchAll(ROUTE_RE)) {
      if (/\d{3,4}\s*x\s*\d{3,4}/i.test(r[3])) routes++;
      else errors.push(`${m.id} plan §7: screenshot line for route ${r[1]} has no viewport sizes (use ${PLAN_VIEWPORTS.join(", ")})`);
    }
    // TASK-32 (E2E run 8 M2): plan bila Start Command ilipita validator → harness haikuweza kuwasha app → sign-off imekataliwa → BLOCKED
    if (!cmdLine(md, "Start Command")) errors.push(`${m.id} plan §7: missing the "Start Command:" line (reviewMode ${m.reviewMode}) — add one line \`Start Command: <command that builds and serves the app on port ${EVIDENCE_PORT}>\`, e.g. \`npm run build && npm run start -- -p ${EVIDENCE_PORT}\` (the harness runs it to take the screenshots)`);
    if (!routes) errors.push(`${m.id} plan §7: missing the screenshot matrix (reviewMode ${m.reviewMode}) — add lines like "- route: / · states: default, error · viewports: ${PLAN_VIEWPORTS.join(", ")}"`);
  }

  // 3b. TASK-35 (b): preflight ya mistari ya amri ya §7 (harness inaziendesha ndani ya sandbox)
  for (const label of ["Start Command", "Lint Command", "Typecheck Command", "Migration Status Command"]) {
    const cmd = cmdLine(md, label);
    const pe = cmd ? preflightError(`${m.id} plan §7`, `"${label}:"`, cmd) : null;
    if (pe) errors.push(pe);
  }

  // 4. Uthibitisho wa technical: command/http Check
  const proofChecks = checks.filter((c) => c.type === "command" || c.type === "http").length;
  if (m.reviewMode !== "visual" && !proofChecks) errors.push(`${m.id} plan: reviewMode ${m.reviewMode} needs ≥1 "command" or "http" Check that proves the work (e.g. {"type":"command","cmd":"node --check server.js"})`);

  return { ok: errors.length === 0, errors, checks, stats: { steps: steps.length, structural, checks: checks.length, routes, proofChecks } };
}

// ── Kizazi (LLM kupitia lanes za plan za Board) ──────────────────────────────
export interface LedgerLike {
  agenda_index: number;
  agenda_item: string;
  status: string;
  decision_summary?: string;
  decision_detail?: string;
  carried_constraints?: string;
  owners?: string;
}

export interface MilestonePlanDeps {
  project: string;
  title: string;
  sessionId: string;
  date: string;
  facts: FactSheet | null;
  /** DATA RASMI (factSheetBlock) au "" */
  factsBlock: string;
  /** faili za data za mfumo au "" */
  dataFilesBlock: string;
  /** finalBoardResolution ya session (zote — zinachujwa hapa kwa agenda za milestone) */
  ledger: LedgerLike[];
  miniOf: (e: LedgerLike) => Promise<string>;
  /** system prompt ya Optimus (plan writer) — tayari ina OCB (stage PLAN) */
  system: string;
  /** zamu moja ya Optimus kwenye lanes za plan (streamTurn) → maandishi */
  write: (o: { label: string; user: string; maxOut: number }) => Promise<string>;
  guard: (md: string) => GuardHit[];
  /** muhtasari wa ripoti za build za milestones zilizopita (≤60 mistari kila moja) */
  prevReports?: string[];
  repoState?: string;
  defects?: string[];
  /** test hook ya Task 4 (inert bila XMD_TEST_HOOKS=1 + alama) */
  sabotage?: (md: string) => string;
  maxSteps?: number;
  log?: (level: "info" | "success" | "warning" | "error", text: string) => void;
}

export interface MilestonePlanResult {
  milestoneId: string;
  status: "active" | "guard_failed" | "structure_failed";
  executable: boolean;
  reasons: string[];
  markdown: string;
  steps: number;
  checks: number;
  routes: number;
  problems: string[];
  warnings: string[];
  guardHits: { found: string; expected: string }[];
  repairs: { structure: number; guard: number };
}

function sectionsSpec(part: 1 | 2, m: Milestone, max: number): string {
  if (part === 1)
    return `## 1. Objective & Deliverable — what milestone ${m.id} delivers (3-6 sentences, ONLY this milestone's agendas ${m.agendas.from}–${m.agendas.to})
## 2. Official Data — copy the DATA RASMI block WORD FOR WORD (the system replaces this section with its own deterministic copy)
## 3. Constraints — copy the project constraints word for word (the system replaces this section too)
## 4. Tech Stack & Design Tokens — from LOCKED decisions only. The FIRST line of this section MUST be exactly:
Styling + Dependencies: <exact styling approach/framework, e.g. "plain CSS in styles.css" or "Tailwind CSS v3 via npm (tailwind.config.js)"> ; packages: <every package that must be installed, exact npm names, or "none">
The next two lines MUST be exactly (the completion gate runs them itself before the milestone may finish):
Build Command: <ONE shell command run from the workspace root that exits 0 only when this milestone builds correctly, e.g. \`npm run build\`, \`node --check server.js\`, or for a docs-only milestone \`test -s README.md\`>
Test Command: <ONE shell command that runs this milestone's automated tests, or "none" if the plan has no automated tests>
Both commands run INSIDE the build sandbox: Linux with Node/npm and Python only — NO Docker, NO local Postgres/database server, so never \`supabase start\`, \`supabase test db\`, \`supabase db reset\`, \`docker …\` or \`psql\`. Verify database work statically (files/SQL content) or with a Node script.
then fonts, colors (hex + where used), touch targets, layout rules.`;
  const visual = m.reviewMode !== "technical";
  const technical = m.reviewMode !== "visual";
  return `## 5. File Structure — every file this milestone creates or edits, with its job and owning agenda
## 6. Work Steps — 1 to ${max} steps for THIS milestone only; each step EXACTLY in this shape:
${MS_STEP_TEMPLATE}
${CHECK_SHAPES}
Step rules: sequential numbering 1..N; every step that creates or edits files MUST have a \`\`\`checks block with ≥1 check; copy official values word for word; if something was not discussed write "not discussed".
## 7. QA Checklist — checkbox list.${visual ? `
Then a "**Screenshots:**" list — one line per route the harness must capture, EXACTLY in this shape:
- route: / · states: default, menu-open[click #menu-toggle] · viewports: ${PLAN_VIEWPORTS.join(", ")}
An extra state = a name plus its actions in brackets: \`click <css selector>\` or \`hover <css selector>\`, several actions joined with " > ".
Then one line \`Start Command: <command that builds and serves the app on port ${EVIDENCE_PORT}>\` (e.g. \`npm run build && npm run start -- -p ${EVIDENCE_PORT}\`) — the harness runs it to take the screenshots.
Optionally one line \`Key Selectors: <comma-separated CSS selectors of this milestone's key elements, e.g. .product-card, #cart-button>\` — the harness measures them (box, fonts, colors, contrast, touch size) next to the generic landmarks.` : ""}${technical ? `
Then a "**Proof:**" list — the exact commands / tests / API calls that prove the work (they must also appear as "command" or "http" checks in the steps).
Technical evidence (TASK-29 — the harness runs these itself, no screenshots in technical mode):
- every protected endpoint needs a NEGATIVE http check: the same request WITHOUT credentials must be denied (e.g. {"type":"http","url":"http://localhost:${EVIDENCE_PORT}/api/admin","expectStatus":401});
- every table this milestone creates needs a "db" check (with "rls":true when the data is private);
- optional lines (one shell command each, or "none"): \`Lint Command: …\`, \`Typecheck Command: …\`, \`Migration Status Command: …\`;${visual ? "" : `
- if the milestone serves an API, one line \`Start Command: <command that serves it on port ${EVIDENCE_PORT}>\` — the harness starts it for the http checks;`}
- never commit secrets or .env files (the harness scans every tracked file).` : ""}
## 8. Agent Rules — DATA RASMI and LEDGER decisions are law; never invent; build ONLY milestone ${m.id}; stop and report on data conflicts or a failed check x2`;
}

const RULES = `RULES:
- English only. Markdown only. No preamble, no closing remarks.
- Never invent prices, hours, names, phone numbers, emails or addresses — copy them from DATA RASMI / LOCKED decisions only.
- On any conflict between a mini-report and a LEDGER decision, the LEDGER decision wins.
- Where a ledger decision states a number or a rule (money, VAT, limits, sizes), quote it verbatim — never re-derive it.
- Do NOT write complete files; short reference snippets only (max 40 lines).`;

/** §9 ya code: maamuzi ya Ledger ya milestone neno kwa neno (hakuna LLM). */
export function ledgerDecisionsSection(entries: LedgerLike[]): string {
  if (!entries.length) return "_No ledger decisions for this milestone._";
  return entries.map((e) => `- **A${e.agenda_index} [${e.status}] ${e.agenda_item}:** ${String(e.decision_summary || "").trim() || "_(no summary)_"}`).join("\n");
}

/** TASK-32: majaribio ya kurekebisha muundo wa plan (zamani 1 — kosa la PART 1 halikuweza kurekebishwa). */
export const PLAN_REPAIR_MAX = 2;
/** kosa la validator lililo kwenye PART 1 (sehemu 1–4: Objective, Data, Constraints, Tech Stack/Styling/Build+Test Command). */
export const isPart1Error = (e: string): boolean => /\bplan §[1-4]\b/.test(e);

export async function generateMilestonePlan(m: Milestone, deps: MilestonePlanDeps): Promise<MilestonePlanResult> {
  const log = deps.log || (() => {});
  const max = Math.max(1, deps.maxSteps || PLAN_STEPS_MAX);
  const inRange = (i: number) => i >= m.agendas.from && i <= m.agendas.to;
  const ledger = deps.ledger.filter((e) => inRange(e.agenda_index)).sort((a, b) => a.agenda_index - b.agenda_index);
  const constraintFallback = constraintFallbackLines(ledger.filter((e) => e.status === "LOCKED").flatMap((e) => String(e.carried_constraints || "").split("\n")));

  // Ingizo kwa mpangilio wa kipaumbele: (1) mini-reports, (2) ledger, (3) ripoti za build zilizopita + repo, (4) defects
  const miniLines = (
    await Promise.all(
      ledger.map(async (e) => {
        const md = await deps.miniOf(e);
        return `### A${e.agenda_index} [${e.status}] ${e.agenda_item}\nOptimus mini-report (primary memory):\n${cap(md || e.decision_summary, 2600)}\nLEDGER decision (authoritative — wins on conflict): ${cap(e.decision_summary, 1500)}`;
      }),
    )
  ).join("\n\n");
  const prev = (deps.prevReports || []).filter(Boolean);
  const ctx = [
    `PROJECT BRIEF: "${deps.project}"`,
    deps.factsBlock,
    deps.dataFilesBlock,
    `=== MILESTONE ${m.id}: ${m.title} · agendas ${m.agendas.from}–${m.agendas.to} · phase ${m.phase} · reviewMode ${m.reviewMode} ===`,
    `=== (1) MINI-REPORTS + (2) LEDGER DECISIONS of this milestone's agendas ===\n${miniLines || "(none)"}`,
    `=== (3) PREVIOUS MILESTONES — build report summaries + current repo state ===\n${prev.length ? prev.join("\n\n") : "none yet — this is the first build"}${deps.repoState ? `\n${deps.repoState}` : ""}`,
    `=== (4) INHERITED DEFECTS from earlier milestones ===\n${(deps.defects || []).length ? deps.defects!.join("\n") : "none"}`,
  ].filter(Boolean).join("\n\n");

  const task = (part: 1 | 2) => `${ctx}

=== YOUR TASK ===
Write PART ${part} of the MILESTONE PLAN for ${m.id} in English. XMD Computer (a literal executor that has NOT seen this Board and cannot ask questions) will build ${m.id} from it — it must be fully self-contained. Output ONLY the sections listed below, each starting with its exact heading.

${sectionsSpec(part, m, max)}

${SANDBOX_CAPABILITIES}

${RULES}`;

  const planTexts: string[] = [];
  planTexts.push(await deps.write({ label: `${m.id} 1/2`, user: task(1), maxOut: 12000 }));
  planTexts.push(await deps.write({ label: `${m.id} 2/2`, user: task(2), maxOut: 24000 }));

  const assemble = () => {
    const a = assemblePlanDocument({ partTexts: planTexts, title: `${deps.title} — ${m.id}: ${m.title}`, sessionId: deps.sessionId, date: deps.date, facts: deps.facts, constraintFallback, maxSteps: max });
    let md = a.markdown.replace(/^# AGENT WORK PLAN — /, "# MILESTONE PLAN — ");
    md = `${md}\n\n## 9. Ledger Decisions (verbatim)\n\n${ledgerDecisionsSection(ledger)}`;
    if ((deps.defects || []).length) md = `${md}\n\n${inheritedSection(deps.defects!)}`; // TASK-28: na CODE — plan inataja defects zilizorithiwa
    if (deps.sabotage) md = deps.sabotage(md);
    return { a, md, v: validateMilestonePlan(md, m) };
  };
  let cur = assemble();
  const repairs = { structure: 0, guard: 0 };

  // Muundo: hadi majaribio PLAN_REPAIR_MAX ya kuandika upya kwa makosa halisi ya validator.
  // TASK-32 (E2E run 8 M1): makosa ya §1–§4 (mf. "Styling + Dependencies:" / Build Command) yako PART 1 — zamani PART 2 tu
  // ndiyo iliandikwa upya, kwa hiyo kosa la §4 halingeweza kurekebishwa kamwe → structure_failed → BLOCKED.
  const structErrs = () => [...cur.a.problems.filter((p) => /hatua \d+ > kubwa|sehemu ya 6|Work Steps/.test(p)), ...cur.v.errors];
  // TASK-35 (b): makosa ya preflight (amri isiyopo) yanapata hadi PREFLIGHT_REPAIR_MAX marudio; yakibaki → structure_failed (hayatupwi).
  const repairMax = () => (structErrs().some(isPreflightError) ? PREFLIGHT_REPAIR_MAX : PLAN_REPAIR_MAX);
  for (let attempt = 1; attempt <= repairMax() && structErrs().length; attempt++) {
    const errs = structErrs();
    const pf = errs.filter(isPreflightError);
    if (pf.length) log("warning", `🧰 Preflight ${m.id}: amri ${pf.length} hazipo kwenye sandbox — zimerudishwa kwa Optimus (jaribio ${attempt}/${PREFLIGHT_REPAIR_MAX}): ${pf.map((e) => (e.match(/`([^`]+)` \(command -v/g) || []).map((x) => x.split("`")[1]).join(",")).filter(Boolean).join(" · ").slice(0, 200)}`);
    if (errs.some(isPart1Error)) {
      repairs.structure++;
      log("warning", `🗺️ Plan ${m.id}: validator imekataa §1–§4 (${errs.filter(isPart1Error).length}) — Optimus anaandika upya kipande 1 (jaribio ${attempt}/${repairMax()})…`);
      const fixed1 = await deps.write({
        label: `${m.id} rekebisha kipande 1 (${attempt})`,
        user: `${task(1)}\n\n=== VALIDATOR FEEDBACK ===\nThe code validator REJECTED your previous PART 1 of the ${m.id} plan:\n${errs.filter(isPart1Error).map((e) => `- ${e}`).join("\n")}\n\nRewrite PART 1 COMPLETELY (sections 1, 2, 3 and 4) and fix EVERY point above. Output ONLY PART 1.`,
        maxOut: 12000,
      });
      planTexts[0] = fixed1;
      cur = assemble();
      if (!structErrs().length) break;
    }
    if (!structErrs().filter((e) => !isPart1Error(e)).length) continue;
    repairs.structure++;
    log("warning", `🗺️ Plan ${m.id}: validator imekataa (${structErrs().length}) — Optimus anaandika upya kipande 2 (jaribio ${attempt}/${repairMax()})…`);
    const fixed = await deps.write({
      label: `${m.id} rekebisha muundo${attempt > 1 ? ` (${attempt})` : ""}`,
      user: `${ctx}\n\n=== YOUR TASK ===\nThe code validator REJECTED your ${m.id} plan:\n${structErrs().map((e) => `- ${e}`).join("\n")}\n\nRewrite PART 2 COMPLETELY (sections 5, 6, 7 and 8 — same headings) fixing every error above. Same step template.\n\n${sectionsSpec(2, m, max)}\n\n${SANDBOX_CAPABILITIES}\n\n${RULES}`,
      maxOut: 24000,
    });
    planTexts.splice(0, planTexts.length, ...replacePlanStepsPart(planTexts, fixed));
    cur = assemble();
  }

  // Data Guard: jaribio 1 la kurekebisha thamani
  let hits = deps.facts ? deps.guard(cur.md) : [];
  if (hits.length) {
    repairs.guard++;
    log("warning", `🛡️ Data Guard · plan ${m.id}: tofauti ${hits.length} — ${hits.slice(0, 4).map((h) => `"${h.found}"`).join(", ")} — Optimus anarekebisha…`);
    const fixed = await deps.write({
      label: `${m.id} rekebisha data`,
      user: `${ctx}\n\nThe ${m.id} plan you wrote contains values that contradict DATA RASMI (deterministic guard):\n${hits.map((h) => `- Found: "${h.found}" — expected instead: ${String(h.expected).slice(0, 140)}`).join("\n")}\n\nRewrite ONLY the affected sections (same headings, same structure), every value corrected to match DATA RASMI word for word. Do not change anything else.`,
      maxOut: 8000,
    });
    planTexts.push(fixed);
    cur = assemble();
    hits = deps.facts ? deps.guard(cur.md) : [];
  }

  const problems = [...cur.a.problems, ...cur.v.errors];
  const status = planStatusOf(hits.length, problems);
  const gate = isPlanExecutable({ status, md: cur.md, problems });
  return {
    milestoneId: m.id,
    status,
    executable: gate.ok,
    reasons: gate.reasons,
    markdown: cur.md,
    steps: cur.v.stats.steps,
    checks: cur.v.stats.checks,
    routes: cur.v.stats.routes,
    problems,
    warnings: planWarningsOf(problems),
    guardHits: hits.map((h) => ({ found: String(h.found), expected: String(h.expected).slice(0, 200) })),
    repairs,
  };
}

/** Kikomo cha chini cha hatua (onyo tu, Task 4) — kinatumika na ripoti. */
export const MS_PLAN_STEPS_MIN = PLAN_STEPS_MIN;
