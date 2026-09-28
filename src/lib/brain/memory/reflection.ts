// src/lib/brain/memory/reflection.ts — mwisho wa Board: kila agent call 1 ya Reflection.
// "Nimefanya nini leo? kuna memory? kuna skill inayokosekana?" → SELF/BOARD au NO_MEMORY · SKILL_NEED au NO_NEW_SKILL.
import { identityBlock, personaName } from "../identity";
import { catalogueFor } from "../skills/selector";
import { saveEvent, type MemoryEvent } from "./events";
import { parseNote } from "./notes";
import { openSafe, silentSafe } from "./checkpoint";
import { brainLine, type BlogFn } from "../brainLog";
import { engineOf, type Persona } from "../ids";
import type { LlmFn } from "../llm";

export interface ReflectionResult { persona: Persona; status: "memory" | "no_memory" | "failed"; self: string; board: string; skillNeed: { name: string; why: string } | null; ms: number }

export async function writeReflection(
  llm: LlmFn,
  blog: BlogFn,
  r: { persona: Persona; sessionId: string; project: string; checkpoints: MemoryEvent[]; decisions: string; spoke: number; openNote?: string },
): Promise<ReflectionResult> {
  const t0 = Date.now();
  const name = personaName(r.persona);
  const mine = r.checkpoints
    .filter((e) => e.status === "memory")
    .map((e) => `Agenda ${e.agenda_index}:${e.self_note ? `\n SELF: ${e.self_note}` : ""}${e.board_note ? `\n BOARD: ${e.board_note}` : ""}`)
    .join("\n");
  try {
    const raw = await llm(
      engineOf(r.persona),
      [
        { role: "system", content: `${identityBlock(r.persona)}\n\n=== TASK: FINAL REFLECTION (private) ===\nThe Board session just ended and the report is saved. Reflect honestly and briefly. Write in English.` },
        {
          role: "user",
          content: `PROJECT: ${r.project.slice(0, 200)}
YOU SPOKE ${r.spoke} TIME(S) IN THIS SESSION (SILENT turns are not counted).${r.spoke === 0 ? " You only observed today: never claim you validated, recommended, proposed, reviewed or enforced anything." : ""}
Only claim actions that your checkpoints below show you actually took.

DECISIONS FROM TODAY'S LEDGER (Optimus mini-reports, short — each line starts with its status):
${r.decisions.slice(0, 7000)}
${r.openNote ? `\n${r.openNote}\n` : ""}
YOUR CHECKPOINTS FROM TODAY:
${mine || "(none)"}

YOUR CURRENT SKILL LIBRARY: ${catalogueFor(r.persona).map((c) => c.id).join(", ")}

Answer in EXACTLY this format:
SELF:
- [imp:1-5] <the most important thing you learned about yourself today> (0-2 lines, or NONE)
BOARD:
- [imp:1-5] <what future Boards must know from today: key decisions/values, unresolved risks> (0-3 lines, or NONE)
SKILL_NEED: <skill name> — <evidence from today why a NEW skill (not in your library) is needed>
(or write NO_NEW_SKILL — new skills are rare; only with concrete evidence)

If there is nothing worth keeping, write NO_MEMORY instead of SELF/BOARD (still answer SKILL_NEED / NO_NEW_SKILL).`,
        },
      ],
      480,
    );
    // R21: siku ya kukaa kimya tu → hakuna "nilihakiki/nilipendekeza"; agenda OPEN → hakuna "locked/consensus"
    const n0 = parseNote(raw);
    const n1 = r.spoke === 0 ? silentSafe(n0) : n0;
    const n = r.openNote ? { ...n1, ...openSafe({ self: n1.self, board: n1.board }) } : n1;
    const ms = Date.now() - t0;
    const status = n.none ? "no_memory" : "memory";
    await saveEvent({ agent_id: r.persona, session_id: r.sessionId, project: r.project, kind: "reflection", self_note: n.self, board_note: n.board, status, ms, model: "rotation" });
    if (n.skillNeed) {
      await saveEvent({ agent_id: r.persona, session_id: r.sessionId, project: r.project, kind: "skill_candidate", self_note: `${n.skillNeed.name} — ${n.skillNeed.why}`, status: "memory" });
    }
    blog(status === "memory" ? "success" : "info", brainLine("memory.reflection", name, [status === "memory" ? `SELF${n.self ? "✓" : "–"} BOARD${n.board ? "✓" : "–"}` : "NO_MEMORY", n.skillNeed ? `SKILL_NEED: ${n.skillNeed.name} (candidate)` : "NO_NEW_SKILL"], ms));
    return { persona: r.persona, status, self: n.self, board: n.board, skillNeed: n.skillNeed || null, ms };
  } catch (err: any) {
    const ms = Date.now() - t0;
    blog("warning", brainLine("memory.reflection", name, [`FAILED: ${String(err?.message || err).slice(0, 100)}`], ms));
    await saveEvent({ agent_id: r.persona, session_id: r.sessionId, project: r.project, kind: "reflection", status: "failed", ms });
    return { persona: r.persona, status: "failed", self: "", board: "", skillNeed: null, ms };
  }
}
