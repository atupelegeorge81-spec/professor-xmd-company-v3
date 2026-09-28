// src/lib/brain/liveContext.ts — snapshot ya hali halisi ya mfumo kwa wito huu (self-awareness).
import { stateBus, type BoardSnapshot } from "./stateBus";
import type { Phase } from "./skills/selector";

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

function boardLine(s: BoardSnapshot): string {
  const head = `"${s.project.slice(0, 120)}" — ${s.status === "running" ? `RUNNING, agenda ${s.agendaIndex}/${s.agendaTotal}${s.agendaItem ? ` (${s.agendaItem.slice(0, 90)})` : ""}, phase ${s.phase}` : s.status === "done" ? `FINISHED ${ago(s.updatedAt)}${s.reportSaved ? ", report saved" : ""}` : s.status === "paused" ? `PAUSED by Mkuu at agenda ${s.agendaIndex}/${s.agendaTotal} (Resume continues exactly there)` : `HALTED ${ago(s.updatedAt)} (can be resumed)`}`;
  const locks = s.locked.slice(-5).map((l) => `   · A${l.index} ${l.status}: ${l.decision.replace(/\s+/g, " ").slice(0, 140)}`).join("\n");
  return `- ${head}; locked ${s.locked.filter((l) => l.status === "LOCKED").length}${s.objections.length ? `, objections ${s.objections.length}` : ""}${locks ? `\n${locks}` : ""}`;
}

export interface LiveOpts {
  surface: "chat" | "board";
  phase: Phase;
  sessionId?: string;
  role?: string;
  agenda?: { index: number; total: number; item: string };
  owners?: string[];
  observers?: string[];
  chatMessages?: number;
}

export function liveContextBlock(o: LiveOpts): string {
  const lines: string[] = ["=== LIVE CONTEXT (real system state, right now) ==="];
  if (o.surface === "board") {
    const s = o.sessionId ? stateBus.get(o.sessionId) : undefined;
    lines.push(`- Surface: Board Room · phase: ${o.phase}${o.role ? ` · your role now: ${o.role}` : ""}`);
    if (o.agenda) lines.push(`- Agenda item ${o.agenda.index}/${o.agenda.total}: ${o.agenda.item.slice(0, 300)}`);
    if (o.owners?.length) lines.push(`- Owners of this item: ${o.owners.join(", ")}${o.observers?.length ? ` · observers: ${o.observers.join(", ")}` : ""}`);
    if (s) lines.push(`- Session: locked ${s.locked.filter((l) => l.status === "LOCKED").length}/${s.agendaTotal} so far${s.objections.length ? ` · objections ${s.objections.length}` : ""}`);
  } else {
    // R15: muhtasari wa mstari mmoja — undani (maamuzi, sessions za zamani, ripoti) unasomwa kwa SITE: board / sessions / reports
    lines.push(`- Surface: private Chat Room with Mkuu${o.chatMessages ? ` · ${o.chatMessages} messages in this thread` : ""}`);
    const boards = stateBus.all();
    const run = boards.find((b) => b.status === "running");
    lines.push(run
      ? `- Board Room right now: RUNNING — ${boardLine(run).replace(/^- /, "").split("\n")[0]} (details: SITE: board)`
      : boards.length
      ? `- Board Room right now: nothing running. Last on this server: ${boardLine(boards[0]).replace(/^- /, "").split("\n")[0]} (details: SITE: board; history: SITE: sessions)`
      : "- Board Room right now: nothing running (history: SITE: sessions / SITE: reports).");
  }
  return lines.join("\n");
}
