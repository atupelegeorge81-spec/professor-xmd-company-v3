// src/lib/brain/memory/recall.ts — kuchagua memory INAYOHUSIKA tu (relevance + recency + importance).
import { readMemory, COMPANY_DOC } from "./store";
import { parseLines, renderLine, type MemLine } from "./format";
import type { Persona } from "../ids";
import { maskPastValues, rememberPastProject } from "../../board/memoryAuthority";

const STOP = new Set("the a an and or for to of in on at by with from is are be this that it as we you our your yake kwa na ya wa la za ni katika hii huo hiyo".split(" "));
const words = (s: string) => new Set(String(s || "").toLowerCase().split(/[^a-z0-9\u00c0-\u024f#]+/).filter((w) => w.length > 2 && !STOP.has(w)));

function score(l: MemLine, q: Set<string>, project: string): number {
  const days = Math.max(0, (Date.now() - Date.parse(l.date)) / 86_400_000);
  const recency = Math.exp(-days / 30); // 0..1
  const importance = l.imp / 5; // 0.2..1
  const lw = words(`${l.project} ${l.text}`);
  let hits = 0;
  for (const w of q) if (lw.has(w)) hits++;
  const relevance = q.size ? Math.min(1, hits / Math.min(6, q.size)) : 0;
  const same = project && l.project && l.project.toLowerCase() === project.toLowerCase() ? 0.25 : 0;
  return 0.35 * relevance + 0.3 * importance + 0.2 * recency + same + (l.imp >= 5 ? 0.15 : 0);
}

function pick(col: string, q: Set<string>, project: string, budget: number): MemLine[] {
  const ranked = parseLines(col).map((l) => ({ l, s: score(l, q, project) })).sort((a, b) => b.s - a.s);
  const out: MemLine[] = [];
  let size = 0;
  for (const { l } of ranked) {
    const n = renderLine(l).length + 1;
    if (size + n > budget) continue;
    out.push(l);
    size += n;
  }
  return out;
}

export interface Recall { self: string; board: string; count: number; chars: number; past?: string }

// R27: lebo ya Board ni ya KIKAO (jina + #kitambulisho, board/memoryAuthority.sessionLabel) — vikao viwili vya brief moja
// vina jina moja; renderLine inakata lebo kwenye herufi 60 → linganisha herufi 60 za kwanza pande zote mbili
const norm60 = (x: string) => x.trim().slice(0, 60).trim().toLowerCase();
const sameProject = (l: MemLine, project: string) => !!project && !!l.project && norm60(l.project) === norm60(project);
/** R26 (C1): mstari wa mradi MWINGINE — "locked/imefungwa" inaondolewa (si uamuzi wa mradi huu) */
const asLesson = (l: MemLine): MemLine => ({ ...l, text: maskPastValues(l.text).replace(/\b(locked|finali[sz]ed|approved)\b\s*:?/gi, "used:").replace(/\b(imefungwa|iliyofungwa|zilizofungwa)\b/gi, "ilitumika") });

export async function recallMemory(p: Persona, o: { query: string; project?: string; surface: "chat" | "board" }): Promise<Recall> {
  // R18: SELF = doc ya agent mwenyewe · BOARD = memory MOJA ya kampuni (agent_memory/company) — wote wanaisoma.
  // board_memory ya zamani ya agent (kabla ya R18) bado inasomwa kama akiba ikiwa company haina kitu.
  const [doc, company] = await Promise.all([readMemory(p), readMemory(COMPANY_DOC)]);
  if (!doc && !company) return { self: "", board: "", count: 0, chars: 0 };
  const q = words(`${o.query} ${o.project || ""}`);
  const [selfBudget, boardBudget] = o.surface === "chat" ? [1500, 1300] : [800, 1600];
  const project = o.project || "";
  const s = pick(doc?.self_memory || "", q, project, selfBudget);
  const b = pick(company?.board_memory || doc?.board_memory || "", q, project, boardBudget);
  // R26 (C1): Board — memory ya MRADI HUU (lebo = title) ni muktadha; ya MIRADI MINGINE ni masomo tu (R24: Hugo→Astro,
  // "Target <50KB" ya Mama Lishe ilitajwa kama "locked" kwenye Saluni). Chat haina mradi → kama zamani.
  if (o.surface === "board" && project) {
    const mine = [...s, ...b].filter((l) => sameProject(l, project));
    const other = [...s, ...b].filter((l) => !sameProject(l, project)).map(asLesson);
    for (const l of other) if (l.project) rememberPastProject(l.project); // R28: jina la mradi wa zamani → gate ya pendekezo
    const selfMine = s.filter((l) => sameProject(l, project)).map(renderLine).join("\n");
    const boardMine = b.filter((l) => sameProject(l, project)).map(renderLine).join("\n");
    const past = other.map(renderLine).join("\n");
    return { self: selfMine, board: boardMine, past, count: mine.length + other.length, chars: selfMine.length + boardMine.length + past.length };
  }
  const self = s.map(renderLine).join("\n");
  const board = b.map(renderLine).join("\n");
  return { self, board, count: s.length + b.length, chars: self.length + board.length };
}

export function memoryBlock(r: Recall): string {
  if (!r.count) return "";
  return `=== YOUR RELEVANT MEMORY (private — use it, never recite it) ===${r.self ? `\nSELF (yours — this project):\n${r.self}` : ""}${r.board ? `\nBOARD (company-wide — this project):\n${r.board}` : ""}${r.past ? `\nPAST SESSIONS — lessons only (values removed). These are NOT decisions or evidence of the current session and are never "locked" or "verified" here — even when a past session had the same name or client. The current brief, DATA RASMI, this session's discussion and its Ledger always override them. Never cite them, never argue "continuity" with them, never say "the previous project chose/locked/verified":\n${r.past}` : ""}`;
}
