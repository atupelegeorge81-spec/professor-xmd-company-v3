import type { AgentId } from "@/lib/team";
import type { Source } from "@/lib/ui-types";

/* ---------------------------------------------------------------------------
 * STAGE ITEMS — kila kitu kinachotokea Board Room kina render yake.
 * Kila aina hapa ina ramani (mapping) ya tukio halisi la engine ya
 * professor-xmd-company (boardRunner.ts + brain/*) — angalia maoni `engine:`.
 * Integration ya baadaye = reducer inayogeuza BoardEvent → StageItem hizi.
 * ------------------------------------------------------------------------- */

export type Step = "wait" | "run" | "done" | "fail" | "skip";

export interface AgendaDef {
  index: number;
  title: string;
  owners: AgentId[];
  requiresCode: boolean;
}

/** engine: user prompt (CEO) */
export interface UserItem { kind: "user"; id: string; text: string }

/** engine: addChip("🏛️ Board Room — …") / resume "♻️ …imeendelea" / reattach · title_done · "💾 Conversation imeundwa" */
export interface ConveneItem {
  kind: "convene"; id: string;
  mode: "new" | "resume" | "reattach";
  project: string;
  title: string; titleShown: number;
  sessionId?: string;
}

/** engine: addChip("🧭 Optimus ameelewa: …") */
export interface ScopeItem { kind: "scope"; id: string; text: string; shown: number }

/** engine: addChip("📋 Agenda (N vipengele): …") */
export interface AgendaBuildItem { kind: "agendaBuild"; id: string; items: AgendaDef[]; shown: number }

/** engine: bcast({type:"round"}) + addChip(" Agenda i/N: … — owners: …") */
export interface AgendaStartItem { kind: "agendaStart"; id: string; agenda: AgendaDef; total: number }

/** engine: runMandatoryEvidenceGate / handleResearchRequest (search, sources, msg_done) + search.ts logs.
 * Inaonyeshwa NDANI ya ThinkingBlock ya zamu inayofuata ya agent huyo (Searched row + badges). */
export interface SearchTrace {
  variant: "gate" | "research" | "objection";
  query: string; queryShown: number;
  /** Appwrite semantic cache */
  cache: Step; similarity?: number; threshold?: number; matched?: string;
  /** session memory (research requests baada ya search ya kwanza) */
  memory?: Step;
  /** cache hit lakini si relevant → fresh verification */
  relevance?: Step;
  /** SearXNG */
  engine: Step; attempt: number; maxAttempts: number; waitLeft?: number; failures: number;
  /** save vector + results */
  save: Step;
  sources: Source[];
  done: boolean;
}

/** Fallback: evidence isiyo na zamu inayofuata (render ya peke yake) */
export interface EvidenceItem { kind: "evidence"; id: string; agent: AgentId; trace: SearchTrace }

export type Signal =
  | "CLARIFY" | "OFF_TOPIC" | "CONTRADICTION" | "DISAGREE"
  | "INSUFFICIENT_EVIDENCE" | "I_WAS_WRONG" | "WAIT" | "SKILL_REQUEST";

/** engine: msg_start → think* → token* → msg_done (msg_reset = retry) · brain parseSignals */
export interface TurnItem {
  kind: "turn"; id: string;
  agent: AgentId;
  role: "owner" | "observer" | "responder" | "chair" | "writer";
  thinking: string[]; thinkShown: number;
  content: string; target: string;
  phase: "thinking" | "searching" | "answering" | "retrying" | "done";
  /** evidence gate / research ya zamu hii (engine: kabla ya jibu) */
  search?: SearchTrace;
  /** R12: RESEARCH_REQUEST / READ_SOURCE zilizoombwa NDANI ya jibu hili — zinaonyeshwa ndani ya zamu hii hii (si sehemu mpya) */
  followUps?: SearchTrace[];
  retry?: { n: number; max: number; model: string };
  seconds: number;
  skill?: { name: string; found: boolean };
}

/** engine: proposal parser / agrees Set / consensus gate / MAX_TURNS */
export interface ConsensusItem {
  kind: "consensus"; id: string;
  event: "proposed" | "reset" | "agreed" | "reached" | "exhausted";
  by: AgentId; version: number;
  owners: AgentId[]; approvals: AgentId[];
}

/** engine (brain): chairReview → Optimus anaongea kama mwenyekiti */
export interface ChairItem { kind: "chair"; id: string; target: AgentId; reason: Signal; text: string; shown: number }

export interface Hunk { line: number; old: string[]; new: string[] }

/** engine: code-writing phase streamTurn (continuation attempts 1..3).
 *  Patch (script_diff) = toleo jipya la box; la zamani linabaki kama mstari mfupi (dissolveMessage). */
export interface ScriptItem {
  kind: "script"; id: string;
  agent: AgentId; file: string; lang: string;
  code: string; shown: number;
  attempt: number; maxAttempts: number;
  /** "resume" = inasubiri kuendelea pale ilipoishia */
  state: "writing" | "resume" | "patching" | "done";
  version: number;
  patch?: { reason: "review" | "objection"; add: number; del: number; hunks: Hunk[]; changed: number[] };
  replaced?: { add: number; del: number };
}

/** engine: reviewer APPROVE / REJECT: … (round 1..2) */
export interface ReviewItem {
  kind: "review"; id: string; agent: AgentId;
  verdict: "pending" | "approve" | "reject";
  round: number; maxRounds: number; notes: string[];
}

/** engine: "Deliverable ya mwisho — item" */
export interface DeliverableItem { kind: "deliverable"; id: string; agent: AgentId; file: string; lines: number; agenda: string }

export type TaskKind = "agenda" | "mini" | "lock" | "relock" | "query" | "validate" | "reportCheck";
/** engine: activityStart/activityEnd (shimmer — si ujumbe wa chat) */
export interface TaskItem { kind: "task"; id: string; task: TaskKind; agent: AgentId; text: string; state: "run" | "done"; result?: string; ms?: number }

export type MemState = "wait" | "run" | "saved" | "none" | "fail";
/** engine (brain): agendaCheckpoints / finalReflection / consolidation — SHIMMER TU, maudhui hayaonyeshwi */
export interface MemoryItem {
  kind: "memory"; id: string;
  scope: "agenda" | "reflection" | "consolidate";
  agenda?: number;
  agents: { id: AgentId; state: MemState }[];
  done: boolean;
}

/** engine: saveLedgerEntry → addChip("🔒 LOCKED" | "🟠 OPEN") · re-lock (supersedes) */
export interface SealItem {
  kind: "seal"; id: string;
  agenda: AgendaDef;
  status: "LOCKED" | "OPEN";
  version: number;
  decision: string;
  rationale?: string; tradeoff?: string;
  constraints: string[];
  owners: AgentId[];
  sources: number;
  ledgerId: string;
  supersedes?: string;
  superseded?: boolean;
}

/** engine: observers loop (SILENT | OBJECTION + SEVERITY) — max 1 objection */
export interface ObserversItem {
  kind: "observers"; id: string; agenda: number;
  checks: { agent: AgentId; state: "wait" | "check" | "silent" | "objection" | "skipped" }[];
  objection?: { agent: AgentId; concern: string; severity: "high" };
}

/** engine: UPDATED DECISION → re-lock + markSuperseded(entryId) + "🔁 SUPERSEDED" */
export interface SupersedeItem {
  kind: "supersede"; id: string; agenda: number;
  objector: AgentId; responder: AgentId;
  from: { ledgerId: string; text: string; version: number };
  to: { ledgerId: string; text: string; version: number };
}

/** engine: "↩️ Objection imekataliwa: …" */
export interface OverruledItem { kind: "overruled"; id: string; objector: AgentId; responder: AgentId; concern: string; reason: string }

/** engine: HATUA 6.4 Ledger validator · report validator [A1..AN] + stitch */
export interface ValidatorItem {
  kind: "validator"; id: string; scope: "ledger" | "report";
  rows: { index: number; title: string; state: "wait" | "check" | "locked" | "open" | "missing" | "ok" | "stitched" }[];
  done: boolean;
}

/** engine: HATUA 6.5 assembleFinalScript (collectLockedPieces → stream 1..6) */
export interface AssemblyItem {
  kind: "assembly"; id: string;
  pieces: { agenda: number; agent: AgentId; file: string; lines: number }[];
  merged: number; // vipande vilivyounganishwa
  file: string; code: string; shown: number;
  attempt: number; maxAttempts: number; done: boolean;
}

export type SectionState = "wait" | "writing" | "done" | "missing" | "repairing" | "repaired";
/** engine: HATUA 7 report parts 1/2, 2/2 · repair loop · saveReport */
export interface ReportItem {
  kind: "report"; id: string;
  title: string;
  part: 0 | 1 | 2 | 3; // 3 = repair
  sections: { n: number; title: string; state: SectionState; chars: number }[];
  /** hati nzima inayokua (kipande 1 + 2 + marekebisho) — inastreamiwa neno kwa neno */
  doc: string; shown: number;
  /** herufi ambapo marekebisho (repair) yanaanzia */
  repairFrom?: number;
  startedAt: number;
  /** true wakati Optimus bado anaandika (stream halisi) */
  live?: boolean;
  saved: "wait" | "saving" | "saved" | "failed";
  /** mjadala umeisha (finalize) — hakuna kazi inayoendelea tena kwenye kadi hii (shimmer izime) */
  settled?: boolean;
  reportId: string;
}

/** engine (R30): HATUA 6.6 — Mpango Kazi wa Agent (plan mode) · kipande 1/2, 2/2 · repair · saveProjectPlan.
 *  Card ya "Optimus anaandika Mpango Kazi wa Agent" — muonekano uleule wa ReportWriter (shimmer, si chip). */
export interface PlanItem {
  kind: "plan"; id: string;
  title: string;
  part: 0 | 1 | 2 | 3; // 3 = repair
  sections: { n: number; title: string; state: SectionState; chars: number }[];
  /** hatua za "### Step N — Title" (zinapatikana live kadiri sehemu ya 6 inavyoandikwa) */
  steps: { n: number; title: string; state: "wait" | "writing" | "done" }[];
  /** hati nzima inayokua — inastreamiwa neno kwa neno kama ripoti */
  doc: string; shown: number;
  /**repair texts zinaanza hapa (maandishi ya "### N." kabla ya hii = ya awali; kutoka hapa = marekebisho) */
  repairFrom?: number;
  startedAt: number;
  live?: boolean;
  saved: "wait" | "saving" | "saved" | "failed";
  settled?: boolean;
  planId: string;
}

/** engine: system chips za retry/rotation/error/halt */
export interface NoticeItem {
  kind: "notice"; id: string;
  tone: "retry" | "rotate" | "warn" | "error" | "halt" | "info";
  agent?: AgentId; text: string; detail?: string;
}

/** engine: bcast({type:"summary"}) + done */
export interface SummaryItem {
  kind: "summary"; id: string;
  seconds: number;
  /** R31: "computer" = XMD Computer (tokens za computer-use) */
  usage: { agent: AgentId | "computer"; requests: number; tokens: number }[];
  locked: number; superseded: number; open: number; sources: number; requests: number;
}

/* ---------------- R31 · XMD Computer (engine: cu/*) ----------------
 * UI ya CU ni TIMELINE (kama xmd3): kila tukio lina StageItem yake kwenye
 * mkondo (cuThink/cuText/cuExec/cuShot/cuLink/cuError). CuRunItem ni card ya
 * HALI/maandalizi tu (task, status, tokens, Files badge) — si tank. */

/** exec moja ya agent — live: tool_draft→exec_start→exec_output→exec_end · replay: item "exec" */
export interface CuExecItem {
  kind: "cuExec"; id: string;
  /** id ya tool call (toolu_…) — inaunganisha draft na exec_start/end */
  execId: string; step: number;
  tool: string; kindX: string;
  command: string; draft?: string;
  path?: string; preview?: string;
  /** edit: before/after (DiffCard ya xmd3) */
  oldStr?: string; newStr?: string;
  exit?: number; ms?: number; lines?: number; chars?: number;
  summary?: string; output?: string;
  state: "run" | "done" | "fail";
  startedAt: number;
}

/** mawazo ya agent (think) — card ya thinking (shimmer; xmd3 ThinkingCard) */
export interface CuThinkItem { kind: "cuThink"; id: string; step: number; text: string; ms?: number; partial: boolean }

/** maneno ya agent (text) — KAWAIDA kwenye mkondo: hakuna avatar, hakuna bubble; markdown+mermaid */
export interface CuTextItem { kind: "cuText"; id: string; step: number; text: string; partial: boolean }

/** picha ya ukurasa (Desktop/Mobile) — fileId ya Appwrite bucket ya screenshots */
export interface CuShotItem { kind: "cuShot"; id: string; step: number; label: string; fileId: string; bucketId: string; ok: boolean }

/** link muhimu — github: repo imeundwa · deploy: tovuti iko live */
export interface CuLinkItem { kind: "cuLink"; id: string; step: number; link: "github" | "deploy"; url: string }

/** R35: tukio la nidhamu la hooks za bridge (advice/continue/brake/shot_deny/fail) — kwenye timeline na export */
export interface CuHookItem { kind: "cuHook"; id: string; step: number; hookKind: string; text: string; command?: string; streak?: number }

/** kosa la awamu ya CU (fatal tu) */
export interface CuErrorItem { kind: "cuError"; id: string; message: string }

/** divider ya mwanzo wa awamu ya CU — badge + mistari miwili (mtindo wa agenda-start; uamuzi #2) */
export interface CuDividerItem { kind: "cuDivider"; id: string }

/** engine: startComputerPhase → divider + card ya HALI ya "XMD Computer" (maandalizi ya e2b:
 *  task, Inatekeleza/Imekamilika, step/tokens/requests, Files badge). Kila kitu kingine
 *  kinamiminika kwenye mkondo kama items zake (cuText/cuExec/cuShot/…). */
/** R31-G4: quota ya siku imeisha — session imepumzika; auto-resume kwenye resumeAt. */
export interface CuPauseItem {
  kind: "cuPause"; id: string;
  resumeAt: number; ms: number; steps: number;
}

/** entry ya file ya sandbox (bridge: {p,d,s}) — mti kama FileTree ya xmd3.
 * string = sessions za zamani (kabla ya R31-G5 — hazibadilishwi). */
export type CuFileEntry = { path: string; isDir: boolean; size: number };

export interface CuRunItem {
  kind: "cuRun"; id: string;
  task: string;
  status: "run" | "done" | "error" | "paused";
  step: number;
  tokens: number; requests: number;
  files: Array<CuFileEntry | string>; filesCount: number;
  github: string; deploy: string;
  screenshots: number;
  startedAt: number; finished: boolean; ms?: number;
}

/** engine: finish event → RIPOTI KAMILI kama DOCUMENT (ReportBody) — si card ya stream. */
export interface CuReportItem {
  kind: "cuReport"; id: string;
  title: string; doc: string;
  partial: boolean; status: string;
  screenshots: number; filesCount: number; tokens: number;
  github: string; deploy: string;
  startedAt: number;
}

export type StageItem =
  | UserItem | ConveneItem | ScopeItem | AgendaBuildItem | AgendaStartItem
  | EvidenceItem | TurnItem | ConsensusItem | ChairItem
  | ScriptItem | ReviewItem | DeliverableItem
  | TaskItem | MemoryItem | SealItem | ObserversItem | SupersedeItem | OverruledItem
  | ValidatorItem | AssemblyItem | ReportItem | PlanItem | NoticeItem | SummaryItem
  | CuRunItem | CuReportItem | CuPauseItem
  | CuThinkItem | CuTextItem | CuExecItem | CuShotItem | CuLinkItem | CuHookItem | CuErrorItem | CuDividerItem;

/* ---------------- live stage (StageRail) ---------------- */
export type AgendaPhase = "evidence" | "discussion" | "code" | "lock" | "review" | "relock" | "memory";
export type FinalePhase = "validate" | "assemble" | "plan" | "report" | "reflect" | "done";

export interface LiveStage {
  scope: "opening" | "agenda" | "finale" | "done";
  agenda?: AgendaDef;
  total: number;
  phase?: AgendaPhase;
  finale?: FinalePhase;
  hadCode: boolean;
  hadObjection: boolean;
  /** R30: session ya plan mode — rail ya finale inaonyesha "Mpango" badala ya "Script" */
  plan?: boolean;
  owners: AgentId[];
  approvals: AgentId[];
  version: number;
  ledger: Record<number, { status: "LOCKED" | "OPEN" | "SUPERSEDED+LOCKED"; version: number }>;
  background: string | null; // shimmer text ya kazi ya background inayoendelea
}
