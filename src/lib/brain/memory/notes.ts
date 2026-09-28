// src/lib/brain/memory/notes.ts — kusoma majibu ya agents: SELF: / BOARD: / NO_MEMORY / SKILL_NEED:
import { stripThink } from "../llm";

export interface ParsedNote { self: string; board: string; none: boolean; skillNeed?: { name: string; why: string } | null }

const block = (src: string, label: string, stops: string[]) => {
  const m = src.match(new RegExp(`(?:^|\\n)\\s*\\**${label}\\**\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*\\**(?:${stops.join("|")})\\**\\s*:|$)`, "i"));
  const v = (m ? m[1] : "").trim();
  return /^(none|hakuna|no_memory|n\/a|-)\.?$/i.test(v) ? "" : v;
};

export function parseNote(raw: string): ParsedNote {
  const src = stripThink(raw);
  const stops = ["SELF", "BOARD", "SKILL_NEED", "NO_NEW_SKILL", "NO_MEMORY"];
  const self = block(src, "SELF", stops);
  const board = block(src, "BOARD", stops);
  // jina linaweza kuwa na "-" (accessibility-audit); kitenganishi ni "—", " - " (yenye nafasi), ":" au "|"
  const sn = src.match(/SKILL_NEED\s*:\s*([A-Za-z0-9_][A-Za-z0-9 _-]{1,59}?)\s*(?:—|–|\s-\s|:|\|)\s*([^\n]+)/i);
  const none = (!self && !board) || (/^\s*NO_MEMORY\s*$/im.test(src) && !self && !board);
  return { self, board, none, skillNeed: sn ? { name: sn[1].trim(), why: sn[2].trim().slice(0, 400) } : null };
}
