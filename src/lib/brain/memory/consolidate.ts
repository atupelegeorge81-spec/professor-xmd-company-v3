// src/lib/brain/memory/consolidate.ts — R18: mtiririko mpya wa memory baada ya collector.
//   1) consolidateSelf    — KILA agent (pamoja na Optimus) anaunganisha SELF memory YAKE MWENYEWE (call 1 kwa agent,
//                           kwa model/lane yake) → agent_memory/<persona>.self_memory
//   2) consolidateCompany — Optimus PEKEE anaandika memory MOJA ya Board ya kampuni nzima kutoka BOARD submissions za
//                           wote → agent_memory/company.board_memory. Agents WOTE wanaisoma (recall.ts).
// Chat haiguswi (chat.ts inaandika self_memory tu, kama zamani). Nakala ya audit → agent_memory_events.
import { personaName } from "../identity";
import { readMemory, writeMemory, COMPANY_DOC } from "./store";
import { saveEvent } from "./events";
import { parseLines, linesFromNote, mergeLines, renderLine, COLUMN_MAX, today } from "./format";
import { stripThink, type LlmFn } from "../llm";
import { brainLine, type BlogFn } from "../brainLog";
import { engineOf, type Persona } from "../ids";
import type { Submission } from "./collector";

const LINE_RULE = `Every line MUST use the format "- [YYYY-MM-DD][imp:N][Project] text".`;

const section = (src: string, label: string) => {
  const m = src.match(new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:SELF_MEMORY|BOARD_MEMORY|COMPANY_MEMORY)\\s*:|$)`, "i"));
  return m ? m[1].trim() : "";
};

/** Jibu la LLM → mistari halali; likikosa mistari ilhali kulikuwa na memory → fallback ya kuunganisha kwa code (haifuti). */
function settle(raw: string, label: string, oldCol: string, add: ReturnType<typeof linesFromNote>): string {
  const lines = parseLines(section(stripThink(raw), label));
  if (!lines.length && (parseLines(oldCol).length || add.length)) throw new Error("jibu halikuwa na mistari halali");
  return mergeLines(lines, []);
}

/** (1) Agent anaunganisha SELF memory YAKE — anaitwa kwa id yake mwenyewe (si Optimus kwa niaba yake). */
export async function consolidateSelf(
  llm: LlmFn,
  blog: BlogFn,
  s: Submission,
  ctx: { sessionId: string; project: string },
): Promise<"saved" | "none" | "fail"> {
  const t0 = Date.now();
  const who = personaName(s.persona);
  if (!s.self.length) {
    blog("info", brainLine("memory.self", who, ["hakuna SELF submission mpya — memory haijaguswa"]));
    return "none";
  }
  const old = await readMemory(s.persona);
  const oldSelf = old?.self_memory || "";
  const add = linesFromNote(s.self.join("\n"), ctx.project);
  let out = "";
  let via = who;
  try {
    const raw = await llm(
      engineOf(s.persona),
      [
        {
          role: "system",
          content: `You are ${who}, consolidating YOUR OWN long-term self memory (how you work, what you learned about yourself, your strengths, mistakes to avoid, your preferences). Board/project facts do NOT belong here. Output ONLY the SELF_MEMORY section. ${LINE_RULE} Keep it under ${COLUMN_MAX} characters.`,
        },
        {
          role: "user",
          content: `TODAY: ${today()} · PROJECT: ${ctx.project.slice(0, 120)}

YOUR CURRENT SELF_MEMORY:
${oldSelf || "(empty)"}

YOUR NEW SELF NOTES (today):
${add.map(renderLine).join("\n") || "(none)"}

Rules: merge duplicates into one line (keep the most exact wording and the highest imp); a newer fact replaces an older conflicting one; drop stale or trivial lines; keep exact values; never invent anything that is not in the lines above.

SELF_MEMORY:
- …`,
        },
      ],
      2000,
      { purpose: "memory.self" },
    );
    out = settle(raw, "SELF_MEMORY", oldSelf, add);
  } catch (err: any) {
    via = `fallback (${String(err?.message || err).slice(0, 60)})`;
    out = mergeLines(parseLines(oldSelf), add);
  }
  const ok = await writeMemory(s.persona, { self_memory: out, last_project: ctx.project });
  await saveEvent({ agent_id: s.persona, session_id: ctx.sessionId, project: ctx.project, kind: "consolidated", self_note: out, status: ok ? "memory" : "failed", ms: Date.now() - t0, model: via });
  blog(ok ? "success" : "warning", brainLine("memory.self", who, [`SELF ${parseLines(out).length} lines`, via, ok ? "agent_memory ✓" : "agent_memory FAILED"], Date.now() - t0));
  return ok ? "saved" : "fail";
}

/** (2) Optimus anaandika memory MOJA ya Board ya kampuni kutoka BOARD submissions za agents wote. */
export async function consolidateCompany(
  llm: LlmFn,
  blog: BlogFn,
  subs: Submission[],
  ctx: { sessionId: string; project: string; openNote?: string },
): Promise<"saved" | "none" | "fail"> {
  const t0 = Date.now();
  const withBoard = subs.filter((s) => s.board.length);
  if (!withBoard.length) {
    blog("info", brainLine("memory.company", "Optimus", ["hakuna BOARD submission mpya — company memory haijaguswa"]));
    return "none";
  }
  const old = await readMemory(COMPANY_DOC);
  const oldBoard = old?.board_memory || "";
  const add = withBoard.flatMap((s) => linesFromNote(s.board.join("\n"), ctx.project));
  const byAgent = withBoard
    .map((s) => `${personaName(s.persona).toUpperCase()}:\n${linesFromNote(s.board.join("\n"), ctx.project).map(renderLine).join("\n")}`)
    .join("\n\n");
  let out = "";
  let via = "optimus";
  try {
    const raw = await llm(
      "pm",
      [
        {
          role: "system",
          content: `You are Optimus, keeper of the COMPANY-WIDE Board memory that every agent reads. You merge what the whole team learned into ONE shared memory: project decisions, constraints, exact values, conventions, lessons for future Boards. No personal self notes. Output ONLY the COMPANY_MEMORY section. ${LINE_RULE} Keep it under ${COLUMN_MAX} characters.`,
        },
        {
          role: "user",
          content: `TODAY: ${today()} · PROJECT: ${ctx.project.slice(0, 120)}

CURRENT COMPANY_MEMORY:
${oldBoard || "(empty)"}

NEW BOARD NOTES FROM THE TEAM (today):
${byAgent}
${ctx.openNote ? `\n${ctx.openNote}\n` : ""}
Rules: one fact = one line even if several agents reported it (keep the most exact wording and the highest imp); a newer fact replaces an older conflicting one; drop stale or trivial lines; keep exact values (colours, numbers, names, versions); never invent anything that is not in the lines above.
R26 scope rules: every line keeps its [project] label. A decision of one project is a fact OF THAT PROJECT only — write it as "used in <project>" (never "locked"/"final" as a general rule), so future projects treat it as a lesson, not a decision. Do NOT store business data values (prices, opening hours, phone numbers, emails, street addresses) — each brief's DATA RASMI is their only source.

COMPANY_MEMORY:
- …`,
        },
      ],
      2600,
      { purpose: "memory.company" },
    );
    out = settle(raw, "COMPANY_MEMORY", oldBoard, add);
  } catch (err: any) {
    via = `fallback (${String(err?.message || err).slice(0, 60)})`;
    out = mergeLines(parseLines(oldBoard), add);
  }
  const ok = await writeMemory(COMPANY_DOC, { board_memory: out, last_project: ctx.project });
  await saveEvent({ agent_id: "optimus", session_id: ctx.sessionId, project: ctx.project, kind: "consolidated", board_note: out, status: ok ? "memory" : "failed", ms: Date.now() - t0, model: `company · ${via}` });
  blog(ok ? "success" : "warning", brainLine("memory.company", "Optimus", [`COMPANY ${parseLines(out).length} lines`, `kutoka agents ${withBoard.length}`, via, ok ? "agent_memory/company ✓" : "agent_memory/company FAILED"], Date.now() - t0));
  return ok ? "saved" : "fail";
}

export type { Persona };
