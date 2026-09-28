// src/lib/brain/clarify.ts — `CLARIFY: @Agent <swali>` → owner huyo anapata ZAMU INAYOFUATA.
// Hili ndilo badiliko PEKEE la mpangilio wa zamu. Consensus / lock / objection hazibadiliki.

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
  return `\n=== QUESTION FOR YOU (CLARIFY) ===\n${p.from} asked you directly: "${p.question}"\nAnswer this FIRST, precisely, then continue with your normal contribution.\n`;
}
