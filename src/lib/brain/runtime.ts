// src/lib/brain/runtime.ts — AGENT RUNTIME: prompt ya kila wito, kwa Chat na Board.
// Mpangilio (R15): 0 TAREHE (juu kabisa) · 1 Identity · 1b Uko wapi / unaweza nini · 2 Live Context + 2b Resources (muhtasari)
// · 3 Understanding · 4 Governance + Board tooling (board tu) · 5 Memory · 6 Skills · 7 Saa (mwisho).
// Maelezo marefu (usage kamili, mwongozo wa website, data ya website) HAYAMO — agent anayasoma kwa SITE: <topic> (just-in-time).
// `lite` = prompt fupi kwa hatua za kuamua (chat: router/verify) — prompt kamili inatumika kwenye jibu la mwisho tu.
import { identityBlock, personaName } from "./identity";
import { GOVERNANCE_BOARD, TOOLING_RULES, TOOLING_BOARD } from "./governance";
import { liveContextBlock, type LiveOpts } from "./liveContext";
import { understandingBlock } from "./understanding";
import { searchPolicyBlock } from "./searchPolicy";
import { recallMemory, memoryBlock } from "./memory/recall";
import { selectSkills, catalogueFor, renderSkills, selectionTag, type Phase, type Surface } from "./skills/selector";
import { brainLine, fmtChars, type BlogFn } from "./brainLog";
import { personaOf } from "./ids";
import { memoryOn, memoryOffNote } from "./memory/switch";
import { resourcesBrief } from "./resources";
import { nowBlock, nowTime, todayLong, situationChat, situationBoard } from "./situation";

export interface BuildOpts {
  /** engine id (pm/designer/…) au persona id */
  agentId: string;
  surface: Surface;
  phase: Phase;
  /** maandishi ya kazi/agenda — kwa relevance ya memory na uchaguzi wa skills */
  task?: string;
  need?: string;
  project?: string;
  /** R26 (C1): lebo fupi ya mradi (conversation title) — memory lines zina lebo hii; mradi huu vs miradi mingine */
  projectLabel?: string;
  sessionId?: string;
  role?: string;
  agenda?: { index: number; total: number; item: string };
  owners?: string[];
  observers?: string[];
  chatMessages?: number;
  /** chat: block ya rolling checkpoint (mazungumzo ya zamani ya thread hii) — memory/rolling.ts */
  rolling?: string;
  date?: string;
  /** log ya mstari mmoja (🧠 …) */
  blog?: BlogFn;
  /** R15: block ya ziada mwishoni (mf. WEBSITE DATA iliyoombwa kwa SITE:) */
  extra?: string;
}

export interface BuiltPrompt { system: string; lite: string; skills: string[]; modules: string[]; memoryLines: number; chars: number; ms: number }

export async function buildAgentPrompt(o: BuildOpts): Promise<BuiltPrompt> {
  const t0 = Date.now();
  const p = personaOf(o.agentId);
  const scope = o.surface === "board" ? `${o.sessionId || "board"}:${o.agenda?.index ?? 0}` : "chat";

  // 5) memory (haipakiwi kwa ripoti / assembly / kazi za memory zenyewe)
  const wantsMemory = !["report", "assembly", "memory"].includes(o.phase);
  let recall = { self: "", board: "", count: 0, chars: 0 };
  if (wantsMemory && !memoryOn()) memoryOffNote(o.blog);
  else if (wantsMemory) {
    const tr = Date.now();
    try {
      recall = await recallMemory(p, { query: `${o.agenda?.item || ""} ${o.task || ""}`.slice(0, 1200), project: o.projectLabel || o.project, surface: o.surface });
      const n = (t: string) => t.split("\n").filter((l) => l.trim()).length;
      o.blog?.("info", brainLine("memory.recall", personaName(p), [o.surface, o.phase, recall.count ? `self ${n(recall.self)} · board ${n(recall.board)}` : "hakuna memory inayohusiana", recall.count ? fmtChars(recall.chars) : ""], Date.now() - tr));
    } catch (err: any) {
      /* memory haipatikani → prompt inaendelea bila hiyo */
      o.blog?.("warning", brainLine("memory.recall", personaName(p), [o.surface, `FAILED: ${String(err?.message || err).slice(0, 80)}`], Date.now() - tr));
    }
  }

  // 6) skills — modules za wakati huu tu (kamili, hazikatwi)
  const sel = selectSkills({ persona: p, surface: o.surface, phase: o.phase, text: `${o.agenda?.item || ""}\n${o.task || ""}`, need: o.need, scope });
  const catalogue = o.phase === "report" ? [] : catalogueFor(p);
  const loaded = new Set(sel.skills);
  const skillText = [
    catalogue.length && o.surface === "chat"
      ? `=== YOUR SKILLS (the right modules load automatically below when the request needs them) ===\n${catalogue.map((c) => `- ${c.id}: ${c.line}${loaded.has(c.id) ? " (loaded)" : ""}`).join("\n")}`
      : catalogue.length
      ? `=== YOUR SKILL LIBRARY (modules load automatically for the current moment; force one with SKILL_REQUEST: <skill> or SKILL_REQUEST: <skill>/<module>) ===\n${catalogue.map((c) => `- ${c.id}: ${c.line}${loaded.has(c.id) ? " (loaded below)" : ""} · modules: ${c.modules.join(", ")}`).join("\n")}`
      : "",
    renderSkills(sel),
  ].filter(Boolean).join("\n\n");
  if (sel.dropped.length) o.blog?.("info", brainLine("skills.budget", personaName(p), [o.phase, `dropped ${sel.dropped.join(", ")}`]));

  // 2b) rasilimali halisi — R15: MUHTASARI tu (kamili: SITE: usage) — si kwa kazi za memory
  const resources = o.phase === "memory" ? "" : await resourcesBrief({ surface: o.surface, agentId: o.agentId, sessionId: o.sessionId, phase: o.phase }).catch(() => "");
  const live: LiveOpts = { surface: o.surface, phase: o.phase, sessionId: o.sessionId, role: o.role, agenda: o.agenda, owners: o.owners, observers: o.observers, chatMessages: o.chatMessages };
  const noTools = ["report", "assembly", "memory"].includes(o.phase);
  const situation = o.surface === "chat" ? situationChat({ chatMessages: o.chatMessages }) : noTools ? "" : situationBoard();
  const clock = `- Current date & time: ${o.date || `${todayLong()}, ${nowTime()}`}`;
  const parts = [
    nowBlock(), // 0
    identityBlock(p), // 1
    situation, // 1b
    liveContextBlock(live), // 2
    resources, // 2b
    understandingBlock(o.surface, o.phase), // 3
    o.surface === "board" ? GOVERNANCE_BOARD : "", // 4 (board tu)
    TOOLING_RULES,
    o.surface === "board" ? TOOLING_BOARD : "",
    searchPolicyBlock(o.surface, o.phase),
    memoryBlock(recall), // 5
    o.rolling || "", // 5b (chat: rolling checkpoint ya thread)
    skillText, // 6
    o.extra || "", // 6b (WEBSITE DATA)
    clock, // 7
  ].filter(Boolean);
  const lite = [nowBlock(), identityBlock(p), situation, liveContextBlock(live), resources, clock].filter(Boolean).join("\n\n");
  const system = parts.join("\n\n");
  const ms = Date.now() - t0;
  o.blog?.(
    "info",
    brainLine(`prompt.${o.surface}`, personaName(p), [
      o.phase,
      o.agenda ? `Agenda ${o.agenda.index}` : "",
      `memory ${recall.count}`,
      `skills [${selectionTag(sel) || "—"}]`,
      fmtChars(system.length),
    ], ms),
  );
  return { system, lite, skills: sel.skills, modules: sel.picks.map((x) => x.module.id), memoryLines: recall.count, chars: system.length, ms };
}
