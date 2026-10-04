// src/lib/board/finale.ts — R20: FINISHING PASS ("Endeleza").
// Functions safi (hazigusi Appwrite, LLM wala Node APIs) — zinatumika na server (resume + sessionIndex) NA
// browser (BoardRoom inaonyesha kinachokosekana), na zinapimwa kwa unit tests.
//
// Finale ya Board = validator → script ya mwisho (Optimus) → ripoti (vipande 1-5 · 6-10, marekebisho) → kuhifadhi
// ripoti → memory ya agents. Mtandao ukikatika katikati (Mama Lishe, 27 Sep: kipande 2/2 hakikuandikwa, ripoti
// haikuhifadhiwa, memory haikuandikwa) → Endeleza inaandika KILICHOKOSEKANA tu:
//   • vipande vilivyokamilika (script yenye code kamili, kipande chenye sehemu zake zote) vinabaki — haviandikwi upya
//   • kipande nusu cha ripoti kinabaki, lakini sehemu yake ya MWISHO inahesabiwa haipo (huenda ilikatika katikati)
//   • kipande cha kwanza kisicholeta KITU (tupu / script isiyofungwa) na vyote vilivyofuata vinaondolewa

export interface FinaleItem {
  kind: string;
  id?: string;
  agentId?: string;
  content?: string;
  text?: string;
}

/** Sehemu 10 za ripoti ya Board (namba, kitambulisho cha kichwa, jina) — chanzo kimoja (boardRunner + UI). */
export const SECTION_DEFS: [number, RegExp, string][] = [
  [1, /muhtasari/i, "Muhtasari"], [2, /utafiti/i, "Utafiti"], [3, /mjadala/i, "Mjadala"],
  [4, /maamuzi/i, "Maamuzi"], [5, /rangi/i, "Rangi"], [6, /kurasa/i, "Kurasa & Menu"],
  [7, /safari ya mteja/i, "Safari ya Mteja"], [8, /tech stack/i, "Tech Stack"],
  [9, /hatari/i, "Hatari"], [10, /action plan/i, "Action Plan"],
];

/** "## N. Kichwa" → maudhui ya kila sehemu (kichwa kinatambuliwa kwa namba + neno lake). */
export function extractSections(md: string): Record<number, string> {
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
    const m = line.match(/^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(\d{1,2})(?!\.\d)[.)]?(?!\d)\s*(?:\*\*)?\s*(.*)$/); // R21: "### 6.1 …" ni kifungu, si kichwa kipya
    let hit = 0;
    if (m) {
      const n = parseInt(m[1], 10);
      const def = SECTION_DEFS.find((d) => d[0] === n);
      if (def && def[1].test(m[2] || "")) hit = n;
    }
    if (hit) { flush(); cur = hit; } else if (cur) buf.push(line);
  }
  flush();
  return out;
}

import { FINALE_PLAN_CHIP, extractPlanSections, PLAN_SECTION_DEFS } from "./workPlan";

const AGENDA_START = /^\s*(?:\p{Extended_Pictographic}\uFE0F?\s*)?Agenda (\d+)\/(\d+):/u;
const VALIDATOR = /^\s*(?:❌|🟠) Validator:/u;
const ASSEMBLY = /^\s*🧩 Optimus anaunganisha/u;
const PART = /^\s*📑 Optimus anaandika ripoti — Kipande (\d+)\/(\d+) \((\d+)-(\d+)\)/u;
const REPAIR = /^\s*🛠️ Optimus anarekebisha ripoti/u;
/** R30: kipande cha plan — "📋 Optimus anaandika Mpango Kazi — Kipande 1/2 (1-4)" */
const PLAN_PART = /^\s*📋 Optimus anaandika Mpango Kazi — Kipande (\d)\/2 \((\d+)-(\d+)\)/u;
/** chip yoyote ya finale (inaanza kipande kipya) */
export const FINALE_CHIP = /^\s*(?:(?:❌|🟠) Validator:|🧩 Optimus anaunganisha|📑 Optimus anaandika ripoti|🛠️ Optimus anarekebisha ripoti|📋 Optimus anaandika Mpango Kazi|📋 Optimus anarekebisha Mpango Kazi)/u;

const txt = (it: FinaleItem) => String(it.text || "");
const isMsg = (it: FinaleItem) => it.kind === "msg" && !!String(it.content || "").trim();

export interface FinaleScan<T> {
  /** finale ilikuwa imeanza (kuna chip ya finale baada ya agenda ya mwisho) */
  started: boolean;
  /** items baada ya kuondoa kipande kisichokamilika + vyote vilivyofuata */
  keep: T[];
  dropped: number;
  /** validator ilikwisha kuendeshwa (chip yake ipo) */
  validated: boolean;
  /** script ya mwisho: imekamilika (au ilionekana hakuna code) */
  scriptDone: boolean;
  script: string;
  /** R30: Mpango Kazi (plan mode) — sehemu zote 8 zipo (au haikuanza) */
  planDone: boolean;
  planSections: Record<number, string>;
  /** maandishi ghafi ya vipande vilivyobaki (wakati wa plan — kwa ingest ya boardRunner) */
  planTexts: string[];
  /** sehemu za ripoti kutoka vipande vilivyobaki */
  sections: Record<number, string>;
  /** maandishi ghafi ya vipande vilivyobaki (kwa ingest ya boardRunner) */
  reportTexts: string[];
}

export function scanFinale<T extends FinaleItem>(items: T[]): FinaleScan<T> {
  let lastAgenda = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === "chip" && AGENDA_START.test(txt(items[i]))) { lastAgenda = i; break; }
  }
  const empty: FinaleScan<T> = { started: false, keep: items, dropped: 0, validated: false, scriptDone: false, script: "", planDone: false, planSections: {}, planTexts: [], sections: {}, reportTexts: [] };
  const first = items.findIndex((it, i) => i > lastAgenda && it.kind === "chip" && FINALE_CHIP.test(txt(it)));
  if (first < 0) return empty;

  // vipande: [chip ya finale, …items mpaka chip ya finale inayofuata]
  const segs: { start: number; end: number }[] = [];
  for (let i = first; i < items.length; i++) {
    if (items[i].kind === "chip" && FINALE_CHIP.test(txt(items[i]))) {
      if (segs.length) segs[segs.length - 1].end = i;
      segs.push({ start: i, end: items.length });
    }
  }

  const out: FinaleScan<T> = { ...empty, started: true };
  let cut = -1;
  for (let s = 0; s < segs.length && cut < 0; s++) {
    const { start, end } = segs[s];
    const head = txt(items[start]);
    const body = items.slice(start + 1, end).filter(isMsg);
    const isLast = s === segs.length - 1;
    if (VALIDATOR.test(head)) { out.validated = true; continue; }
    if (ASSEMBLY.test(head)) {
      const joined = body.map((m) => String(m.content)).join("\n");
      const fences = (joined.match(/```/g) || []).length;
      if (fences > 0 && fences % 2 === 0) { out.scriptDone = true; out.script = joined; continue; }
      // hakuna ujumbe kabisa + finale iliendelea → ilionekana hakuna deliverable ya code
      if (!body.length && !isLast) { out.scriptDone = true; out.script = ""; continue; }
      cut = start;
      break;
    }
    // R30: kipande cha MPANGO KAZI (plan mode) — kanuni ileile ya ripoti (complete = sehemu zote za kipande zipo)
    const pl = head.match(PLAN_PART);
    if (pl) {
      const from = Number(pl[2]);
      const to = Number(pl[3]);
      const text = body.map((m) => String(m.content)).join("\n");
      const sec = extractPlanSections(text);
      const found = Object.keys(sec).map(Number).sort((a, b) => a - b);
      if (!found.length) { cut = start; break; }
      const complete = Array.from({ length: to - from + 1 }, (_, k) => from + k).every((n) => !!sec[n] || !!out.planSections[n]);
      if (!complete) delete sec[found[found.length - 1]];
      out.planTexts.push(complete ? text : Object.entries(sec).map(([k, v]) => `## ${k}. ${PLAN_SECTION_DEFS.find((d) => d[0] === +k)?.[2] || ""}\n${v}`).join("\n\n"));
      for (const [k, v] of Object.entries(sec)) if (!out.planSections[+k] || v.length > out.planSections[+k].length) out.planSections[+k] = v;
      continue;
    }
    // R30: marekebisho ya plan — sehemu zilizorekebishwa zinaingizwa (kanuni ya REPAIR ya ripoti)
    if (FINALE_PLAN_CHIP.test(head) && /anarekebisha/.test(head)) {
      const text = body.map((m) => String(m.content)).join("\n");
      const sec = extractPlanSections(text);
      if (!Object.keys(sec).length) { cut = start; break; }
      out.planTexts.push(text);
      for (const [k, v] of Object.entries(sec)) if (!out.planSections[+k] || v.length > out.planSections[+k].length) out.planSections[+k] = v;
      continue;
    }
    const pm = head.match(PART);
    if (pm) {
      const from = Number(pm[3]);
      const to = Number(pm[4]);
      const text = body.map((m) => String(m.content)).join("\n");
      const sec = extractSections(text);
      const found = Object.keys(sec).map(Number).sort((a, b) => a - b);
      if (!found.length) { cut = start; break; }
      // kamili = kila sehemu ya kipande ipo hapa AU kwenye vipande vya awali (Endeleza iliomba zilizokosekana tu)
      const complete = Array.from({ length: to - from + 1 }, (_, k) => from + k).every((n) => !!sec[n] || !!out.sections[n]);
      // kipande nusu: sehemu ya mwisho iliyopatikana huenda ilikatika katikati → haihesabiwi (itaandikwa upya)
      if (!complete) delete sec[found[found.length - 1]];
      out.reportTexts.push(complete ? text : Object.entries(sec).map(([k, v]) => `## ${k}. ${SECTION_DEFS.find((d) => d[0] === +k)?.[2] || ""}\n${v}`).join("\n\n"));
      for (const [k, v] of Object.entries(sec)) if (!out.sections[+k] || v.length > out.sections[+k].length) out.sections[+k] = v;
      continue;
    }
    if (REPAIR.test(head)) {
      const text = body.map((m) => String(m.content)).join("\n");
      const sec = extractSections(text);
      if (!Object.keys(sec).length) { cut = start; break; }
      out.reportTexts.push(text);
      for (const [k, v] of Object.entries(sec)) if (!out.sections[+k] || v.length > out.sections[+k].length) out.sections[+k] = v;
    }
  }
  if (cut >= 0) {
    out.keep = items.slice(0, cut);
    out.dropped = items.length - cut;
  }
  return out;
}

/** Hali ya finale inayohifadhiwa ndani ya resume state (R20). Sessions za zamani hazina — zinakisiwa. */
export interface FinaleState {
  reportId?: string | null;
  memory?: boolean;
  /** R30: doc id ya Mpango Kazi (project_plans) */
  planId?: string | null;
  /** R31: awamu ya XMD Computer imekamilika (ripoti ya agent imeingia) */
  computer?: boolean;
}

/**
 * Kinachokosekana ili mjadala ukamilike (kwa kitufe cha Endeleza). [] = hakuna (au si mjadala wa kuendeleza).
 * `done` = agenda zilizokamilika (resume state), `agendaTotal` = idadi ya agenda.
 * R30: `mode` = "plan" (default ya mpya — Mpango Kazi badala ya script) | "code" (flow ya zamani).
 */
export function missingParts(o: { status: string; items: FinaleItem[]; agendaTotal: number; done: number[]; finale?: FinaleState | null; mode?: "code" | "plan"; computerPlanned?: boolean }): string[] {
  if (o.status === "completed" || !o.agendaTotal) return [];
  const doneSet = new Set(o.done);
  const left = Array.from({ length: o.agendaTotal }, (_, i) => i + 1).filter((i) => !doneSet.has(i));
  const scan = scanFinale(o.items);
  if (left.length && !scan.started) return [`Agenda ${left.length === 1 ? left[0] : `${left[0]}–${left[left.length - 1]}`} (mjadala)`];
  const out: string[] = [];
  const plan = o.mode !== "code";
  // ripoti ikishahifadhiwa (reportId) plan + sehemu zote zimo ndani yake — kinachoweza kubaki ni memory tu
  if (!o.finale?.reportId) {
    if (plan) {
      if (!o.finale?.planId && !scan.planDone) out.push("Mpango Kazi wa Agent");
    } else if (!scan.scriptDone) out.push("Script ya mwisho");
    const miss = SECTION_DEFS.filter((d) => !scan.sections[d[0]]).map((d) => d[0]);
    if (miss.length) {
      const contiguous = miss.every((n, i) => i === 0 || n === miss[i - 1] + 1);
      out.push(`Ripoti: sehemu ${miss.length > 1 && contiguous ? `${miss[0]}–${miss[miss.length - 1]}` : miss.join(", ")}`);
    }
    out.push("Kuhifadhi ripoti (Reports)");
  }
  if (!o.finale?.memory) out.push("Memory ya agents");
  // R31: awamu ya XMD Computer — kwa sessions mpya zilizopangiwa computer (chip ya resume) pekee;
  // sessions za zamani hazina computerPlanned → hazigusiwi kabisa (data ya zamani ni sheria).
  if (o.mode !== "code" && o.finale?.planId && o.computerPlanned && !o.finale?.computer) out.push("Utekelezaji wa XMD Computer");
  return out;
}

/** resume state (chip iliyofichwa) → { agenda, done, finale, mode } */
export function readResumeState(items: FinaleItem[]): { runnerId: string; agendaTotal: number; done: number[]; finale: FinaleState | null; mode?: "code" | "plan" } | null {
  const P = "__PROFESSOR_XMD_RESUME_STATE__:";
  const it = [...items].reverse().find((x) => x?.kind === "chip" && typeof x.text === "string" && x.text.startsWith(P));
  if (!it) return null;
  try {
    const s = JSON.parse(String(it.text).slice(P.length));
    if (!Array.isArray(s?.agenda)) return null;
    return {
      runnerId: String(s.runnerId || ""),
      agendaTotal: s.agenda.length,
      done: Array.isArray(s.done) ? s.done.filter((n: unknown) => typeof n === "number") : [],
      finale: s.finale && typeof s.finale === "object" ? { reportId: s.finale.reportId ?? null, memory: !!s.finale.memory, planId: s.finale.planId ?? null } : null,
      mode: s.mode === "code" ? "code" : s.mode === "plan" ? "plan" : undefined,
    };
  } catch {
    return null;
  }
}
