import type { SearchResult } from "./search";
export type { SearchResult };

export interface LogEntry {
  id: string;
  timestamp: string;
  /** epoch ms — UI huonyesha muda kwa timezone ya app */
  at?: number;
  type: "info" | "success" | "warning" | "error" | "api" | "search" | "system";
  message: string;
  details?: string;
}

export type AgentEvent =
  | { type: "thinking"; text: string }
  | { type: "search"; query: string }
  | { type: "sources"; sources: SearchResult[] }
  | { type: "search_error"; message: string }
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "log"; entry: LogEntry }
  | { type: "usage"; sessionRequests: number; totalTokens: number }
  | { type: "usage_live"; prompt: number; completion: number }
  | { type: "usage_turn"; prompt: number; completion: number; total: number; exact: boolean }
  /** R10 Agent Brain: memory ya chat (shimmer tu — maudhui hayaonyeshwi) */
  | { type: "memory"; state: "start" | "saved" | "none" | "fail" }
  /** R15: kitendo cha website kinachohitaji uthibitisho wa Mkuu (card chini ya jibu) */
  | { type: "action"; action: "start_board"; task: string }
  /** R16 Capacity Broker: agent anasubiri nafasi ya lane (shimmer "anasubiri nafasi") · until=null → amepata */
  | { type: "capacity"; waiting: boolean; until?: number | null };

export interface ScriptDiffChange {
  startLine: number;
  oldLines: string[];
  newLines: string[];
}

export interface ScriptDiff {
  additions: number;
  deletions: number;
  changes: ScriptDiffChange[];
}

export type BoardEvent =
  | { type: "log"; entry: LogEntry }
  | { type: "system"; text: string }
  /** R16.1: mwisho wa historia (buffer) wakati wa Attach/Resume — UI inachora yaliyotangulia bila animation */
  | { type: "sync" }
  | { type: "round"; round: number; total: number }
  | { type: "msg_start"; id: string; agentId: string }
  | { type: "think"; id: string; text: string }
  | { type: "search"; id: string; query: string }
  | { type: "sources"; id: string; sources: SearchResult[] }
  | { type: "token"; id: string; text: string }
  | { type: "msg_reset"; id: string }
  | { type: "msg_done"; id: string }
  | { type: "script_diff"; id: string; diff: ScriptDiff }
  | { type: "title_stream"; text: string }
  | { type: "title_done"; title: string }
  | { type: "usage"; agentId: string; requests: number; tokens: number; id?: string; prompt?: number; completion?: number; exact?: boolean }
  /** Makadirio ya tokens wakati jibu bado linarudi (tokenizer, ~300ms). Usage ya kweli inafuata kwenye `usage`. */
  | { type: "usage_live"; id: string; agentId: string; prompt: number; completion: number }
  /** R20: jumla ya session kwa provider (xkiro, groq, openrouter, unorouter, gemini) */
  | { type: "usage_provider"; byProvider: Record<string, { requests: number; tokens: number }> }
  | { type: "summary"; usage: { total: UsageTotals; [agentId: string]: UsageTotals } }
  | { type: "report"; id: string; title: string; content: string }
  /** Kazi ya background (shimmer) — mini report, lock, validator… */
  | { type: "activity"; id: string; text?: string; state: "start" | "end" }
  /** R31 · XMD Computer: matukio ya computer-use (kutoka sandbox, via /api/boardroom/cu-event). */
  | { type: "cu"; cu: { type: string; i?: number; [k: string]: unknown } }
  | { type: "error"; message: string }
  | { type: "done" };

export interface UsageTotals {
  requests: number;
  tokens: number;
  prompt?: number;
  completion?: number;
}

export type AgentPhase = "thinking" | "searching" | "answering" | "done" | "error";

export interface UiMessage {
  id: string;
  role: "user" | "agent";
  agentId?: string;
  content: string;
  thinking: string;
  query?: string;
  sources: SearchResult[];
  searchError?: string;
  phase: AgentPhase;
  error?: string;
}

export interface ReportDoc {
  id: string;
  title: string;
  content: string;
  agents: string;
  project: string;
  created_at: string;
}

export interface ConversationDoc {
  id: string;
  title: string;
  project: string;
  status: string;
  created_at: string;
  items_count: number;
}
