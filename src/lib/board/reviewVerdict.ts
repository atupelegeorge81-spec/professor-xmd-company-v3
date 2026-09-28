// src/lib/board/reviewVerdict.ts — R26 (D3): hukumu ya mkaguzi inasomwa kwa uhakika.
// R24: reviews 8 hazikuwa na hukumu (APPROVE/REJECT) → zilihesabiwa REJECT → fix calls 8 zisizobadilisha kitu.
// Sasa: "none" ≠ REJECT — inajaribiwa tena mara moja, kisha "HAIKUKAGULIWA" (bila fix call). PURE.

export type Verdict = "approve" | "reject" | "none";

export function reviewVerdict(text: string): { verdict: Verdict; note: string } {
  const t = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const lines = t.split("\n").map((l) => l.replace(/^[\s>#*_`-]+/, "").replace(/[*_`]+/g, "").trim());
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const rj = l.match(/^(?:verdict\s*:\s*)?REJECT(?:ED)?\b\s*:?\s*(.*)$/i);
    if (rj) return { verdict: "reject", note: [rj[1], ...lines.slice(i + 1)].join("\n").trim() || t };
    if (/^(?:verdict\s*:\s*)?APPROVE(?:D)?\b/i.test(l)) {
      const rest = lines.slice(i + 1).join("\n");
      if (/^\s*REJECT\b/im.test(rest)) continue;
      return { verdict: "approve", note: "" };
    }
  }
  const any = t.match(/\bREJECT(?:ED)?\s*:\s*([\s\S]+)/i);
  if (any) return { verdict: "reject", note: any[1].trim() };
  return { verdict: "none", note: t };
}
