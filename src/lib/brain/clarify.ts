// src/lib/brain/clarify.ts — `CLARIFY: @Agent <swali>` → owner huyo anapata ZAMU INAYOFUATA.
// Hili ndilo badiliko PEKEE la mpangilio wa zamu. Consensus / lock / objection hazibadiliki.
// R39: (1) swali la moja kwa moja bila prefix (jina la mwenzako + "?") linaunganishwa pia;
//      (2) swali la contrast/WCAG — mfumo unajibu kwa hesabu (SYSTEM VERIFIED) kabla ya kinywa.

import { contrastQuestionNote } from "../board/contrastGuard";

export interface ClarifyAsk { from: string; toId: string; toName: string; question: string }

type A = { id: string; name: string };

/** Tafuta CLARIFY inayomlenga OWNER mwingine (si yeye mwenyewe). */
export function parseClarify<T extends A>(text: string, speaker: T, owners: T[]): ClarifyAsk | null {
  const m = String(text || "").match(/(?:^|\n)\s*\**CLARIFY:?\**\s*:?\s*@?([A-Za-z]+)[,:\s-]+([\s\S]+?)(?=\n\s*(?:[A-Z_]{3,}[A-Z ]*:)|\n\n|$)/);
  if (!m) return null;
  const who = m[1].toLowerCase();
  const target = owners.find((o) => o.name.toLowerCase() === who || o.id.toLowerCase() === who);
  if (!target || target.id === speaker.id) return null;
  return { from: speaker.name, toId: target.id, toName: target.name, question: m[2].trim().slice(0, 600) };
}

/** R39: swali la moja kwa moja bila prefix ya CLARIFY — ujumbe wenye "?" UNAOMTAJA owner mwingine
 *  na bila signal yoyote ya uamuzi (AGREE/DISAGREE/PROPOSED/DEFER/OBJECTION). Mfano halisi
 *  (6ac7d777): "@Optimus, can you confirm that #00D4AA has been verified…?" — swali hili
 *  linampatia Optimus zamu ya kujibu, hata bila kuandika "CLARIFY:". */
export function parseDirectQuestion<T extends A>(text: string, speaker: T, owners: T[]): ClarifyAsk | null {
  const t = String(text || "");
  if (!t.includes("?")) return null;
  // ujumbe wa uamuzi si swali la kueleweka (unashughulikiwa na flow zake wenyewe)
  if (/(^|\n)\s*\*{0,2}\s*(AGREE|DISAGREE|PROPOSED DECISION|UPDATED DECISION|DEFER|OBJECTION|OBJECTION REJECTED|RESEARCH_REQUEST|READ_SOURCE|SKILL_REQUEST|WAIT|CLARIFY)\*{0,2}\s*:/i.test(t)) return null;
  for (const o of owners) {
    if (o.id === speaker.id) continue;
    if (new RegExp(`@?\\b${o.name}\\b`, "i").test(t)) {
      return { from: speaker.name, toId: o.id, toName: o.name, question: t.replace(/\s+/g, " ").trim().slice(0, 600) };
    }
  }
  return null;
}

/** Zamu ya kawaida ni owners[turn % n]; CLARIFY iliyopo inaipita mara moja. */
export function pickSpeaker<T extends A>(owners: T[], turn: number, pending: ClarifyAsk | null): T {
  if (pending) {
    const t = owners.find((o) => o.id === pending.toId);
    if (t) return t;
  }
  return owners[turn % owners.length];
}

export function clarifyNote(p: ClarifyAsk | null, me: A): string {
  if (!p || p.toId !== me.id) return "";
  // R39: swali la contrast/WCAG — hesabu ya mfumo inamfikia anayejibu (si kinywa chake)
  return `\n=== QUESTION FOR YOU (CLARIFY) ===\n${p.from} asked you directly: "${p.question}"\nAnswer this FIRST, precisely, then continue with your normal contribution.\nRules: answer with EVIDENCE (a number with its source, a document you READ, a calculation you show) or say plainly "I don't know — record it as ASSUMPTION". Never restate the question back as "I confirm X" without evidence.${contrastQuestionNote(p.question)}`;
}
