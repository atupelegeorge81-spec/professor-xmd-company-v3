import type { SearchResult } from "./search";
export type { SearchResult };

export interface LogEntry {
  id: string;
  timestamp: string;
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
  | { type: "usage"; sessionRequests: number; totalTokens: number };

export type BoardEvent =
  | { type: "log"; entry: LogEntry }
  | { type: "system"; text: string }
  | { type: "round"; round: number; total: number }
  | { type: "msg_start"; id: string; agentId: string }
  | { type: "think"; id: string; text: string }
  | { type: "search"; id: string; query: string }
  | { type: "sources"; id: string; sources: SearchResult[] }
  | { type: "token"; id: string; text: string }
  | { type: "msg_reset"; id: string }
  | { type: "code_dissolve_start"; id: string; oldCode: string; newCode: string }
  | { type: "msg_remove"; id: string }
  | { type: "msg_corrected"; id: string }
  | { type: "msg_done"; id: string }
  | { type: "title_stream"; text: string }
  | { type: "title_done"; title: string }
  | { type: "usage"; agentId: string; requests: number; tokens: number }
  | { type: "summary"; usage: { total: { requests: number; tokens: number }; [agentId: string]: { requests: number; tokens: number } } }
  | { type: "report"; id: string; title: string; content: string }
  | { type: "error"; message: string }
  | { type: "done" };

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
