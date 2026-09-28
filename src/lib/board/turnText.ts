// src/lib/board/turnText.ts — R20: usafi wa maandishi ya zamu + parser ya pendekezo (safi, zinajaribika bila server).

/** PROPOSED DECISION → mpaka RATIONALE/TRADE-OFF/EVIDENCE au MWISHO wa ujumbe (pia **bold**). */
export function parseProposal(text: string): RegExpMatchArray | null {
  return text.match(/\*{0,2}PROPOSED DECISION\*{0,2}\s*:\s*\*{0,2}\s*([\s\S]+?)(?=\n\s*\*{0,2}(?:RATIONALE|TRADE-OFF|EVIDENCE)\*{0,2}\s*:|$)/i);
}

/**
 * Mabaki ya provider yanayoharibu zamu:
 *  · `<tool_call>` / `</tool_call>` (model iliiga tool-call) — tag zinaondolewa, maudhui (pendekezo halisi) yanabaki
 *  · mwanzo uliokatwa na reasoning parser ya provider: ".POSED DECISION:" / "agree.REE:" / " tags (under 80 words)…"
 */
export function tidyTurn(text: string, hints = ""): string {
  const t = text
    .replace(/<\/?tool_call>/gi, "")
    .replace(/^\s*tags \(under 80 words\)[^\n]*(?:\n|$)/i, "")
    .replace(/^\s*[.,:;]*\s*(?:PRO)?POSED DECISION\s*:/i, "PROPOSED DECISION:")
    .replace(/^\s*(?:agree\.?|\.)?(?:AG)?REE\s*:/i, "AGREE:")
    .trim();
  return repairHead(t, hints).text; // R21: kila neno la kuanzia lililokatika (".D DECISION", ".ILENT", ".ECTION" …)
}

/**
 * R21 — MWANZO WA JIBU ULIOKATIKA (UnoRouter, imethibitishwa kwa stream ghafi 27 Sep):
 * kwenye mpito wa reasoning → jibu, baadhi ya channels za Uno zinatuma chunk yenye `reasoning_content` NA `content`
 * pamoja ({"content":"AGREE","reasoning_content":"."}) au zinapoteza chunk ya KWANZA ya jibu na kuacha "." ya
 * mawazo mahali pake. Tokens zinakuja vipande ("PRO" + "POSED DECISION", "AG" + "REE") → ".POSED DECISION",
 * ".D DECISION", ".REE:". Maneno ya kuanzia ni machache na yanajulikana → kipande kilichobaki kinarudishwa kwenye
 * neno kamili. Hakuna kinachobuniwa: kipande lazima kiwe MWISHO wa neno halali la kuanzia.
 */
export const HEAD_KEYWORDS = [
  "PROPOSED DECISION", "UPDATED DECISION", "AGREE", "DISAGREE", "OBJECTION REJECTED", "OBJECTION", "SILENT",
  "APPROVED", "CHANGES_REQUESTED", "CHANGES REQUESTED", "READ_SOURCE", "RESEARCH_REQUEST", "SKILL_REQUEST",
  "CLARIFY", "DEFER", "SEARCH", "REJECT", "ACCEPT", "INSUFFICIENT_EVIDENCE", "I_WAS_WRONG", "RATIONALE",
  "TRADE-OFF", "EVIDENCE", "ASSUMPTION", "CONTRADICTION", "OFF_TOPIC",
];

export interface HeadRepair { text: string; fixed: boolean; from?: string; to?: string }

export function repairHead(text: string, hints = ""): HeadRepair {
  // R27: provider aligawanya neno kati ya reasoning na content na kurudia kipande ("…I must RE" | "JECT.JECT: …")
  //      → nakala mbili za kipande kimoja zilizotenganishwa na "." zinaunganishwa kwanza, kisha urekebishaji wa kawaida
  const dup = text.match(/^(\s*)([A-Z][A-Z_\-]{1,})\.[ \t]*\2(?=\*{0,2}[ \t]*:)/);
  if (dup && !HEAD_KEYWORDS.includes(dup[2])) {
    const r = repairHead(`${dup[1]}${dup[2]}${text.slice(dup[0].length)}`, hints);
    if (r.fixed) return { ...r, from: dup[0].trim() };
  }
  // R28: mkia wa mawazo (herufi ndogo) umevuja mbele ya kipande: "decision.POSED DECISION:" → ".POSED DECISION:" → PROPOSED
  //      (unaondolewa TU kama kinachobaki kinarekebishwa kuwa neno halali la kuanzia)
  const tail = text.match(/^(\s*)[a-z][a-z'’-]{0,24}(?:[ \t][a-z][a-z'’-]{0,24}){0,2}[.,;:…]+(?=\*{0,2}[A-Z])/);
  if (tail) {
    const r = repairHead(`${tail[1]}.${text.slice(tail[0].length)}`, hints);
    if (r.fixed) return { ...r, from: tail[0].trim() + (r.from || "") };
  }
  const m = text.match(/^(\s*)([.,;:…·'"`]+)?[ \t]*(\*{0,2})([A-Z][A-Z_\-]*(?: [A-Z][A-Z_\-]*)?)(?=\*{0,2}[ \t]*:|[ \t]*\n|[ \t]*$)/);
  if (!m) return { text, fixed: false };
  const [whole, lead, punct = "", stars, frag] = m;
  const exact = HEAD_KEYWORDS.includes(frag);
  if (exact) {
    if (!punct) return { text, fixed: false };
    const out = `${lead}${stars}${frag}${text.slice(whole.length)}`;
    return { text: out, fixed: true, from: whole.trim(), to: frag };
  }
  if (frag.length < 2) return { text, fixed: false };
  let cands = HEAD_KEYWORDS.filter((k) => k.length > frag.length && k.endsWith(frag));
  if (!cands.length) return { text, fixed: false };
  // bila alama ya "." mwanzoni → kipande lazima kiwe na ":" na kilichopotea kiwe kifupi (token 1–2)
  const colon = /^\*{0,2}[ \t]*:/.test(text.slice(whole.length));
  if (!punct && (!colon || frag.length < 3)) return { text, fixed: false };
  cands = cands.filter((k) => punct || k.length - frag.length <= 8);
  if (!cands.length) return { text, fixed: false };
  // kidokezo: maneno yaliyomo kwenye prompt ya zamu hii yanapewa kipaumbele (".D DECISION" → PROPOSED vs UPDATED)
  const inHint = hints ? cands.filter((k) => hints.includes(k)) : [];
  const pool = inHint.length ? inHint : cands;
  const to = pool.sort((a, b) => (a.length - frag.length) - (b.length - frag.length) || HEAD_KEYWORDS.indexOf(a) - HEAD_KEYWORDS.indexOf(b))[0];
  return { text: `${lead}${stars}${to}${text.slice(whole.length)}`, fixed: true, from: whole.trim(), to };
}

/**
 * R21 — kizuizi cha mwanzo wa STREAM: maandishi ya jibu yanashikiliwa mpaka neno la kwanza likamilike (":" au
 * mstari mpya, au herufi 48), yanarekebishwa kwa repairHead, kisha yanapita moja kwa moja — UI haionyeshi ".REE" tena.
 */
export function makeHeadGate(emit: (t: string) => void, hints = "", onFix?: (r: HeadRepair) => void) {
  let buf = "";
  let open = false;
  const release = () => {
    open = true;
    if (!buf) return;
    const r = repairHead(buf, hints);
    if (r.fixed) onFix?.(r);
    emit(r.text);
    buf = "";
  };
  return {
    feed(t: string) {
      if (open) return emit(t);
      buf += t;
      const body = buf.replace(/^[\s.,;:…·'"`*]+/, "");
      if (/[:\n]/.test(body) || body.length >= 48) release();
    },
    flush() { if (!open) release(); },
  };
}

/** R21 — Uno ikigonga max_tokens ndani ya reasoning inarudisha MAWAZO YOTE kama `content` (stream ghafi: content ===
 *  reasoning, finish "length"). Hilo si jibu → lane nyingine. */
export function isReasoningDump(content: string, reasoning: string): boolean {
  const n = (s: string) => s.replace(/\s+/g, " ").trim();
  const c = n(content), r = n(reasoning);
  if (c.length < 120 || r.length < 120) return false;
  return r.startsWith(c.slice(0, 200)) && c.length >= r.length * 0.6;
}

/** Kinachoonyeshwa kwenye UI: signal ya READ_SOURCE inaonyeshwa kama kitendo, si kama jibu la agent. */
export function visibleTurn(text: string): string {
  return text.replace(/^\s*\*{0,2}READ_SOURCE\*{0,2}\s*:\s*<?(https?:\/\/[^\s>]+)>?\s*$/gim, "📖 Anasoma chanzo: $1").trim();
}
