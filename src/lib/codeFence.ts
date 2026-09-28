// src/lib/codeFence.ts — code HALISI kutoka kwenye maandishi ya agent (pure: server + client).
//
// Tatizo lililorekebishwa (audit R9, Agenda 11 "qa.js v2" tupu):
// engine inahifadhi script ya writer kama ujumbe wake WOTE ("Mkuu, hii ni script…\n```javascript\n…```").
// Patch ikifungwa ndani ya ```scriptbox, fence ya ndani (```javascript) ilivunja parser —
// ScriptBox ilionyesha sentensi ya utangulizi badala ya code.
import { splitFences } from "./chat/fences";

export interface PureCode { code: string; lang: string; fenced: boolean }

/** Code tu (bila prose). Fences nyingi za lugha moja zinaunganishwa; lugha tofauti → kubwa zaidi. */
export function pureCode(raw: string): PureCode {
  const src = String(raw || "").replace(/\r\n/g, "\n");
  const segs = splitFences(src).filter((s): s is Extract<ReturnType<typeof splitFences>[number], { type: "code" }> => s.type === "code");
  if (segs.length === 0) return { code: src.trim(), lang: "", fenced: false };
  const main = segs.reduce((a, b) => (b.code.length > a.code.length ? b : a));
  const same = segs.filter((s) => s.lang === main.lang);
  const code = (same.length > 1 ? same.map((s) => s.code.replace(/\s+$/, "")).join("\n\n") : main.code).replace(/\s+$/, "");
  return { code, lang: main.lang, fenced: true };
}

/** Je, maandishi yana code halisi (si fence tupu)? */
export function hasRealCode(raw: string): boolean {
  const p = pureCode(raw);
  return p.fenced && p.code.replace(/\s/g, "").length >= 20;
}

/** Transcript: kila code block → alama fupi ya mstari mmoja (code yenyewe iko kwenye Ledger). */
export function compactCodeBlocks(text: string): string {
  const src = String(text || "").replace(/\r\n/g, "\n");
  if (!src.includes("```") && !src.includes("<<<<<<<")) return src;
  const out: string[] = [];
  for (const s of splitFences(src)) {
    if (s.type === "text") { out.push(s.text); continue; }
    let lang = s.lang || "text";
    let body = s.code;
    if (lang === "scriptbox") {
      lang = (body.match(/^lang:\s*(.+)$/m)?.[1] || "text").trim();
      body = body.includes("\n---\n") ? body.slice(body.indexOf("\n---\n") + 5) : body;
    }
    const lines = body.split("\n").filter((l) => l.trim()).length;
    out.push(`[CODE ${lang}, mistari ${lines}${s.closed ? "" : ", haijakamilika"} — imehifadhiwa kwenye Ledger]`);
  }
  return out
    .join("\n")
    .replace(/<<<<<<<\s*SEARCH[\s\S]*?>>>>>>>\s*REPLACE/g, "[PATCH SEARCH/REPLACE]")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
