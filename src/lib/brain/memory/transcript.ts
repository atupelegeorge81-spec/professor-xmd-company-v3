// src/lib/brain/memory/transcript.ts — kubana mjadala wa agenda (kwa mini-report, checkpoints, owner context).
// Sheria: maandishi yote ya mjadala yanabaki; code inakuwa alama ya mstari mmoja; links zinafupishwa.
import { compactCodeBlocks } from "@/lib/codeFence";

export type Talk = { name: string; text: string; tag?: string };

const THINK = /<think>[\s\S]*?<\/think>/gi;

/** Ujumbe mmoja: bila <think>, code → [CODE …], URL ndefu → domain tu. */
export function compactMessage(text: string): string {
  return compactCodeBlocks(String(text || "").replace(THINK, ""))
    .replace(/https?:\/\/([^\s/)]+)[^\s)]*/g, "[$1]")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * Transcript nzima ya agenda. Ikizidi `maxChars`, jumbe za MWANZO zinafupishwa kwanza
 * (za karibuni zinabaki kamili) — hakuna ujumbe unaoondolewa bila alama.
 */
export function compactTranscript(talk: Talk[], maxChars = 0): string {
  const rows = talk
    .map((t) => ({ head: `### ${t.name}${t.tag ? ` (${t.tag})` : ""}`, body: compactMessage(t.text) }))
    .filter((r) => r.body);
  const render = () => rows.map((r) => `${r.head}\n${r.body}`).join("\n\n");
  let out = render();
  if (!maxChars || out.length <= maxChars) return out;
  // fupisha za zamani kuanzia mwanzo, mpaka iingie (za mwisho 2 hazifupishwi)
  for (let i = 0; i < rows.length - 2 && out.length > maxChars; i++) {
    const b = rows[i].body;
    if (b.length > 360) rows[i].body = `${b.slice(0, 340).trim()} … [ujumbe umefupishwa: herufi ${b.length}]`;
    out = render();
  }
  if (out.length > maxChars) out = `[… mwanzo wa mjadala umekatwa kwa urefu]\n${out.slice(out.length - maxChars)}`;
  return out;
}
