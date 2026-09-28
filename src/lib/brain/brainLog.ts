// src/lib/brain/brainLog.ts — logs za Brain (kila tukio + matokeo + muda).
// Muundo: 🧠 [memory.checkpoint] Ultron · Agenda 4 · SELF✓ BOARD✓ · 1.8s
export type LogType = "info" | "success" | "warning" | "error" | "system";
export type BlogFn = (type: LogType, msg: string) => void;

export const fmtMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`);
export const fmtChars = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k chars` : `${n} chars`);

export function brainLine(tag: string, who: string, parts: (string | false | null | undefined)[], ms?: number): string {
  const p = parts.filter(Boolean).map((x) => ` · ${x}`).join("");
  return `🧠 [${tag}] ${who}${p}${ms != null ? ` · ${fmtMs(ms)}` : ""}`;
}

/** console fallback (chat background, n.k.) */
export const consoleBlog: BlogFn = (type, msg) => (type === "error" ? console.error : type === "warning" ? console.warn : console.log)(msg);
