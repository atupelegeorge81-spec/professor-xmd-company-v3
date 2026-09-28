// src/lib/brain/hooks.ts — mahali PEKEE ambapo boardRunner inaita Brain.
//   prompt()        → system prompt ya kila wito (badala ya agent.systemPrompt)
//   noteSignals()   → SKILL_REQUEST: <id> (inaingia kwenye wito unaofuata wa agent huyo)
//   onAgendaDone()  → checkpoints (LLM call 1 kwa kila agent ALIYESHIRIKI), baada ya mini-report ya MWISHO
//   onResume()      → backfill ya checkpoints zilizokatika (agenda iliyorukwa kwenye resume) — memory/resumeGuard.ts
//   onBoardDone()   → reflection (kila agent) → collector → KILA agent anaunganisha SELF yake → Optimus anaandika
//                     memory MOJA ya Board ya kampuni (agent_memory/company) ambayo agents wote wanaisoma
// UI: matukio ya "memory" (MemoryStrip ya stage — shimmer + avatars, maudhui HAYAONYESHWI).
import { buildAgentPrompt, type BuildOpts } from "./runtime";
import { requestSkill } from "./skills/selector";
import { resolveSkill } from "./skills/registry";
import { writeCheckpoint, type CheckpointResult } from "./memory/checkpoint";
import { writeReflection } from "./memory/reflection";
import { collect, dedupeEvents } from "./memory/collector";
import { markOpenCheckpoints } from "./memory/openMark";
import { consolidateSelf, consolidateCompany } from "./memory/consolidate";
import { listSessionEvents, type MemoryEvent } from "./memory/events";
import { stateBus, type BoardSnapshot } from "./stateBus";
import { brainLine, fmtMs, type BlogFn } from "./brainLog";
import { personaName } from "./identity";
import { personaOf, PERSONAS, type Persona } from "./ids";
import type { Talk } from "./memory/transcript";
import type { LlmFn } from "./llm";
import { memoryOn, memoryOffNote } from "./memory/switch";
import { existingCheckpoints, hasCheckpoint, backfillPlan } from "./memory/resumeGuard";
import { parseSiteLines, siteQuery, siteBlock } from "./site/query";

export type MemState = "wait" | "run" | "saved" | "none" | "fail";
export type BrainUiEvent =
  | { type: "memory"; op: "start"; key: string; scope: "agenda" | "reflection" | "consolidate"; agenda?: number; agents: Persona[] }
  | { type: "memory"; op: "agent"; key: string; agent: Persona; state: MemState }
  | { type: "memory"; op: "end"; key: string }
  | { type: "skill_tag"; id: string; skills: string[]; requested?: string; found?: boolean };

export interface BoardBrainDeps {
  sessionId: () => string;
  project: string;
  /** jina fupi la mradi (conversation title) — lebo ya memory lines/events; fallback: project */
  label?: () => string;
  llm: LlmFn;
  blog: BlogFn;
  emit: (e: BrainUiEvent) => void;
}

type PromptOpts = Omit<BuildOpts, "surface" | "sessionId" | "project" | "blog" | "agentId"> & { msgId?: string };

export function createBoardBrain(d: BoardBrainDeps) {
  const local: MemoryEvent[] = []; // checkpoints za process hii (Appwrite ikishindwa, bado zinakusanywa)
  const spoke: Partial<Record<Persona, number>> = {};
  /** R15: SITE: <topic> ya agent → data ya website inaingia kwenye zamu yake INAYOFUATA (kama READ_SOURCE) */
  const sitePending: Partial<Record<Persona, Promise<{ topic: string; text: string }[]>>> = {};
  let seq = 0;
  const k = (s: string) => `${s}-${++seq}`;

  // R16: memory (checkpoint/reflection/consolidation) = darasa BACKGROUND kwenye Capacity Broker (Uno → Groq → XKiro)
  const bgLlm: LlmFn = (agentId, messages, maxTokens, o) => d.llm(agentId, messages, maxTokens, { cls: "background", purpose: "memory", ...o });
  const ev = (key: string, agent: Persona, state: MemState) => d.emit({ type: "memory", op: "agent", key, agent, state });

  return {
    state(patch: Partial<BoardSnapshot>) {
      stateBus.update(d.sessionId(), { project: d.project, ...patch });
    },
    lock(e: { index: number; item: string; decision: string; status: string }) {
      stateBus.lock(d.sessionId(), e);
    },
    objection(o: { index: number; by: string; outcome: string }) {
      stateBus.objection(d.sessionId(), o);
    },

    async prompt(agentId: string, o: PromptOpts): Promise<string> {
      const p0 = personaOf(agentId);
      const pend = sitePending[p0];
      delete sitePending[p0];
      const site = pend ? siteBlock(await pend.catch(() => [])) : "";
      const built = await buildAgentPrompt({ ...o, agentId, surface: "board", sessionId: d.sessionId(), project: d.project, projectLabel: d.label?.() || undefined, blog: d.blog, extra: site || undefined });
      if (o.msgId && built.skills.length) d.emit({ type: "skill_tag", id: o.msgId, skills: built.skills, found: true });
      return built.system;
    },

    /** Signals za jibu la agent (SKILL_REQUEST) + hesabu ya ushiriki. */
    noteSignals(agentId: string, text: string, agendaIndex: number, msgId?: string) {
      const p = personaOf(agentId);
      if (!/^\s*SILENT\s*$/i.test(String(text || ""))) spoke[p] = (spoke[p] || 0) + 1; // R21: SILENT si kuzungumza
      const qs = parseSiteLines(text);
      if (qs.length) {
        const t0 = Date.now();
        sitePending[p] = Promise.all(qs.map((q) => siteQuery(q, { agentId, surface: "board", sessionId: d.sessionId() }))).then((r) => {
          d.blog("info", brainLine("site.read", personaName(p), [r.map((x) => `${x.topic} (${x.text.length} chars)`).join(" · "), "inaingia kwenye zamu yake inayofuata"], Date.now() - t0));
          return r;
        });
      }
      const m = String(text || "").match(/(?:^|\n)\s*\**SKILL_REQUEST\**\s*:\s*([A-Za-z0-9 _/-]{2,80})/i);
      if (!m) return;
      const id = resolveSkill(m[1]);
      if (id) {
        requestSkill(`${d.sessionId() || "board"}:${agendaIndex}`, p, id);
        d.blog("info", brainLine("skill.request", personaName(p), [`${m[1].trim()} → ${id}`, id.includes("/") ? "module itapakiwa kwenye zamu yake inayofuata" : "skill nzima (modules zote) itapakiwa kwenye zamu yake inayofuata"]));
      } else {
        d.blog("warning", brainLine("skill.request", personaName(p), [`"${m[1].trim()}" haipo kwenye maktaba`, "imeandikwa kama hitaji (reflection itaamua candidate)"]));
      }
      if (msgId) d.emit({ type: "skill_tag", id: msgId, skills: [id || m[1].trim()], requested: m[1].trim(), found: !!id });
    },

    /** Baada ya mini-report ya MWISHO ya agenda: checkpoint ya kila agent aliyeshiriki (kwa zamu). */
    async onAgendaDone(a: { agendaIndex: number; agendaItem: string; participants: { id: string; role: string }[]; talk: Talk[]; miniDecision: string }): Promise<CheckpointResult[]> {
      const people = a.participants.filter((x, i, arr) => arr.findIndex((y) => personaOf(y.id) === personaOf(x.id)) === i);
      if (!people.length) return [];
      if (!memoryOn()) { memoryOffNote(d.blog); return []; }
      // resume-safe: agent aliye na checkpoint ya agenda hii tayari (session hii) haandiki nakala ya pili
      const ex = await existingCheckpoints(d.sessionId(), local);
      const key = k(`cp${a.agendaIndex}`);
      const agents = people.map((x) => personaOf(x.id));
      const t0 = Date.now();
      d.emit({ type: "memory", op: "start", key, scope: "agenda", agenda: a.agendaIndex, agents });
      const out: CheckpointResult[] = [];
      for (const x of people) {
        const p = personaOf(x.id);
        if (hasCheckpoint(ex, a.agendaIndex, p)) {
          ev(key, p, "saved");
          d.blog("info", brainLine("memory.checkpoint", personaName(p), [`Agenda ${a.agendaIndex}`, "SKIP — tayari ipo kwenye session hii (resume)"]));
          continue;
        }
        ev(key, p, "run");
        const r = await writeCheckpoint(bgLlm, d.blog, {
          persona: p, sessionId: d.sessionId(), project: d.label?.() || d.project, agendaIndex: a.agendaIndex, agendaItem: a.agendaItem, role: x.role, talk: a.talk, miniDecision: a.miniDecision,
        });
        out.push(r);
        if (r.status === "memory") local.push({ agent_id: p, session_id: d.sessionId(), kind: "checkpoint", agenda_index: a.agendaIndex, self_note: r.self, board_note: r.board, status: "memory" });
        ev(key, p, r.status === "memory" ? "saved" : r.status === "no_memory" ? "none" : "fail");
      }
      d.emit({ type: "memory", op: "end", key });
      d.blog("info", brainLine("memory.agenda", `Agenda ${a.agendaIndex}`, [`${out.filter((r) => r.status === "memory").length}/${out.length} memory · ${out.filter((r) => r.status === "no_memory").length} NO_MEMORY`], Date.now() - t0));
      return out;
    },

    /**
     * RESUME: agenda zilizorukwa (tayari kwenye Ledger). Board ikikatika katikati ya checkpoints, zilizokosekana
     * zinaandikwa sasa kutoka mini-report ya Ledger (mjadala wenyewe haupo tena). Agenda ya mwisho iliyotatuliwa +
     * zenye checkpoints nusu tu — si kila agenda (gharama ina mipaka).
     */
    async onResume(resolved: { index: number; item: string; owners: string[]; mini: string }[]) {
      if (!resolved.length) return;
      if (!memoryOn()) { memoryOffNote(d.blog); return; }
      const t0 = Date.now();
      const ex = await existingCheckpoints(d.sessionId(), local);
      const plan = backfillPlan(ex, resolved.map((r) => ({ index: r.index, owners: [...new Set(r.owners.map(personaOf))] })));
      if (!plan.length) {
        d.blog("info", brainLine("memory.resume", "Checkpoints", [`agenda ${resolved.length} zilizorukwa`, "hakuna checkpoint iliyokosekana"], Date.now() - t0));
        return;
      }
      for (const b of plan) {
        const r0 = resolved.find((r) => r.index === b.index)!;
        const key = k(`cpr${b.index}`);
        d.emit({ type: "memory", op: "start", key, scope: "agenda", agenda: b.index, agents: b.missing });
        d.blog("info", brainLine("memory.resume", `Agenda ${b.index}`, [`backfill ${b.missing.map(personaName).join(", ")}`, "chanzo: mini-report ya Ledger"]));
        for (const p of b.missing) {
          ev(key, p, "run");
          const r = await writeCheckpoint(bgLlm, d.blog, {
            persona: p, sessionId: d.sessionId(), project: d.label?.() || d.project, agendaIndex: b.index, agendaItem: r0.item, role: "owner",
            talk: [{ name: "Optimus", tag: "mini-report (resume — the live discussion is no longer available)", text: r0.mini || "(no mini-report)" }],
            miniDecision: (r0.mini || "").slice(0, 1500),
          });
          if (r.status === "memory") local.push({ agent_id: p, session_id: d.sessionId(), kind: "checkpoint", agenda_index: b.index, self_note: r.self, board_note: r.board, status: "memory" });
          ev(key, p, r.status === "memory" ? "saved" : r.status === "no_memory" ? "none" : "fail");
        }
        d.emit({ type: "memory", op: "end", key });
      }
      d.blog("success", brainLine("memory.resume", "Checkpoints", [`backfill agenda ${plan.map((b) => b.index).join(", ")}`, `${plan.reduce((n, b) => n + b.missing.length, 0)} agents`], Date.now() - t0));
    },

    /** Mwisho wa Board (baada ya ripoti kuhifadhiwa): reflection → collector → consolidation. */
    /** R20: inarudisha { ok } — ok=false kama consolidation ya agent yeyote ilishindwa (Endeleza itarudia memory). */
    async onBoardDone(b: { decisions: string; open?: { index: number; item: string }[] }): Promise<{ ok: boolean }> {
      if (!memoryOn()) { memoryOffNote(d.blog); return { ok: true }; }
      const sid = d.sessionId();
      const t0 = Date.now();
      // 1) Reflection — kila agent call 1
      const rk = k("refl");
      d.emit({ type: "memory", op: "start", key: rk, scope: "reflection", agents: PERSONAS });
      // R21: checkpoints za agenda OPEN zinawekewa alama kabla ya reflection/collector — "locked" haiwezi kuingia memory ya kampuni
      const openList = b.open || [];
      const prior = markOpenCheckpoints(dedupeEvents([...(await listSessionEvents(sid, ["checkpoint"])), ...local]), openList.map((o) => o.index));
      const openNote = openList.length
        ? `LEDGER STATUS — these items stayed OPEN (NOT locked, no final decision): ${openList.map((o) => `A${o.index} "${o.item.slice(0, 90)}"`).join("; ")}. Never describe them as locked/agreed/decided, and never merge them into a locked decision line; if you keep a line about them, it must say OPEN.`
        : "";
      const reflections: MemoryEvent[] = [];
      for (const p of PERSONAS) {
        ev(rk, p, "run");
        const r = await writeReflection(bgLlm, d.blog, { persona: p, sessionId: sid, project: d.label?.() || d.project, checkpoints: prior.filter((e) => e.agent_id === p), decisions: b.decisions, spoke: spoke[p] || 0, openNote });
        if (r.status === "memory") reflections.push({ agent_id: p, session_id: sid, kind: "reflection", self_note: r.self, board_note: r.board, status: "memory" });
        ev(rk, p, r.status === "memory" ? "saved" : r.status === "no_memory" ? "none" : "fail");
      }
      d.emit({ type: "memory", op: "end", key: rk });

      // 2) Collector — anakusanya tu
      const subs = collect(PERSONAS, [...prior, ...reflections]);
      d.blog("info", brainLine("memory.collect", "Collector", subs.map((s) => `${personaName(s.persona)} ${s.self.length + s.board.length}`)));

      // 3) R18 — KILA agent (pamoja na Optimus) anaunganisha SELF memory YAKE mwenyewe
      const ctx = { sessionId: sid, project: d.label?.() || d.project, openNote };
      const ck = k("cons");
      d.emit({ type: "memory", op: "start", key: ck, scope: "consolidate", agents: PERSONAS });
      let selfSaved = 0;
      let selfFailed = 0;
      for (const s of subs) {
        ev(ck, s.persona, "run");
        const st = await consolidateSelf(bgLlm, d.blog, s, ctx);
        if (st === "saved") selfSaved++;
        if (st === "fail") selfFailed++;
        // Optimus: SELF yake + memory ya kampuni — state yake inaonyeshwa baada ya zote mbili
        if (s.persona !== "optimus") ev(ck, s.persona, st === "saved" ? "saved" : st === "none" ? "none" : "fail");
        else if (st === "fail") ev(ck, s.persona, "fail");
      }
      // 4) R18 — Optimus PEKEE: memory MOJA ya Board ya kampuni (wote wanaisoma)
      const co = await consolidateCompany(bgLlm, d.blog, subs, ctx);
      const opt = subs.find((s) => s.persona === "optimus");
      ev(ck, "optimus", co === "fail" ? "fail" : co === "saved" || opt?.self.length ? "saved" : "none");
      d.emit({ type: "memory", op: "end", key: ck });
      const ok = selfFailed === 0 && co !== "fail";
      d.blog(ok ? "success" : "warning", `🧠 Memory ya Board ${ok ? "imekamilika" : "haikukamilika"} (reflection 5 · self ${selfSaved}${selfFailed ? ` · imeshindwa ${selfFailed}` : ""} · company ${co}) · ${fmtMs(Date.now() - t0)}`);
      return { ok };
    },
  };
}

export type BoardBrain = ReturnType<typeof createBoardBrain>;
