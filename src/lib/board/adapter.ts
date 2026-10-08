// src/lib/board/adapter.ts
// Reducer safi: matukio HALISI ya engine (BoardEvent NDJSON ya /api/boardroom) → StageItem[] + LiveStage.
// Hakuna data ya mfano. Kila chip/log/message ya boardRunner.ts ina ramani yake hapa.
// Pia hucheza tena session iliyohifadhiwa (Appwrite items) kama matukio bandia (replaySaved).

import type { BoardEvent, ScriptDiff } from "@/lib/types";
import type { SearchResult } from "@/lib/search";
import { AGENTS, agentInText, getAgent, toUiAgent, type AgentId } from "@/lib/team";
import { REPORT_SECTIONS, type Source } from "@/lib/ui-types";
import type {
  AgendaDef, AssemblyItem, LiveStage, MemoryItem, ObserversItem, PlanItem, ReportItem, ReviewItem, ScriptItem, SealItem,
  SearchTrace, StageItem, TaskItem, TaskKind, TurnItem,
  CuExecItem, CuReportItem, CuRunItem, CuShotItem, SummaryItem, CuTextItem, CuThinkItem,
} from "@/lib/stage/types";
import { pureCode } from "@/lib/codeFence";
import { PLAN_SECTION_DEFS, PLAN_PART_RE, PLAN_SAVED_RE, PLAN_FAILED_RE, PLAN_REPAIR_RE, parsePlanSteps } from "@/lib/board/workPlan";
import { readResumeState } from "./finale";

/* ------------------------------------------------------------------ events */
export interface EngineAgendaItem { index: number; item: string; owners: string[]; requiresCode: boolean }
export interface LedgerLite {
  id?: string; agenda_index: number; agenda_item: string; status: string; decision_summary: string;
  rationale?: string; trade_off?: string; carried_constraints?: string; sources?: string; supersedes?: string; owners?: string;
}
export type AdapterEvent =
  | BoardEvent
  | { type: "activity"; id: string; text?: string; state: "start" | "end" }
  | { type: "user_prompt"; text: string }
  | { type: "agenda_meta"; agenda: EngineAgendaItem[] }
  | { type: "ledger_meta"; entries: LedgerLite[] }
  // R10 Agent Brain (engine: brain/hooks.ts) — MemoryStrip (shimmer) + tag ya skill kwenye zamu
  | { type: "memory"; op: "start"; key: string; scope: "agenda" | "reflection" | "consolidate"; agenda?: number; agents: AgentId[] }
  | { type: "memory"; op: "agent"; key: string; agent: AgentId; state: "wait" | "run" | "saved" | "none" | "fail" }
  | { type: "memory"; op: "end"; key: string }
  | { type: "skill_tag"; id: string; skills: string[]; requested?: string; found?: boolean };

export type AgentStatus = "online" | "thinking" | "speaking" | "idle";
export type UsageRow = { requests: number; tokens: number };

export interface AdapterSnapshot {
  items: StageItem[];
  stage: LiveStage;
  /** agenda zote za mradi (kutoka chip/metadata ya engine) */
  agendaList: AgendaDef[];
  title: string;
  status: Record<AgentId, AgentStatus>;
  /** tokens kwa agent: exact (kutoka provider) · R31: "computer" = XMD Computer */
  usage: Record<string, UsageRow>;
  /** R20: tokens za session kwa provider (xkiro/groq/openrouter/unorouter/gemini) — tupu kwa sessions za zamani */
  providers: Record<string, UsageRow>;
  /** tokens za majibu yanayoendelea sasa hivi (makadirio ya tokenizer, live) */
  liveTokens: number;
  liveByAgent: Record<AgentId, number>;
  done: boolean;
  failed: boolean;
  sessionShort: string | null;
}

/* ------------------------------------------------------------------ helpers */
const nid = () => Math.random().toString(36).slice(2, 10);
const WRITERS = new Set<AgentId>(["vextron", "megatron", "cybertron"]);
const ALL_ONLINE = (): Record<AgentId, AgentStatus> => ({ optimus: "online", ultron: "online", vextron: "online", megatron: "online", cybertron: "online" });
const ZERO_USAGE = (): Record<AgentId, UsageRow> => ({
  optimus: { requests: 0, tokens: 0 }, ultron: { requests: 0, tokens: 0 }, vextron: { requests: 0, tokens: 0 },
  megatron: { requests: 0, tokens: 0 }, cybertron: { requests: 0, tokens: 0 },
});

export const EMPTY_STAGE: LiveStage = {
  scope: "opening", total: 0, hadCode: false, hadObjection: false, owners: [], approvals: [], version: 0, ledger: {}, background: null,
};

const toSources = (r: SearchResult[] | undefined): Source[] =>
  (r || []).filter((s) => s && s.url).map((s) => ({ title: s.title || s.url, url: s.url, snippet: s.content }));

const splitThink = (t: string): string[] =>
  t.replace(/<\/?think>/gi, "").split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);

const visible = (raw: string) =>
  raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^SEARCH:\s*.+$/gim, "").replace(/^\s+/, "");

const EXT: Record<string, string> = { html: "html", css: "css", python: "py", py: "py", javascript: "js", js: "js", jsx: "jsx", tsx: "tsx", typescript: "ts", ts: "ts", json: "json", bash: "sh", sh: "sh", sql: "sql" };
const fileFor = (agent: AgentId, lang: string) => {
  const base = { vextron: "frontend", megatron: "backend", cybertron: "qa", optimus: "final", ultron: "design" }[agent];
  return `${base}.${EXT[lang.toLowerCase()] || "txt"}`;
};

/** Toa code ya fence ya kwanza (hata kama haijafungwa bado — streaming). */
function extractCode(raw: string): { lang: string; code: string; closed: boolean } {
  const at = raw.indexOf("```scriptbox\n");
  if (at >= 0) {
    // R10 (audit): fence ya MWISHO ndiyo inayofunga scriptbox — fence ya ndani (```javascript) haivunji tena
    const rest = raw.slice(at + 13);
    const endM = rest.match(/\n```\s*$/);
    const body = endM ? rest.slice(0, endM.index) : rest.replace(/\n?`{1,3}$/, "");
    const lang0 = (body.match(/^lang:\s*(.+)$/m)?.[1] || "text").trim();
    let code = body.includes("\n---\n") ? body.slice(body.indexOf("\n---\n") + 5) : body;
    let lang = lang0;
    if (/(^|\n)```/.test(code)) { const p = pureCode(code); code = p.code; if (p.lang && p.lang !== "text") lang = p.lang; }
    return { lang, code, closed: !!endM };
  }
  const open = raw.indexOf("```");
  if (open < 0) return { lang: "text", code: "", closed: false };
  const nl = raw.indexOf("\n", open);
  if (nl < 0) return { lang: raw.slice(open + 3).trim() || "text", code: "", closed: false };
  const lang = raw.slice(open + 3, nl).trim() || "text";
  const rest = raw.slice(nl + 1);
  const close = rest.lastIndexOf("\n```");
  const fences = (raw.match(/```/g) || []).length;
  const closed = fences >= 2 && fences % 2 === 0;
  const code = closed && close >= 0 ? rest.slice(0, close) : rest.replace(/\n?`{1,3}$/, "");
  return { lang, code, closed };
}

type MsgKind = "pending" | "search" | "turn" | "script" | "patch" | "review" | "observer" | "deliverable" | "assembly" | "report" | "plan" | "skip";
interface Msg {
  id: string; agent: AgentId; kind: MsgKind; ui: string | null;
  raw: string; think: string; t0: number; firstToken: number | null; done: boolean;
  diff?: ScriptDiff; dissolving?: boolean; reason?: "review" | "objection";
  /** continuation ya script: maandishi ya attempts za awali */
  base?: string;
  /** R10: skills zilizopakiwa kwenye wito huu (tag ya TurnItem) */
  skillTag?: { name: string; found: boolean };
  /** R12: search iliyoombwa ndani ya jibu lililotangulia la agent yule yule → inaambatishwa kwenye zamu hiyo */
  follow?: boolean;
}

/* ================================================================== adapter */
export function createBoardAdapter(opts: { instant?: boolean; now?: () => number } = {}) {
  const now = opts.now || (() => Date.now());
  let instant = !!opts.instant;

  let items: StageItem[] = [];
  let cuRunUi: string | null = null; // R31: id ya CuRunItem ya awamu husika
  let planMode = false; // R31-G5: mode ya session — plan mode HAINA script/patch/review (awamu za code hazipo)
  let cuThinkSeq = 0; // R31-G5: kila block ya think = card yake (si step — mbili kwenye step ileile zilichanganyika)
  let cuThinkOpen: string | null = null; // card ya think iliyo wazi (think_start…think_end)
  /** R38-RC4: fikia card ya think iliyo wazi bila kuisaha (orphan limewekwa partial:false). */
  const closeCuThink = () => { if (cuThinkOpen) { patch<CuThinkItem>(cuThinkOpen, { partial: false }); cuThinkOpen = null; } };
  const index = new Map<string, number>();
  let stage: LiveStage = { ...EMPTY_STAGE };
  let title = "";
  let status = ALL_ONLINE();
  let usage = ZERO_USAGE();
  /** R20: tokens za session kwa provider (usage_provider) */
  let providers: Record<string, UsageRow> = {};
  const live = new Map<string, { agent: AgentId; tokens: number }>();
  let done = false;
  let failed = false;
  let sessionShort: string | null = null;
  const t0 = now();

  // muktadha wa engine
  const msgs = new Map<string, Msg>();
  let agendaDefs: AgendaDef[] = [];
  let agendaMeta: EngineAgendaItem[] | null = null;
  let cur: AgendaDef | undefined;
  let afterLock = false;
  let consensus = { proposed: "", by: "" as AgentId | "", agrees: new Set<AgentId>(), reached: false, version: 0 };
  let reviewRound = 0;
  let reviewRejected = false;
  let objection: { agent: AgentId; concern: string } | null = null;
  let responderTurn: string | null = null;
  let finale: "none" | "validate" | "assemble" | "plan" | "report" = "none";
  const pendingSearch = new Map<AgentId, string>();
  const spoke = new Set<AgentId>();
  const scripts = new Map<AgentId, { ui: string; raw: string; agenda: number }>();
  let observersUi: string | null = null;
  let reportUi: string | null = null;
  let reportRaw: string[] = [];
  let reportMissing: number[] = [];
  // R30: card ya Mpango Kazi (kama ReportWriter — shimmer, si chip)
  let planUi: string | null = null;
  let planRaw: string[] = [];
  let assemblyUi: string | null = null;
  let assemblyRaw = "";
  let agendaTask: string | null = null;
  const tasks = new Map<string, string>(); // engine activity id → ui id
  const traceOwner = new Map<AgentId, string>(); // agent → ui item yenye trace inayoendelea
  // R12: zamu iliyomalizika yenye RESEARCH_REQUEST/READ_SOURCE — search zinazofuata za agent huyo zinaingia ndani yake
  let followTarget: { agent: AgentId; ui: string } | null = null;
  const taskStart = new Map<string, number>();
  let baseSeconds = 0;

  /* ------------------------------------------------ item ops */
  const add = (it: StageItem) => {
    index.set(it.id, items.length);
    items = [...items, it];
    return it.id;
  };
  const get = <T extends StageItem>(id: string | null | undefined): T | undefined => {
    if (!id) return undefined;
    const i = index.get(id);
    return i === undefined ? undefined : (items[i] as T);
  };
  const patch = <T extends StageItem>(id: string | null | undefined, p: Partial<T> | ((x: T) => Partial<T>)) => {
    if (!id) return;
    const i = index.get(id);
    if (i === undefined) return;
    const x = items[i] as T;
    const next = { ...x, ...(typeof p === "function" ? p(x) : p) } as StageItem;
    items = items.slice();
    items[i] = next;
  };
  const remove = (id: string) => {
    const i = index.get(id);
    if (i === undefined) return;
    items = items.filter((x) => x.id !== id);
    index.clear();
    items.forEach((x, k) => index.set(x.id, k));
  };
  const stageSet = (p: Partial<LiveStage>) => { stage = { ...stage, ...p }; };
  const setStatus = (a: AgentId, s: AgentStatus) => { if (status[a] !== s) status = { ...status, [a]: s }; };
  const notice = (tone: Extract<StageItem, { kind: "notice" }>["tone"], text: string, agent?: AgentId, detail?: string) =>
    add({ kind: "notice", id: nid(), tone, agent, text, detail });

  const newTrace = (variant: SearchTrace["variant"], query: string): SearchTrace => ({
    variant, query, queryShown: query.length, cache: "wait", engine: "wait", attempt: 0, maxAttempts: 11, failures: 0, save: "wait", sources: [], done: false,
  });
  const patchTrace = (ui: string, p: Partial<SearchTrace> | ((t: SearchTrace) => Partial<SearchTrace>)) => {
    const it = get(ui);
    if (!it) return;
    if (it.kind === "turn" && it.followUps?.length && !it.followUps[it.followUps.length - 1].done) {
      patch<TurnItem>(ui, (x) => {
        const f = x.followUps!.slice();
        const last = f[f.length - 1];
        f[f.length - 1] = { ...last, ...(typeof p === "function" ? p(last) : p) };
        return { followUps: f };
      });
      return;
    }
    if (it.kind === "turn" && it.search) patch<TurnItem>(ui, (x) => ({ search: { ...x.search!, ...(typeof p === "function" ? p(x.search!) : p) } }));
    if (it.kind === "evidence") patch<Extract<StageItem, { kind: "evidence" }>>(ui, (x) => ({ trace: { ...x.trace, ...(typeof p === "function" ? p(x.trace) : p) } }));
  };

  /** Search ya agent isiyofuatwa na zamu yake → kadi ya evidence ya peke yake (mpangilio wa muda unabaki sahihi). */
  const flushAgent = (agent: AgentId) => flushPending(undefined, agent);
  const flushPending = (except?: AgentId, only?: AgentId) => {
    for (const [agent, ui] of [...pendingSearch]) {
      if (agent === except || (only && agent !== only)) continue;
      pendingSearch.delete(agent);
      const it = get<TurnItem>(ui);
      if (!it || it.kind !== "turn" || !it.search || it.content) continue;
      const i = index.get(ui)!;
      items = items.slice();
      items[i] = { kind: "evidence", id: ui, agent, trace: { ...it.search, done: true } };
      setStatus(agent, "online");
    }
  };

  const defFor = (idx: number, titleText?: string): AgendaDef => {
    const d = agendaDefs.find((a) => a.index === idx);
    if (d) return d;
    const nd: AgendaDef = { index: idx, title: titleText || `Agenda ${idx}`, owners: [], requiresCode: false };
    agendaDefs = [...agendaDefs, nd].sort((a, b) => a.index - b.index);
    return nd;
  };
  const applyAgendaMeta = () => {
    if (!agendaMeta?.length) return;
    agendaDefs = agendaMeta.map((a) => ({ index: a.index, title: a.item, owners: (a.owners || []).map(toUiAgent), requiresCode: !!a.requiresCode }));
    const byIdx = (n: number) => agendaDefs.find((a) => a.index === n);
    items = items.map((x) => {
      if (x.kind === "agendaBuild") return { ...x, items: agendaDefs, shown: agendaDefs.length };
      if (x.kind === "agendaStart") { const d = byIdx(x.agenda.index); return d ? { ...x, agenda: d, total: agendaDefs.length } : x; }
      if (x.kind === "seal") { const d = byIdx(x.agenda.index); return d ? { ...x, agenda: d, owners: d.owners } : x; }
      return x;
    });
    if (cur) cur = byIdx(cur.index) || cur;
    stageSet({ total: agendaDefs.length, agenda: cur, owners: cur?.owners.length ? cur.owners : stage.owners });
  };

  const resetAgendaCtx = () => {
    flushPending();
    followTarget = null;
    afterLock = false;
    consensus = { proposed: "", by: "", agrees: new Set(), reached: false, version: 0 };
    reviewRound = 0;
    reviewRejected = false;
    objection = null;
    responderTurn = null;
    observersUi = null;
    spoke.clear();
  };

  /* ------------------------------------------------ classification */
  const classify = (m: Msg): MsgKind => {
    const c = m.raw;
    if (finale === "plan" && m.agent === "optimus") return "plan";
    if (finale === "report" && m.agent === "optimus") return "report";
    if (finale === "assemble" && m.agent === "optimus") return "assembly";
    if (afterLock && !objection && cur && !cur.owners.includes(m.agent)) return "observer";
    if (afterLock && !objection && !cur?.owners.length && !spoke.has(m.agent)) return "observer";
    if (objection && !responderTurn && m.agent === (cur?.owners[0] || "optimus")) return "turn";
    // R31-G5 · PLAN MODE: hakuna script/patch/review/deliverable — awamu hizo za CODE mode
    // hazipo kabisa. (Kosa la 6ac42a20: consensus ikifika, ujumbe unaofuata wa writer uliingia
    // ScriptBox TUPU "script", wa non-writer kwenye card ya "code review"; objection + writer
    // uliingia "patch" — logic ya patching ya zamani. Sasa: kila kitu ni turn ya kawaida.)
    if (!planMode) {
      if (/^\*\*Deliverable ya mwisho/.test(c)) return "deliverable";
      if (/^↕️/.test(c)) return "skip";
      if (/^```scriptbox/.test(c)) return "patch";
      if (objection && responderTurn && WRITERS.has(m.agent)) return "patch";
      if (consensus.reached && !afterLock) {
        if (WRITERS.has(m.agent) && (cur?.owners.includes(m.agent) ?? true)) return reviewRejected ? "patch" : "script";
        return "review";
      }
    }
    return "turn";
  };

  const startTurn = (m: Msg) => {
    flushPending(m.agent);
    const reuse = pendingSearch.get(m.agent);
    const role: TurnItem["role"] = objection ? "responder" : cur?.owners.includes(m.agent) ? "owner" : "chair";
    if (objection && !responderTurn) responderTurn = m.id;
    if (reuse && get(reuse)?.kind === "turn") {
      m.ui = reuse;
      pendingSearch.delete(m.agent);
      patch<TurnItem>(reuse, { phase: "thinking", role });
    } else {
      m.ui = add({ kind: "turn", id: nid(), agent: m.agent, role, thinking: [], thinkShown: 0, content: "", target: "", phase: "thinking", seconds: instant ? -1 : 0 });
    }
    if (!objection && cur?.owners.includes(m.agent)) stageSet({ phase: "discussion" });
    if (objection) stageSet({ phase: "review" });
  };

  const startScript = (m: Msg) => {
    stageSet({ phase: "code", hadCode: true });
    const prev = scripts.get(m.agent);
    const prevIt = get<ScriptItem>(prev?.ui);
    if (prev && prevIt && prev.agenda === (cur?.index ?? 0) && prevIt.state === "resume") {
      m.ui = prev.ui;
      m.base = `${prev.raw}\n`;
      patch<ScriptItem>(prev.ui, (x) => ({ attempt: x.attempt + 1, state: "writing" }));
      return;
    }
    m.ui = add({ kind: "script", id: nid(), agent: m.agent, file: fileFor(m.agent, "text"), lang: "text", code: "", shown: 0, attempt: 1, maxAttempts: 3, state: "writing", version: 1 });
    scripts.set(m.agent, { ui: m.ui, raw: "", agenda: cur?.index ?? 0 });
  };

  const startPatch = (m: Msg) => {
    const prev = scripts.get(m.agent);
    const base = get<ScriptItem>(prev?.ui);
    m.reason = objection ? "objection" : "review";
    m.ui = add({
      kind: "script", id: nid(), agent: m.agent, file: base?.file || fileFor(m.agent, "text"), lang: base?.lang || "text",
      code: base?.code || "", shown: (base?.code || "").length, attempt: 1, maxAttempts: 3, state: "patching", version: (base?.version || 1) + 1,
    });
    stageSet({ phase: objection ? "review" : "code" });
  };

  const ensureObservers = (): string => {
    if (observersUi && get(observersUi)) return observersUi;
    const owners = cur?.owners || [];
    const obs = AGENTS.map((a) => a.id).filter((id) => !owners.includes(id));
    observersUi = add({ kind: "observers", id: nid(), agenda: cur?.index ?? 0, checks: obs.map((agent) => ({ agent, state: "wait" as const })) });
    stageSet({ phase: "review" });
    return observersUi;
  };
  const setCheck = (agent: AgentId, state: ObserversItem["checks"][number]["state"]) => {
    const ui = ensureObservers();
    patch<ObserversItem>(ui, (x) => ({
      checks: x.checks.some((c) => c.agent === agent) ? x.checks.map((c) => (c.agent === agent ? { ...c, state } : c)) : [...x.checks, { agent, state }],
    }));
  };

  /** R12: search ya agent iliyoombwa ndani ya jibu lake lililopita → ndani ya zamu ile ile (hakuna sehemu mpya tupu) */
  const attachFollow = (m: Msg, trace: SearchTrace): boolean => {
    if (!followTarget || followTarget.agent !== m.agent) return false;
    const it = get<TurnItem>(followTarget.ui);
    if (!it || it.kind !== "turn") { followTarget = null; return false; }
    m.kind = "search";
    m.follow = true;
    m.ui = followTarget.ui;
    patch<TurnItem>(m.ui, (x) => ({ followUps: [...(x.followUps || []), trace] }));
    traceOwner.set(m.agent, m.ui);
    return true;
  };

  const materialize = (m: Msg, via: "think" | "token" | "search" | "done") => {
    if (m.kind !== "pending") return;
    if (via === "search") {
      m.kind = "search";
      return;
    }
    followTarget = null; // ujumbe mwingine wowote umeanza → search zijazo si za zamu ile tena
    m.kind = classify(m);
    switch (m.kind) {
      case "turn": startTurn(m); break;
      case "script": startScript(m); break;
      case "patch": startPatch(m); break;
      case "review": {
        reviewRound++;
        m.ui = add({ kind: "review", id: nid(), agent: m.agent, verdict: "pending", round: reviewRound, maxRounds: 2, notes: [] });
        break;
      }
      case "observer": setCheck(m.agent, "check"); break;
      case "assembly": {
        if (!assemblyUi || !get(assemblyUi)) {
          const pieces = [...scripts.entries()]
            .map(([agent, s]) => ({ agent, s: get<ScriptItem>(s.ui), agenda: s.agenda }))
            .filter((p) => p.s && p.s.code)
            .map((p) => ({ agenda: p.agenda, agent: p.agent, file: p.s!.file, lines: p.s!.code.split("\n").length }));
          assemblyUi = add({ kind: "assembly", id: nid(), pieces, merged: pieces.length, file: "final.txt", code: "", shown: 0, attempt: 1, maxAttempts: 6, done: false });
          assemblyRaw = "";
        } else {
          patch<AssemblyItem>(assemblyUi, (x) => ({ attempt: x.attempt + 1, done: false }));
          assemblyRaw += "\n";
        }
        m.ui = assemblyUi;
        break;
      }
      case "report": {
        if (!reportUi || !get(reportUi)) openReport(1);
        m.ui = reportUi;
        reportRaw.push("");
        patch<ReportItem>(reportUi, { live: true });
        break;
      }
      case "plan": {
        if (!planUi || !get(planUi)) openPlan(1);
        m.ui = planUi;
        planRaw.push("");
        patch<PlanItem>(planUi, { live: true });
        break;
      }
      default: break;
    }
  };

  /* ------------------------------------------------ report */
  const openReport = (part: 1 | 2 | 3) => {
    if (!reportUi || !get(reportUi)) {
      reportRaw = [];
      reportUi = add({
        kind: "report", id: nid(), title: title || "Ripoti", part, reportId: "", doc: "", shown: 0, saved: "wait", startedAt: now(), live: false,
        sections: REPORT_SECTIONS.map((t, i) => ({ n: i + 1, title: t, state: "wait" as const, chars: 0 })),
      });
    } else patch<ReportItem>(reportUi, { part });
  };
  const syncReport = (streaming: boolean) => {
    const it = get<ReportItem>(reportUi);
    if (!it) return;
    const parts = reportRaw.map((p) => visible(p).trim()).filter(Boolean);
    const main = parts.slice(0, Math.min(parts.length, 2));
    const fix = parts.slice(2);
    let doc = main.join("\n\n");
    let repairFrom: number | undefined;
    if (fix.length) { repairFrom = doc.length + 2; doc = `${doc}\n\n${fix.join("\n\n")}`; }
    const heads = [...doc.matchAll(/^#{1,3}\s*(\d{1,2})[.)]/gm)].map((h) => ({ n: Number(h[1]), at: h.index ?? 0 }));
    const sections = it.sections.map((s) => {
      const hi = heads.map((h, i) => ({ ...h, i })).filter((h) => h.n === s.n).pop();
      if (!hi) return reportMissing.includes(s.n) ? { ...s, state: "missing" as const } : s;
      const end = heads[hi.i + 1]?.at ?? doc.length;
      const isLast = hi.i === heads.length - 1;
      const repairing = repairFrom !== undefined && hi.at >= repairFrom;
      const state = isLast && streaming ? (repairing ? "repairing" : "writing") : repairing ? "repaired" : "done";
      return { ...s, state: state as ReportItem["sections"][number]["state"], chars: end - hi.at };
    });
    patch<ReportItem>(reportUi, { doc, shown: doc.length, repairFrom, sections, title: title || it.title });
  };

  /* ------------------------------------------------ plan (R30 — muonekano uleule wa report) */
  const openPlan = (part: 1 | 2 | 3) => {
    if (!planUi || !get(planUi)) {
      planRaw = [];
      planUi = add({
        kind: "plan", id: nid(), title: title || "Mpango Kazi wa Agent", part, planId: "", doc: "", shown: 0, saved: "wait", startedAt: now(), live: false,
        sections: PLAN_SECTION_DEFS.map((d) => ({ n: d[0], title: d[2], state: "wait" as const, chars: 0 })),
        steps: [],
      });
    } else patch<PlanItem>(planUi, { part });
  };

  const syncPlan = (streaming: boolean) => {
    const it = get<PlanItem>(planUi);
    if (!it) return;
    const parts = planRaw.map((p) => visible(p).trim()).filter(Boolean);
    const main = parts.slice(0, Math.min(parts.length, 2));
    const fix = parts.slice(2);
    let doc = main.join("\n\n");
    let repairFrom: number | undefined;
    if (fix.length) { repairFrom = doc.length + 2; doc = `${doc}\n\n${fix.join("\n\n")}`; }
    const heads = [...doc.matchAll(/^#{1,3}\s*(\d{1,2})[.)]/gm)].map((h) => ({ n: Number(h[1]), at: h.index ?? 0 }));
    const sections = it.sections.map((s) => {
      const hi = heads.map((h, i) => ({ ...h, i })).filter((h) => h.n === s.n).pop();
      if (!hi) return s;
      const end = heads[hi.i + 1]?.at ?? doc.length;
      const isLast = hi.i === heads.length - 1;
      const repairing = repairFrom !== undefined && hi.at >= repairFrom;
      const state = isLast && streaming ? (repairing ? "repairing" : "writing") : repairing ? "repaired" : "done";
      return { ...s, state: state as PlanItem["sections"][number]["state"], chars: end - hi.at };
    });
    // hatua: "### Step N — Title" (live kadiri sehemu ya 6 inavyoandikwa)
    const stepHeads = [...doc.matchAll(/^###\s*Step\s+(\d+)\s*[—–-]+\s*(.+)$/gm)].map((m) => ({ n: Number(m[1]), title: m[2].trim(), at: m.index ?? 0 }));
    const lastHeadAt = stepHeads.length ? stepHeads[stepHeads.length - 1].at : -1;
    const steps = stepHeads.map((s) => ({ n: s.n, title: s.title, state: (streaming && s.at === lastHeadAt ? "writing" : "done") as "wait" | "writing" | "done" }));
    patch<PlanItem>(planUi, { doc, shown: doc.length, repairFrom, sections, steps, title: title || it.title });
  };

  /* ------------------------------------------------ logs → search trace */
  const onLog = (msg: string) => {
    const agent = agentInText(msg);
    if (!agent) return;
    const ui = traceOwner.get(agent);
    if (!ui) return;
    const it = get(ui);
    const fu = it?.kind === "turn" && it.followUps?.length ? it.followUps[it.followUps.length - 1] : undefined;
    const tr = fu && !fu.done ? fu : it?.kind === "turn" ? it.search : it?.kind === "evidence" ? it.trace : undefined;
    if (!tr || tr.done) return;
    let m: RegExpMatchArray | null;
    if (/anakagua Appwrite cache kwanza/.test(msg)) patchTrace(ui, { cache: "run" });
    else if ((m = msg.match(/KAPATA kwenye Appwrite! Similarity: ([\d.]+)%/))) patchTrace(ui, { cache: "done", similarity: Number(m[1]), engine: "skip", save: "skip" });
    else if ((m = msg.match(/swali la zamani lililomatch: "([\s\S]*)"/))) patchTrace(ui, { matched: m[1] });
    else if ((m = msg.match(/KAKOSA kwenye Appwrite — similarity ya juu: ([\d.]+)%(?: \(threshold (\d+)%)?/))) patchTrace(ui, { cache: "fail", similarity: Number(m[1]), ...(m[2] ? { threshold: Number(m[2]) } : {}) });
    else if (/Embedding Engine haipatikani sasa/.test(msg)) patchTrace(ui, { cache: "skip" });
    else if (/Appwrite cache error/.test(msg)) patchTrace(ui, { cache: "fail" });
    else if (/cache hit haionekani relevant/.test(msg)) patchTrace(ui, { relevance: "fail", engine: "wait", save: "wait" });
    else if (/anarudi SearXNG MOJA KWA MOJA/.test(msg)) patchTrace(ui, (t) => ({ cache: t.cache === "wait" ? "skip" : t.cache }));
    else if (/anaangalia memory ya mjadala huu kwanza/.test(msg)) patchTrace(ui, { cache: "skip", memory: "run" });
    else if (/amepata kwenye memory/.test(msg)) patchTrace(ui, { memory: "done", engine: "skip", save: "skip" });
    else if (/hakupata kwenye memory/.test(msg)) patchTrace(ui, { memory: "fail" });
    else if ((m = msg.match(/anawasha SearXNG engine\.\.\. \(attempt (\d+)\/(\d+)\)/))) patchTrace(ui, { engine: "run", attempt: Number(m[1]), maxAttempts: Number(m[2]), waitLeft: undefined });
    else if (/SearXNG attempt \d+\/\d+ imefeli/.test(msg)) patchTrace(ui, (t) => ({ engine: "fail", failures: t.failures + 1 }));
    else if ((m = msg.match(/inasubiri (\d+)s kabla ya retry/))) patchTrace(ui, { waitLeft: Number(m[1]) });
    else if (/KUTOKA SEARCH ENGINE/.test(msg)) patchTrace(ui, { engine: "done", waitLeft: undefined });
    else if (/anasave vector/.test(msg)) patchTrace(ui, { save: "run" });
    else if (/SAVE SUCCESS/.test(msg)) patchTrace(ui, { save: "done" });
    else if (/Appwrite save error/.test(msg)) patchTrace(ui, { save: "fail" });
    else if (/SearXNG imeshindwa baada ya retries/.test(msg)) patchTrace(ui, { engine: "fail", waitLeft: undefined });
  };

  /* ------------------------------------------------ chips */
  const onChip = (raw: string) => {
    const text = raw.trim();
    let m: RegExpMatchArray | null;
    if ((m = text.match(/^🏛️ Board Room — "([\s\S]*)"$/))) {
      add({ kind: "convene", id: nid(), mode: "new", project: m[1], title: title, titleShown: title.length, sessionId: sessionShort || undefined });
      stageSet({ scope: "opening" });
      return;
    }
    if ((m = text.match(/^♻️ Board Room imeendelea — "([\s\S]*)"$/))) {
      add({ kind: "convene", id: nid(), mode: "resume", project: m[1], title, titleShown: title.length, sessionId: sessionShort || undefined });
      return;
    }
    if (/^♻️ Kuna mjadala unaoendelea background/.test(text)) { notice("info", "Kuna mjadala unaoendelea background — umerejea kwake."); return; }
    if ((m = text.match(/^💾 Conversation imeundwa \(id: ([A-Za-z0-9]+)/))) {
      sessionShort = m[1];
      const conv = [...items].reverse().find((x) => x.kind === "convene");
      if (conv) patch(conv.id, { sessionId: m[1] });
      return;
    }
    if (/^♻️ (Conversation imerejeshwa|Kuendelea na mjadala)/.test(text)) { notice("info", text.replace(/^♻️\s*/, "")); return; }
    if ((m = text.match(/^🧭 Optimus ameelewa:\s*([\s\S]*)$/))) { add({ kind: "scope", id: nid(), text: m[1], shown: m[1].length }); return; }
    if (/^📋 Optimus anaunda agenda/.test(text)) {
      agendaTask = add({ kind: "task", id: nid(), task: "agenda", agent: "optimus", text: "Optimus anaunda agenda ya mradi…", state: "run" });
      taskStart.set(agendaTask, now());
      stageSet({ background: "Optimus anaunda agenda ya mradi…" });
      setStatus("optimus", "thinking");
      return;
    }
    if ((m = text.match(/^📋 Agenda \((\d+) vipengele\):\s*([\s\S]*)$/))) {
      if (agendaTask) { patch<TaskItem>(agendaTask, { state: "done", result: `vipengele ${m[1]}`, ms: now() - (taskStart.get(agendaTask) || now()) }); agendaTask = null; }
      setStatus("optimus", "online");
      stageSet({ background: null });
      if (!agendaMeta?.length) {
        const titles = m[2].split(" · ").map((s) => s.trim()).filter(Boolean);
        agendaDefs = titles.map((t, i) => ({ index: i + 1, title: t, owners: [], requiresCode: false }));
      }
      add({ kind: "agendaBuild", id: nid(), items: agendaDefs, shown: agendaDefs.length });
      stageSet({ total: agendaDefs.length || Number(m[1]) });
      return;
    }
    if ((m = text.match(/^Agenda (\d+)\/(\d+):\s*([\s\S]*?) — owners:\s*(.*)$/))) {
      resetAgendaCtx();
      const idx = Number(m[1]);
      const d = defFor(idx, m[3]);
      if (!d.owners.length) {
        const owners = m[4].split(/\s*\+\s*|,\s*/).map((n) => agentInText(n)).filter(Boolean) as AgentId[];
        agendaDefs = agendaDefs.map((a) => (a.index === idx ? { ...a, owners } : a));
      }
      cur = agendaDefs.find((a) => a.index === idx)!;
      add({ kind: "agendaStart", id: nid(), agenda: cur, total: Number(m[2]) });
      stageSet({ scope: "agenda", agenda: cur, total: Number(m[2]), phase: "evidence", owners: cur.owners, approvals: [], version: 0, hadCode: false, hadObjection: false });
      return;
    }
    if ((m = text.match(/^🔒 LOCKED:\s*([\s\S]*?) → ([\s\S]*)$/)) || (m = text.match(/^🟠 OPEN:\s*([\s\S]*?) → ([\s\S]*)$/))) {
      flushPending();
      const locked = text.startsWith("🔒");
      const d = cur || defFor(stage.agenda?.index ?? 0, m[1]);
      afterLock = true;
      add({
        kind: "seal", id: nid(), agenda: d, status: locked ? "LOCKED" : "OPEN", version: 1,
        decision: locked ? consensus.proposed || m[2] : "UNRESOLVED — hakuna consensus ya kutosha",
        constraints: [], owners: d.owners, sources: sourcesInAgenda(d.index), ledgerId: "",
      });
      stageSet({ phase: "lock", ledger: { ...stage.ledger, [d.index]: { status: locked ? "LOCKED" : "OPEN", version: 1 } } });
      return;
    }
    if (/^❌ Ledger imeshindwa/.test(text)) { notice("halt", text.replace(/^❌\s*/, "")); return; }
    if ((m = text.match(/^🛑 Objection:\s*([\s\S]*)$/))) {
      const ui = ensureObservers();
      const ob = get<ObserversItem>(ui);
      const objector = ob?.checks.find((c) => c.state === "objection")?.agent || ob?.checks.find((c) => c.state === "check")?.agent || "optimus";
      const concern = m[1].replace(/\.\.\.$/, "");
      objection = { agent: objector, concern };
      patch<ObserversItem>(ui, (x) => ({
        objection: { agent: objector, concern: x.objection?.concern || concern, severity: "high" },
        checks: x.checks.map((c) => (c.agent === objector ? { ...c, state: "objection" } : c.state === "wait" || c.state === "check" ? { ...c, state: "skipped" } : c)),
      }));
      stageSet({ hadObjection: true, phase: "review" });
      return;
    }
    if ((m = text.match(/^🔁 SUPERSEDED →\s*([\s\S]*)$/))) {
      const idx = cur?.index ?? stage.agenda?.index ?? 0;
      const old = [...items].reverse().find((x): x is SealItem => x.kind === "seal" && x.agenda.index === idx && !x.superseded);
      if (old) patch<SealItem>(old.id, { superseded: true });
      const d = cur || defFor(idx);
      const responder = get<TurnItem>(responderTurn ? msgs.get(responderTurn)?.ui : null)?.agent || d.owners[0] || "optimus";
      add({ kind: "seal", id: nid(), agenda: d, status: "LOCKED", version: (old?.version || 1) + 1, decision: m[1], constraints: [], owners: d.owners, sources: sourcesInAgenda(idx), ledgerId: "", supersedes: old?.ledgerId });
      add({
        kind: "supersede", id: nid(), agenda: idx, objector: objection?.agent || "optimus", responder,
        from: { ledgerId: old?.ledgerId || "", text: old?.decision || "", version: old?.version || 1 },
        to: { ledgerId: "", text: m[1], version: (old?.version || 1) + 1 },
      });
      stageSet({ phase: "relock", ledger: { ...stage.ledger, [idx]: { status: "SUPERSEDED+LOCKED", version: (old?.version || 1) + 1 } } });
      return;
    }
    if ((m = text.match(/^↩️ Objection imekataliwa:\s*([\s\S]*)$/))) {
      const responder = get<TurnItem>(responderTurn ? msgs.get(responderTurn)?.ui : null)?.agent || cur?.owners[0] || "optimus";
      add({ kind: "overruled", id: nid(), objector: objection?.agent || "optimus", responder, concern: objection?.concern || "", reason: m[1] });
      return;
    }
    if (/^⚠️ Re-lock/.test(text)) { notice("warn", text.replace(/^⚠️\s*/, "")); return; }
    if (/^🟠 Validator:/.test(text)) { notice("warn", text.replace(/^🟠\s*/, "")); return; }
    if (/^❌ Validator:/.test(text)) { notice("halt", text.replace(/^❌\s*/, "")); return; }
    if (/^🧩 /.test(text)) {
      flushPending();
      finale = "assemble";
      stageSet({ scope: "finale", finale: "assemble", background: null });
      return;
    }
    // R30: card ya Mpango Kazi — chips hizi ZIMEMEZWA hapa (hazionekani kama notice; card ndiyo inayoonyesha)
    if ((m = text.match(PLAN_PART_RE))) {
      flushPending();
      finale = "plan";
      stageSet({ scope: "finale", finale: "plan", plan: true });
      openPlan(Number(m[1]) as 1 | 2);
      return;
    }
    if (PLAN_REPAIR_RE.test(text)) {
      openPlan(3);
      syncPlan(false);
      return;
    }
    if (PLAN_SAVED_RE.test(text)) {
      if (planUi && get<PlanItem>(planUi)?.saved !== "failed") patch<PlanItem>(planUi, { saved: "saved", live: false });
      return;
    }
    if (PLAN_FAILED_RE.test(text)) {
      if (planUi) patch<PlanItem>(planUi, { saved: "failed", live: false });
      notice("error", text.replace(/^❌\s*/, ""));
      return;
    }
    if ((m = text.match(/^📑 Optimus anaandika ripoti — Kipande (\d)\/2/))) {
      finale = "report";
      stageSet({ scope: "finale", finale: "report" });
      if (assemblyUi) patch<AssemblyItem>(assemblyUi, { done: true });
      openReport(Number(m[1]) as 1 | 2);
      return;
    }
    if ((m = text.match(/^🛠️ Optimus anarekebisha ripoti:\s*([\s\S]*?)(\.\.\.)?$/))) {
      openReport(3);
      reportMissing = m[1].split(/,\s*/).map((t) => REPORT_SECTIONS.findIndex((s) => s.toLowerCase() === t.trim().toLowerCase()) + 1).filter((n) => n > 0);
      syncReport(false);
      return;
    }
    if (/^🤝 /.test(text)) {
      // engine: "🤝 Mjadala umekamilika. Ripoti iko kwenye 📑 Reports." — inaandikwa BAADA ya saveReport kufaulu.
      // Replay/refresh haina tukio la "report", hivyo chip hii ndiyo uthibitisho kwamba ripoti imehifadhiwa.
      if (/Ripoti iko kwenye/i.test(text) && reportUi && get<ReportItem>(reportUi)?.saved !== "failed") patch<ReportItem>(reportUi, { saved: "saved", live: false });
      return;
    }
    if (/^❌ Ripoti imeandikwa lakini IMESHINDWA/.test(text)) {
      if (reportUi) patch<ReportItem>(reportUi, { saved: "failed", live: false });
      notice("error", text.replace(/^❌\s*/, ""));
      return;
    }
    if (/^❌ Ripoti imekosa/.test(text)) { if (reportUi) patch<ReportItem>(reportUi, { saved: "failed", live: false }); notice("error", text.replace(/^❌\s*/, "")); return; }
    if ((m = text.match(/^🔁 (\S+): ([\s\S]*?) → ([\s\S]*?) → ([\s\S]*)$/))) {
      notice("rotate", `${m[1]}: ${m[2]}`, agentInText(m[1]) || undefined, `${m[3]} → ${m[4]}`);
      return;
    }
    if ((m = text.match(/^♻️ (\S+): model retry (\d+)\/(\d+) → ([\s\S]*)$/))) {
      const agent = agentInText(m[1]) || undefined;
      const active = agent ? [...msgs.values()].reverse().find((x) => x.agent === agent && !x.done && x.kind === "turn") : undefined;
      if (active?.ui) patch<TurnItem>(active.ui, { phase: "retrying", content: "", retry: { n: Number(m[2]), max: Number(m[3]), model: m[4] } });
      notice("retry", `${m[1]}: jibu tupu/truncated — retry ${m[2]}/${m[3]}`, agent, m[4]);
      return;
    }
    notice(/^❌/.test(text) ? "error" : /^⚠️/.test(text) ? "warn" : "info", text);
  };

  const sourcesInAgenda = (idx: number) => {
    const start = [...items].map((x, i) => ({ x, i })).reverse().find((p) => p.x.kind === "agendaStart" && p.x.agenda.index === idx)?.i ?? 0;
    const urls = new Set<string>();
    for (let i = start; i < items.length; i++) {
      const x = items[i];
      const tr = x.kind === "turn" ? x.search : x.kind === "evidence" ? x.trace : undefined;
      tr?.sources.forEach((s) => urls.add(s.url));
      if (x.kind === "turn") x.followUps?.forEach((f) => f.sources.forEach((s) => urls.add(s.url)));
    }
    return urls.size;
  };

  /* ------------------------------------------------ msg done */
  const finishMsg = (m: Msg) => {
    m.done = true;
    live.delete(m.id);
    const c = visible(m.raw).trim();
    switch (m.kind) {
      case "search": {
        if (m.ui) patchTrace(m.ui, (t) => ({
          done: true,
          cache: t.cache === "wait" || t.cache === "run" ? "skip" : t.cache,
          engine: t.engine === "run" || t.engine === "wait" ? (t.memory === "done" ? "skip" : t.sources.length ? "done" : "fail") : t.engine,
          save: t.save === "run" ? "done" : t.save === "wait" ? "skip" : t.save,
          waitLeft: undefined,
        }));
        if (m.ui && !m.follow) patch<TurnItem>(m.ui, (x) => (x.kind === "turn" ? { phase: "thinking" } : {}));
        traceOwner.delete(m.agent);
        setStatus(m.agent, "online");
        break;
      }
      case "turn": {
        patch<TurnItem>(m.ui, { content: c, target: c, phase: "done", retry: undefined });
        followTarget = m.ui && /(^|\n)\s*\*{0,2}(RESEARCH_REQUEST|READ_SOURCE)\*{0,2}\s*:/i.test(c) ? { agent: m.agent, ui: m.ui } : null;
        spoke.add(m.agent);
        mirrorConsensus(m.agent, c);
        break;
      }
      case "script": {
        const s = scripts.get(m.agent);
        if (s && s.ui === m.ui) {
          const x = extractCode(s.raw);
          patch<ScriptItem>(m.ui, { code: x.code, shown: x.code.length, lang: x.lang, file: fileFor(m.agent, x.lang), state: x.closed ? "done" : "resume" });
        }
        break;
      }
      case "patch": {
        if (m.diff || /^```scriptbox/.test(m.raw.trim()) || /```scriptbox/.test(m.raw)) {
          const x = extractCode(m.raw.slice(m.raw.indexOf("```scriptbox") >= 0 ? m.raw.indexOf("```scriptbox") : 0));
          const d = m.diff;
          const hunks = (d?.changes || []).map((h) => ({ line: h.startLine, old: h.oldLines, new: h.newLines }));
          const changed: number[] = [];
          hunks.forEach((h) => h.new.forEach((_, k) => changed.push(h.line + k)));
          patch<ScriptItem>(m.ui, {
            code: x.code, shown: x.code.length, lang: x.lang, file: fileFor(m.agent, x.lang), state: "done",
            patch: d ? { reason: m.reason || "review", add: d.additions, del: d.deletions, hunks, changed } : undefined,
          });
          const prev = scripts.get(m.agent);
          if (prev && prev.ui !== m.ui && d) patch<ScriptItem>(prev.ui, { replaced: { add: d.additions, del: d.deletions } });
          scripts.set(m.agent, { ui: m.ui!, raw: m.raw, agenda: cur?.index ?? 0 });
        } else {
          if (m.ui) remove(m.ui);
          const name = getAgent(m.agent)!.name;
          if (/^NO_CHANGES_NEEDED/i.test(c) || /^ℹ️/.test(c)) notice("info", `${name}: hakuna mabadiliko yanayohitajika kwenye script yake.`, m.agent);
          else notice("retry", `${name}: patch haikutumika kwa usahihi — anajaribu tena.`, m.agent);
        }
        break;
      }
      case "review": {
        const ok = /^APPROVE/i.test(c);
        const notes = ok ? [] : c.replace(/^REJECT:\s*/i, "").split(/\n+|(?<=\.)\s+(?=[A-Z0-9-])/).map((s) => s.replace(/^[-*•\d.)\s]+/, "").trim()).filter(Boolean).slice(0, 6);
        patch<ReviewItem>(m.ui, { verdict: ok ? "approve" : "reject", notes });
        if (!ok) reviewRejected = true;
        break;
      }
      case "observer": {
        const silent = /^SILENT$/i.test(c);
        const om = c.match(/OBJECTION:\s*(.+?)(?:\n|$)/i);
        const sev = c.match(/SEVERITY:\s*(high|medium|low)/i);
        if (!silent && om && sev && sev[1].toLowerCase() === "high") {
          setCheck(m.agent, "objection");
          const ui = ensureObservers();
          patch<ObserversItem>(ui, { objection: { agent: m.agent, concern: om[1].trim().slice(0, 400), severity: "high" } });
        } else setCheck(m.agent, "silent");
        break;
      }
      case "assembly": {
        const x = extractCode(assemblyRaw);
        patch<AssemblyItem>(m.ui, { code: x.code, shown: x.code.length, file: fileFor("optimus", x.lang), done: x.closed });
        break;
      }
      case "report": {
        syncReport(false);
        patch<ReportItem>(reportUi, { live: false, saved: "saving" });
        break;
      }
      case "plan": {
        syncPlan(false);
        patch<PlanItem>(planUi, { live: false, saved: "saving" });
        break;
      }
      case "pending": {
        // ujumbe bila tokens: deliverable ya mwisho (setItemContent tu) au ujumbe uliokwama
        if (WRITERS.has(m.agent) && (consensus.reached || afterLock)) addDeliverable(m.agent);
        break;
      }
      case "deliverable": addDeliverable(m.agent); break;
      default: break;
    }
    setStatus(m.agent, "online");
  };

  const addDeliverable = (agent: AgentId) => {
    const s = get<ScriptItem>(scripts.get(agent)?.ui);
    add({ kind: "deliverable", id: nid(), agent, file: s?.file || fileFor(agent, "text"), lines: s?.code ? s.code.split("\n").length : 0, agenda: cur?.title || "" });
  };

  const mirrorConsensus = (agent: AgentId, clean: string) => {
    if (!cur || !cur.owners.includes(agent) || afterLock || consensus.reached) return;
    const isAgree = /(^|\n)\s*\*{0,2}\s*AGREE:\s*\*{0,2}/i.test(clean);
    const pd = clean.match(/PROPOSED DECISION:\s*([\s\S]+?)(?=\n(?:RATIONALE:|TRADE-OFF:|EVIDENCE:|$))/i);
    const owners = cur.owners;
    if (pd && !isAgree) {
      const hadVotes = consensus.agrees.size > 1;
      consensus.proposed = pd[1].trim();
      consensus.by = agent;
      consensus.agrees = new Set([agent]);
      consensus.version++;
      add({ kind: "consensus", id: nid(), event: consensus.version > 1 && hadVotes ? "reset" : "proposed", by: agent, version: consensus.version, owners, approvals: [...consensus.agrees] });
    }
    if (consensus.proposed && isAgree) {
      consensus.agrees.add(agent);
      add({ kind: "consensus", id: nid(), event: "agreed", by: agent, version: consensus.version, owners, approvals: [...consensus.agrees] });
    }
    if (consensus.proposed && owners.length && owners.every((o) => consensus.agrees.has(o))) {
      consensus.reached = true;
      add({ kind: "consensus", id: nid(), event: "reached", by: (consensus.by || agent) as AgentId, version: consensus.version, owners, approvals: [...consensus.agrees] });
    }
    stageSet({ approvals: [...consensus.agrees], version: consensus.version });
  };

  /* ------------------------------------------------ brain (R10) */
  const memStrips = new Map<string, string>(); // engine key → ui id
  const applySkillTag = (m: Msg | undefined) => {
    if (!m?.skillTag || !m.ui) return;
    const it = get<TurnItem>(m.ui);
    if (it && it.kind === "turn" && it.skill?.name !== m.skillTag.name) patch<TurnItem>(m.ui, { skill: m.skillTag });
  };
  function applyBrain(e: AdapterEvent): boolean {
    if (e.type === "memory") {
      if (e.op === "start") {
        flushPending();
        const ui = add({ kind: "memory", id: nid(), scope: e.scope, agenda: e.agenda, agents: e.agents.map((id) => ({ id, state: "wait" as const })), done: false });
        memStrips.set(e.key, ui);
        stageSet({
          background: e.scope === "consolidate" ? "Optimus anaunganisha memory…" : e.scope === "reflection" ? "Final reflection…" : `Memory checkpoint · agenda ${e.agenda}`,
          ...(e.scope === "agenda" ? { phase: "memory" as const } : { scope: "finale" as const, finale: "reflect" as const }),
        });
      } else if (e.op === "agent") {
        const ui = memStrips.get(e.key);
        if (ui) patch<MemoryItem>(ui, (x) => ({ agents: x.agents.map((a) => (a.id === e.agent ? { ...a, state: e.state } : a)) }));
        if (e.state === "run") setStatus(e.agent, "thinking");
        else setStatus(e.agent, "online");
      } else {
        const ui = memStrips.get(e.key);
        if (ui) patch<MemoryItem>(ui, (x) => ({ done: true, agents: x.agents.map((a) => (a.state === "run" || a.state === "wait" ? { ...a, state: "none" as const } : a)) }));
        memStrips.delete(e.key);
        stageSet({ background: null });
      }
      return true;
    }
    if (e.type === "skill_tag") {
      const m = msgs.get(e.id);
      if (m) {
        m.skillTag = { name: e.skills.join(" + "), found: e.found !== false };
        applySkillTag(m);
      }
      return true;
    }
    return false;
  }

  /* ------------------------------------------------ apply */
  function apply(e: AdapterEvent) {
    if (applyBrain(e)) return;
    applyCore(e);
    if ("id" in e && typeof (e as { id?: unknown }).id === "string") applySkillTag(msgs.get((e as { id: string }).id));
  }
  function applyCore(e: AdapterEvent) {
    switch (e.type) {
      case "user_prompt": add({ kind: "user", id: nid(), text: e.text }); break;
      // R31-G5: plan mode — hakuna script/patch/review UI; stage.plan mapema (rail ya agenda pia)
      case "mode":
        planMode = e.mode === "plan";
        stageSet({ plan: planMode || undefined });
        break;
      case "agenda_meta": agendaMeta = e.agenda; applyAgendaMeta(); break;
      case "ledger_meta": applyLedger(e.entries); break;
      case "log": onLog(e.entry.message); break;
      case "system": onChip(e.text); break;
      case "title_stream": break;
      case "title_done": {
        title = e.title;
        items = items.map((x) => (x.kind === "convene" ? { ...x, title: e.title, titleShown: e.title.length } : (x.kind === "report" || x.kind === "plan") && !x.title ? { ...x, title: e.title } : x));
        break;
      }
      case "round": stageSet({ total: e.total }); break;
      case "activity": {
        if (e.state === "start") {
          const text = e.text || "";
          const task: TaskKind = /mini report/i.test(text) ? "mini" : /anafunga upya/i.test(text) ? "relock" : /anafunga agenda/i.test(text) ? "lock"
            : /search query ya pingamizi/i.test(text) ? "query" : /anakagua Ledger/i.test(text) ? "validate" : /agenda zote kwenye ripoti/i.test(text) ? "reportCheck" : "mini";
          if (task === "validate") { flushPending(); finale = "validate"; stageSet({ scope: "finale", finale: "validate" }); }
          if (task === "lock") stageSet({ phase: "lock" });
          if (task === "relock") stageSet({ phase: "relock" });
          const ui = add({ kind: "task", id: nid(), task, agent: "optimus", text, state: "run" });
          tasks.set(e.id, ui);
          taskStart.set(ui, now());
          stageSet({ background: text });
          setStatus("optimus", "thinking");
        } else {
          const ui = tasks.get(e.id);
          const it = get<TaskItem>(ui);
          if (ui && it) {
            patch<TaskItem>(ui, { state: "done", ms: now() - (taskStart.get(ui) || now()) });
            if (it.task === "validate") {
              const rows = agendaDefs.map((a) => {
                const l = stage.ledger[a.index];
                return { index: a.index, title: a.title, state: (l ? (l.status === "OPEN" ? "open" : "locked") : "missing") as "open" | "locked" | "missing" };
              });
              add({ kind: "validator", id: nid(), scope: "ledger", rows, done: true });
            }
          }
          tasks.delete(e.id);
          stageSet({ background: null });
          setStatus("optimus", "online");
        }
        break;
      }
      case "msg_start": {
        const m: Msg = { id: e.id, agent: toUiAgent(e.agentId), kind: "pending", ui: null, raw: "", think: "", t0: now(), firstToken: null, done: false };
        msgs.set(e.id, m);
        break;
      }
      case "search": {
        const m = msgs.get(e.id);
        if (!m) break;
        if (m.kind === "pending" && attachFollow(m, newTrace("research", e.query))) { setStatus(m.agent, "thinking"); break; }
        if (m.kind === "pending") {
          followTarget = null;
          materialize(m, "search");
          const variant: SearchTrace["variant"] = objection ? "objection" : spoke.has(m.agent) ? "research" : "gate";
          if (pendingSearch.has(m.agent)) flushAgent(m.agent); // search mpya ya agent yule yule → ya zamani inakuwa evidence
          m.ui = add({
            kind: "turn", id: nid(), agent: m.agent, role: objection ? "responder" : "owner", thinking: [], thinkShown: 0, content: "", target: "",
            phase: "searching", seconds: instant ? -1 : 0, search: newTrace(variant, e.query),
          });
          pendingSearch.set(m.agent, m.ui);
          traceOwner.set(m.agent, m.ui);
          stageSet(objection ? { phase: "review" } : spoke.has(m.agent) ? {} : { phase: "evidence" });
        }
        setStatus(m.agent, "thinking");
        break;
      }
      case "sources": {
        const m = msgs.get(e.id);
        if (!m) break;
        if (m.kind === "pending" && attachFollow(m, { ...newTrace(objection ? "objection" : "research", ""), cache: "skip", memory: "done", engine: "skip", save: "skip" })) {
          if (m.ui) patchTrace(m.ui, { sources: toSources(e.sources) });
          break;
        }
        if (m.kind === "pending") {
          // memory hit (hakuna `search` event) — handleResearchRequest
          followTarget = null;
          materialize(m, "search");
          m.ui = add({
            kind: "turn", id: nid(), agent: m.agent, role: objection ? "responder" : "owner", thinking: [], thinkShown: 0, content: "", target: "",
            phase: "searching", seconds: instant ? -1 : 0, search: { ...newTrace(objection ? "objection" : "research", ""), cache: "skip", memory: "done", engine: "skip", save: "skip" },
          });
          pendingSearch.set(m.agent, m.ui);
        }
        if (m.ui) patchTrace(m.ui, { sources: toSources(e.sources) });
        break;
      }
      case "think": {
        const m = msgs.get(e.id);
        if (!m) break;
        m.think += e.text;
        if (m.kind === "pending") materialize(m, "think");
        if (m.kind === "turn" && m.ui) {
          const steps = splitThink(m.think);
          patch<TurnItem>(m.ui, (x) => ({ thinking: steps, thinkShown: steps.length, phase: x.phase === "answering" ? x.phase : "thinking" }));
        }
        if (m.kind !== "search") setStatus(m.agent, "thinking");
        break;
      }
      case "token": {
        const m = msgs.get(e.id);
        if (!m) break;
        if (m.done && /^↕️/.test(e.text)) {
          // dissolveMessage: script ya zamani imebadilishwa na sasisho
          const mm = e.text.match(/\+(\d+)\s*-(\d+)/);
          const ui = m.ui;
          if (ui && get(ui)?.kind === "script" && mm) patch<ScriptItem>(ui, (x) => ({ replaced: x.replaced || { add: Number(mm[1]), del: Number(mm[2]) } }));
          break;
        }
        m.raw += e.text;
        if (m.kind === "pending") {
          if (instant && /^↕️/.test(m.raw)) {
            // replay: ujumbe wa script uliobadilishwa — code yake ilifutwa na engine
            const mm = m.raw.match(/\+(\d+)\s*-(\d+)/);
            m.kind = "skip";
            m.ui = add({ kind: "script", id: nid(), agent: m.agent, file: fileFor(m.agent, "text"), lang: "text", code: "", shown: 0, attempt: 1, maxAttempts: 3, state: "done", version: 1, replaced: { add: Number(mm?.[1] || 0), del: Number(mm?.[2] || 0) } });
            break;
          }
          materialize(m, "token");
        }
        if (m.firstToken === null) {
          m.firstToken = now();
          if (m.kind === "turn" && m.ui && !instant) patch<TurnItem>(m.ui, { seconds: Math.max(0, Math.round((m.firstToken - m.t0) / 1000)) });
        }
        switch (m.kind) {
          case "turn": patch<TurnItem>(m.ui, { content: visible(m.raw), phase: "answering", retry: undefined }); setStatus(m.agent, "speaking"); break;
          case "script": {
            const s = scripts.get(m.agent);
            if (s && s.ui === m.ui) {
              s.raw = (m.base || "") + m.raw;
              const x = extractCode(s.raw);
              patch<ScriptItem>(m.ui, { code: x.code, shown: x.code.length, lang: x.lang, file: fileFor(m.agent, x.lang) });
            }
            setStatus(m.agent, "speaking");
            break;
          }
          case "patch": setStatus(m.agent, "speaking"); break;
          case "assembly": {
            assemblyRaw += e.text;
            const x = extractCode(assemblyRaw);
            patch<AssemblyItem>(m.ui, { code: x.code, shown: x.code.length, file: fileFor("optimus", x.lang) });
            setStatus("optimus", "speaking");
            break;
          }
          case "report": reportRaw[reportRaw.length - 1] = m.raw; syncReport(true); setStatus("optimus", "speaking"); break;
          case "plan": planRaw[planRaw.length - 1] = m.raw; syncPlan(true); setStatus("optimus", "speaking"); break;
          default: setStatus(m.agent, "speaking"); break;
        }
        break;
      }
      case "msg_reset": {
        const m = msgs.get(e.id);
        if (!m) break;
        if (m.done) { m.dissolving = true; break; }
        m.raw = "";
        if (m.kind === "turn") patch<TurnItem>(m.ui, { content: "", phase: "retrying" });
        if (m.kind === "report") { reportRaw[reportRaw.length - 1] = ""; syncReport(true); }
        if (m.kind === "plan") { planRaw[planRaw.length - 1] = ""; syncPlan(true); }
        if (m.kind === "assembly") assemblyRaw = "";
        break;
      }
      case "script_diff": { const m = msgs.get(e.id); if (m) m.diff = e.diff; break; }
      case "msg_done": { const m = msgs.get(e.id); if (m && !m.done) { if (m.kind === "pending" && m.raw) materialize(m, "done"); finishMsg(m); } break; }
      case "usage_provider": {
        providers = { ...e.byProvider };
        break;
      }
      case "usage_live": {
        live.set(e.id, { agent: toUiAgent(e.agentId), tokens: e.prompt + e.completion });
        break;
      }
      case "usage": {
        // R31: "computer" ni XMD Computer — si agent ya timu (isiungane na Optimus)
        const a = e.agentId === "computer" ? "computer" : toUiAgent(e.agentId);
        usage = { ...usage, [a]: { requests: e.requests, tokens: e.tokens } };
        if (e.id) live.delete(e.id);
        break;
      }
      case "report": {
        if (!reportUi) openReport(1);
        patch<ReportItem>(reportUi, { saved: "saved", reportId: e.id, title: e.title, live: false });
        break;
      }
      case "summary": {
        const rows: SummaryItem["usage"] = AGENTS.map((a) => {
          const u = (e.usage as Record<string, { requests: number; tokens: number }>)[a.engineId] || { requests: 0, tokens: 0 };
          return { agent: a.id, requests: u.requests, tokens: u.tokens };
        });
        // R31: tokens za XMD Computer (agent "computer") — mstari wake mwenyewe kwenye SummaryCard
        const cuU = (e.usage as Record<string, { requests: number; tokens: number }>)["computer"];
        if (cuU && (cuU.tokens || cuU.requests)) rows.push({ agent: "computer", requests: cuU.requests, tokens: cuU.tokens });
        usage = Object.fromEntries(rows.map((r) => [r.agent, { requests: r.requests, tokens: r.tokens }])) as Record<AgentId, UsageRow>;
        live.clear();
        const seals = items.filter((x): x is SealItem => x.kind === "seal");
        add({
          kind: "summary", id: nid(), seconds: Math.round((now() - t0) / 1000) + baseSeconds, usage: rows,
          locked: seals.filter((s) => s.status === "LOCKED" && !s.superseded).length,
          superseded: items.filter((x) => x.kind === "supersede").length,
          open: seals.filter((s) => s.status === "OPEN").length,
          sources: new Set(items.flatMap((x) => (x.kind === "evidence" ? x.trace.sources : x.kind === "turn" ? [...(x.search?.sources || []), ...(x.followUps || []).flatMap((f) => f.sources)] : []).map((s) => s.url))).size,
          requests: rows.reduce((n, r) => n + r.requests, 0),
        });
        break;
      }
      case "cu": applyCu(e.cu); break;
      case "error": notice("error", e.message); failed = true; break;
      case "done": finalize(); break;
      default: break;
    }
  }

  function applyLedger(entries: LedgerLite[]) {
    if (!entries?.length) return;
    const short = (id?: string) => (id ? id.slice(-6) : "");
    const constraintsOf = (e: LedgerLite) => (e.carried_constraints || "").split("\n").map((s) => s.replace(/^[-*•\s]+/, "").trim()).filter((s) => s && !/^hakuna\.?$/i.test(s)).slice(0, 6);
    const srcCount = (e: LedgerLite) => { try { const v = JSON.parse(e.sources || "[]"); return Array.isArray(v) ? v.length : 0; } catch { return 0; } };
    items = items.map((x) => {
      if (x.kind === "seal") {
        const cands = entries.filter((e) => e.agenda_index === x.agenda.index);
        const e = x.version > 1 ? cands.find((c) => c.supersedes) || cands[cands.length - 1] : cands.find((c) => !c.supersedes) || cands[0];
        if (!e) return x;
        return {
          ...x, ledgerId: short(e.id) || x.ledgerId, decision: e.decision_summary || x.decision, rationale: e.rationale || x.rationale,
          tradeoff: e.trade_off || x.tradeoff, constraints: constraintsOf(e).length ? constraintsOf(e) : x.constraints,
          sources: Math.max(x.sources, srcCount(e)), supersedes: e.supersedes ? short(e.supersedes) : x.supersedes,
        };
      }
      return x;
    });
    items = items.map((x) => {
      if (x.kind !== "supersede") return x;
      const seals = items.filter((s): s is SealItem => s.kind === "seal" && s.agenda.index === x.agenda);
      const from = seals.find((s) => s.superseded);
      const to = seals.find((s) => !s.superseded && s.version > 1);
      return { ...x, from: { ...x.from, ledgerId: from?.ledgerId || x.from.ledgerId }, to: { ...x.to, ledgerId: to?.ledgerId || x.to.ledgerId } };
    });
  }

  function finalize() {
    flushPending();
    done = true;
    items = items.map((x) => {
      if (x.kind === "turn" && x.followUps?.some((f) => !f.done)) x = { ...x, followUps: x.followUps.map((f) => ({ ...f, done: true })) };
      if (x.kind === "turn" && x.phase !== "done") return { ...x, phase: "done", retry: undefined, search: x.search && { ...x.search, done: true } };
      if (x.kind === "script" && x.state !== "done") return { ...x, state: "done" };
      if (x.kind === "evidence" && !x.trace.done) return { ...x, trace: { ...x.trace, done: true } };
      if (x.kind === "task" && x.state === "run") return { ...x, state: "done" };
      if (x.kind === "review" && x.verdict === "pending") return x;
      if (x.kind === "report") return { ...x, live: false, settled: true };
      if (x.kind === "plan") return { ...x, live: false, settled: true };
      if (x.kind === "assembly" && !x.done) return { ...x, done: true };
      return x;
    });
    live.clear();
    status = ALL_ONLINE();
    stageSet({ background: null, ...(failed ? {} : { scope: "done", finale: "done" }) });
  }

  /* ------------------ R31 · XMD Computer ------------------
   * Matukio ya bridge (bcast live) na SessionItem za replay — yote {type:"cu", cu:{...}}.
   * Live: exec_start→exec_output*→exec_end, shot→shot_ok, think/text, usage, github/deploy, finish, run_end.
   * Replay (savedToEvents): item moja "exec" (iliyounganishwa), "shot" yenye fileId, "report", "run_end". */
  /* ---------------------------------------------------- R31 · XMD Computer (TIMELINE kama xmd3)
   * Kila tukio la CU lina StageItem YAKE kwenye mkondo: thinking card (shimmer),
   * maneno ya agent (KAWAIDA — hakuna avatar, hakuna bubble, markdown+mermaid),
   * exec cards (draft inamiminika → command → output), screenshot cards (scan→flash),
   * GitHub/Live cards. CuRunItem ni card ya HALI tu (maandalizi ya e2b).
   * Live: tool_draft→exec_start→exec_output→exec_end · Replay: items za engine. */
  function applyCu(cu: Record<string, any>): void {
    const t = String(cu?.type || "");
    const runItem = (): CuRunItem | null => {
      const it = items.find((x) => x.id === cuRunUi);
      return it && it.kind === "cuRun" ? it : null;
    };
    const execBy = (execId: string): CuExecItem | undefined =>
      items.find((x) => x.kind === "cuExec" && x.execId === execId) as CuExecItem | undefined;
    const firstUrl = (v: any): string => (Array.isArray(v) ? String(v[0] || "") : String(v || ""));

    switch (t) {
      case "divider":
      case "run_start": {
        // divider ya awamu (badge + mistari — mtindo wa agenda-start) inakuja mara moja
        if (!items.some((x) => x.kind === "cuDivider")) add({ kind: "cuDivider", id: nid() });
        if (cuRunUi) {
          if (t === "run_start" && cu.task) patch<CuRunItem>(cuRunUi, { task: String(cu.task) });
          return;
        }
        cuRunUi = nid();
        add({
          kind: "cuRun", id: cuRunUi,
          task: String(cu.task || "Utekelezaji wa Mpango Kazi"),
          status: "run", step: 0, tokens: 0, requests: 0,
          files: [], filesCount: 0, github: "", deploy: "", screenshots: 0,
          startedAt: now(), finished: false,
        });
        break;
      }
      // ── mawazo ya agent: thinking card (xmd3 ThinkingCard — shimmer → collapsed) ──
      case "think_start": {
        // R31-G5: kila block ya think = card YAKE (wawili kwenye step ileile walichanganyika)
        // R38-RC4: card iliyotangulia iliyofungwa bila think_end (stream ikirudiwa/ikikatika)
        // inafungwa kabla ya mpya — usiache orphan partial:true (ushahidi [311]/[314])
        if (cuThinkOpen) { patch<CuThinkItem>(cuThinkOpen, { partial: false }); cuThinkOpen = null; }
        cuThinkSeq += 1;
        cuThinkOpen = `cuThink_${cuThinkSeq}`;
        add({ kind: "cuThink", id: cuThinkOpen, step: Number(cu.step) || 0, text: "", partial: true });
        break;
      }
      case "think_delta": {
        if (!cuRunUi) return;
        if (!cuThinkOpen) { cuThinkSeq += 1; cuThinkOpen = `cuThink_${cuThinkSeq}`; add({ kind: "cuThink", id: cuThinkOpen, step: Number(cu.step) || 0, text: "", partial: true }); }
        const cur = get<CuThinkItem>(cuThinkOpen);
        if (cur) patch<CuThinkItem>(cuThinkOpen, { text: (cur.text + String(cu.text || "")).slice(0, 4000), partial: true });
        else add({ kind: "cuThink", id: cuThinkOpen, step: Number(cu.step) || 0, text: String(cu.text || ""), partial: true });
        break;
      }
      case "think_end": {
        if (!cuRunUi) return;
        const id = cuThinkOpen;
        cuThinkOpen = null;
        if (!id) break;
        const cur = get<CuThinkItem>(id);
        patch<CuThinkItem>(id, { text: String(cu.text ?? cur?.text ?? "").slice(0, 4000), ms: Number(cu.ms) || undefined, partial: false });
        break;
      }
      case "think": {
        // replay (item kamili kutoka doc) — card MPYA kila moja
        if (!cuRunUi) return;
        cuThinkSeq += 1;
        add({ kind: "cuThink", id: `cuThink_${cuThinkSeq}`, step: Number(cu.step) || 0, text: String(cu.text || "").slice(0, 4000), ms: Number(cu.ms) || undefined, partial: false });
        break;
      }
      // ── maneno ya agent: mkondoni KAWAIDA (markdown + mermaid — hakuna card) ──
      case "text_delta": {
        if (!cuRunUi) return;
        const s = Number(cu.step) || 0;
        const id = `cuText_${s}`;
        const cur = get<CuTextItem>(id);
        if (cur) patch<CuTextItem>(id, { text: (cur.text + String(cu.text || "")).slice(0, 20_000), partial: true });
        else add({ kind: "cuText", id, step: s, text: String(cu.text || ""), partial: true });
        break;
      }
      case "text_end":
      case "text": {
        if (!cuRunUi) return;
        const s = Number(cu.step) || 0;
        const id = `cuText_${s}`;
        const cur = get<CuTextItem>(id);
        const text = String(cu.text ?? cur?.text ?? "").slice(0, 20_000);
        if (cur) patch<CuTextItem>(id, { text, partial: false });
        else add({ kind: "cuText", id, step: s, text, partial: false });
        break;
      }
      // ── exec: draft (code ikimiminika) → start → output → end ──
      case "tool_draft": {
        if (!cuRunUi) return;
        const execId = String(cu.id || "");
        if (!execId) return;
        // R31-G4: `content` ndiyo CODE inayomiminika (xmd3 CodeStreamBlock); `preview` ni label tu
        const draft = String(cu.content || cu.preview || "");
        const cur = execBy(execId);
        if (cur) {
          if (draft) patch<CuExecItem>(cur.id, { draft: draft.slice(0, 2000) });
        } else {
          add({
            kind: "cuExec", id: nid(), execId, step: Number(cu.step) || 0,
            tool: String(cu.name || "?"), kindX: "?", command: "", draft: draft.slice(0, 2000),
            state: "run", startedAt: now(),
          });
        }
        break;
      }
      case "exec_start": {
        if (!cuRunUi) return;
        const execId = String(cu.id || "");
        const cur = execBy(execId);
        const base: Partial<CuExecItem> = {
          tool: String(cu.tool || "?"), kindX: String(cu.kind || "?"),
          command: String(cu.command || ""), path: cu.path || undefined,
          preview: cu.preview ? String(cu.preview) : undefined,
          oldStr: cu.old_str ? String(cu.old_str) : undefined,
          newStr: cu.new_str ? String(cu.new_str) : undefined,
        };
        if (cur) patch<CuExecItem>(cur.id, base);
        else add({ kind: "cuExec", id: nid(), execId, step: Number(cu.step) || 0, ...base, state: "run", startedAt: now() } as CuExecItem);
        patch<CuRunItem>(cuRunUi, (x) => ({ step: Math.max(x.step, Number(cu.step) || 0) }));
        break;
      }
      case "exec_output": {
        const cur = execBy(String(cu.id || ""));
        if (!cur) return;
        patch<CuExecItem>(cur.id, { output: ((cur.output || "") + String(cu.chunk || "")).slice(-4000) });
        break;
      }
      case "exec_end": {
        const cur = execBy(String(cu.id || ""));
        const exit = Number(cu.exit);
        if (cur) {
          patch<CuExecItem>(cur.id, {
            state: (Number.isFinite(exit) && exit !== 0) ? "fail" : "done",
            exit: Number.isFinite(exit) ? exit : undefined,
            ms: Number(cu.ms) || undefined, lines: Number(cu.lines) || undefined, chars: Number(cu.chars) || undefined,
            summary: String(cu.summary || "").slice(0, 220) || undefined,
          });
        }
        break;
      }
      case "exec": { // replay: item iliyounganishwa (exec kamili + output)
        if (!cuRunUi) return;
        const exit = Number(cu.exit);
        add({
          kind: "cuExec", id: nid(), execId: String(cu.execId || nid()), step: Number(cu.step) || 0,
          tool: String(cu.tool || "?"), kindX: String(cu.kindX || "?"),
          command: String(cu.command || ""), path: cu.path || undefined,
          preview: cu.preview ? String(cu.preview) : undefined,
          oldStr: cu.oldStr || cu.old_str ? String(cu.oldStr || cu.old_str) : undefined,
          newStr: cu.newStr || cu.new_str ? String(cu.newStr || cu.new_str) : undefined,
          exit: Number.isFinite(exit) ? exit : undefined, ms: Number(cu.ms) || undefined,
          lines: Number(cu.lines) || undefined, chars: Number(cu.chars) || undefined,
          summary: String(cu.summary || "").slice(0, 220) || undefined,
          output: String(cu.output || "").slice(0, 4000) || undefined,
          state: Number.isFinite(exit) && exit !== 0 ? "fail" : "done",
          startedAt: now(),
        });
        patch<CuRunItem>(cuRunUi, (x) => ({ step: Math.max(x.step, Number(cu.step) || 0) }));
        break;
      }
      // ── shot: live (bila fileId → scan line) → shot_ok (fileId) · replay: kamili ──
      case "shot": {
        if (!cuRunUi) return;
        add({ kind: "cuShot", id: nid(), step: Number(cu.step) || 0, label: String(cu.label || "Picha"), fileId: String(cu.fileId || ""), bucketId: String(cu.bucketId || ""), ok: !!cu.fileId });
        patch<CuRunItem>(cuRunUi, (x) => ({ screenshots: x.screenshots + 1 }));
        break;
      }
      case "shot_ok": {
        const pending = [...items].reverse().find((x) => x.kind === "cuShot" && !x.ok && (x as CuShotItem).label === String(cu.label || ""));
        if (pending) patch<CuShotItem>(pending.id, { fileId: String(cu.fileId || ""), bucketId: String(cu.bucketId || ""), ok: true });
        break;
      }
      case "usage": {
        if (!cuRunUi || cu.ok === false) return; // attempts zilizoshindikana hazihesabiwi
        const total = Number(cu.total) || 0;
        patch<CuRunItem>(cuRunUi, (x) => ({ tokens: x.tokens + total, requests: x.requests + 1 }));
        break;
      }
      case "pause": {
        // R31-G4 (replay): session ilipumzika (quota ya siku) — card ya pause + run "paused"
        closeCuThink(); // R38-RC4: pause — think wazi inafungwa
        if (cuRunUi) patch<CuRunItem>(cuRunUi, { status: "paused", finished: true });
        add({ kind: "cuPause", id: nid(), resumeAt: Number((cu as any).resumeAt) || Number((cu as any).resume_at) || 0, ms: Number(cu.ms) || 0, steps: Number(cu.steps) || 0 } as any);
        break;
      }
      case "files": {
        // R31-G4: bridge inatuma `tree` (si `files`) — kosa la G: uwanja usiokuwepo → tree
        // haikuwa ionekani LIVE. Mwisho tu = 0 files ni halali (workspace mpya).
        const normFile = (x: any) => (typeof x === "string" ? x : { path: String(x?.p ?? x?.path ?? ""), isDir: !!(x?.d ?? x?.isDir), size: Number(x?.s ?? x?.size ?? 0) || 0 });
        const tree = Array.isArray(cu.tree) ? cu.tree.map(normFile).slice(0, 500) : Array.isArray(cu.files) ? cu.files.map(normFile).slice(0, 500) : [];
        if (!cuRunUi) return;
        patch<CuRunItem>(cuRunUi, { files: tree, filesCount: Number(cu.filesCount) || tree.length });
        break;
      }
      case "github": {
        if (!cuRunUi) return;
        const url = String(cu.url || "");
        patch<CuRunItem>(cuRunUi, { github: url });
        add({ kind: "cuLink", id: nid(), step: Number(cu.step) || 0, link: "github", url });
        break;
      }
      // R35: nidhamu ya hooks (live: xmd_hook + kind · replay: hook + hookKind) — kwenye timeline na export
      case "xmd_hook":
      case "hook": {
        add({ kind: "cuHook", id: nid(), step: Number(cu.step) || 0,
              hookKind: String(cu.kind || cu.hookKind || "advice"),
              text: String(cu.text || ""), command: cu.command ? String(cu.command).slice(0, 300) : undefined,
              streak: Number(cu.streak) || 0 });
        break;
      }
      case "deploy": {
        if (!cuRunUi) return;
        const url = String(cu.url || "");
        patch<CuRunItem>(cuRunUi, { deploy: url });
        add({ kind: "cuLink", id: nid(), step: Number(cu.step) || 0, link: "deploy", url });
        break;
      }
      case "report":
      case "finish": {
        const doc = String(cu.text || cu.report || "");
        if (!doc) return;
        const run = runItem();
        add({
          kind: "cuReport", id: nid(),
          title: "Ripoti ya XMD Computer",
          doc, partial: !!cu.partial, status: String(cu.status || "done"),
          screenshots: run?.screenshots || 0, filesCount: run?.filesCount || 0, tokens: run?.tokens || 0,
          github: run?.github || "", deploy: run?.deploy || "",
          startedAt: run?.startedAt || now(),
        });
        break;
      }
      case "error": {
        const msg = String(cu.message || "Kosa la XMD Computer");
        add({ kind: "cuError", id: nid(), message: msg.slice(0, 500) });
        if (!cuRunUi) notice("error", `🖥️ XMD Computer: ${msg}`);
        break;
      }
      case "run_end": {
        closeCuThink(); // R38-RC4: think iliyo wazi haibaki partial:true mwishoni (hata bila run card)
        if (!cuRunUi) return;
        const run = runItem();
        if (String(cu.status) === "paused_quota") {
          patch<CuRunItem>(cuRunUi, { status: "paused", finished: true, ms: Number(cu.ms) || undefined });
          add({ kind: "cuPause", id: nid(), resumeAt: Number((cu as any).resume_at) || 0, ms: Number(cu.ms) || 0, steps: Number(cu.steps) || 0 } as any);
          break;
        }
        patch<CuRunItem>(cuRunUi, {
          status: String(cu.status || "done") === "error" ? "error" : "done",
          finished: true,
          ms: Number(cu.ms) || undefined,
          github: firstUrl(cu.github) || run?.github || "",
          deploy: firstUrl(cu.live) || run?.deploy || "",
          tokens: Number(cu.tokens) || run?.tokens || 0,
          requests: Number(cu.requests) || run?.requests || 0,
        });
        break;
      }
      case "phase_done": {
        closeCuThink(); // R38-RC4: pause/error ya awamu — think wazi inafungwa
        const st = String(cu.status || "") === "paused" ? "paused" : cu.ok ? "done" : "error";
        if (cuRunUi) patch<CuRunItem>(cuRunUi, { status: st, finished: true });
        break;
      }
      default: break; // step_start, usage_total — live tu
    }
  }

  function snapshot(): AdapterSnapshot {
    let liveTokens = 0;
    const liveByAgent = { optimus: 0, ultron: 0, vextron: 0, megatron: 0, cybertron: 0 } as Record<AgentId, number>;
    live.forEach((v) => { liveTokens += v.tokens; liveByAgent[v.agent] += v.tokens; });
    return { items, stage, agendaList: agendaDefs, title, status, usage, providers, liveTokens, liveByAgent, done, failed, sessionShort };
  }

  return {
    apply,
    snapshot,
    finalize,
    /** replay: hakuna muda halisi wa kufikiri — ThinkTrace inaonyesha "Thought" bila sekunde */
    setInstant(v: boolean) { instant = v; },
    setBaseSeconds(s: number) { baseSeconds = Math.max(0, Math.round(s)); },
  };
}

export type BoardAdapter = ReturnType<typeof createBoardAdapter>;

/* ================================================================== replay */
export interface SavedItem {
  kind: "msg" | "chip" | "round" | "title" | "cu";
  id: string; agentId?: string; thinking?: string; content?: string; sources?: SearchResult[]; text?: string; round?: number; total?: number;
  /** R31 · XMD Computer */
  cu?: string; i?: number; step?: number; tool?: string; command?: string; output?: string; preview?: string;
  fileId?: string; bucketId?: string; label?: string; url?: string; message?: string; status?: string; exit?: number; ms?: number;
  live?: string; github?: string; tokens?: number; requests?: number; model?: string; task?: string; partial?: boolean;
}

const HIDDEN = /^__PROFESSOR_XMD_(RESUME_STATE|USAGE|BRIEF|FACTS|CU_STATE)__:/; // R26: brief + facts · R31: hali ya XMD Computer

/** Hugeuza items zilizohifadhiwa (Appwrite) kuwa mfululizo wa matukio kwa adapter. */
export function savedToEvents(items: SavedItem[], project: string): AdapterEvent[] {
  const out: AdapterEvent[] = [];
  // R31-G5: mode YA KWANZA — replay ya plan session isione script/patch/review (kosa la 6ac42a20:
  // consensus → ScriptBox tupu; chip ya resume-state ina mode tangu R30)
  const st = readResumeState((items || []) as any);
  out.push({ type: "mode", mode: st?.mode === "code" ? "code" : st ? st.mode || "code" : "plan" });
  if (project) out.push({ type: "user_prompt", text: project });
  for (const it of items || []) {
    if ((it as any).kind === "cu") {
      // R31 · XMD Computer — kila tukio lililohifadhiwa linaingia buffer kama event ya "cu"
      out.push({ type: "cu", cu: { type: String((it as any).cu || ""), ...it } } as any);
      continue;
    }
    if (it.kind === "title" && it.text) out.push({ type: "title_done", title: it.text });
    else if (it.kind === "chip" && it.text && !HIDDEN.test(it.text)) out.push({ type: "system", text: it.text });
    else if (it.kind === "round") out.push({ type: "round", round: it.round || 0, total: it.total || 0 });
    else if (it.kind === "msg") {
      const id = it.id || nid();
      out.push({ type: "msg_start", id, agentId: it.agentId || "pm" });
      const content = String(it.content || "");
      const sq = content.match(/^(?:🔎 Evidence check:|🔍)\s*([\s\S]*)$/) || content.match(/^(📄[^\n]*)$/);
      const mem = content.match(/^🧠 \(memory\)\s*([\s\S]*)$/);
      if (sq) {
        out.push({ type: "search", id, query: sq[1].trim() });
        out.push({ type: "sources", id, sources: it.sources || [] });
      } else if (mem) {
        out.push({ type: "sources", id, sources: it.sources || [] });
      } else {
        if (it.thinking) out.push({ type: "think", id, text: it.thinking });
        if (content) out.push({ type: "token", id, text: content });
      }
      out.push({ type: "msg_done", id });
    }
  }
  return out;
}
