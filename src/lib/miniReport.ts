// src/lib/miniReport.ts — MINI-REPORT ya Optimus kwa kila agenda (imehamishwa kutoka boardRunner.ts).
//
// SHERIA ZA R10 (Mkuu):
//  · Inaandikwa MWISHO KABISA wa agenda — baada ya observers wote kusema SILENT au objection kutatuliwa
//    na agenda kufungwa kwa mara ya mwisho. Kisha ndipo agenda inayofuata inaanza.
//  · Optimus anasoma MJADALA WOTE wa agenda (owners, code phase, review, observers, objection na jibu lake),
//    si jumbe 6 za mwisho zilizokatwa herufi 500 kama zamani.
//  · Usahihi 100%: kilichojadiliwa ndicho kinachoandikwa. Thamani halisi (rangi, namba, majina, orodha)
//    zinakaguliwa kwa code (value-coverage check) na zinazokosekana zinaongezwa; maneno halisi ya uamuzi
//    uliofungwa yanaambatishwa mwishoni ili ripoti ya mwisho isipoteze kitu.
import { compactTranscript, type Talk } from "./brain/memory/transcript";

export type MiniReport = { detail: string; constraints: string; tradeOff: string; llm: boolean; missing: string[] };

export interface MiniInput {
  agendaIndex: number;
  agendaItem: string;
  /** uamuzi wa MWISHO (baada ya objection kama ilikubaliwa) */
  decision: string;
  consensus: boolean;
  owners: string[];
  codeWriters: string[];
  /** mjadala wote wa agenda hii, kwa mpangilio */
  talk: Talk[];
  observers?: { name: string; verdict: string }[];
  objection?: { by: string; concern: string; responder: string; outcome: "accepted" | "rejected" | "failed"; answer: string };
  /** R26 (E1): majaribio ya LLM yaliyoshindwa kabla (kutoka alama ya fallback) — jaribio la pili linatumia transcript fupi */
  priorTries?: number;
}

export interface MiniDeps {
  llm: (agentId: string, messages: Record<string, unknown>[], maxTokens: number, opts?: { cls?: "heavy" | "normal" | "light" | "background"; purpose?: string }) => Promise<string>;
  withActivity: <T>(text: string, fn: () => Promise<T>) => Promise<T>;
  blog: (type: "info" | "success" | "warning" | "error" | "system", msg: string) => void;
  thinkRe: RegExp;
}

const SECTIONS = ["DECISION_SUMMARY", "CONDITIONS", "OBJECTIONS", "RATIONALE_TRADEOFFS", "EVIDENCE", "OPEN_ITEMS", "CARRIED_CONSTRAINTS"] as const;
const TITLE: Record<(typeof SECTIONS)[number], string> = {
  DECISION_SUMMARY: "Uamuzi",
  CONDITIONS: "Masharti yaliyoongezwa",
  OBJECTIONS: "Observers & Pingamizi",
  RATIONALE_TRADEOFFS: "Sababu & Trade-offs",
  EVIDENCE: "Evidence",
  OPEN_ITEMS: "Yaliyobaki wazi",
  CARRIED_CONSTRAINTS: "Carried Constraints",
};

/** Uamuzi safi: bila [Condition added by X] bodies ndefu (zinaripotiwa kwenye CONDITIONS). */
export const cleanDecision = (d: string) => String(d || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

/** Uamuzi unaotumika sasa: bila aya ya "[Previous lock — superseded …]" (inabaki kwenye nukuu ya Ledger tu). */
export const activeDecision = (d: string) => String(d || "").replace(/\n*\[Previous lock[^\]]*\]:[\s\S]*$/i, "").trim();

/** Thamani halisi ambazo LAZIMA zionekane kwenye mini-report (hex, namba zenye vipimo, `identifiers`, uwiano). */
export function criticalValues(text: string): string[] {
  // R21: code blocks (```…```) hazihesabiwi — backticks zake ziliunganisha spans mbili na kuokota ". The" / ". Use a"
  const src = String(text || "").replace(/```[\s\S]*?(?:```|$)/g, "\n");
  const found = new Set<string>();
  const add = (v: string) => { const t = v.trim(); if (t.length >= 2 && t.length <= 60) found.add(t); };
  for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) add(m[0]);
  // R21: si sehemu ya utility class (`gap-x-2 mb-4` ilitoa "2 mb")
  for (const m of src.matchAll(/(?<![\w.-])\d+(?:\.\d+)?\s?(?:px|rem|em|ms|s|sec|%|kb|mb|gb|fps|vh|vw|dp|pt|x)(?![\w-])/gi)) add(m[0]);
  for (const m of src.matchAll(/\b\d+(?:\.\d+)?:\d+(?:\.\d+)?\b/g)) add(m[0]);
  for (const line of src.split("\n")) {
    if (((line.match(/`/g) || []).length % 2) !== 0) continue; // backticks zisizo jozi → hakuna uhakika wa span
    for (const m of line.matchAll(/`([^`]{2,60})`/g)) {
      const v = m[1];
      if (/^\s|\s$/.test(v) || /^[.,;:!?)\]]\s/.test(v)) continue; // maandishi kati ya spans mbili, si code
      add(v);
    }
  }
  return [...found];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "").replace(/[`"'*]/g, "");

export function missingValues(values: string[], report: string): string[] {
  const hay = norm(report);
  return values.filter((v) => !hay.includes(norm(v)));
}

/** R20: alama isiyoonekana ya mini-report ya fallback (LLM ilishindwa) — Resume/Endeleza inaiandika upya. */
export const MINI_FALLBACK_MARK = "<!-- xmd:mini-fallback -->";
/** R26 (E1): alama inabeba idadi ya majaribio + sababu: <!-- xmd:mini-fallback tries=2 reason=… --> */
const FALLBACK_RE = /\n?<!-- xmd:mini-fallback(?: tries=(\d+))?(?: reason=[^>]*?)? -->/g;
/** kikomo: LLM inajaribiwa mara 2 kwa jumla (1 wakati wa agenda + 1 kwenye Endeleza) — si kila resume milele (A3 ya R24) */
export const MINI_MAX_TRIES = 2;
export function miniTries(detail: string | undefined | null): number {
  const m = [...String(detail || "").matchAll(FALLBACK_RE)];
  if (!m.length) return 0;
  return Math.max(...m.map((x) => Number(x[1]) || 1));
}
export function miniFallbackReason(detail: string | undefined | null): string {
  const m = String(detail || "").match(/<!-- xmd:mini-fallback[^>]*? reason=([^>]*?) -->/);
  return m ? m[1].trim() : "";
}
export const stripFallbackMark = (d: string) => String(d || "").replace(FALLBACK_RE, "");

/**
 * Mini-report inayohitaji kuandikwa upya na Optimus: ya muda, ya fallback (alama), au ya zamani isiyo na
 * "Maneno halisi ya uamuzi uliofungwa" (kila mini-report ya LLM inayo — A2 ya Mama Lishe haikuwa nayo).
 */
export function needsMiniRedo(detail: string | undefined | null): boolean {
  const d = String(detail || "");
  if (!d.trim()) return true;
  if (/Mini-report ya muda/.test(d)) return true;
  const tries = miniTries(d);
  // R26 (E1): fallback iliyojaribiwa mara MINI_MAX_TRIES → inabaki (sababu imehifadhiwa), haijaribiwi kila resume
  if (tries) return tries < MINI_MAX_TRIES;
  return !/\*\*Maneno halisi ya uamuzi uliofungwa \(Ledger\):\*\*/.test(d);
}

/** Mini-report ya muda (bila LLM) — inahifadhiwa wakati wa LOCK ili Resume iwe salama. */
export function provisionalMini(a: Pick<MiniInput, "agendaIndex" | "agendaItem" | "decision" | "consensus">, note = ""): MiniReport {
  const d = cleanDecision(a.decision);
  return {
    detail:
      `### Mini-Report — Agenda ${a.agendaIndex}: ${a.agendaItem}\n` +
      `**Uamuzi:** ${d ? d.slice(0, 6000) : "UNRESOLVED — hakuna consensus ya kutosha"}\n` +
      (note ? `${note}\n` : "") +
      (d ? `\n_(Mini-report ya muda — Optimus ataandika kamili baada ya observers kumaliza.)_` : ""),
    constraints: d ? `- ${d.slice(0, 1500)}` : "",
    tradeOff: "",
    llm: false,
    missing: [],
  };
}

function grab(clean: string, label: string): string {
  const others = SECTIONS.join("|");
  const m = clean.match(new RegExp(`(?:^|\\n)\\s*\\**${label}\\**\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*\\**(?:${others})\\**\\s*:|$)`, "i"));
  return m ? m[1].trim() : "";
}

/** Mini-report kamili — Optimus anasoma mjadala WOTE. Inaitwa MARA MOJA, mwisho wa agenda. */
export async function writeMiniReport(deps: MiniDeps, a: MiniInput): Promise<MiniReport> {
  const decisionText = cleanDecision(a.decision);
  const observersLine = (a.observers || []).map((o) => `${o.name}: ${o.verdict}`).join(" · ");
  const objectionLine = a.objection
    ? `${a.objection.by} → ${a.objection.concern}\nJibu la ${a.objection.responder} (${a.objection.outcome}): ${a.objection.answer}`
    : "";
  if (!a.consensus || !decisionText) {
    return provisionalMini(a, observersLine ? `**Observers:** ${observersLine}` : "");
  }

  // R26 (E1): jaribio la pili → transcript fupi + lanes za "normal" (heavy = Flash yenye RPD 20 tu)
  const retry = (a.priorTries || 0) > 0;
  const transcript = compactTranscript(a.talk, retry ? 12000 : 26000);
  const text = `${a.agendaIndex}: ${a.agendaItem}`;
  return deps.withActivity(`Optimus anasoma mjadala wote wa agenda ${a.agendaIndex} na kuandika mini report…`, async () => {
    const t0 = Date.now();
    try {
      const raw = await deps.llm(
        "pm",
        [
          {
            role: "system",
            content:
              "You are Optimus, the project manager and consensus chair. You write EXACT mini-reports of one finished agenda item. " +
              "Your only sources are the full transcript and the final locked decision given to you. Output ONLY the requested sections. Never write code. " +
              "Write the prose in Kiswahili, but copy every technical value, name, identifier, colour, number, unit, file name and list item EXACTLY as written in the source (do not translate or round them).",
          },
          {
            role: "user",
            content: `AGENDA ${text}
OWNERS: ${a.owners.join(", ")}
${a.codeWriters.length ? `CODE imeandikwa na: ${a.codeWriters.join(", ")} (code yenyewe iko kwenye Ledger — USIIANDIKE).` : "Hakuna code kwenye agenda hii."}

=== UAMUZI WA MWISHO ULIOFUNGWA (source of truth) ===
${decisionText.slice(0, 9000)}

=== OBSERVERS ===
${observersLine || "(hakuna observers walioulizwa)"}
${objectionLine ? `\n=== PINGAMIZI NA MATOKEO ===\n${objectionLine}\n` : ""}
=== MJADALA WOTE WA AGENDA HII (kwa mpangilio) ===
${transcript || "(hakuna)"}

SHERIA ZA USAHIHI (lazima):
1. Andika kilichojadiliwa na kukubaliwa TU. Usiongeze wazo, namba, jina, chanzo au sharti ambalo halipo kwenye mjadala au uamuzi.
2. Thamani ikibadilika wakati wa mjadala, andika thamani ya MWISHO tu (iliyofungwa), si ya zamani.
3. Orodha (mfano: cases, vipengele, hatua, rangi) ziandikwe ZOTE kwa mpangilio uleule — usiache kipengele hata kimoja.
4. Nakili kila thamani ya kiufundi herufi kwa herufi (mfano #1E293B, 44px, 4.5:1, \`splitBill()\`).
5. Pingamizi lililokataliwa si uamuzi; lililokubaliwa limeshaingia kwenye uamuzi wa mwisho.

Andika kwa muundo HUU HASA (vichwa vyote 7, kwa Kiingereza kama vilivyo), bila maneno mengine:
DECISION_SUMMARY: <kila kilichoidhinishwa na thamani ZOTE halisi — mistari mingi kadiri inavyohitajika>
CONDITIONS:
- <sharti lililoongezwa na owner (AGREE + condition) — nani, sharti gani, katika hali yake ya mwisho> (au: - Hakuna.)
OBJECTIONS:
- <observer: SILENT, au pingamizi: nani, nini, matokeo (limekubaliwa → nini kilibadilika / limekataliwa → kwa nini)>
RATIONALE_TRADEOFFS: <sababu zilizotolewa na trade-offs zilizokubaliwa>
EVIDENCE:
- <evidence/vyanzo vilivyotajwa kwenye mjadala tu> (au: - Hakuna.)
OPEN_ITEMS:
- <kilichoahirishwa au kubaki wazi waziwazi kwenye mjadala> (au: - Hakuna.)
CARRIED_CONSTRAINTS:
- <sharti ambalo agenda zinazofuata LAZIMA ziliheshimu> (mistari 2-8, au: - Hakuna.)`,
          },
        ],
        2600,
        { cls: retry ? "normal" : "heavy", purpose: "mini-report" }, // R18: Gemini Flash kwanza (sekunde, si dakika)
      );
      const clean = raw.replace(deps.thinkRe, "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      const got = Object.fromEntries(SECTIONS.map((s) => [s, grab(clean, s)])) as Record<(typeof SECTIONS)[number], string>;
      if (!got.DECISION_SUMMARY) throw new Error("DECISION_SUMMARY haipo kwenye jibu");

      let detail = `### Mini-Report — Agenda ${a.agendaIndex}: ${a.agendaItem}\n`;
      for (const s of SECTIONS) {
        if (!got[s]) continue;
        const v = got[s];
        detail += /^\s*-/.test(v) ? `**${TITLE[s]}:**\n${v}\n` : `**${TITLE[s]}:** ${v}\n`;
      }

      // ---- VALUE-COVERAGE CHECK (deterministic) ----
      // Thamani za lock ILIYOBADILISHWA (baada ya pingamizi kukubaliwa) SI za kuhakikisha — zimepitwa na wakati.
      const values = criticalValues(`${activeDecision(decisionText)}\n${a.objection?.outcome === "accepted" ? a.objection.answer.replace(/^[\s\S]*?UPDATED DECISION\s*:/i, "").replace(/\n\s*RATIONALE\s*:[\s\S]*$/i, "") : ""}`);
      const missing = missingValues(values, detail);
      if (missing.length) {
        detail += `**Thamani halisi kutoka uamuzi (zilikosekana kwenye muhtasari — zimeongezwa na mfumo):** ${missing.join(" · ")}\n`;
        deps.blog("warning", `🧾 Mini-report Agenda ${a.agendaIndex}: thamani ${missing.length} zilikosekana na zimeongezwa (${missing.slice(0, 6).join(", ")}).`);
      }
      // maneno halisi ya uamuzi uliofungwa — chanzo cha ukweli kwa ripoti ya mwisho
      detail += `\n**Maneno halisi ya uamuzi uliofungwa (Ledger):**\n> ${decisionText.slice(0, 4000).replace(/\n/g, "\n> ")}\n`;

      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      deps.blog("success", `🧾 Mini-report Agenda ${a.agendaIndex}: Optimus amesoma jumbe ${a.talk.length} (herufi ${transcript.length}) · sehemu ${SECTIONS.filter((s) => got[s]).length}/7 · thamani ${values.length - missing.length}/${values.length} · ${secs}s`);
      return {
        detail: detail.slice(0, 14000),
        constraints: (got.CARRIED_CONSTRAINTS || `- ${decisionText.slice(0, 1500)}`).slice(0, 4000),
        tradeOff: got.RATIONALE_TRADEOFFS.slice(0, 2500),
        llm: true,
        missing,
      };
    } catch (err: any) {
      deps.blog("warning", `⚠️ Mini-report Agenda ${a.agendaIndex} (LLM) imeshindwa — fallback ya kideterministic inatumika: ${String(err?.message || err).slice(0, 120)}`);
      const fb = provisionalMini(a, [observersLine && `**Observers:** ${observersLine}`, objectionLine && `**Pingamizi:** ${objectionLine.slice(0, 1200)}`].filter(Boolean).join("\n"));
      const tries = (a.priorTries || 0) + 1;
      const reason = String(err?.message || err).replace(/-->|[<>\n]/g, " ").slice(0, 160);
      if (tries >= MINI_MAX_TRIES) deps.blog("warning", `🧾 Mini-report Agenda ${a.agendaIndex}: LLM imeshindwa mara ${tries} — fallback ya kideterministic inabaki (haitajaribiwa tena kwenye Endeleza). Sababu: ${reason}`);
      return { ...fb, detail: `${fb.detail.replace(/\n_\(Mini-report ya muda[^\n]*\)_/, "")}\n<!-- xmd:mini-fallback tries=${tries} reason=${reason} -->` };
    }
  });
}

/** Sehemu ya "Uamuzi" ya mini-report (kwa context ya agenda zinazofuata). */
export function miniDecisionSection(detail: string, max = 900): string {
  const d = stripFallbackMark(String(detail || ""));
  const m = d.match(/\*\*Uamuzi:\*\*\s*([\s\S]*?)(?=\n\*\*[^*\n]+:\*\*|$)/);
  const s = (m ? m[1] : "").trim();
  return s.length > max ? `${s.slice(0, max).trim()}…` : s;
}

/**
 * R10: CONTEXT KAMILI ya agenda iliyotangulia kutoka mini-report yake (si "tulijadili X" tu):
 * Uamuzi + Masharti + Observers/Pingamizi + Sababu/Trade-offs + Yaliyobaki wazi + thamani halisi.
 * Evidence na nukuu ya Ledger zinaachwa (zipo kwenye Ledger; ripoti ya mwisho inazisoma).
 */
const CONTEXT_TITLES = ["Uamuzi", "Masharti yaliyoongezwa", "Observers & Pingamizi", "Sababu & Trade-offs", "Yaliyobaki wazi", "Thamani halisi", "Hali", "Sababu halisi ya kubaki OPEN", "Pendekezo la mwisho", "Owners waliokubali"]; // R21: rekodi ya agenda OPEN
export function miniContext(detail: string, max = 2000): string {
  const d = stripFallbackMark(String(detail || ""));
  const parts: string[] = [];
  for (const m of d.matchAll(/\*\*([^*\n]+):\*\*\s*([\s\S]*?)(?=\n\*\*[^*\n]+:\*\*|\n### |$)/g)) {
    const title = m[1].trim();
    const body = m[2].trim();
    if (!body || /^-?\s*Hakuna\.?$/i.test(body)) continue;
    if (!CONTEXT_TITLES.some((t) => title.startsWith(t))) continue;
    parts.push(`${title.startsWith("Thamani halisi") ? "Thamani halisi" : title}: ${body}`);
  }
  const s = parts.length ? parts.join("\n") : miniDecisionSection(d, max);
  return s.length > max ? `${s.slice(0, max).trim()}…` : s;
}
