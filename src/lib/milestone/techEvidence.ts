// TASK 29 (maelezo29) — Technical review mode: ushahidi wa backend/security BILA screenshots.
// Data safi (bila I/O): scanner ya siri (regex + masking), amri za plan, cast ya reviewers kwa reviewMode.
// Harness ya sandbox: src/lib/cu/techEvidence.ts. Matokeo yote yanaingia `EvidencePack.checks` (ids `tech/...`, `plan/...`)
// ili reviewers wayataje kama `check:<id>` (classifyEvidence ya task 23 inayakubali bila mabadiliko).
import { cmdLine } from "./startpack";
import type { Check, ReviewMode } from "./types";

/** technical/mixed wanahitaji ushahidi wa technical (maelezo29 #4: mixed = vyote viwili). */
export const needsTechEvidence = (mode: ReviewMode | string | undefined) => mode === "technical" || mode === "mixed";

// ── Siri (secrets scan) ──────────────────────────────────────────────────────
export type SecretKind = "private_key" | "github_token" | "openai_key" | "supabase_service_key" | "supabase_secret_key" | "jwt" | "committed_env";
export interface SecretFinding { file: string; line: number; kind: SecretKind; masked: string }

interface SecretRule { kind: SecretKind; re: RegExp; /** ERE ya git grep (kichujio cha awali; JS inaamua) */ ere: string }
const NB = "(?<![A-Za-z0-9_])";
export const SECRET_RULES: SecretRule[] = [
  { kind: "private_key", re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g, ere: "-----BEGIN ([A-Z]+ )*PRIVATE KEY-----" },
  { kind: "github_token", re: new RegExp(`${NB}(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})`, "g"), ere: "(gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22})" },
  { kind: "openai_key", re: new RegExp(`${NB}sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}`, "g"), ere: "sk-[A-Za-z0-9_-]{20}" },
  { kind: "supabase_secret_key", re: new RegExp(`${NB}sb_secret_[A-Za-z0-9_-]{20,}`, "g"), ere: "sb_secret_[A-Za-z0-9_-]{20}" },
  { kind: "jwt", re: new RegExp(`${NB}eyJ[A-Za-z0-9_-]{8,}\\.eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}`, "g"), ere: "eyJ[A-Za-z0-9_-]{8,}\\.eyJ[A-Za-z0-9_-]{8,}\\." },
  // SUPABASE_SERVICE_ROLE_KEY=<thamani> (hata kama si JWT — funguo mpya za Supabase)
  { kind: "supabase_service_key", re: /SUPABASE_SERVICE(?:_ROLE)?_KEY\s*[:=]\s*["'`]?([A-Za-z0-9._-]{20,})/g, ere: "SUPABASE_SERVICE(_ROLE)?_KEY *[:=] *[\"'`]?[A-Za-z0-9._-]{20}" },
];
/** `.env`, `.env.local`, `api/.env.production` — si `.env.example|sample|template|dist` */
export const ENV_FILE_RE = /(^|\/)\.env(\.(?!example$|sample$|template$|dist$|defaults$)[^/]+)?$/i;
/** faili zinazorukwa na scanner (si msimbo wa mradi / ushahidi wetu wenyewe) */
export const SECRET_SCAN_EXCLUDE = ["node_modules", ".xmd", ".next", "dist"];

/** "ghp_****…(40 chars)" — herufi 4 za mwanzo tu (aina inaonekana; thamani haionekani). */
export function maskSecret(v: string): string {
  const s = String(v || "");
  return `${s.slice(0, Math.min(4, Math.max(0, s.length - 8)))}****…(${s.length} chars)`;
}

function jwtRole(tok: string): string {
  try {
    const p = tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return String(JSON.parse(Buffer.from(p, "base64").toString("utf8"))?.role || "");
  } catch { return ""; }
}

/** Matches zote za mstari mmoja (kila thamani mara moja). */
export function findSecretsInLine(text: string): { kind: SecretKind; value: string }[] {
  const out: { kind: SecretKind; value: string }[] = [];
  const seen = new Set<string>();
  for (const r of SECRET_RULES) {
    r.re.lastIndex = 0;
    for (const m of String(text).matchAll(r.re)) {
      const value = r.kind === "supabase_service_key" ? m[1] : m[0];
      if (!value || seen.has(value)) continue;
      seen.add(value);
      const kind: SecretKind = r.kind === "jwt" && jwtRole(value) === "service_role" ? "supabase_service_key" : r.kind;
      out.push({ kind, value });
    }
  }
  return out;
}

/** Ficha siri zote ndani ya maandishi (output za amri, details za checks) — kamwe usichapishe thamani. */
export function maskSecrets(text: string): string {
  let s = String(text ?? "");
  for (const r of SECRET_RULES) {
    s = s.replace(r.re, (full: string, g1?: string) => (r.kind === "supabase_service_key" && typeof g1 === "string" ? full.replace(g1, maskSecret(g1)) : maskSecret(full)));
  }
  return s;
}

/** Output ya `git grep -nI` (path:line:text) + orodha ya faili za git → findings (zimefichwa). */
export function parseSecretScan(grepOut: string, trackedFiles: string[]): SecretFinding[] {
  const out: SecretFinding[] = [];
  const excluded = (f: string) => SECRET_SCAN_EXCLUDE.some((d) => f === d || f.startsWith(`${d}/`) || f.includes(`/${d}/`));
  for (const f of trackedFiles) if (ENV_FILE_RE.test(f) && !excluded(f)) out.push({ file: f, line: 0, kind: "committed_env", masked: "(file is tracked by git)" });
  for (const raw of String(grepOut || "").split("\n")) {
    const m = /^(.+?):(\d+):(.*)$/.exec(raw);
    if (!m || excluded(m[1])) continue;
    for (const h of findSecretsInLine(m[3])) out.push({ file: m[1], line: Number(m[2]), kind: h.kind, masked: maskSecret(h.value) });
  }
  return out;
}

/** Check ya `tech/secrets` — FAIL ikiwa kuna chochote; detail inataja faili (thamani zimefichwa). */
export function secretsCheckDetail(findings: SecretFinding[], scanned: number): string {
  if (!findings.length) return `no secrets found in ${scanned} tracked files (private keys, GitHub tokens, sk- keys, JWTs, Supabase service keys, committed .env)`;
  const files = [...new Set(findings.map((f) => f.file))];
  return `${findings.length} secret(s) in ${files.length} file(s): ${files.join(", ")}\n${findings.slice(0, 30).map((f) => `- ${f.file}${f.line ? `:${f.line}` : ""} ${f.kind} ${f.masked}`).join("\n")}`;
}

/** ERE moja kwa git grep (alternation ya kanuni zote). */
export const secretGrepEre = () => SECRET_RULES.map((r) => `(${r.ere})`).join("|");

// ── Amri za plan (maelezo29: tests, npm audit, lint/typecheck, migration status) ──
export interface TechCommand { id: string; label: string; cmd: string; expectExit: number }
export const TECH_PLAN_COMMANDS: { id: string; label: string }[] = [
  { id: "build", label: "Build Command" },
  { id: "test", label: "Test Command" },
  { id: "lint", label: "Lint Command" },
  { id: "typecheck", label: "Typecheck Command" },
  { id: "migrations", label: "Migration Status Command" },
];
export const NPM_AUDIT_CMD = "npm audit --omit=dev --audit-level=high";

/** Amri za ushahidi wa technical (ids `tech/<id>`). `hasPackageJson` → npm audit (prod deps). */
export function techCommandsOf(planMarkdown: string, hasPackageJson: boolean): TechCommand[] {
  const out: TechCommand[] = [];
  for (const c of TECH_PLAN_COMMANDS) {
    const cmd = cmdLine(planMarkdown || "", c.label);
    if (cmd) out.push({ id: `tech/${c.id}`, label: c.label, cmd, expectExit: 0 });
  }
  if (hasPackageJson) out.push({ id: "tech/audit", label: "npm audit (prod)", cmd: NPM_AUDIT_CMD, expectExit: 0 });
  return out;
}

/** Checks zote za plan (```checks za hatua) zinazoweza kuendeshwa bila browser — ids `plan/<id>`. */
export const TECH_CHECK_TYPES = ["command", "grep", "http", "file_exists", "file_contains", "db"] as const;
export function techPlanChecks(checks: Check[]): Check[] {
  const seen = new Set<string>();
  return checks
    .filter((c) => (TECH_CHECK_TYPES as readonly string[]).includes(c.type))
    .map((c) => ({ ...c, id: `plan/${c.id}` }) as Check)
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

// ── Reviewers: "cast" ya slots mbili kwa reviewMode (maelezo29 #2) ─────────────
/** Slots mbili za pipeline ya review (tasks 23–28) zinabaki "designer"/"frontend" (data, keys za verdicts);
 *  technical → Optimus anachagua wataalamu 2 kutoka roster: backend (Megatron) + QA/security (Cybertron). */
export type ReviewSlot = "designer" | "frontend";
export type ReviewCast = Record<ReviewSlot, string>;
export const VISUAL_CAST: ReviewCast = { designer: "designer", frontend: "frontend" };
/** mpangilio wa upendeleo wa technical (agent ids) */
export const TECH_REVIEWER_PREFERENCE = ["backend", "qa", "frontend", "designer"] as const;

/** roster ya ramani (majina madogo: megatron, cybertron…) au agent ids → cast. Megatron hawekwi asipokuwa kwenye roster
 *  (task 13: hakuna kazi ya backend → hayupo). QA/security (Cybertron) ndiye mbadala wa daima wa slot ya pili. */
export function reviewCast(mode: ReviewMode | string | undefined, roster: string[] = [], idByRoster: Record<string, string> = {}): ReviewCast {
  if (mode !== "technical") return { ...VISUAL_CAST };
  const ids = new Set(roster.map((r) => idByRoster[String(r).toLowerCase()] || String(r).toLowerCase()));
  const picked: string[] = TECH_REVIEWER_PREFERENCE.filter((a) => ids.has(a)).slice(0, 2);
  for (const a of ["qa", "frontend", "designer"]) if (picked.length < 2 && !picked.includes(a)) picked.push(a);
  return { designer: picked[0], frontend: picked[1] };
}
export const castAgentId = (cast: Partial<ReviewCast> | undefined, slot: ReviewSlot): string => cast?.[slot] || slot;

/** Lens ya technical kwa kila agent (prompts za English). */
export const TECH_LENS: Record<string, string> = {
  backend: "Judge the backend: API behaviour vs the plan and the ledger, data model and migrations, error handling, input validation, test results and command outputs. Does every endpoint do what the plan says, with correct status codes?",
  qa: "Judge security and quality: committed secrets, authentication and authorization (unauthenticated requests MUST be denied — look at the negative http checks), input validation, rate limits, error messages that leak internals (stack traces, SQL), Row Level Security on tables, dependency audit, test coverage of failure paths.",
  frontend: "Judge the integration: API contracts as used by clients, error/empty states, configuration and environment handling, build and test outputs.",
  designer: "Judge whether the delivered behaviour matches the locked product decisions and the plan's goal; read command outputs and checks for proof.",
};
export const TECH_METHOD = `This milestone is TECHNICAL: there are NO screenshots — reply with "screenshots": []. Your evidence is the TECHNICAL EVIDENCE below (command outputs, secrets scan, http checks incl. negative/unauthenticated ones, database checks, git diff).
1) CLAIMS vs EVIDENCE: list every claim of the XMD Computer Build Report (tests pass, no secrets, auth enforced, migrations applied, …) and compare it with the evidence. A claim that the evidence contradicts is a DEFECT (kind "broken", severity ≥ major for security) citing the contradicting check, e.g. "check:tech/secrets".
2) WHAT THE REPORT DOES NOT SAY: failing or missing checks, endpoints without a negative check, tables without RLS, untested failure paths.
3) SECURITY CHECKLIST: secrets · authentication/authorization · input validation · rate limits · error leaks · RLS · dependency audit.
Every finding needs evidence pointing INTO THE EVIDENCE PACK: "check:<id>" of a listed check (e.g. check:tech/secrets, check:plan/c2, check:tech/test). Separate DEFECTS from PROPOSALS.`;
