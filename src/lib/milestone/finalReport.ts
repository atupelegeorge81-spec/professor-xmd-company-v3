// TASK-31 (maelezo31) — Ripoti ya mwisho ya Optimus kwa CEO (milestone mode), ya kweli na yenye ushahidi.
// Data inakusanywa na CODE (store ya milestones + Ledger + mini-reports + links), si kumbukumbu ya LLM.
// Verdict inatolewa na CODE (honesty rule): "COMPLETED" TU milestones ZOTE zikiwa signed off NA post-deploy checks zimepita;
// vinginevyo `CAP_REACHED in Mk` au `PARTIAL — see open defects`, na maneno ya "complete/imekamilika" yanaondolewa kwenye maandishi.
// Sehemu 2, 4, 5, 6 = code (jedwali/orodha); 1, 3, 7 = Optimus (report skill) kutoka data hii hii. Hakuna sehemu ya plan.
import type { Defect, EvidenceCheckResult, EvidencePack, LaneUse, Milestone, MilestoneMap, MilestoneState, MilestoneStatus, WaiverEntry } from "./types";
import type { FinalReportRow } from "./signoff";
import { maskSecrets } from "./techEvidence";

export const FINAL_REPORT_DOC_KEY = "finalReportDoc";
export const SIGNED: readonly MilestoneStatus[] = ["SIGNED_OFF", "SIGNED_OFF_WITH_WAIVERS"];
export const FINAL_SECTIONS: readonly [number, string, "code" | "llm"][] = [
  [1, "Matokeo dhidi ya brief ya CEO (kilichojengwa · kisichojengwa · kilichobadilika na kwa nini)", "llm"],
  [2, "Milestones — status na raundi", "code"],
  [3, "Maamuzi muhimu ya Board na proposals za review zilizokubaliwa", "llm"],
  [4, "Defects wazi / zilizorithiwa na waivers (pamoja na sababu)", "code"],
  [5, "Ushahidi — screenshots, matokeo ya checks, ukaguzi wa live URL", "code"],
  [6, "Usalama na maelezo ya kiufundi", "code"],
  [7, "Jinsi ya kuendesha / kujaribu, hatari, na hatua zinazopendekezwa", "llm"],
];

export interface PostDeployResult {
  liveUrl: string;
  ran: boolean;
  ok: boolean;
  reason: string;
  routes: { route: string; status: number; ok: boolean }[];
  checks: EvidenceCheckResult[];
  screens: { count: number; errors: number; exit: number; urls: string[] } | null;
  at: string;
}

export interface FinalMilestone {
  id: string; title: string; phase: string; reviewMode: string;
  status: MilestoneStatus | "NOT_STARTED"; round: number; maxRounds: number;
  tag?: string; sha?: string; clean: boolean; closed: number;
  acceptedProposals: { id: string; title: string }[];
  build: { found: boolean; ok: boolean; chars: number; summary: string; commands: number } | null;
  evidenceRound: number | null;
  screenshots: { id: string; route: string; viewport: string; url: string }[];
  checks: { pass: number; fail: number; error: number; failed: { id: string; detail: string }[] };
  technical: { secrets: number; secretFiles: string[]; checks: EvidenceCheckResult[] } | null;
}
export interface FinalReportData {
  sessionId: string; title: string; project: string;
  milestones: FinalMilestone[];
  defects: { open: Defect[]; inherited: Defect[]; waived: (Defect & { reason: string; approvedBy: string[] })[] };
  ledger: { agenda_index: number; agenda_item: string; status: string; summary: string }[];
  minis: { agenda_index: number; summary: string }[];
  links: { repo?: string; live?: string };
  lanes: { calls: number; byClass: Record<string, number>; visionDegraded: number; fallback: number };
  postDeploy: PostDeployResult | null;
}

export interface GatherDeps {
  get: <T>(key: string) => Promise<T | null>;
  sessionId: string; title: string; project: string;
  ledger: { agenda_index: number; agenda_item: string; status: string; decision_summary?: string }[];
  minis: { agenda_index: number; summary: string }[];
  links: { repo?: string; live?: string };
  postDeploy: PostDeployResult | null;
}

const OPEN = new Set(["OPEN", "IN_FIX", "REOPENED"]);
const cut = (s: unknown, n: number) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

/** Data yote ya ripoti kutoka store ya milestones (code — si LLM). */
export async function gatherFinalReportData(d: GatherDeps): Promise<FinalReportData> {
  const map = await d.get<MilestoneMap>("map");
  const rows = (await d.get<{ milestones?: FinalReportRow[] }>("finalReport"))?.milestones || [];
  const defects = (await d.get<{ defects?: Defect[] }>("defects"))?.defects || [];
  const decisions = (await d.get<{ decisions?: { id: string; milestoneId?: string; proposalId?: string; title?: string; source?: string; acceptedProposals?: { id: string; title: string }[] }[] }>("decisions"))?.decisions || [];
  const lanes: LaneUse[] = [];
  const waivers: WaiverEntry[] = [];
  const out: FinalMilestone[] = [];
  for (const m of (map?.milestones || []) as Milestone[]) {
    const st = await d.get<MilestoneState>(`state:${m.id}`);
    const row = rows.find((r) => r.milestoneId === m.id);
    lanes.push(...(st?.lanesUsed || []));
    waivers.push(...((await d.get<{ waivers?: WaiverEntry[] }>(`waivers:${m.id}`))?.waivers || st?.waivers || []));
    const round = st?.round ?? 0;
    let ev: (EvidencePack & { exit?: number }) | null = null;
    let evRound: number | null = null;
    for (let r = round; r >= 0 && !ev; r--) { ev = await d.get<EvidencePack>(`evidence:${m.id}:R${r}`); if (ev) evRound = r; }
    let checks: EvidenceCheckResult[] = [];
    for (let r = round; r >= 1 && !checks.length; r--) checks = (await d.get<{ results?: EvidenceCheckResult[] }>(`checks:${m.id}:R${r}`))?.results || [];
    if (!checks.length) checks = ev?.checks || [];
    const rep = await d.get<{ found?: boolean; ok?: boolean; chars?: number; markdown?: string; commands?: unknown[] }>(`report:${m.id}`);
    const tech = m.reviewMode === "visual" ? [] : (ev?.checks || []).filter((c) => /^(tech|plan)\//.test(c.id));
    const fromLedger = decisions.filter((x) => x.milestoneId === m.id && x.proposalId && !x.source).map((x) => ({ id: x.id, title: String(x.title || "") }));
    out.push({
      id: m.id, title: m.title, phase: m.phase, reviewMode: m.reviewMode,
      status: st?.status || "NOT_STARTED", round, maxRounds: st?.maxRounds ?? 10,
      tag: row?.tag, sha: decisions.find((x) => x.id === `MS-${m.id}`) ? (decisions.find((x) => x.id === `MS-${m.id}`) as { sha?: string }).sha : undefined,
      clean: !!row?.clean, closed: row?.closed ?? 0,
      acceptedProposals: fromLedger.length ? fromLedger : ((decisions.find((x) => x.id === `MS-${m.id}`)?.acceptedProposals) || []),
      build: rep ? { found: !!rep.found, ok: !!rep.ok, chars: rep.chars || 0, summary: cut((rep.markdown || "").split(/\n## 2/)[0].replace(/^#.*$/m, ""), 600), commands: (rep.commands || []).length } : null,
      evidenceRound: evRound,
      screenshots: (ev?.screenshots || []).filter((s) => s.url).slice(0, 12).map((s) => ({ id: s.id, route: s.route, viewport: s.viewport, url: s.url })),
      checks: {
        pass: checks.filter((c) => c.result === "PASS").length, fail: checks.filter((c) => c.result === "FAIL").length, error: checks.filter((c) => c.result === "ERROR").length,
        failed: checks.filter((c) => c.result !== "PASS").slice(0, 10).map((c) => ({ id: c.id, detail: cut(c.detail, 200) })),
      },
      technical: m.reviewMode === "visual" ? null : { secrets: ev?.technical?.secrets ?? 0, secretFiles: ev?.technical?.secretFiles || [], checks: tech },
    });
  }
  const byClass: Record<string, number> = {};
  for (const l of lanes) { const k = l.laneClass || String(l.lane || "?").split(/[-:]/)[0]; byClass[k] = (byClass[k] || 0) + 1; }
  const wv = new Map(waivers.map((w) => [w.defectId, w]));
  return {
    sessionId: d.sessionId, title: d.title, project: d.project, milestones: out,
    defects: {
      open: defects.filter((x) => OPEN.has(x.status)),
      inherited: defects.filter((x) => x.status === "INHERITED"),
      waived: defects.filter((x) => x.status === "WAIVED").map((x) => ({ ...x, reason: wv.get(x.id)?.reason || "", approvedBy: wv.get(x.id)?.approvedBy || [] })),
    },
    ledger: d.ledger.map((e) => ({ agenda_index: e.agenda_index, agenda_item: e.agenda_item, status: e.status, summary: cut(e.decision_summary, 400) })),
    minis: d.minis.map((x) => ({ agenda_index: x.agenda_index, summary: cut(x.summary, 700) })),
    links: d.links,
    lanes: { calls: lanes.length, byClass, visionDegraded: lanes.filter((l) => l.visionDegraded).length, fallback: lanes.filter((l) => l.usedFallback ?? l.fallback).length },
    postDeploy: d.postDeploy,
  };
}

/* ───────────────────────────── honesty rule (code) ───────────────────────────── */

export interface Verdict { complete: boolean; line: string; why: string[] }
export function verdictOf(d: Pick<FinalReportData, "milestones" | "postDeploy" | "defects">): Verdict {
  const ms = d.milestones;
  const cap = ms.filter((m) => m.status === "CAP_REACHED").map((m) => m.id);
  const notSigned = ms.filter((m) => !SIGNED.includes(m.status as MilestoneStatus)).map((m) => `${m.id} ${m.status}`);
  const why: string[] = [];
  if (!ms.length) why.push("no milestones in the map");
  if (notSigned.length) why.push(`not signed off: ${notSigned.join(", ")}`);
  if (!d.postDeploy) why.push("post-deploy checks did not run (no live URL)");
  else if (!d.postDeploy.ok) why.push(`post-deploy checks FAILED: ${d.postDeploy.reason}`);
  if (d.defects.inherited.length) why.push(`inherited defects: ${d.defects.inherited.map((x) => x.id).join(", ")}`);
  const complete = !why.length;
  const line = complete
    ? `COMPLETED — milestones ${ms.length}/${ms.length} signed off · post-deploy checks PASS`
    : cap.length ? `CAP_REACHED in ${cap.join(", ")}` : "PARTIAL — see open defects";
  return { complete, line, why };
}

/** Maneno ya "imekamilika" yanaruhusiwa kama verdict TU (milestones zote signed off + post-deploy PASS). */
export const COMPLETE_WORDS = /\b(complete[ds]?|completely|completion|[a-z]*kamilika|[a-z]*kamilishwa)\b/gi;
export function enforceHonesty(text: string, complete: boolean): string {
  return complete ? text : text.replace(COMPLETE_WORDS, "[PARTIAL]");
}

/* ───────────────────────────── sehemu za code ───────────────────────────── */

const yes = (b: boolean) => (b ? "✅" : "❌");
export function codeSection(n: number, d: FinalReportData): string {
  const L: string[] = [];
  if (n === 2) {
    L.push("| Milestone | Phase · review | Status | Raundi (zilizotumika / max) | Tag | Defects zilizofungwa |", "|---|---|---|---|---|---|");
    for (const m of d.milestones) L.push(`| ${m.id} ${cut(m.title, 60)} | ${m.phase} · ${m.reviewMode} | **${m.status}**${m.clean ? " (clean)" : ""} | ${m.round} / ${m.maxRounds} | ${m.tag ? `\`${m.tag}\`${m.sha ? ` @ ${m.sha.slice(0, 7)}` : ""}` : "—"} | ${m.closed} |`);
    L.push("", `Lanes (judge/review): wito ${d.lanes.calls} · ${Object.entries(d.lanes.byClass).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"} · visionDegraded ${d.lanes.visionDegraded} · fallback ${d.lanes.fallback}`);
    for (const m of d.milestones.filter((x) => x.build)) L.push(`- Build Report ${m.id}: ${m.build!.found ? "ipo" : "HAIPO"} · muundo ${m.build!.ok ? "sahihi" : "una makosa"} · amri ${m.build!.commands} · herufi ${m.build!.chars}`);
  } else if (n === 4) {
    const { open, inherited, waived } = d.defects;
    if (!open.length && !inherited.length && !waived.length) L.push("Hakuna defect iliyo wazi, iliyorithiwa wala iliyosamehewa (waiver).");
    if (open.length) { L.push("**Wazi (OPEN / REOPENED / IN_FIX):**"); for (const x of open) L.push(`- ${x.id} [${x.severity}] (${x.milestoneId}) ${cut(x.title, 140)} — attempts ${x.attempts}`); }
    if (inherited.length) {
      L.push("**Zilizorithiwa (INHERITED — milestone ilifika kikomo cha raundi):**");
      for (const x of inherited) { const h = x.history?.[x.history.length - 1]; L.push(`- ${x.id} [${x.severity}] kutoka ${x.inheritedFrom || x.milestoneId}: ${cut(x.title, 140)} — sababu: ${cut(h?.cause || h?.result || `bado haijapita baada ya attempts ${x.attempts}`, 200)}`); }
    }
    if (waived.length) { L.push("**Waivers (WAIVED):**"); for (const x of waived) L.push(`- ${x.id} [${x.severity}] (${x.milestoneId}) ${cut(x.title, 140)} — sababu: ${cut(x.reason || "(sababu haikuandikwa)", 300)}${x.approvedBy.length ? ` · approved by ${x.approvedBy.join(", ")}` : ""}`); }
  } else if (n === 5) {
    for (const m of d.milestones) {
      L.push(`**${m.id}** — checks za mwisho: PASS ${m.checks.pass} · FAIL ${m.checks.fail} · ERROR ${m.checks.error}${m.evidenceRound !== null ? ` · evidence R${m.evidenceRound}` : ""}`);
      for (const f of m.checks.failed) L.push(`  - ${f.id}: ${f.detail}`);
      for (const s of m.screenshots) L.push(`  - 📸 ${s.id} \`${s.route}\` ${s.viewport}: ${s.url}`);
    }
    L.push("", `Repo: ${d.links.repo || "(haikutolewa)"} · Live URL: ${d.links.live || d.postDeploy?.liveUrl || "(haikutolewa)"}`);
    const p = d.postDeploy;
    if (!p) L.push("Post-deploy checks: HAZIKUENDESHWA — hakuna live URL.");
    else {
      L.push(`Post-deploy checks (${p.liveUrl}): ${yes(p.ok)} ${p.ok ? "PASS" : `FAIL — ${p.reason}`}`);
      for (const r of p.routes) L.push(`  - GET ${r.route} → HTTP ${r.status} ${yes(r.ok)}`);
      for (const c of p.checks) L.push(`  - ${c.id} (${c.type}) ${c.result}${c.result === "PASS" ? "" : ` — ${cut(c.detail, 160)}`}`);
      if (p.screens) { L.push(`  - screenshots za live: ${p.screens.count} · errors ${p.screens.errors} · exit ${p.screens.exit}`); for (const u of p.screens.urls.slice(0, 6)) L.push(`    - ${u}`); }
    }
  } else if (n === 6) {
    const tm = d.milestones.filter((m) => m.technical);
    if (!tm.length) L.push("Hakuna milestone ya technical/mixed — ukaguzi wa usalama wa code (secrets scan, amri za plan) haukuwa sehemu ya review.");
    for (const m of tm) {
      const t = m.technical!;
      L.push(`**${m.id} (${m.reviewMode})** — secrets: ${t.secrets}${t.secretFiles.length ? ` (${t.secretFiles.join(", ")})` : ""} · technical checks ${t.checks.length}`);
      for (const c of t.checks.slice(0, 12)) L.push(`  - ${c.id} ${c.result}${c.result === "PASS" ? "" : ` — ${cut(c.detail, 160)}`}`);
    }
  }
  return L.join("\n");
}

/* ───────────────────────────── maandishi ya Optimus (1, 3, 7) ───────────────────────────── */

export function narrativePrompt(d: FinalReportData, v: Verdict): string {
  const ms = d.milestones.map((m) => `- ${m.id} "${m.title}" (${m.phase}, ${m.reviewMode}): ${m.status}, rounds ${m.round}/${m.maxRounds}${m.build?.summary ? ` · Build Report: ${m.build.summary}` : ""}${m.acceptedProposals.length ? ` · accepted proposals: ${m.acceptedProposals.map((p) => `${p.id} ${p.title}`).join("; ")}` : ""}`).join("\n");
  const dl = [...d.defects.open.map((x) => `${x.id} OPEN ${x.title}`), ...d.defects.inherited.map((x) => `${x.id} INHERITED ${x.title}`), ...d.defects.waived.map((x) => `${x.id} WAIVED ${x.title} — ${x.reason}`)].join("\n") || "(none)";
  return [
    `PROJECT (CEO brief): ${cut(d.project, 1500)}`,
    `VERDICT (code — copy as is, do not soften or upgrade): ${v.line}${v.why.length ? ` · ${v.why.join(" · ")}` : ""}`,
    `LEDGER (locked Board decisions — source of truth):\n${d.ledger.map((e) => `[A${e.agenda_index}] ${e.agenda_item} (${e.status}): ${e.summary}`).join("\n") || "(empty)"}`,
    `MINI-REPORTS:\n${d.minis.map((x) => `[A${x.agenda_index}] ${x.summary}`).join("\n") || "(none)"}`,
    `MILESTONES:\n${ms}`,
    `DEFECTS:\n${dl}`,
    `LINKS: repo ${d.links.repo || "none"} · live ${d.links.live || d.postDeploy?.liveUrl || "none"} · post-deploy ${d.postDeploy ? (d.postDeploy.ok ? "PASS" : `FAIL (${d.postDeploy.reason})`) : "not run"}`,
    "",
    "=== FINAL REPORT (KISWAHILI) — andika sehemu HIZI TATU TU, kila moja na kichwa chake kamili: ===",
    "## 1. Matokeo dhidi ya brief ya CEO\n## 3. Maamuzi muhimu ya Board na proposals za review zilizokubaliwa\n## 7. Jinsi ya kuendesha / kujaribu, hatari, na hatua zinazopendekezwa",
    "SHERIA: kila fact itoke kwenye data hapo juu tu (usibuni namba, routes, faili wala URL). Sehemu 1: kilichojengwa / kisichojengwa / kilichobadilika na kwa nini (milestone kwa milestone).",
    "USIANDIKE plan, Mpango Kazi wala orodha ya hatua za utekelezaji — plans ziliandikwa kwa kila milestone. Usiandike verdict yako mwenyewe; code ndiyo inayotoa verdict.",
    v.complete ? "" : "Mradi HAUJAKAMILIKA kwa mujibu wa code: usitumie maneno 'complete', 'completed' wala 'imekamilika' kuelezea mradi.",
  ].filter(Boolean).join("\n\n");
}

/** Sehemu ## N. za maandishi ya LLM (vichwa vya ndani vinashushwa kuwa bold — hakuna sehemu mpya, hakuna plan). */
export function llmSections(md: string): Record<number, string> {
  const out: Record<number, string> = {};
  const text = String(md || "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  const parts = text.split(/^#{1,3}\s*(\d)\.\s*[^\n]*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const n = Number(parts[i]);
    if (![1, 3, 7].includes(n)) continue;
    const body = parts[i + 1].replace(/^#{1,6}\s+(.+)$/gm, "**$1**").trim();
    if (body && (!out[n] || body.length > out[n].length)) out[n] = body;
  }
  return out;
}

export interface FinalReportDoc { markdown: string; verdict: Verdict; missingLlm: number[] }
/** Ripoti nzima: kichwa + verdict ya code + sehemu 7 kwa mpangilio. Honesty + masking ya siri inatumika kwa maandishi yote. */
export function assembleFinalReport(d: FinalReportData, llmText: string): FinalReportDoc {
  const v = verdictOf(d);
  const llm = llmSections(llmText);
  const missingLlm = [1, 3, 7].filter((n) => !llm[n]);
  const body: string[] = [];
  for (const [n, title, src] of FINAL_SECTIONS) {
    let s = src === "code" ? codeSection(n, d) : llm[n] || `_(Optimus hakuandika sehemu hii — data ya code tu:)_\n${n === 1 ? d.milestones.map((m) => `- ${m.id} ${m.title}: ${m.status}`).join("\n") : n === 3 ? d.ledger.map((e) => `- [A${e.agenda_index}] ${e.agenda_item}: ${e.summary}`).join("\n") : "- angalia sehemu 4 na 5."}`;
    if (n === 3) {
      const acc = d.milestones.flatMap((m) => m.acceptedProposals.map((p) => `- ${m.id} · ${p.id} ${p.title}`));
      s += `\n\n**Proposals za review zilizokubaliwa (code):**\n${acc.length ? acc.join("\n") : "- hakuna"}`;
    }
    body.push(`## ${n}. ${title}`, "", s.trim(), "");
  }
  const honest = enforceHonesty(body.join("\n"), v.complete);
  const head = [`# Ripoti ya Mwisho kwa CEO: ${d.title}`, "", `**Verdict (code):** ${v.line}`, ...(v.why.length ? [`_Sababu (code):_ ${enforceHonesty(v.why.join(" · "), false)}`] : []), ""];
  return { markdown: maskSecrets(`${head.join("\n")}\n${honest}`.trim()), verdict: v, missingLlm };
}
