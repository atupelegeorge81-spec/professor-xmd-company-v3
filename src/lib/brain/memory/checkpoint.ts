// src/lib/brain/memory/checkpoint.ts — baada ya MINI-REPORT YA MWISHO ya kila agenda:
// kila agent ALIYESHIRIKI anapata LLM call YAKE (kwa zamu), anasoma mjadala wa agenda hiyo na kuandika
// SELF: / BOARD: au NO_MEMORY. Inahifadhiwa agent_memory_events mara moja (Resume-safe).
import { identityBlock, personaName } from "../identity";
import { compactTranscript, type Talk } from "./transcript";
import { recallMemory } from "./recall";
import { saveEvent } from "./events";
import { parseNote } from "./notes";
import { brainLine, type BlogFn } from "../brainLog";
import { engineOf, type Persona } from "../ids";
import type { LlmFn } from "../llm";

export interface CheckpointInput {
  persona: Persona;
  sessionId: string;
  project: string;
  agendaIndex: number;
  agendaItem: string;
  role: string; // owner / observer / writer …
  talk: Talk[];
  miniDecision: string;
}

export interface CheckpointResult { persona: Persona; status: "memory" | "no_memory" | "failed"; self: string; board: string; ms: number }

/** mini-report ya agenda iliyofungwa (si UNRESOLVED/DEFERRED/tupu) */
export function isLockedMini(mini: string): boolean {
  const m = String(mini || "").trim();
  return !!m && !/^(UNRESOLVED|DEFERRED)\b/i.test(m) && !/\*\*Uamuzi:\*\*\s*(UNRESOLVED|DEFERRED)\b/i.test(m);
}

/** kinga ya mwisho: kwa agenda isiyofungwa, "locked/unanimous/consensus achieved" hazibaki kwenye note */
export function openSafe<T extends { self: string; board: string }>(n: T): T {
  const fix = (s: string) =>
    s ? s.replace(/\b(?:unanimous(?:ly)?\s+)?(?:consensus\s+(?:was\s+)?(?:achieved|reached)|locked(?:\s+decision)?|agreed)\b/gi, "proposed (NOT locked — item stayed OPEN)") : s;
  return { ...n, self: fix(n.self), board: fix(n.board) };
}

/** R21: agent aliyesema SILENT tu kwenye agenda (observer) hakufanya kitendo chochote humo. */
export function stayedSilent(talk: Talk[], name: string, role: string): boolean {
  if (!/^observer$/i.test(String(role || "").trim())) return false;
  const mine = talk.filter((t) => t.name.toLowerCase() === name.toLowerCase());
  return mine.length > 0 && mine.every((t) => /^\s*SILENT\s*$/i.test(t.text));
}

const ACTION_VERB = /\b(?:(?:I|we)\s+)?(?:have\s+)?(?:successfully\s+)?(validated|verified|recommended|recommending|proposed|proposing|enforced|enforcing|reviewed|rejected|approved|maintained|ensured|implemented|tested|confirmed|insisted|guided|led)\b/gi;

/**
 * R21: kinga ya mwisho kwa observer aliyekaa SILENT — "I validated …" / "Maintained … by recommending …" (Megatron na
 * Cybertron waliandika vitendo ambavyo hawakuvifanya) → mstari unaonyesha wazi kuwa aliangalia tu.
 */
export function silentSafe<T extends { self: string; board: string }>(n: T): T {
  const fix = (s: string) =>
    s
      ? s
          .split("\n")
          .map((line) => {
            if (!ACTION_VERB.test(line)) return line;
            ACTION_VERB.lastIndex = 0;
            const body = line.replace(ACTION_VERB, (_m, v: string) => (/ing$/i.test(v) ? "seeing the owners" : "observed the owners' work that"));
            return body.replace(/^(\s*-\s*(?:\[imp:\d\]\s*)?)/i, "$1(observer — stayed SILENT) ");
          })
          .join("\n")
      : s;
  return { ...n, self: fix(n.self), board: fix(n.board) };
}

export async function writeCheckpoint(llm: LlmFn, blog: BlogFn, c: CheckpointInput): Promise<CheckpointResult> {
  const t0 = Date.now();
  const name = personaName(c.persona);
  try {
    const known = await recallMemory(c.persona, { query: c.agendaItem, project: c.project, surface: "board" }).catch(() => null);
    // R20: agenda isiyofungwa haielezwi tena kama "FINAL LOCKED DECISION" (Vextron aliandika A6 "locked" wakati ilibaki OPEN)
    const locked = isLockedMini(c.miniDecision);
    const silent = stayedSilent(c.talk, name, c.role);
    let meta: { model: string; tokens: number | null } | null = null;
    const raw = await llm(
      engineOf(c.persona),
      [
        {
          role: "system",
          content: `${identityBlock(c.persona)}\n\n=== TASK: MEMORY CHECKPOINT (private, never shown in the Board) ===\nYou decide what YOU should remember from the agenda item that just finished. Be selective: only durable, reusable knowledge. Never copy code. Write in English.`,
        },
        {
          role: "user",
          content: `PROJECT: ${c.project.slice(0, 200)}
AGENDA ${c.agendaIndex}: ${c.agendaItem}
YOUR ROLE IN THIS ITEM: ${c.role}${silent ? `\nYOU STAYED SILENT IN THIS ITEM: you only observed. Never claim that you validated, verified, recommended, proposed, reviewed, approved, rejected, tested, enforced or implemented anything here — only what you OBSERVED the owners do.` : ""}

${locked
  ? `FINAL LOCKED DECISION (Optimus mini-report):\n${c.miniDecision.slice(0, 1500)}`
  : `STATUS: NOT LOCKED — this item ended WITHOUT consensus and stays OPEN.\n${c.miniDecision.slice(0, 1500) || "(unresolved)"}\nNever describe this item as locked, agreed or unanimous. If you remember it, remember it as an OPEN question with the competing proposals.`}

FULL DISCUSSION OF THIS ITEM (code compacted):
${compactTranscript(c.talk, 14000)}

WHAT YOU ALREADY REMEMBER (do not repeat these):
${[known?.self, known?.board].filter(Boolean).join("\n") || "(nothing yet)"}

Write your memory checkpoint in EXACTLY this format:
SELF:
- [imp:1-5] <about YOU: a lesson, a mistake you made or avoided, what worked, a preference of Mkuu you noticed> (0-2 lines, or NONE)
BOARD:
- [imp:1-5] <knowledge you must carry into future Boards: the decision and its exact key values, open risks, dependencies> (0-3 lines, or NONE)

If there is truly nothing worth remembering, output only: NO_MEMORY
imp: 5 = critical, 3 = useful, 1 = minor. Each line under 220 characters.
Never store business data values (prices, opening hours, phone numbers, emails, street addresses) — they live in the brief's DATA RASMI, not in memory.`,
        },
      ],
      900, // R26: 420 ilikata mistari ya memory katikati (thinking ya Gemini inakula bajeti)
      { onMeta: (m) => { meta = m; } },
    );
    const n0 = locked ? parseNote(raw) : openSafe(parseNote(raw));
    const n = silent ? silentSafe(n0) : n0;
    const ms = Date.now() - t0;
    const status = n.none ? "no_memory" : "memory";
    const id = await saveEvent({
      agent_id: c.persona, session_id: c.sessionId, project: c.project, kind: "checkpoint", agenda_index: c.agendaIndex, agenda_item: c.agendaItem,
      self_note: n.self, board_note: n.board, status, ms, model: (meta as { model: string } | null)?.model || "rotation", tokens: (meta as { tokens: number | null } | null)?.tokens ?? undefined,
    });
    blog(status === "memory" ? "success" : "info", brainLine("memory.checkpoint", name, [`Agenda ${c.agendaIndex}`, status === "memory" ? `SELF${n.self ? "✓" : "–"} BOARD${n.board ? "✓" : "–"}` : "NO_MEMORY", id ? "saved" : "save failed (local only)"], ms));
    return { persona: c.persona, status, self: n.self, board: n.board, ms };
  } catch (err: any) {
    const ms = Date.now() - t0;
    blog("warning", brainLine("memory.checkpoint", name, [`Agenda ${c.agendaIndex}`, `FAILED: ${String(err?.message || err).slice(0, 100)}`], ms));
    await saveEvent({ agent_id: c.persona, session_id: c.sessionId, project: c.project, kind: "checkpoint", agenda_index: c.agendaIndex, agenda_item: c.agendaItem, status: "failed", ms });
    return { persona: c.persona, status: "failed", self: "", board: "", ms };
  }
}

