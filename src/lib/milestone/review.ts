// TASK 23 (maelezo23) — Reviewer analysis (Round 0, HURU): Designer (Ultron) + Frontend Engineer (Vextron) wanachambua
// EvidencePack kila mmoja PEKE YAKE (hakuna anayeona jibu la mwenzake) → Findings zenye muundo (defects + proposals).
//  · Context pack inajengwa na CODE kwa mpangilio huu: OCB (REVIEW_ANALYSE) + RoundHeader · mini-reports (kamili) ·
//    ledger (fupi) · plan ya milestone · Build Report · EvidencePack (picha kama image parts + muhtasari wa *.dom.json +
//    checks + regression[] + git diff) · defect ledger (iliyorithiwa) · orodha ya baselines za milestones zilizopita.
//  · Lane: Gemini Flash (thinking ON) kupitia broker iliyopo hadi task 30. Picha = image parts halisi (idadi inaandikwa).
//  · JSON inathibitishwa na code; batili → kurudia (max 2) pamoja na orodha ya makosa.
// Behind XMD_MILESTONES (inaitwa na pipeline ya milestone tu).
import { createHash } from "node:crypto";
import { AGENTS } from "@/lib/agents";
import { type CompleteResult } from "@/lib/broker";
import { judgeComplete } from "./judge"; // TASK-30
/** umbo la ujumbe wa broker (content: string au parts za OpenAI — text + image_url) */
type Msg = { role: string; content?: unknown };
import { buildOCB, type OcbInput } from "./ocb";
import type { LedgerLike } from "./plan";
import { castAgentId, TECH_LENS, TECH_METHOD, type ReviewCast } from "./techEvidence"; // TASK-29
import { DEFECT_SEVERITIES, type Defect, type DefectSeverity, type EvidencePack, type ReviewMode, type RoundHeaderData } from "./types";

export const REVIEWERS = ["designer", "frontend"] as const;
export type ReviewerId = (typeof REVIEWERS)[number];

/** Defect-like (id/status/history zinapewa na code baadaye — task 24+). */
export interface DefectFinding {
  title: string;
  area: string;
  severity: DefectSeverity;
  /** "violation" = inavunja uamuzi uliofungwa · "broken" = tabia iliyovunjika */
  kind: "violation" | "broken";
  /** mf. "A2" (agenda ya ledger) — kwa violation */
  decisionRef?: string;
  evidence: string[];
  expected: string;
  actual: string;
}
export interface Proposal {
  title: string;
  detail: string;
  rationale: string;
  evidence: string[];
}
export interface ScreenshotReading {
  id: string;
  description: string;
}
export interface Findings {
  reviewer: ReviewerId;
  /** maelezo23: "For EVERY screenshot say what is where, how big, how arranged" */
  screenshots: ScreenshotReading[];
  defects: DefectFinding[];
  proposals: Proposal[];
  notes: string;
}

export interface ReviewContext {
  /** OCB bila stage/self (code inaweka REVIEW_ANALYSE + reviewer) */
  ocb: Omit<OcbInput, "stage" | "self">;
  roundHeader: RoundHeaderData;
  /** mini-reports za agenda za milestone hii — KAMILI */
  miniReports: { agendaIndex: number; title: string; detail: string }[];
  ledger: LedgerLike[];
  planMarkdown: string;
  buildReport: string;
  pack: EvidencePack;
  /** defect ledger (iliyorithiwa kutoka milestones/raundi zilizopita) */
  defects: Defect[];
  /** baselines za milestones zilizoidhinishwa (task 22 manifests) */
  baselines: { milestoneId: string; route: string; viewport: string; state: string; url?: string }[];
  /** TASK-29: technical → slots zinachezwa na wataalamu wa roster (backend + qa); tupu = designer/frontend */
  cast?: Partial<ReviewCast>;
  reviewMode?: ReviewMode;
}

export interface DomJson {
  page: Record<string, any>;
  elements: Record<string, any>[];
  totalCandidates?: number;
  truncated?: boolean;
}
export interface ReviewImage { mime: string; base64: string }

export interface ReviewDeps {
  /** LLM (default: broker → Gemini Flash, thinking ON) */
  complete?: (o: { reviewer: ReviewerId; messages: Msg[]; purpose: string; agentId?: string; /** TASK-29: technical bila picha → lane yoyote nzito (si Gemini tu) */ textOnly?: boolean }) => Promise<Pick<CompleteResult, "text" | "usage"> & { lane?: { id: string; model: string; tier?: string; provider?: string }; visionDegraded?: boolean }>;
  /** TASK-30: digest ya picha (id → maelezo, Flash vision mapema) — kwa lane isiyo na vision */
  imageDigest?: Record<string, string> | null;
  /** TASK-30: rekodi ya kila wito wa judge → state.lanesUsed */
  onLane?: (rec: import("./types").LaneUse) => void;
  /** TASK-29: kusubiri kabla ya kujaribu tena LLM ikishindwa (default 45s; tests 0) */
  retryWaitMs?: number;
  /** PNG ya screenshot (default: fetch url ya storage) */
  loadImage?: (shot: EvidencePack["screenshots"][number]) => Promise<ReviewImage | null>;
  /** *.dom.json (default: fetch url ya storage) */
  loadDom?: (dm: EvidencePack["domMetrics"][number]) => Promise<DomJson | null>;
  /** false = bila picha (T4 ya kulinganisha) */
  images?: boolean;
  maxImages?: number;
  log?: (level: "info" | "success" | "warning" | "error", text: string) => void;
}

export interface ReviewMeta {
  reviewer: ReviewerId;
  /** sha256 ya prompt (system + user text + hash za picha) */
  promptHash: string;
  promptChars: number;
  imageParts: number;
  textParts: number;
  attempts: number;
  /** makosa ya jaribio la mwisho (tupu = halali) */
  errors: string[];
  lane: string;
  model: string;
  tier: string;
  ms: number;
  usage: CompleteResult["usage"];
  /** TASK-30: findings zilitoka kwenye lane bila vision (digest badala ya picha) — sign-off ya visual inazikataa */
  visionDegraded?: boolean;
}
export interface ReviewRun {
  findings: Findings | null;
  valid: boolean;
  meta: ReviewMeta;
  /** maandishi kamili ya prompt (kwa uthibitisho wa uhuru) */
  promptText: string;
  /** jibu ghafi la mwisho */
  raw: string;
}

export const REVIEW_MAX_RETRIES = 2;
export const REVIEW_MAX_IMAGES = 12;
/** Gemini haitumi thinking kwenye stream: high thinking + picha + context ~60k chars = kimya > 90s (T1 halisi: stall ×4). */
export const REVIEW_STALL_FIRST_MS = 300_000;
const DOM_ELEMENTS_PER_SHOT = 40;
const cap = (s: unknown, n: number) => { const t = String(s ?? ""); return t.length > n ? `${t.slice(0, n)} […cut ${t.length - n} chars]` : t; };
/** TASK-29: slot → agent anayeicheza (cast ya technical) */
const agentOf = (id: ReviewerId, cast?: Partial<ReviewCast>) => AGENTS.find((a) => a.id === castAgentId(cast, id)) || AGENTS.find((a) => a.id === id)!;
/** TASK-29: review ya technical (hakuna screenshots — ushahidi wa technical) */
export const isTechnicalReview = (ctx: { reviewMode?: ReviewMode; pack?: EvidencePack }) =>
  ctx.reviewMode === "technical" || (!!ctx.pack?.technical && !(ctx.pack.screenshots || []).length);

/** "ROUND 0/10 (M1) — closed defects: 0 · open: 0 · waivers: 0 · rounds left: 10" (types.ts RoundHeaderData) */
export function formatRoundHeader(d: RoundHeaderData): string {
  const open = d.open.length ? `${d.open.length} (${d.open.map((o) => `${o.id} attempt ${o.attempt}`).join(", ")})` : "0";
  return `ROUND ${d.round}/${d.maxRounds} (${d.milestoneId}) — closed defects: ${d.closedDefects} · open: ${open} · waivers: ${d.waivers} · rounds left: ${d.roundsLeft}`;
}

// ── Prompts (English) ────────────────────────────────────────────────────────
const ROLE_PROMPT: Record<ReviewerId, string> = {
  designer: `Judge layout, spacing, type scale, color use vs the ledger's design rules, visual hierarchy, brand feel, imagery. Is it premium/professional? What would a top agency change?`,
  frontend: `Judge implementation vs spec, responsiveness at 375/768/1280, overflow, states (hover/focus/empty/error), accessibility, console errors, consistency with tokens.`,
};
const BOTH_PROMPT = `Use DOM metrics for sizes/positions/fonts/colors; use pictures for feel and layout. For EVERY screenshot say what is where, how big, how arranged. Every finding needs evidence (screenshot id or metric or check id). Separate DEFECTS (violations of locked decisions or broken behavior) from PROPOSALS (improvements, e.g. 'add sample clothing items', 'change this palette'). You may search the web for current design practice (only if a search tool is available in this call — otherwise rely on what you know).`;

const OUTPUT_SPEC = `OUTPUT: ONE JSON object, nothing else (no prose before or after; a \`\`\`json fence is tolerated). Long answers are allowed.
{
  "reviewer": "<your id: designer | frontend>",
  "screenshots": [ { "id": "S-001", "description": "what is where, how big, how arranged (cite DOM numbers)" } ],   // EVERY screenshot id of the pack, once
  "defects": [ { "title": "...", "area": "e.g. header / product grid / typography", "severity": "blocker|major|medium|minor",
                 "kind": "violation|broken", "decisionRef": "A2 (ledger agenda, for violations; optional)",
                 "evidence": ["S-002", "S-002 dom: <selector> <property>=<value>", "check:<check id>", "regression:/route@375x667", "console"],
                 "expected": "what the locked decision / spec requires", "actual": "what the evidence shows" } ],
  "proposals": [ { "title": "...", "detail": "...", "rationale": "...", "evidence": ["S-001", ...] } ],
  "notes": "anything else (overall verdict, uncertainties)"
}
EVIDENCE RULES: every defect and proposal needs ≥1 evidence item that points INTO THE EVIDENCE PACK: a screenshot id (e.g. "S-003"), a DOM metric written exactly as "S-003 dom: <selector> <property>=<value>" (copy selector and value from the DOM METRICS lines), "check:<id>" of a listed check, "regression:<route>@<viewport>" of a listed regression, or "console". Extra references ("ledger:A2", "plan", "build-report", "git-diff") are allowed in addition. Never invent ids. A DEFECT must be a violation of a LOCKED decision / the plan, or broken behavior — taste goes to PROPOSALS.`;

function systemPrompt(reviewer: ReviewerId, ctx?: Pick<ReviewContext, "cast" | "reviewMode" | "pack">): string {
  const a = agentOf(reviewer, ctx?.cast);
  const tech = !!ctx && isTechnicalReview(ctx);
  return [
    `You are ${a.name}, the ${a.role} of PROFESSOR XMD COMPANY ("${a.tagline}"). You are one of two independent reviewers of a milestone the XMD Computer just built. You review ALONE — you will not see the other reviewer's findings, and they will not see yours.`,
    `YOUR LENS: ${tech ? TECH_LENS[a.id] || TECH_LENS.qa : ROLE_PROMPT[reviewer]}`,
    `METHOD: ${tech ? TECH_METHOD : BOTH_PROMPT}`,
    tech ? OUTPUT_SPEC.replace("<your id: designer | frontend>", reviewer) : OUTPUT_SPEC,
  ].join("\n\n");
}

/** Muhtasari wa dom.json kwa LLM: mstari wa page + elements (zinazoonekana kwanza). Selector/value zinanakiliwa neno kwa neno kwenye evidence. */
export function domLines(shotId: string, d: DomJson | null, max = DOM_ELEMENTS_PER_SHOT): string {
  if (!d) return `${shotId}: (no DOM metrics)`;
  const p = d.page || {};
  const head = `${shotId} page: viewport ${p.innerWidth}x${p.innerHeight} · scrollWidth=${p.scrollWidth} clientWidth=${p.clientWidth} scrollHeight=${p.scrollHeight} · overflowPx=${p.overflowPx} · bodyBackground=${p.bodyBackground} · fontsLoaded=[${(p.fontsLoaded || []).slice(0, 6).join("; ")}]${(p.fontsFailed || []).length ? ` fontsFailed=[${p.fontsFailed.join("; ")}]` : ""} · imagesWithoutAlt=${(p.imagesWithoutAlt || []).length} · headingProblems=${JSON.stringify(p.headingOrderProblems || [])}`;
  const els = [...(d.elements || [])].sort((a, b) => Number(!!b.visible) - Number(!!a.visible)).slice(0, max);
  const rows = els.map((e) => {
    const b = e.box || {};
    const fam = String(e.fontFamily || "").split(",")[0].replace(/["']/g, "").trim();
    const parts = [
      `${shotId} dom: ${e.selector}`, `<${e.tag}>${e.text ? ` "${String(e.text).slice(0, 30)}"` : ""}`,
      `x=${b.x} y=${b.y} width=${b.w} height=${b.h}`,
      `fontSize=${e.fontSize} fontWeight=${e.fontWeight} fontFamily=${fam}${e.textTransform && e.textTransform !== "none" ? ` textTransform=${e.textTransform}` : ""}${e.letterSpacing && e.letterSpacing !== "normal" ? ` letterSpacing=${e.letterSpacing}` : ""}`,
      `color=${e.color} backgroundColor=${e.backgroundColor} contrastRatio=${e.contrastRatio}${e.lowContrast ? " LOW-CONTRAST" : ""}`,
    ];
    if (e.touchTarget) parts.push(`touch ${e.touchTarget.w}x${e.touchTarget.h}${e.tooSmall ? " TOO-SMALL" : ""}`);
    if (!e.visible) parts.push("hidden");
    return parts.join(" · ");
  });
  const more = (d.elements || []).length > els.length ? `\n${shotId}: +${d.elements.length - els.length} more elements not listed` : "";
  return [head, ...rows].join("\n") + more;
}

export interface BuiltPrompt {
  messages: Msg[];
  /** maandishi yote ya prompt (system + user text) */
  text: string;
  hash: string;
  imageParts: number;
  textParts: number;
  imageIds: string[];
}

/** Context pack (mpangilio wa maelezo23) → messages. Picha = image parts halisi (data URL) baada ya maandishi ya evidence. */
export async function buildReviewPrompt(reviewer: ReviewerId, ctx: ReviewContext, deps: ReviewDeps = {}): Promise<BuiltPrompt> {
  const pack = ctx.pack;
  const ocb = buildOCB({ ...ctx.ocb, stage: "REVIEW_ANALYSE", self: castAgentId(ctx.cast, reviewer) as OcbInput["self"] });
  const tech = isTechnicalReview(ctx); // TASK-29
  const loadDom = deps.loadDom || defaultLoadDom;
  const doms = await Promise.all((pack.screenshots || []).map(async (s) => {
    const dm = (pack.domMetrics || []).find((d) => d.screenshotId === s.id);
    return dm ? loadDom(dm).catch(() => null) : null;
  }));
  const shotsLine = (pack.screenshots || []).map((s) => `- ${s.id}: route ${s.route} · viewport ${s.viewport} · state ${s.state}`).join("\n") || "- (no screenshots)";
  // TASK-29: technical → output za amri/scan zinaonyeshwa kwa urefu (ndio ushahidi pekee)
  const checks = (pack.checks || []).map((c) => `- check:${c.id} [${c.type}] ${c.result} — ${cap(c.detail, tech ? 1500 : 300)}`).join("\n") || "- (no check results)";
  const regression = (pack.regression || []).map((r) => `- regression:${r.route}@${r.viewport} [${r.kind}] changed ${r.changedPct}% (threshold ${r.thresholdPct}%) vs baseline ${r.baselineMilestone}${r.note ? ` — ${r.note}` : ""}${r.changeOrderIds?.length ? ` (change orders ${r.changeOrderIds.join(", ")})` : ""}`).join("\n") || "- (none)";
  const ledger = ctx.ledger.map((e) => `- A${e.agenda_index} [${e.status}] ${e.agenda_item}: ${cap(String(e.decision_summary || "").replace(/\s+/g, " ").trim(), 400) || "(no summary)"}`).join("\n") || "- (no ledger decisions)";
  const minis = ctx.miniReports.map((m) => `### A${m.agendaIndex} — ${m.title}\n${m.detail.trim()}`).join("\n\n") || "(no mini-reports)";
  const defects = ctx.defects.map((d) => `- ${d.id} [${d.status}, ${d.severity}, ${d.milestoneId} R${d.foundInRound}] ${d.title} — expected: ${cap(d.expected, 160)} · actual: ${cap(d.actual, 160)}`).join("\n") || "- (none)";
  const baselines = ctx.baselines.map((b) => `- ${b.milestoneId}: ${b.route} @${b.viewport} ${b.state}`).join("\n") || "- (none — this is the first reviewed milestone)";

  const want = deps.images !== false;
  const maxImg = deps.maxImages ?? REVIEW_MAX_IMAGES;
  const loadImage = deps.loadImage || defaultLoadImage;
  const imgs: { id: string; img: ReviewImage }[] = [];
  if (want) {
    for (const s of (pack.screenshots || []).slice(0, maxImg)) {
      const img = await loadImage(s).catch(() => null);
      if (img) imgs.push({ id: s.id, img });
    }
  }
  const imgNote = tech ? "PICTURES: none — technical mode (no screenshots)." : !want
    ? "PICTURES: NOT attached in this call — you only have the DOM metrics and the text above. Do not claim anything you could only know from looking at a picture."
    : imgs.length
      ? `PICTURES: ${imgs.length} screenshot image(s) are attached after this text, in this order: ${imgs.map((i) => i.id).join(", ")}. Each image is preceded by a label with its id.`
      : "PICTURES: none could be loaded — rely on the DOM metrics.";

  const sections = [
    `${ocb}\n${formatRoundHeader(ctx.roundHeader)}`,
    `## MINI-REPORTS OF THIS MILESTONE'S AGENDAS (full)\n${minis}`,
    `## LEDGER (locked decisions — authoritative)\n${ledger}`,
    `## MILESTONE PLAN (what XMD Computer was told to build)\n${cap(ctx.planMarkdown, 24_000)}`,
    `## XMD COMPUTER BUILD REPORT\n${cap(ctx.buildReport || "(no build report)", 16_000)}`,
    ...(tech ? [`## TECHNICAL EVIDENCE (decided by code — no screenshots in technical mode)
SECRETS SCAN: ${pack.technical ? `${pack.technical.secrets} finding(s)${pack.technical.secretFiles.length ? ` in ${pack.technical.secretFiles.join(", ")}` : ""} — see check:tech/secrets` : "not run"}
CHECKS NOT PASSING: ${(pack.checks || []).filter((c) => c.result !== "PASS").map((c) => `check:${c.id} ${c.result}`).join(", ") || "none"}
COMMANDS RUN: ${(pack.commands || []).map((c) => `\`${cap(c.cmd, 120)}\` → exit ${c.exit}`).join(" · ") || "none"}`] : []),
    `## EVIDENCE PACK (${pack.milestoneId} R${pack.round}${pack.base ? ` · ${pack.mode || "local"} ${pack.base}` : ""})
SCREENSHOTS:
${shotsLine}
DOM METRICS (measured by the harness in a real browser; px; box x/y from the page top-left):
${doms.map((d, i) => domLines(pack.screenshots[i].id, d)).join("\n\n")}
CHECK RESULTS (decided by code):
${checks}
REGRESSION vs approved baselines:
${regression}
CONSOLE ERRORS: ${(pack.consoleErrors || []).length ? pack.consoleErrors.slice(0, 20).map((c) => cap(c, 200)).join(" | ") : "none"}
HARNESS ERRORS: ${(pack.errors || []).length ? pack.errors.slice(0, 10).map((e) => `${e.kind}: ${cap(e.detail, 160)}`).join(" | ") : "none"}
GIT DIFF SUMMARY:
${cap(pack.gitDiffSummary || "(none)", 4000)}
${imgNote}`,
    `## DEFECT LEDGER (inherited / still open)\n${defects}`,
    `## BASELINES OF PREVIOUS MILESTONES (approved screenshots)\n${baselines}`,
    tech
      ? `## YOUR TASK\nReview milestone ${pack.milestoneId} as ${agentOf(reviewer, ctx.cast).name} (reviewer id "${reviewer}"). Technical mode: "screenshots": []. Compare the Build Report's claims with the technical evidence, list what the report does not say, run the security checklist, then list DEFECTS and PROPOSALS citing check:<id>. Reply with the JSON object only.`
      : `## YOUR TASK\nReview milestone ${pack.milestoneId} as ${agentOf(reviewer).name} (${reviewer}). Describe EVERY screenshot (${(pack.screenshots || []).map((s) => s.id).join(", ") || "none"}), then list DEFECTS and PROPOSALS with evidence. Reply with the JSON object only.`,
  ];
  const userText = sections.join("\n\n");
  const system = systemPrompt(reviewer, ctx);
  const content: any[] = [{ type: "text", text: userText }];
  for (const { id, img } of imgs) {
    const s = pack.screenshots.find((x) => x.id === id)!;
    content.push({ type: "text", text: `Image ${id} — route ${s.route} · viewport ${s.viewport} · state ${s.state}:` });
    content.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.base64}` } });
  }
  const messages = [{ role: "system", content: system }, { role: "user", content }] as unknown as Msg[];
  const text = `${system}\n\n${userText}`;
  const h = createHash("sha256").update(text);
  for (const { img } of imgs) h.update(createHash("sha256").update(img.base64).digest("hex"));
  return { messages, text, hash: h.digest("hex"), imageParts: imgs.length, textParts: content.filter((c) => c.type === "text").length, imageIds: imgs.map((i) => i.id) };
}

async function defaultLoadImage(s: EvidencePack["screenshots"][number]): Promise<ReviewImage | null> {
  if (!/^https?:\/\//.test(s.url || "")) return null;
  const r = await fetch(s.url);
  if (!r.ok) return null;
  return { mime: r.headers.get("content-type")?.split(";")[0] || "image/png", base64: Buffer.from(await r.arrayBuffer()).toString("base64") };
}
async function defaultLoadDom(d: EvidencePack["domMetrics"][number]): Promise<DomJson | null> {
  if (!/^https?:\/\//.test(d.url || "")) return null;
  const r = await fetch(d.url!);
  return r.ok ? ((await r.json()) as DomJson) : null;
}

// ── Uthibitisho wa JSON ──────────────────────────────────────────────────────
/** JSON kutoka jibu (fence au maandishi ya pembeni yanaruhusiwa). */
export function extractJson(text: string): unknown {
  const t = String(text || "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const body = fence ? fence[1] : t;
  try { return JSON.parse(body); } catch { /* jaribu kipande cha { … } */ }
  const a = body.indexOf("{"), b = body.lastIndexOf("}");
  if (a >= 0 && b > a) {
    const obj = body.slice(a, b + 1);
    try { return JSON.parse(obj); } catch (e) {
      // TASK-32 (E2E halisi, E7 M1 R1): Optimus alivunja JSON mara 2 mfululizo (koma iliyokosekana) → consolidation invalid → BLOCKED
      try { return JSON.parse(repairJson(obj)); } catch { throw e; }
    }
  }
  throw new Error("no JSON object found");
}

/** Urekebishaji mdogo wa makosa ya kawaida ya LLM NJE ya strings: koma iliyokosekana kati ya mistari, trailing comma.
 *  Matokeo bado yanapita validation kamili ya mpigaji — hii haibuni maudhui. */
export function repairJson(src: string): string {
  let out = "", inStr = false, esc = false, lastSig = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') { inStr = false; lastSig = '"'; }
      continue;
    }
    if (c === '"' || c === "{" || c === "[") {
      // thamani mpya inaanza baada ya thamani iliyokamilika bila koma → ongeza koma
      if (lastSig && /["}\]\deEtl]/.test(lastSig) && /\n/.test(out.slice(out.search(/\S\s*$/) + 1))) out = out.replace(/(\S)(\s*)$/, "$1,$2");
      out += c;
      if (c === '"') inStr = true;
      lastSig = c;
      continue;
    }
    if (c === "}" || c === "]") { out = out.replace(/,(\s*)$/, "$1"); out += c; lastSig = c; continue; }
    out += c;
    if (!/\s/.test(c)) lastSig = c;
  }
  return out;
}

const SHOT_RE = /^(S-\d{3,})\b/;
const EXTRA_REF = /^(ledger:A?\d+|plan\b|build-report\b|git-diff\b|baseline\b)/i;

/** Evidence moja → "pack" (inaelekeza ndani ya EvidencePack) · "extra" · au kosa. */
export function classifyEvidence(ev: string, pack: EvidencePack): { kind: "pack" | "extra" } | { error: string } {
  const s = String(ev || "").trim();
  if (!s) return { error: "empty evidence item" };
  const shot = SHOT_RE.exec(s);
  if (shot) return pack.screenshots.some((x) => x.id === shot[1]) ? { kind: "pack" } : { error: `screenshot ${shot[1]} is not in the pack (have ${pack.screenshots.map((x) => x.id).join(", ") || "none"})` };
  const ck = /^check:\s*(\S+)/i.exec(s);
  if (ck) return pack.checks.some((c) => c.id === ck[1]) ? { kind: "pack" } : { error: `check ${ck[1]} is not in the pack` };
  if (pack.checks.some((c) => c.id === s)) return { kind: "pack" };
  const rg = /^regression:\s*(\/\S*)@(\d{3,4}x\d{3,4})/i.exec(s);
  if (rg) return (pack.regression || []).some((r) => r.route === rg[1] && r.viewport === rg[2]) ? { kind: "pack" } : { error: `regression ${rg[1]}@${rg[2]} is not in the pack` };
  if (/^console\b/i.test(s)) return (pack.consoleErrors || []).length ? { kind: "pack" } : { error: "\"console\" cited but the pack has no console errors" };
  if (EXTRA_REF.test(s)) return { kind: "extra" };
  return { error: `unrecognised evidence "${s.slice(0, 60)}" — use a screenshot id, "S-00x dom: <selector> <property>=<value>", check:<id>, regression:<route>@<viewport> or console` };
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

export function validateFindings(raw: unknown, reviewer: ReviewerId, pack: EvidencePack, cast?: Partial<ReviewCast>): { ok: true; value: Findings } | { ok: false; errors: string[] } {
  const e: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["root: must be a JSON object"] };
  const a = agentOf(reviewer, cast);
  const who = String(raw.reviewer || "").toLowerCase();
  if (who && who !== reviewer && who !== a.name.toLowerCase() && who !== a.id) e.push(`reviewer: must be "${reviewer}" (got ${JSON.stringify(raw.reviewer)})`);
  const evid = (arr: unknown, p: string) => {
    if (!Array.isArray(arr) || !arr.length) { e.push(`${p}.evidence: must be a non-empty array`); return; }
    let packRefs = 0;
    arr.forEach((x, i) => {
      if (typeof x !== "string") { e.push(`${p}.evidence[${i}]: must be a string`); return; }
      const c = classifyEvidence(x, pack);
      if ("error" in c) e.push(`${p}.evidence[${i}]: ${c.error}`);
      else if (c.kind === "pack") packRefs++;
    });
    if (!packRefs) e.push(`${p}.evidence: needs at least one item pointing into the evidence pack (screenshot id / dom metric / check / regression / console)`);
  };
  // screenshots: kila id mara moja
  const ids = pack.screenshots.map((s) => s.id);
  if (!Array.isArray(raw.screenshots)) e.push("screenshots: must be an array with one entry per screenshot");
  else {
    const seen = new Set<string>();
    raw.screenshots.forEach((s: unknown, i: number) => {
      if (!isObj(s) || !nonEmpty(s.id) || !nonEmpty(s.description)) { e.push(`screenshots[${i}]: must be {id, description}`); return; }
      if (!ids.includes(s.id)) e.push(`screenshots[${i}].id: ${s.id} is not in the pack`);
      seen.add(s.id);
    });
    const missing = ids.filter((x) => !seen.has(x));
    if (missing.length) e.push(`screenshots: missing descriptions for ${missing.join(", ")}`);
  }
  if (!Array.isArray(raw.defects)) e.push("defects: must be an array (may be empty)");
  else raw.defects.forEach((d: unknown, i: number) => {
    const p = `defects[${i}]`;
    if (!isObj(d)) { e.push(`${p}: must be an object`); return; }
    for (const k of ["title", "area", "expected", "actual"]) if (!nonEmpty(d[k])) e.push(`${p}.${k}: must be a non-empty string`);
    if (!(DEFECT_SEVERITIES as readonly string[]).includes(d.severity)) e.push(`${p}.severity: must be one of ${DEFECT_SEVERITIES.join("|")} (got ${JSON.stringify(d.severity)})`);
    if (d.kind !== "violation" && d.kind !== "broken") e.push(`${p}.kind: must be "violation" or "broken" (got ${JSON.stringify(d.kind)})`);
    if (d.decisionRef !== undefined && d.decisionRef !== null && typeof d.decisionRef !== "string") e.push(`${p}.decisionRef: must be a string`);
    evid(d.evidence, p);
  });
  if (!Array.isArray(raw.proposals)) e.push("proposals: must be an array (may be empty)");
  else raw.proposals.forEach((x: unknown, i: number) => {
    const p = `proposals[${i}]`;
    if (!isObj(x)) { e.push(`${p}: must be an object`); return; }
    for (const k of ["title", "detail", "rationale"]) if (!nonEmpty(x[k])) e.push(`${p}.${k}: must be a non-empty string`);
    evid(x.evidence, p);
  });
  if (raw.notes !== undefined && typeof raw.notes !== "string") e.push("notes: must be a string");
  if (e.length) return { ok: false, errors: e };
  return {
    ok: true,
    value: {
      reviewer,
      screenshots: raw.screenshots.map((s: any) => ({ id: s.id, description: String(s.description) })),
      defects: raw.defects.map((d: any) => ({
        title: String(d.title), area: String(d.area), severity: d.severity, kind: d.kind, ...(d.decisionRef ? { decisionRef: String(d.decisionRef) } : {}),
        evidence: d.evidence.map(String), expected: String(d.expected), actual: String(d.actual),
      })),
      proposals: raw.proposals.map((x: any) => ({ title: String(x.title), detail: String(x.detail), rationale: String(x.rationale), evidence: x.evidence.map(String) })),
      notes: String(raw.notes || ""),
    },
  };
}

/** TASK-30: lane ya JUDGE — Gemini Flash (keys 4, thinking ON) → XKiro → Flash-Lite; picha kwenye lane bila vision → digest. */
const judgeFor = (deps: ReviewDeps): NonNullable<ReviewDeps["complete"]> => async ({ reviewer, messages, purpose, agentId }) => // textOnly: mnyororo wa judge ni uleule (hops 32 — judgeComplete)
  judgeComplete({ agentId: agentId || reviewer, purpose, messages, maxOut: 32_000, cls: "heavy", effort: "high", temperature: 0.4, priority: "background", waitMs: 120_000, stallFirstMs: REVIEW_STALL_FIRST_MS },
    { digest: deps.imageDigest, onLane: deps.onLane });

/** maelezo23 #1 — reviewer MMOJA, peke yake. */
export async function analyse(reviewer: ReviewerId, pack: EvidencePack, ctx: Omit<ReviewContext, "pack">, deps: ReviewDeps = {}): Promise<ReviewRun> {
  const t0 = Date.now();
  const full: ReviewContext = { ...ctx, pack };
  const built = await buildReviewPrompt(reviewer, full, deps);
  const complete = deps.complete || judgeFor(deps);
  const purpose = `review-analyse:${pack.milestoneId}:R${pack.round}:${reviewer}`;
  const agentId = castAgentId(ctx.cast, reviewer); // TASK-29
  const textOnly = isTechnicalReview(full) && built.imageParts === 0; // TASK-29: hakuna picha → Gemini si lazima (T4 Koyeb: 429 ya Gemini iliua analysis)
  deps.log?.("info", `🔎 ${agentOf(reviewer, ctx.cast).name} (${reviewer}) ${pack.milestoneId} R${pack.round}: prompt ${built.text.length} chars · parts: text ${built.textParts} + image ${built.imageParts}${built.imageIds.length ? ` (${built.imageIds.join(", ")})` : ""} · hash ${built.hash.slice(0, 12)}`);
  let messages = built.messages;
  let raw = "", errors: string[] = ["not run"], findings: Findings | null = null, attempts = 0;
  let lane = "", model = "", tier = "", usage: CompleteResult["usage"] = null, llmFails = 0, visionDegraded = false;
  for (let i = 0; i <= REVIEW_MAX_RETRIES; i++) {
    attempts++;
    let r: Awaited<ReturnType<typeof complete>>;
    try {
      r = await complete({ reviewer, messages, purpose, agentId, textOnly });
    } catch (e: any) {
      // lanes zimekwisha / provider down → reviewer huyu hana findings (raundi haianguki; harness inaamua)
      errors = [`LLM call failed: ${String(e?.message || e).slice(0, 300)}`];
      deps.log?.("error", `🔎 ${reviewer} attempt ${attempts}: ${errors[0]}`);
      // TASK-29 (Koyeb T4: 429 za Gemini kwa wote wawili ndani ya 1s) — subiri kisha jaribu tena; broker inaepuka lanes zilizochoka
      // kosa la LLM halitumii nafasi za kurekebisha JSON (Koyeb T4: Megatron alikosa jaribio la 3 la JSON) — kikomo chake ni tofauti
      if (++llmFails > REVIEW_MAX_RETRIES) break;
      i--;
      const wait = deps.retryWaitMs ?? 45_000;
      deps.log?.("warning", `🔎 ${reviewer}: LLM imeshindwa — jaribio jingine baada ya ${Math.round(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    raw = r.text; usage = r.usage ?? null; visionDegraded = !!r.visionDegraded;
    lane = r.lane?.id || lane; model = r.lane?.model || model; tier = r.lane?.tier || tier;
    let parsed: unknown;
    try { parsed = extractJson(raw); } catch (e: any) { errors = [`invalid JSON: ${String(e?.message || e).slice(0, 200)}`]; parsed = undefined; }
    if (parsed !== undefined) {
      const v = validateFindings(parsed, reviewer, pack, ctx.cast);
      if (v.ok) { findings = v.value; errors = []; break; }
      errors = v.errors;
    }
    deps.log?.("warning", `🔎 ${reviewer} attempt ${attempts}: ${errors.length} error(s) — ${errors.slice(0, 3).join("; ").slice(0, 300)}`);
    if (i === REVIEW_MAX_RETRIES) break;
    messages = [
      ...built.messages,
      { role: "assistant", content: cap(raw, 60_000) },
      { role: "user", content: `Your JSON is not valid. Fix EVERY error below and reply with the complete corrected JSON object only:\n${errors.slice(0, 40).map((x) => `- ${x}`).join("\n")}` },
    ] as unknown as Msg[];
  }
  const meta: ReviewMeta = {
    reviewer, promptHash: built.hash, promptChars: built.text.length, imageParts: built.imageParts, textParts: built.textParts,
    attempts, errors, lane, model, tier, ms: Date.now() - t0, usage, ...(visionDegraded ? { visionDegraded: true } : {}),
  };
  deps.log?.(findings ? "success" : "error", `🔎 ${reviewer}: ${findings ? `defects ${findings.defects.length} · proposals ${findings.proposals.length}` : `INVALID after ${attempts} attempt(s)`} · ${model || "?"} · ${Math.round(meta.ms / 1000)}s`);
  return { findings, valid: !!findings, meta, promptText: built.text, raw };
}

/** Vipande (≥ minLen) vya jibu A vilivyomo ndani ya prompt B. Vipande vilivyonakiliwa kutoka context ya PAMOJA
 *  (vipo pia kwenye prompt ya A yenyewe — mf. mistari ya DOM) si uvujaji → vinarukwa. Tupu = huru. */
export function leakedFragments(output: string, otherPrompt: string, ownPrompt = "", minLen = 60, step = 30): string[] {
  const norm = (x: string) => String(x || "").replace(/\s+/g, " ");
  const out = norm(output), p = norm(otherPrompt), own = norm(ownPrompt);
  const hits: string[] = [];
  for (let i = 0; i + minLen <= out.length; i += step) {
    const frag = out.slice(i, i + minLen);
    if (p.includes(frag) && !own.includes(frag)) hits.push(frag);
  }
  return hits;
}

export interface Round0Review {
  designer: ReviewRun;
  frontend: ReviewRun;
  independence: { hashesDiffer: boolean; designerLeakIntoFrontend: string[]; frontendLeakIntoDesigner: string[]; ok: boolean };
}

/** maelezo23 #5 — wote wawili SAMBAMBA, prompts tofauti; uthibitisho: hash tofauti na hakuna jibu la mmoja ndani ya prompt ya mwingine. */
export async function reviewRound0(pack: EvidencePack, ctx: Omit<ReviewContext, "pack">, deps: ReviewDeps = {}): Promise<Round0Review> {
  const [designer, frontend] = await Promise.all(REVIEWERS.map((r) => analyse(r, pack, ctx, deps)));
  const dl = leakedFragments(designer.raw, frontend.promptText, designer.promptText);
  const fl = leakedFragments(frontend.raw, designer.promptText, frontend.promptText);
  const independence = { hashesDiffer: designer.meta.promptHash !== frontend.meta.promptHash, designerLeakIntoFrontend: dl, frontendLeakIntoDesigner: fl, ok: false };
  independence.ok = independence.hashesDiffer && !dl.length && !fl.length;
  if (!independence.ok) deps.log?.("error", `🔎 independence FAILED: hashesDiffer=${independence.hashesDiffer} leaks ${dl.length}/${fl.length}`);
  return { designer, frontend, independence };
}
