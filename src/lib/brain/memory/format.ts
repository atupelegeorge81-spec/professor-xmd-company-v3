// src/lib/brain/memory/format.ts — muundo wa mistari ya memory:
//   - [2026-09-26][imp:3][Gawanya Bili] Ujumbe…
// Rekodi MOJA kwa agent; kila column ≤ ~5,500 herufi.

export const COLUMN_MAX = 5500;

export interface MemLine { date: string; imp: number; project: string; text: string }

const LINE = /^\s*-\s*\[(\d{4}-\d{2}-\d{2})\]\s*\[imp:(\d)\]\s*\[([^\]]*)\]\s*(.+)$/;

export function parseLines(col: string): MemLine[] {
  return String(col || "")
    .split("\n")
    .map((l) => l.match(LINE))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ date: m[1], imp: Math.min(5, Math.max(1, Number(m[2]) || 2)), project: m[3].trim(), text: m[4].trim() }));
}

export const renderLine = (l: MemLine) => `- [${l.date}][imp:${l.imp}][${l.project.slice(0, 60)}] ${l.text.replace(/\s+/g, " ").slice(0, 400)}`;

export const today = (tz = process.env.APP_TIMEZONE || "Africa/Dar_es_Salaam") =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Maandishi huru ya agent ("- [imp:4] text" au "text") → MemLine[] */
export function linesFromNote(note: string, project: string, date = today()): MemLine[] {
  return String(note || "")
    .split("\n")
    .map((l) => l.trim().replace(/^[-*•]\s*/, ""))
    .filter((l) => l && !/^(none|hakuna|no_memory)\.?$/i.test(l))
    .map((l) => {
      const full = l.match(/^\[(\d{4}-\d{2}-\d{2})\]\s*\[imp:(\d)\]\s*\[([^\]]*)\]\s*(.+)$/);
      if (full) return { date: full[1], imp: Number(full[2]) || 2, project: full[3], text: full[4] };
      const imp = l.match(/^\[imp:(\d)\]\s*(.+)$/i);
      return { date, imp: imp ? Math.min(5, Math.max(1, Number(imp[1]))) : 2, project, text: (imp ? imp[2] : l).trim() };
    })
    .filter((x) => x.text.length > 3);
}

const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/g, " ").trim();

/** Fallback ya kideterministic: unganisha, ondoa marudio, kata za chini kwa alama (imp + recency). */
/** R30.1 (E3c): kikomo cha mistari ya kila column ya memory — mpya/muhimu zinabaki, za zamani zaidi zinaondoka KWA MPANGO. */
export const MEMORY_MAX_LINES = 30;

export function mergeLines(old: MemLine[], add: MemLine[], max = COLUMN_MAX): string {
  const seen = new Set<string>();
  const all = [...add, ...old].filter((l) => {
    const k = key(l.text).slice(0, 120);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const score = (l: MemLine) => l.imp * 2 - Math.max(0, (Date.now() - Date.parse(l.date)) / 86_400_000) / 30;
  const ranked = [...all].sort((a, b) => score(b) - score(a));
  const keep: MemLine[] = [];
  let size = 0;
  for (const l of ranked) {
    if (keep.length >= MEMORY_MAX_LINES) break; // R30.1 (E3c): kikomo cha mistari
    const r = renderLine(l);
    if (size + r.length + 1 > max) continue;
    keep.push(l);
    size += r.length + 1;
  }
  return keep.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map(renderLine).join("\n");
}
