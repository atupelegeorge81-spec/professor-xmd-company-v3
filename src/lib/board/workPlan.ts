// src/lib/board/workPlan.ts — R30: MPANGO KAZI WA AGENT (plan mode).
//
// Board ya plan mode: mjadala + maamuzi (LOCKED) vinaendelea kama ilivyo, ila HAKUNA awamu ya kuandika
// code nzima (sample code ndogo tu). Mwisho wa Board, Optimus anaandika MPANGO KAZI WA AGENT kwa Kiingereza —
// hatua 8-15 (coarse) zenye muundo uniform — unaosomwa na computer-use agent kupitia /api/plans.
//
// Moduli hii ni PURE (hakuna I/O) → inajaribiwa na unit tests moja kwa moja.
// Sehemu 2 (Official Data) na 3 (Constraints) za plan zinajengwa na CODE kutoka Fact Sheet (neno kwa neno),
// si na LLM — kanuni ya R26 "backend-is-truth" inaendelea.

import type { FactSheet } from "./factSheet";

/* ================= constants ================= */

/** Coarse (amri ya Mkuu): kila hatua ni kazi kubwa yenye verification yake. */
export const PLAN_STEPS_MIN = 8;
export const PLAN_STEPS_MAX = 15;
/** Sample code ya kurejelea kwenye plan (snippet ya hoja, si faili kamili). */
export const SAMPLE_CODE_MAX_LINES = 40;

/** Sehemu 8 za Mpango Kazi (namba, kitambulisho cha kichwa, jina) — chanzo kimoja (engine + UI + ukaguzi). */
export const PLAN_SECTION_DEFS: [number, RegExp, string][] = [
  [1, /objective/i, "Objective & Deliverable"],
  [2, /official data/i, "Official Data"],
  [3, /constraints/i, "Constraints"],
  [4, /tech stack|design tokens/i, "Tech Stack & Design Tokens"],
  [5, /file structure/i, "File Structure"],
  [6, /work steps/i, "Work Steps"],
  [7, /qa checklist/i, "QA Checklist"],
  [8, /agent rules/i, "Agent Rules"],
];

export const PLAN_PARTS: { part: 1 | 2; label: string; nums: number[] }[] = [
  { part: 1, label: "1/2 (1-4)", nums: [1, 2, 3, 4] },
  { part: 2, label: "2/2 (5-8)", nums: [5, 6, 7, 8] },
];

/* ================= chips (engine → adapter; adapter ZIMEMEZWA — hazionekani kama chip za UI) ================= */

/** mf. "📋 Optimus anaandika Mpango Kazi — Kipande 1/2 (1-4)" — adapter inaifungua kuwa card ya plan (kama ripoti). */
export const planPartChip = (part: 1 | 2) => {
  const p = PLAN_PARTS.find((x) => x.part === part)!;
  return `📋 Optimus anaandika Mpango Kazi — Kipande ${p.label}`;
};
export const PLAN_PART_RE = /^📋 Optimus anaandika Mpango Kazi — Kipande (\d)\/2 \((\d+)-(\d+)\)/;
export const PLAN_SAVED_CHIP = "📋 Mpango Kazi wa Agent umehifadhiwa";
export const PLAN_SAVED_RE = /^📋 Mpango Kazi wa Agent umehifadhiwa(?: \(hatua (\d+)\))?/;
export const PLAN_FAILED_RE = /^❌ Mpango Kazi/;
export const PLAN_REPAIR_RE = /^📋 Optimus anarekebisha Mpango Kazi/;
/** chip yoyote ya finale ya plan (inaanza kipande kipya kwenye scanFinale) */
export const FINALE_PLAN_CHIP = /^\s*📋 Optimus anaandika Mpango Kazi|^\s*📋 Optimus anarekebisha Mpango Kazi/u;

/* ================= parsing ================= */

/** "## N. Kichwa" → maudhui ya kila sehemu ya plan (kanuni ileile ya extractSections ya ripoti). */
export function extractPlanSections(md: string): Record<number, string> {
  const out: Record<number, string> = {};
  let cur = 0;
  let buf: string[] = [];
  const flush = () => {
    if (cur) {
      const txt = buf.join("\n").trim();
      if (txt && (!out[cur] || txt.length > out[cur].length)) out[cur] = txt;
    }
    buf = [];
  };
  const norm = String(md || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "");
  for (const line of norm.split("\n")) {
    const m = line.match(/^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(\d{1,2})(?!\.\d)[.)]?(?!\d)\s*(?:\*\*)?\s*(.*)$/);
    let hit = 0;
    if (m) {
      const n = parseInt(m[1], 10);
      const def = PLAN_SECTION_DEFS.find((d) => d[0] === n);
      if (def && def[1].test(m[2] || "")) hit = n;
    }
    if (hit) { flush(); cur = hit; } else if (cur) buf.push(line);
  }
  flush();
  return out;
}

export interface PlanStep { n: number; title: string }

/** "### Step N — Title" (ndani ya sehemu ya 6). */
export function parsePlanSteps(md: string): PlanStep[] {
  const out: PlanStep[] = [];
  const seen = new Set<number>();
  for (const m of String(md || "").matchAll(/^###\s*Step\s+(\d+)\s*[—–-]+\s*(.+)$/gm)) {
    const n = Number(m[1]);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push({ n, title: m[2].trim().slice(0, 160) });
  }
  return out;
}

export const countPlanSteps = (md: string): number => parsePlanSteps(md).length;

/** Mwili wa hatua N (kutoka "### Step N" hadi hatua/kipengele kinachofuata) — kwa API ya step moja. */
export function planStepBody(md: string, n: number): string {
  const re = new RegExp(`^###\\s*Step\\s+${n}\\s*[—–-]+[^\\n]*\\n`, "m");
  const at = String(md || "").search(re);
  if (at < 0) return "";
  const rest = md.slice(at).replace(re, "");
  const next = rest.search(/^###\s*Step\s+\d+\s*[—–-]|^##\s/m);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

/** Sample code ya plan imepunguzwa hadi mistari SAMPLE_CODE_MAX_LINES (plan mode: snippet, si faili kamili). */
export function capSampleCode(code: string, maxLines = SAMPLE_CODE_MAX_LINES): { text: string; capped: boolean } {
  const lines = String(code || "").split("\n");
  if (lines.length <= maxLines) return { text: code, capped: false };
  return {
    text: `${lines.slice(0, maxLines).join("\n")}\n… (imepunguzwa — plan mode: snippet ya rejea tu, si script kamili)`,
    capped: true,
  };
}

/* ================= sehemu za CODE (deterministic — si LLM) ================= */

function factLines(f: FactSheet): string[] {
  const L: string[] = [];
  if (f.name) L.push(`- Business name: ${f.name}`);
  if (f.address) L.push(`- Address: ${f.address}`);
  return L;
}

/** §2 Official Data — kutoka Fact Sheet, NENO KWA NENO (LLM haiandiki sehemu hii kamwe). */
export function officialDataMarkdown(f: FactSheet | null | undefined): string {
  if (!f) return "_No official data was provided in the brief._";
  const L: string[] = [];
  L.push(...factLines(f));
  if (f.hours?.length) {
    L.push("- Opening hours (verbatim):");
    for (const h of f.hours) L.push(`  - ${h.days}: ${h.time}`);
  }
  if (f.closed?.length) L.push(`- Closed days (verbatim — NEVER show times for these): ${f.closed.join("; ")}`);
  if (f.services?.length) {
    L.push(`- Services & prices${f.currency ? ` (${f.currency})` : ""} (verbatim — copy, never reformat or invent):`);
    for (const s of f.services) L.push(`  - ${s.name} — ${s.price}`);
  }
  if (f.phone) L.push(`- Phone/WhatsApp: ${f.phone.value}${f.phone.placeholder ? " (PLACEHOLDER from the brief — replace only when the CEO provides the real number)" : ""}${f.phone.file ? ` — from \`${f.phone.file}\`` : ""}`);
  if (f.email) L.push(f.email.forbidden ? "- Email: NONE (the brief forbids any email address)" : `- Email: ${f.email.value}`);
  if (f.rules?.length) {
    L.push("- Mandatory sentences (verbatim — must appear exactly as written):");
    for (const r of f.rules) L.push(`  - ${r}`);
  }
  L.push("");
  L.push("> This table is generated by the system from the brief. It is the ONLY source of truth for prices, hours, phone, email and address.");
  return L.join("\n");
}

/** §3 Constraints — MASHARTI ya brief, neno kwa neno. */
export function constraintsMarkdown(f: FactSheet | null | undefined): string {
  if (!f || !f.constraints?.length) return "_No constraints were provided in the brief._";
  const L: string[] = f.constraints.map((c) => `- ${c}`);
  L.push("");
  L.push("> Generated by the system from the brief (verbatim). Every step MUST respect all of these.");
  return L.join("\n");
}

/* ================= assembly (deterministic) ================= */

export interface PlanAssembleResult {
  markdown: string;
  steps: PlanStep[];
  sections: Record<number, string>;
  /** matatizo yaliyogunduliwa (hatua nje ya kikomo, sehemu zilizokosekana) — kwa logs, si kwa kuzuia */
  problems: string[];
}

/**
 * Inaunganisha vipande vya LLM kuwa hati MOJA ya plan:
 *  · sehemu 2 na 3 zinabadilishwa na toleo la CODE kutoka Fact Sheet (hakuna kuhusiana na LLM);
 *  · hatua zinapewa namba mfululizo 1..N (deterministic);
 *  · kichwa kina session + tarehe + mode.
 */
export function assemblePlanDocument(o: { partTexts: string[]; title: string; sessionId: string; date: string; facts?: FactSheet | null }): PlanAssembleResult {
  const collected: Record<number, string> = {};
  const ingest = (md: string) => {
    const sec = extractPlanSections(md);
    for (const [k, v] of Object.entries(sec)) {
      const n = Number(k);
      if (!collected[n] || sec[n].length > collected[n].length) collected[n] = v;
    }
  };
  for (const t of o.partTexts || []) ingest(String(t || ""));

  const problems: string[] = [];
  // sehemu 2/3 = CODE tu (kanuni ya R26: LLM haiamui thamani)
  collected[2] = officialDataMarkdown(o.facts);
  collected[3] = constraintsMarkdown(o.facts);

  // hatua: namba mfululizo + kikomo
  let steps: PlanStep[] = [];
  if (collected[6]) {
    const parsed = parsePlanSteps(collected[6]);
    if (!parsed.length) problems.push("sehemu ya 6 haina '### Step N — Title' hata moja");
    let body = collected[6];
    let i = 0;
    body = body.replace(/^###\s*Step\s+\d+\s*[—–-]+\s*(.+)$/gm, (full, title) => {
      i += 1;
      return `### Step ${i} — ${String(title).replace(/\s+$/, "")}`;
    });
    steps = parsePlanSteps(body);
    collected[6] = `${body}\n\n**TOTAL STEPS: ${steps.length}**`;
    if (steps.length && steps.length < PLAN_STEPS_MIN) problems.push(`hatua ${steps.length} < ndogo ya ${PLAN_STEPS_MIN}`);
    if (steps.length > PLAN_STEPS_MAX) problems.push(`hatua ${steps.length} > kubwa ya ${PLAN_STEPS_MAX}`);
  } else {
    problems.push("sehemu ya 6 (Work Steps) haipo");
  }

  for (const d of PLAN_SECTION_DEFS) if (!collected[d[0]]) problems.push(`sehemu ${d[0]} (${d[2]}) haipo`);

  const L: string[] = [
    `# AGENT WORK PLAN — ${o.title}`,
    "",
    `> Generated by PROFESSOR-XMD Board · Session \`${o.sessionId}\` · ${o.date} · Mode: PLAN (decisions LOCKED; the code will be written by the computer-use agent, step by step)`,
    "",
  ];
  for (const d of PLAN_SECTION_DEFS) if (collected[d[0]]) L.push(`## ${d[0]}. ${d[2]}`, "", collected[d[0]].trim(), "");
  return { markdown: L.join("\n").trim(), steps, sections: collected, problems };
}

/** Muundo wa HATUA uniform (kwa prompt ya Optimus — anaruhusiwa kuandika hii pekee). */
export const PLAN_STEP_TEMPLATE = `### Step <N> — <imperative title, e.g. "Create the data files from Official Data">
- **Goal:** <what this step builds, 1-2 sentences>
- **Source:** Agenda <n> mini-report (authoritative)
- **Files:** <paths this step creates or touches>
- **Instructions:** <numbered, concrete, imperative instructions>
- **Official Data (verbatim):** <ONLY the values this step needs, copied word for word from section 2 — or "none">
- **Sample Code (reference only):** <short snippet from the debate, ≤ 40 lines — or omit>
- **Verification:** <what must be TRUE for this step to count as done>
- **Depends on:** <step numbers, or "none">`;
