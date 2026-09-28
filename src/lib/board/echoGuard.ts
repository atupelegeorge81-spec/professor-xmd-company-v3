// src/lib/board/echoGuard.ts — R27: AGREE iliyonakili ujumbe wa agent mwingine NENO KWA NENO si tathmini — haihesabiwi kama kura.
// Tatizo halisi (R27, Agenda 2): Vextron na Megatron walirudia AGREE ya Cybertron herufi kwa herufi ("The proposal aligns with
// Agenda 1 LOCKED … No defects found.") — makubaliano ya kuiga, si ya kukagua.

const norm = (s: string) =>
  String(s || "")
    .replace(/^\s*\*{0,2}\s*(AGREE|DISAGREE)\s*:?\s*\*{0,2}/i, "")
    .toLowerCase()
    .replace(/[`*_>#\-–—:;,.!?()"'\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Jina la agent ambaye ujumbe wake ulinakiliwa (≥80 herufi, sawa au ndani ya mwingine kwa ≥95%), au null. */
export function echoOf(text: string, prior: { name: string; text: string }[], self: string): string | null {
  const a = norm(text);
  if (a.length < 80) return null;
  for (let i = prior.length - 1; i >= 0; i--) {
    const p = prior[i];
    if (!p || p.name === self) continue;
    const b = norm(p.text);
    if (b.length < 80) continue;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    if (long.includes(short) && short.length / long.length >= 0.95) return p.name;
  }
  return null;
}
