"use client";
// src/lib/chat/useAgentChat.ts — historia ya chumba binafsi cha agent.
// Chanzo cha ukweli: Appwrite (/api/agent-chats → agent_conversations). Collection ikikosekana au
// Appwrite isiposanidiwa → localStorage (kama zamani). localStorage pia ni cache ya haraka ya kufungua.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatTurn, Feedback } from "@/components/agents/ChatMessage";
import type { AgentId } from "@/lib/team";

export type ChatMsg = { kind: "user"; id: string; text: string } | ChatTurn;
export interface TurnMeta { status?: "done" | "stopped" | "error"; model?: string; prompt?: number; completion?: number; total?: number; exact?: boolean; requests?: number }

const cacheKey = (id: string) => `xmd:chat:${id}`;
const threadKey = (id: string) => `xmd:chatThread:${id}`;
export const newThreadId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

interface Doc {
  id: string; agent_id: string; thread_id: string; seq: number; role: "user" | "agent"; content: string;
  thinking?: string; search_query?: string; sources?: { title: string; url: string; snippet?: string }[];
  status?: string; seconds?: number; feedback?: Feedback; model?: string;
  prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; tokens_exact?: boolean; requests?: number;
}

function fromDoc(d: Doc): ChatMsg {
  if (d.role === "user") return { kind: "user", id: d.id, text: d.content };
  const thinking = (d.thinking || "").split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  return {
    kind: "turn", id: d.id, agent: d.agent_id as AgentId, thinking, thinkShown: thinking.length,
    search: d.search_query || undefined, sources: (d.sources || []).map((s) => ({ title: s.title || s.url, url: s.url, snippet: s.snippet })),
    content: d.content, phase: "done", seconds: d.seconds || 0, feedback: d.feedback || null, model: d.model || undefined,
  };
}

function toDoc(m: ChatMsg, agent: AgentId, threadId: string, seq: number, meta?: TurnMeta): Doc {
  if (m.kind === "user") return { id: m.id, agent_id: agent, thread_id: threadId, seq, role: "user", content: m.text };
  return {
    id: m.id, agent_id: agent, thread_id: threadId, seq, role: "agent", content: m.content,
    thinking: m.thinking.join("\n\n"), search_query: m.search || "", sources: m.sources.map((s) => ({ title: s.title, url: s.url, snippet: s.snippet })),
    status: meta?.status || "done", seconds: m.seconds, feedback: m.feedback ?? null, model: meta?.model || m.model,
    prompt_tokens: meta?.prompt, completion_tokens: meta?.completion, total_tokens: meta?.total, tokens_exact: meta?.exact, requests: meta?.requests,
  };
}

const post = (method: string, url: string, body?: unknown) =>
  fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
    .then((r) => r.json())
    .catch(() => null);

export function useAgentChat(agent: AgentId | undefined) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [stored, setStored] = useState<boolean | null>(null); // null = bado inapakia
  const [reason, setReason] = useState<string | undefined>();
  const [saveError, setSaveError] = useState<string | null>(null); // Appwrite imekataa kuhifadhi → onyesha sababu
  const [loading, setLoading] = useState(true);
  const thread = useRef<string>("");
  const loaded = useRef(false);

  /* ---------- pakia: cache ya kivinjari mara moja, kisha Appwrite (chanzo cha ukweli) ---------- */
  useEffect(() => {
    if (!agent) return;
    let alive = true;
    loaded.current = false;
    Promise.resolve()
      .then(() => {
        // cache ya kivinjari kwanza (inaonekana mara moja), Appwrite ikija inachukua nafasi
        try {
          const raw = localStorage.getItem(cacheKey(agent));
          if (alive && raw) setMsgs((JSON.parse(raw) as ChatMsg[]).map((m) => (m.kind === "turn" && m.phase !== "done" ? { ...m, phase: "done" } : m)));
          thread.current = localStorage.getItem(threadKey(agent)) || newThreadId();
        } catch { thread.current = newThreadId(); }
        return fetch(`/api/agent-chats?agent=${agent}`, { cache: "no-store" });
      })
      .then((r) => r.json())
      .then((j: { stored: boolean; reason?: string; threadId: string | null; messages: Doc[] }) => {
        if (!alive) return;
        setStored(!!j?.stored);
        setReason(j?.reason);
        if (j?.stored) {
          if (j.threadId) thread.current = j.threadId;
          setMsgs((j.messages || []).map(fromDoc));
        }
      })
      .catch(() => { if (alive) setStored(false); })
      .finally(() => { if (alive) { loaded.current = true; setLoading(false); } });
    return () => { alive = false; };
  }, [agent]);

  /* ---------- cache ya kivinjari (daima) ---------- */
  const cache = useCallback((list: ChatMsg[]) => {
    if (!agent || !loaded.current) return;
    try {
      // R15: kadi ya "Anzisha Board" ni ya wakati huo tu — haihifadhiwi (refresh haionyeshi kadi ya zamani)
      localStorage.setItem(cacheKey(agent), JSON.stringify(list.slice(-40), (k, v) => (k === "action" ? undefined : v)));
      localStorage.setItem(threadKey(agent), thread.current);
    } catch {}
  }, [agent]);

  /** Hifadhi ujumbe uliokamilika (user mara moja; agent baada ya jibu kuisha). */
  const persist = useCallback((m: ChatMsg, seq: number, meta?: TurnMeta) => {
    if (!agent || !stored) return Promise.resolve(false);
    return post("POST", "/api/agent-chats", { message: toDoc(m, agent, thread.current, seq, meta) }).then((j) => {
      if (j && j.stored === false) { setStored(false); setReason(j.reason); }
      if (j?.ok) setSaveError(null);
      else setSaveError((j && (j.reason || j.error)) || "Seva haikujibu — ujumbe haujahifadhiwa Appwrite");
      return !!j?.ok;
    });
  }, [agent, stored]);

  const remove = useCallback((id: string) => {
    if (stored) post("DELETE", `/api/agent-chats?id=${encodeURIComponent(id)}`);
  }, [stored]);

  const feedback = useCallback((id: string, f: Feedback) => {
    setMsgs((list) => list.map((m) => (m.id === id && m.kind === "turn" ? { ...m, feedback: f } : m)));
    if (stored) post("PATCH", "/api/agent-chats", { id, feedback: f });
  }, [stored]);

  const clear = useCallback(() => {
    if (!agent) return;
    const old = thread.current;
    if (stored) post("DELETE", `/api/agent-chats?agent=${agent}&thread=${encodeURIComponent(old)}`);
    thread.current = newThreadId();
    setMsgs([]);
    try { localStorage.removeItem(cacheKey(agent)); localStorage.setItem(threadKey(agent), thread.current); } catch {}
  }, [agent, stored]);

  return { msgs, setMsgs, stored, reason, saveError, dismissError: () => setSaveError(null), loading, cache, persist, remove, feedback, clear, threadId: () => thread.current };
}
